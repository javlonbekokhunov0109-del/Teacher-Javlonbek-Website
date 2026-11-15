// POST /.netlify/functions/exam-result  { test_id, score, total, band?, q? }
// Saves one finished attempt for the signed-in student (only for a test they are allowed to open).
const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");
const { getAccess, getExamSettings, canOpenExam, cleanResult } = require("./_exams");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  let b; try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }
  if (!b.test_id || !/^[0-9a-f-]{36}$/i.test(String(b.test_id))) return json(400, { error: "Missing test." });
  const row = cleanResult(b);
  if (!row) return json(400, { error: "Invalid result." });
  const db = serviceClient();
  try {
    const t = await db.from("exam_tests").select("id, is_free, ready, questions").eq("id", b.test_id).maybeSingle();
    if (!t.data || !t.data.ready) return json(404, { error: "Test not found." });
    const [access, settings] = await Promise.all([getAccess(db, user), getExamSettings(db)]);
    if (!canOpenExam(access, settings, t.data)) return json(403, { error: "No access." });
    // do not pile up identical double posts (page reloads, double clicks)
    const last = await db.from("exam_results").select("id, score, total, created_at").eq("user_id", user.id).eq("test_id", b.test_id).order("created_at", { ascending: false }).limit(1);
    const l = last.data && last.data[0];
    if (l && l.score === row.score && l.total === row.total && Date.now() - new Date(l.created_at).getTime() < 60 * 1000) return json(200, { ok: true, duplicate: true });
    const ins = await db.from("exam_results").insert({ user_id: user.id, test_id: b.test_id, score: row.score, total: row.total, band: row.band, q: row.q });
    if (ins.error) throw ins.error;
    return json(200, { ok: true });
  } catch (e) {
    console.error("exam-result", e);
    return json(500, { error: "Could not save the result." });
  }
};
