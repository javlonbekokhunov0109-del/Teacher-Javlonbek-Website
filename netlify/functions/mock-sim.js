// GET /.netlify/functions/mock-sim?id=<mock id>&part=listening|reading&n=<1..>
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
  const q = event.queryStringParameters || {}, part = q.part, n = parseInt(q.n || "1", 10);
  if (!/^[0-9a-f-]{36}$/i.test(String(q.id || "")) || (part !== "listening" && part !== "reading") || !(n >= 1 && n <= 12)) return json(400, { error: "Invalid request." });
  const db = serviceClient();
  try {
    const access = await getAccess(db, user);
    const { data: m } = await db.from("mocks").select("id, number, is_free, published, listening_item").eq("id", q.id).maybeSingle();
    if (!m || (!m.published && !access.admin)) return json(404, { error: "Mock not found." });
    if (!canOpenMock(access, m)) return json(403, { locked: true, error: "This mock is part of the paid pack." });
    const sims = simsFor(m.number);
    const entry = part === "listening" ? sims.listening : sims.reading[n - 1];
    const page = entry && readSim(entry.file);
    if (!page) return json(404, { error: "This part is not available yet." });
    if (part === "reading") return html(200, page);

    let audioUrl = null;
    if (m.listening_item) {
      const it = await db.from("content_items").select("storage_path, ready").eq("id", m.listening_item).maybeSingle();
      if (it.data && it.data.storage_path && (it.data.ready || access.admin)) {
        const s = await db.storage.from(BUCKET).createSignedUrl(it.data.storage_path, 4 * 3600);
        if (s.data && s.data.signedUrl) audioUrl = absoluteStorageUrl(s.data.signedUrl);
      }
    }
    const inject = "<script>window.MOCK_AUDIO_URL=" + JSON.stringify(audioUrl).replace(/</g, "\\u003c") + ";</script>";
    return html(200, page.replace(/<head[^>]*>/i, (h) => h + inject));
  } catch (e) {
    console.error("mock-sim", e);
    return json(500, { error: "Could not open this test." });
  }
};
