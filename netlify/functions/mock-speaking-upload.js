// POST /.netlify/functions/mock-speaking-upload   { mock_id, part: 1|2|3, duration_sec }
// Step 1 of the Speaking check: creates a pending result and a one-time private upload slot for the recording.
// (Step 2 = the browser uploads the audio; step 3 = mock-check-speaking-background marks it; step 4 = mock-result is polled.)
const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");
const { getAccess, canOpenMock, usedToday, limitFor } = require("./_access");
const { getSettings } = require("./_marking");

const BUCKET = "speaking-audio";
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }
  const part = Number(body.part), mockId = String(body.mock_id || ""), dur = Number(body.duration_sec);
  if (![1, 2, 3].includes(part) || !/^[0-9a-f-]{36}$/i.test(mockId)) return json(400, { error: "Invalid request." });
  if (!isFinite(dur) || dur < 3) return json(400, { error: "That recording is too short. Please record your answer again." });
  if (dur > 330) return json(400, { error: "That recording is too long (max 5 minutes per part)." });

  const db = serviceClient();
  try {
    const [access, settings] = await Promise.all([getAccess(db, user), getSettings(db)]);
    if (!settings.speaking_enabled) return json(403, { error: "The Speaking AI check is not open yet.", disabled: true });
    const { data: mock } = await db.from("mocks").select("id, is_free, published, speaking").eq("id", mockId).maybeSingle();
    if (!mock || (!mock.published && !access.admin)) return json(404, { error: "Mock not found." });
    if (!canOpenMock(access, mock)) return json(403, { locked: true, error: "This mock is part of the paid pack." });
    const used = await usedToday(db, user.id), limit = limitFor(settings, access);
    if (used >= limit) return json(429, { error: `You have used all ${limit} AI checks for today. Come back tomorrow.`, usage: { used, limit } });

    const ins = await db.from("mock_results").insert({ user_id: user.id, mock_id: mock.id, section: "speaking", status: "pending", payload: { part, duration_sec: Math.round(dur) } }).select("id").single();
    if (ins.error) throw ins.error;
    const path = `${user.id}/${ins.data.id}.wav`;
    const signed = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data) { await db.from("mock_results").delete().eq("id", ins.data.id); throw signed.error || new Error("no upload url"); }
    return json(200, { id: ins.data.id, bucket: BUCKET, path, token: signed.data.token });
  } catch (e) {
    console.error("mock-speaking-upload", e);
    return json(500, { error: "Could not start the recording upload. Please try again." });
  }
};
