// POST /.netlify/functions/mock-check-speaking-background   { id }
// Netlify "background" function: answers 202 immediately and keeps working for up to 15 minutes.
// It fetches the uploaded recording, has Gemini mark it, stores the result on the pending row and deletes the audio.
const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");
const { getSettings, modelOf, speakingPromptOf, callGemini, AIError, aiMessage, cleanEvaluation, SPEAKING_KEYS } = require("./_marking");

const BUCKET = "speaking-audio";
exports.handler = async (event) => {
  if (event.httpMethod !== "POST" || missingEnv() || !process.env.GEMINI_API_KEY) return json(202, {});
  const user = await getUserFromRequest(event);
  if (!user) return json(202, {});
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(202, {}); }
  const id = String(body.id || ""); if (!/^[0-9a-f-]{36}$/i.test(id)) return json(202, {});
  const db = serviceClient();
  const fail = async (code, msg) => { await db.from("mock_results").update({ status: "error", error: msg || aiMessage(code) }).eq("id", id).eq("user_id", user.id); };
  let path = null;
  try {
    const { data: row } = await db.from("mock_results").select("id, user_id, mock_id, status, payload").eq("id", id).maybeSingle();
    if (!row || row.user_id !== user.id || row.status !== "pending") return json(202, {});
    path = `${user.id}/${id}.wav`;
    const settings = await getSettings(db);
    if (!settings.speaking_enabled) { await fail("disabled", "The Speaking AI check is not open yet."); return json(202, {}); }

    const dl = await db.storage.from(BUCKET).download(path);
    if (dl.error || !dl.data) { await fail("upload_missing", "We did not receive your recording. Please record and try again."); return json(202, {}); }
    const buf = Buffer.from(await dl.data.arrayBuffer());
    if (buf.length < 2000) { await fail("not_assessable"); return json(202, {}); }
    if (buf.length > 14 * 1024 * 1024) { await fail("too_big", "That recording is too large. Please record a shorter answer."); return json(202, {}); }

    const { data: mock } = await db.from("mocks").select("speaking").eq("id", row.mock_id).maybeSingle();
    const sp = (mock && mock.speaking) || {}, part = Number(row.payload && row.payload.part) || 1;
    const qs = part === 1 ? [].concat(...(sp.part1 || []).map((t) => (t.questions || []).map((q) => `(${t.topic}) ${q}`)))
      : part === 2 ? [(sp.part2 && sp.part2.title) || "", ...(((sp.part2 && sp.part2.bullets) || []).map((b) => "- " + b)), (sp.part2 && sp.part2.roundoff) || ""] : (sp.part3 || []);
    const ctx = `The candidate is answering IELTS Speaking Part ${part}. The examiner's questions were:\n${qs.filter(Boolean).join("\n")}\n\nThe recording follows. Assess only what you hear.`;

    let clean;
    try {
      const raw = await callGemini({ system: speakingPromptOf(settings), model: modelOf(settings), timeoutMs: 90000, retries: 1,
        parts: [{ text: ctx }, { inline_data: { mime_type: "audio/wav", data: buf.toString("base64") } }] });
      if (raw && raw.assessable === false) throw new AIError("not_assessable");
      clean = cleanEvaluation(raw, SPEAKING_KEYS, { offset: settings.calibration_offset, showRange: settings.show_range });
      clean.transcript = String((raw && raw.transcript) || "").slice(0, 6000);
    } catch (e) {
      const code = e instanceof AIError ? e.code : "gemini_network";
      console.error("speaking check", code, e && e.status);
      await fail(code); return json(202, {});
    }
    await db.from("mock_results").update({ status: "done", band: clean.overall_band, error: null, payload: { ...row.payload, part, evaluation: clean } }).eq("id", id);
  } catch (e) {
    console.error("mock-check-speaking-background", e);
    try { await fail("gemini_network"); } catch (_) {}
  } finally {
    if (path) { try { await db.storage.from(BUCKET).remove([path]); } catch (_) {} }
  }
  return json(202, {});
};
