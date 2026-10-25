// GET /.netlify/functions/mock-sim?id=<mock id>&part=listening|reading
// Returns one interactive test page (HTML) if - and only if - the signed-in student may open this mock.
// For Listening, a short-lived protected link to the recording (the mock's attached audio file) is injected.
const { json, missingEnv, serviceClient, getUserFromRequest, BUCKET, absoluteStorageUrl } = require("./_shared");
const { getAccess, canOpenMock } = require("./_access");
const { readSim, simsFor } = require("./_sims");

const html = (status, body) => ({ statusCode: status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }, body });

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  const q = event.queryStringParameters || {}, part = q.part;
  if (!/^[0-9a-f-]{36}$/i.test(String(q.id || "")) || (part !== "listening" && part !== "reading") ) return json(400, { error: "Invalid request." });
  const db = serviceClient();
  try {
    const access = await getAccess(db, user);
    const { data: m } = await db.from("mocks").select("id, number, is_free, published, listening_item").eq("id", q.id).maybeSingle();
    if (!m || (!m.published && !access.admin)) return json(404, { error: "Mock not found." });
    if (!canOpenMock(access, m)) return json(403, { locked: true, error: "This mock is part of the paid pack." });
    // inside a full-mock sitting the page learns its attempt and its wall-clock deadline (so a refresh cannot stop the clock)
    let sitting = null;
    if (q.attempt) {
      if (!/^[0-9a-f-]{36}$/i.test(String(q.attempt))) return json(400, { error: "Invalid sitting." });
      const { data: at } = await db.from("mock_attempts").select("id, user_id, mock_id, status, state").eq("id", q.attempt).maybeSingle();
      const sec = at && at.state && at.state.sections && at.state.sections[part];
      if (!at || at.user_id !== user.id || at.mock_id !== m.id || at.status !== "in_progress" || !sec || sec.status === "ready") return json(409, { error: "This part is not open in your sitting." });
      sitting = { attempt: at.id, section: part, deadline: sec.deadline || null, done: sec.status === "done" };
    }
    const sims = simsFor(m.number);
    const entry = part === "listening" ? sims.listening : sims.reading;
    const page = entry && readSim(entry.file);
    if (!page) return json(404, { error: "This part is not available yet." });
    const sit = sitting ? "<script>window.MOCK_SITTING=" + JSON.stringify(sitting).replace(/</g, "\\u003c") + ";</script>" : "";
    if (part === "reading") return html(200, sitting ? page.replace(/<head[^>]*>/i, (h) => h + sit) : page);

    let audioUrl = entry.audio || null;
    if (!audioUrl && m.listening_item) {
      const it = await db.from("content_items").select("storage_path, ready").eq("id", m.listening_item).maybeSingle();
      if (it.data && it.data.storage_path && (it.data.ready || access.admin)) {
        const s = await db.storage.from(BUCKET).createSignedUrl(it.data.storage_path, 4 * 3600);
        if (s.data && s.data.signedUrl) audioUrl = absoluteStorageUrl(s.data.signedUrl);
      }
    }
    const inject = "<script>window.MOCK_AUDIO_URL=" + JSON.stringify(audioUrl).replace(/</g, "\\u003c") + ";</script>" + sit;
    return html(200, page.replace(/<head[^>]*>/i, (h) => h + inject));
  } catch (e) {
    console.error("mock-sim", e);
    return json(500, { error: "Could not open this test." });
  }
};
