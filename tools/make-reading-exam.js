#!/usr/bin/env node
// Turns the separate "IELTS WARRIORS" Reading passage pages into ONE 60-minute full-screen exam page.
//   node tools/make-reading-exam.js --out netlify/functions/sims/src/m1-reading-exam.html --title "Reading - Volume 10 Test 1" part1.html part2.html part3.html
// It reads each passage's text, questions and answer key, checks that every answered question has an input, and writes
// a self-contained page (timer, day/night, text size, highlighting in passage AND questions, results with band estimate).
const fs = require("fs"), path = require("path");
const args = process.argv.slice(2); const opt = { minutes: 60 }; const files = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) opt[args[i].slice(2)] = args[++i]; else files.push(args[i]); }
if (!opt.out || files.length < 1) { console.error("usage: make-reading-exam.js --out <file> [--title T] [--minutes 60] [--name NAME] [--link https://t.me/Javlonbek_Okhunov] part1.html part2.html ..."); process.exit(1); }
const must = (m, what, f) => { if (!m) { console.error(`ERROR: ${f}: could not find ${what}. Is this one of the IELTS WARRIORS reading pages?`); process.exit(2); } return m; };
const parts = files.map((f) => {
  const s = fs.readFileSync(f, "utf8");
  const cfg = JSON.parse(must(s.match(/const CFG=(\{[\s\S]*?\});\n/), "the CFG block", f)[1]);
  const passage = must(s.match(/<article class="pane left" id="passage">([\s\S]*?)<\/article>/), "the passage", f)[1];
  const questions = must(s.match(/<div class="pane right" id="questions">([\s\S]*?)<\/div>\s*<div class="arrows">/), "the questions", f)[1];
  const banner = must(s.match(/<div class="banner">([\s\S]*?)<\/div>/), "the banner", f)[1];
  return { cfg, passage, questions, banner, file: f };
}).sort((a, b) => a.cfg.part - b.cfg.part);
// ---- checks ----
const problems = []; let expect = 1;
parts.forEach((p) => {
  if (p.cfg.first !== expect) problems.push(`${path.basename(p.file)}: starts at question ${p.cfg.first} but the previous part ended at ${expect - 1}`);
  expect = p.cfg.last + 1;
  for (let n = p.cfg.first; n <= p.cfg.last; n++) {
    if (p.cfg.key[n] === undefined) problems.push(`question ${n} has no answer key`);
    if (!new RegExp(`id="q${n}"|name="q${n}"`).test(p.questions)) problems.push(`question ${n} has no input on the page`);
  }
});
if (problems.length) { console.error("PROBLEMS:\n - " + problems.join("\n - ")); process.exit(3); }
const total = parts.reduce((a, p) => a + (p.cfg.last - p.cfg.first + 1), 0);
const store = String(parts[0].cfg.store).replace(/_p\d+$/, "") + "_exam";
const cfg = { title: opt.title || "Reading", minutes: Number(opt.minutes), store, total, parts: parts.map((p) => ({ part: p.cfg.part, first: p.cfg.first, last: p.cfg.last, title: p.cfg.title, key: p.cfg.key })) };
const body = parts.map((p, i) => `<div class="part" data-part="${p.cfg.part}"${i ? " hidden" : ""}>\n<div class="banner">${p.banner}</div>\n<div class="ws"><article class="pane left">${p.passage}</article><div class="divider" aria-hidden="true"><span>&#8596;</span></div><div class="pane right">${p.questions}</div></div>\n</div>`).join("\n");
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
let html = fs.readFileSync(path.join(__dirname, "reading-exam.template.html"), "utf8")
  .replace(/__NAME__/g, esc(opt.name || "Teacher Javlonbek")).replace(/__LINK__/g, esc(opt.link || "https://t.me/Javlonbek_Okhunov")).replace("__TITLE__", esc(cfg.title)).replace("__HEADTITLE__", esc(cfg.title)).replace("__PARTS__", () => body).replace("__CFG__", () => JSON.stringify(cfg).replace(/</g, "\\u003c"));
fs.mkdirSync(path.dirname(opt.out), { recursive: true }); fs.writeFileSync(opt.out, html);
console.log(`OK  ${opt.out}\n    ${parts.length} parts, ${total} questions, ${cfg.minutes} minutes, ${Math.round(html.length / 1024)} KB, storage key "${store}"`);
