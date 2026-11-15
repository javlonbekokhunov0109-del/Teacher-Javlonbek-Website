// Real Exam Tests: shared rules. A test opens for: the teacher, anyone when it is a free sample,
// or a student who is in an ACTIVE class that the teacher ticked in the exam settings (e.g. IELTS WARRIORS).
const { getAccess } = require("./_access");

async function getExamSettings(db) {
  const r = await db.from("exam_settings").select("class_ids").eq("id", 1).maybeSingle();
  return { class_ids: (r.data && r.data.class_ids) || [] };
}
// access = result of getAccess(); settings = getExamSettings()
function memberOfExamClass(access, settings) {
  return !!(access.admin || (settings.class_ids || []).some((c) => access.activeClassIds.has(c)));
}
function canOpenExam(access, settings, test) {
  return !!(access.admin || test.is_free || memberOfExamClass(access, settings));
}
// What the page may do with a posted result. Returns a clean row or null.
function cleanResult(b) {
  const score = Number(b && b.score), total = Number(b && b.total);
  if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > 200 || score < 0 || score > total) return null;
  let band = b.band == null || b.band === "" ? null : Number(b.band);
  if (band != null && !(band >= 0 && band <= 9)) band = null;
  let q = null;
  if (Array.isArray(b.q) && b.q.length <= 200 && b.q.every((x) => x === 0 || x === 1)) q = b.q;
  return { score, total, band, q };
}
// A very small, safe cleaner for the admin form.
function cleanMeta(b) {
  const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const i = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const kind = b.kind === "listening" ? "listening" : "reading";
  const pn = b.passage_no === "" || b.passage_no == null ? null : i(b.passage_no, null, 1, 9);
  return {
    kind, series: s(b.series, 60), test_no: i(b.test_no, 1, 1, 99), passage_no: kind === "reading" ? pn : null,
    title: s(b.title, 140) || "Untitled", minutes: i(b.minutes, kind === "listening" ? 40 : 60, 1, 240), questions: i(b.questions, 40, 1, 120),
    is_free: !!b.is_free, sort: i(b.sort, 0, -9999, 9999),
  };
}
module.exports = { getAccess, getExamSettings, memberOfExamClass, canOpenExam, cleanResult, cleanMeta };
