// GET /.netlify/functions/exam-open?id=<test id>
// Checks the student may open this test, then returns short-lived links to the (private) test page and audio.
const { json, missingEnv, serviceClient, getUserFromRequest, BUCKET } = require("./_shared");
const { getAccess, getExamSettings, canOpenExam } = require("./_exams");
const EXPIRES = 60 * 60 * 4;

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  const id = (event.queryStringParameters || {}).id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: "Missing test id." });
  const db = serviceClient();
  try {
    const r = await db.from("exam_tests").select("id, kind, series, test_no, passage_no, title, minutes, questions, is_free, ready, html_path, audio_path").eq("id", id).maybeSingle();
    const t = r.data;
    const [access, settings] = await Promise.all([getAccess(db, user), getExamSettings(db)]);
    if (!t || !t.html_path || (!t.ready && !access.admin)) return json(404, { error: "Test not found." });
    if (!canOpenExam(access, settings, t)) return json(403, { locked: true, error: "These tests are for IELTS WARRIORS students." });
    const h = await db.storage.from(BUCKET).createSignedUrl(t.html_path, EXPIRES);
    if (h.error || !h.data) return json(500, { error: "Could not open this test." });
    let audio = null;
    if (t.audio_path) {
      const a = await db.storage.from(BUCKET).createSignedUrl(t.audio_path, EXPIRES);
      if (a.error || !a.data) return json(500, { error: "Could not open the audio." });
      audio = a.data.signedUrl;
    }
    return json(200, {
      test: { id: t.id, kind: t.kind, series: t.series, test_no: t.test_no, passage_no: t.passage_no, title: t.title, minutes: t.minutes, questions: t.questions },
      html_url: h.data.signedUrl, audio_url: audio,
    });
  } catch (e) {
    console.error("exam-open", e);
    return json(500, { error: "Could not open this test." });
  }
};
