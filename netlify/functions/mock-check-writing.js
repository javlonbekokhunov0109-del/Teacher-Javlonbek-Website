// POST /.netlify/functions/mock-check-writing   { mock_id, task: 1|2, text }
// Marks one Writing task of a mock with Gemini (calibrated prompt + optional offset from mock_settings) and saves it.
const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");
const { getAccess, canOpenMock, usedToday, limitFor } = require("./_access");
const { getSettings, modelOf, writingPromptOf, countWords, callGemini, AIError, aiMessage, cleanEvaluation, WRITING_KEYS } = require("./_marking");
const { describeTask1 } = require("./_mockdata");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (missingEnv() || !process.env.GEMINI_API_KEY) return json(500, { error: "Backend not fully configured (Gemini key missing)." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in to check your writing." });
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }
  const task = Number(body.task), mockId = String(body.mock_id || ""); let text = String(body.text || "").trim();
  const attemptId = body.attempt_id ? String(body.attempt_id) : null;
  if (attemptId && !/^[0-9a-f-]{36}$/i.test(attemptId)) return json(400, { error: "Invalid sitting." });
  if (task !== 1 && task !== 2) return json(400, { error: "Task must be 1 or 2." });
  if (!/^[0-9a-f-]{36}$/i.test(mockId)) return json(400, { error: "Missing mock." });
  if (text.length > 14000) return json(400, { error: "That is far too long for one task." });
  const db = serviceClient();
  try {
    if (attemptId) {   // marking a full-mock sitting: the text is the one SAVED in the sitting (not whatever the browser sends)
      const { data: at } = await db.from("mock_attempts").select("id, user_id, mock_id, status, state").eq("id", attemptId).maybeSingle();
      if (!at || at.user_id !== user.id || at.mock_id !== mockId || at.status !== "in_progress") return json(404, { error: "Sitting not found." });
      const ws = at.state && at.state.sections && at.state.sections.writing;
      if (!ws || ws.status !== "done") return json(409, { error: "Submit the Writing section first." });
      text = String(((at.state.data || {}).writing || {})["t" + task] || "").trim();
    }
    const words = countWords(text);
    if (words < 20) return json(400, { error: attemptId ? `Task ${task} is too short to mark (it has ${words} words). It will count as not marked.` : "Your answer is too short to assess (minimum 20 words)." });
    if (words > 1200) return json(400, { error: "That answer is unusually long (over 1200 words). Please trim it." });
    const [access, settings] = await Promise.all([getAccess(db, user), getSettings(db)]);
    const { data: mock } = await db.from("mocks").select("id, number, title, is_free, published, writing").eq("id", mockId).maybeSingle();
    if (!mock || (!mock.published && !access.admin)) return json(404, { error: "Mock not found." });
    if (!canOpenMock(access, mock)) return json(403, { locked: true, error: "This mock is part of the paid pack." });

    const t = task === 1 ? (mock.writing || {}).task1 : (mock.writing || {}).task2;
    if (!t || !t.question) return json(404, { error: "This mock has no Writing Task " + task + "." });
    const minWords = Number(t.min_words) || (task === 1 ? 150 : 250);

    const used = await usedToday(db, user.id), limit = limitFor(settings, access);
    if (used >= limit) return json(429, { error: `You have used all ${limit} AI checks for today. Come back tomorrow${access.mocks ? "" : ", or unlock the full pack for more"}.`, usage: { used, limit } });

    let userText = task === 1
      ? `IELTS Academic Writing TASK 1 (minimum ${minWords} words)\nQUESTION:\n${t.question}\n\nCHART DATA (use it to check the candidate's figures and overview):\n${describeTask1(t)}\n\n`
      : `IELTS Writing TASK 2 (minimum ${minWords} words)\nQUESTION:\n${t.question}\n\n`;
    userText += `CANDIDATE ANSWER (${words} words${words < minWords ? " - UNDER the minimum length" : ""}):\n${text}`;

    let raw, clean;
    try {
      raw = await callGemini({ system: writingPromptOf(settings), parts: [{ text: userText }], model: modelOf(settings), retries: 1 });
      clean = cleanEvaluation(raw, WRITING_KEYS, { offset: settings.calibration_offset, showRange: settings.show_range });
    } catch (e) {
      const code = e instanceof AIError ? e.code : "gemini_network";
      console.error("mock-check-writing", code, e && e.status);
      return json(502, { error: aiMessage(code) });
    }
    clean.word_count = words; clean.min_words = minWords; clean.under_length = words < minWords;

    const ins = await db.from("mock_results").insert({
      user_id: user.id, mock_id: mock.id, attempt_id: attemptId, section: task === 1 ? "writing_t1" : "writing_t2", status: "done",
      band: clean.overall_band, payload: { text, word_count: words, min_words: minWords, evaluation: clean },
    }).select("id, created_at").single();
    await db.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
    if (ins.error) { console.error("mock-check-writing save", ins.error); return json(200, { evaluation: clean, id: null, saved: false, usage: { used: used + 1, limit } }); }
    return json(200, { id: ins.data.id, created_at: ins.data.created_at, evaluation: clean, saved: true, usage: { used: used + 1, limit } });
  } catch (e) {
    console.error("mock-check-writing", e);
    return json(500, { error: "Could not mark your writing. Please try again." });
  }
};
