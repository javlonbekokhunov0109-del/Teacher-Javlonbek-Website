// Mock content: validation (used when the teacher saves a mock) and a plain-text description of
// Task 1 data so the AI can check the candidate's figures against the real data.
const T1_TYPES = ["line", "bar", "pie", "table", "process"];
const isStr = (v, min = 1, max = 4000) => typeof v === "string" && v.trim().length >= min && v.length <= max;
const isNum = (v) => typeof v === "number" && isFinite(v);

function validateTask1(t, p) {
  if (!t || typeof t !== "object") { p.push("Task 1 is missing."); return; }
  if (!T1_TYPES.includes(t.type)) p.push("Task 1 type must be one of: " + T1_TYPES.join(", ") + ".");
  if (!isStr(t.question, 30, 1500)) p.push("Task 1 question must be 30-1500 characters.");
  if (!isStr(t.title, 3, 160)) p.push("Task 1 needs a chart title.");
  if (t.min_words !== undefined && !(Number.isInteger(t.min_words) && t.min_words >= 50 && t.min_words <= 400)) p.push("Task 1 min_words must be 50-400.");
  const d = t.data || {};
  if (t.type === "line" || t.type === "bar") {
    const axis = t.type === "line" ? d.x : d.categories;
    if (!Array.isArray(axis) || axis.length < 2 || axis.length > 14 || !axis.every((a) => isStr(String(a), 1, 40))) p.push(t.type === "line" ? "Line data needs x (2-14 labels)." : "Bar data needs categories (2-14 labels).");
    if (!Array.isArray(d.series) || d.series.length < 1 || d.series.length > 6) p.push("Chart data needs 1-6 series.");
    else d.series.forEach((s, i) => { if (!isStr(s && s.name, 1, 60)) p.push("Series " + (i + 1) + " needs a name."); if (!Array.isArray(s && s.values) || !s.values.every(isNum) || (Array.isArray(axis) && s.values.length !== axis.length)) p.push("Series " + (i + 1) + " must have one number per label."); });
  } else if (t.type === "pie") {
    if (!Array.isArray(d.pies) || d.pies.length < 1 || d.pies.length > 3) p.push("Pie data needs 1-3 pies.");
    else d.pies.forEach((pie, i) => { const sl = pie && pie.slices; if (!isStr(pie && pie.title, 1, 80)) p.push("Pie " + (i + 1) + " needs a title."); if (!Array.isArray(sl) || sl.length < 2 || sl.length > 8 || !sl.every((s) => isStr(s && s.label, 1, 60) && isNum(s.value))) p.push("Pie " + (i + 1) + " needs 2-8 slices with label and value."); else { const sum = sl.reduce((a, s) => a + s.value, 0); if (Math.abs(sum - 100) > 0.6) p.push("Pie " + (i + 1) + " slices must add up to 100 (now " + Math.round(sum * 10) / 10 + ")."); } });
  } else if (t.type === "table") {
    if (!Array.isArray(d.columns) || d.columns.length < 2 || d.columns.length > 8) p.push("Table needs 2-8 columns.");
    if (!Array.isArray(d.rows) || d.rows.length < 1 || d.rows.length > 12 || (Array.isArray(d.columns) && !d.rows.every((r) => Array.isArray(r) && r.length === d.columns.length))) p.push("Table rows must each have one cell per column (1-12 rows).");
  } else if (t.type === "process") {
    if (!Array.isArray(d.steps) || d.steps.length < 4 || d.steps.length > 12 || !d.steps.every((s) => isStr(s && s.label, 1, 90))) p.push("Process needs 4-12 steps, each with a label.");
  }
}
function validateWriting(w) {
  const p = [];
  if (!w || typeof w !== "object") return ["Writing section is missing."];
  validateTask1(w.task1, p);
  const t2 = w.task2;
  if (!t2 || !isStr(t2.question, 30, 2000)) p.push("Task 2 question must be 30-2000 characters.");
  if (t2 && t2.min_words !== undefined && !(Number.isInteger(t2.min_words) && t2.min_words >= 100 && t2.min_words <= 600)) p.push("Task 2 min_words must be 100-600.");
  return p;
}
function validateSpeaking(s) {
  const p = [];
  if (!s || typeof s !== "object") return ["Speaking section is missing."];
  if (!Array.isArray(s.part1) || s.part1.length < 1 || s.part1.length > 3) p.push("Speaking Part 1 needs 1-3 topics.");
  else s.part1.forEach((t, i) => { if (!isStr(t && t.topic, 2, 80)) p.push("Part 1 topic " + (i + 1) + " needs a name."); if (!Array.isArray(t && t.questions) || t.questions.length < 3 || t.questions.length > 8 || !t.questions.every((q) => isStr(q, 8, 300))) p.push("Part 1 topic " + (i + 1) + " needs 3-8 questions."); });
  const c = s.part2;
  if (!c || !isStr(c.title, 10, 250) || !Array.isArray(c.bullets) || c.bullets.length < 3 || c.bullets.length > 5 || !c.bullets.every((b) => isStr(b, 3, 200))) p.push("Part 2 needs a title and 3-5 bullets.");
  if (!Array.isArray(s.part3) || s.part3.length < 4 || s.part3.length > 8 || !s.part3.every((q) => isStr(q, 10, 300))) p.push("Part 3 needs 4-8 questions.");
  return p;
}

function describeTask1(t) {
  if (!t) return "";
  const d = t.data || {}; const L = [];
  L.push(`Task 1 (Academic) - ${({ line: "line graph", bar: "bar chart", pie: "pie charts", table: "table", process: "process diagram" })[t.type] || t.type}. Title: ${t.title}.`);
  if (t.type === "line" || t.type === "bar") {
    const axis = t.type === "line" ? d.x : d.categories;
    L.push(`${t.type === "line" ? "X axis" : "Categories"}: ${axis.join(", ")}.${d.unit ? " Unit: " + d.unit + "." : ""}${d.ylabel ? " Vertical axis: " + d.ylabel + "." : ""}`);
    d.series.forEach((s) => L.push(`${s.name}: ` + s.values.map((v, i) => `${axis[i]}=${v}`).join("; ")));
  } else if (t.type === "pie") {
    d.pies.forEach((p) => L.push(`${p.title}: ` + p.slices.map((s) => `${s.label}=${s.value}%`).join("; ")));
  } else if (t.type === "table") {
    if (d.caption) L.push(d.caption);
    L.push("Columns: " + d.columns.join(" | "));
    d.rows.forEach((r) => L.push(r.join(" | ")));
  } else if (t.type === "process") {
    L.push("Stages in order" + (d.loop ? " (the last stage leads back to the first)" : "") + ": " + d.steps.map((s, i) => `${i + 1}. ${s.label}${s.detail ? " (" + s.detail + ")" : ""}`).join(" -> "));
  }
  return L.join("\n");
}
const summariseWriting = (w) => ({ task1_type: w && w.task1 && w.task1.type || null });

module.exports = { T1_TYPES, validateWriting, validateSpeaking, describeTask1, summariseWriting };
