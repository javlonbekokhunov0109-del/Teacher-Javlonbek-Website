// GET /.netlify/functions/exam-list
// Every ready exam test (so locked ones can be shown with a lock) + the student's own best result per test.
// Never returns storage paths: the student asks exam-open for a short-lived link per test.
const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");
const { getAccess, getExamSettings, memberOfExamClass, canOpenExam } = require("./_exams");

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  const db = serviceClient();
  try {
    const [t, access, settings, res] = await Promise.all([
      db.from("exam_tests").select("id, kind, series, test_no, passage_no, title, minutes, questions, is_free, audio_path, sort, created_at").eq("ready", true),
      getAccess(db, user), getExamSettings(db),
      db.from("exam_results").select("test_id, score, total, band, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
    ]);
    if (t.error) throw t.error;
    const mine = {};
    (res.data || []).forEach((r) => {
      const m = (mine[r.test_id] = mine[r.test_id] || { attempts: 0, best: null, last_at: r.created_at });
      m.attempts++; if (!m.best || r.score > m.best.score) m.best = { score: r.score, total: r.total, band: r.band };
    });
    const tests = (t.data || []).map((x) => ({
      id: x.id, kind: x.kind, series: x.series, test_no: x.test_no, passage_no: x.passage_no, title: x.title,
      minutes: x.minutes, questions: x.questions, is_free: !!x.is_free, sort: x.sort,
      locked: !canOpenExam(access, settings, x), mine: mine[x.id] || null,
    }));
    return json(200, { tests, member: memberOfExamClass(access, settings), admin: !!access.admin });
  } catch (e) {
    console.error("exam-list", e);
    return json(500, { error: "Could not load the tests." });
  }
};
