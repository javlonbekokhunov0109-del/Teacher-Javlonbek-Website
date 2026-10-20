// POST /.netlify/functions/check-writing
// Body: { question, essay }
// Auth: Bearer <supabase access token>
// Verifies the student, sends the essay to Google Gemini for an IELTS Task 2 evaluation, saves the result
// to the database, and returns it. The Gemini key stays server-side (GEMINI_API_KEY in Netlify).
//
// MARKING: the examiner prompt is calibrated on the official Cambridge sample answers (see _prompts.js) and,
// together with the optional calibration offset, can be edited from Admin -> Mocks without a deploy.

const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");
const {
  getSettings, modelOf, writingPromptOf, countWords, callGemini, AIError, aiMessage, cleanEvaluation, WRITING_KEYS,
} = require("./_marking");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (missingEnv() || !process.env.GEMINI_API_KEY) {
    return json(500, { error: "Backend not fully configured. Check SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY in Netlify." });
  }

  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in to check your writing." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }

  const question = String(body.question || "").trim();
  const essay = String(body.essay || "").trim();
  if (!question) return json(400, { error: "Please paste the Task 2 question." });
  if (!essay) return json(400, { error: "Please paste your essay." });

  const words = countWords(essay);
  if (words < 20) return json(400, { error: "Your essay is too short to assess (minimum 20 words)." });
  if (words > 1200) return json(400, { error: "That essay is unusually long (over 1200 words). Please trim it." });
  if (question.length > 2000) return json(400, { error: "The question is too long." });

  const db = serviceClient();
  const settings = await getSettings(db);

  let clean;
  try {
    const raw = await callGemini({
      system: writingPromptOf(settings),
      model: modelOf(settings),
      parts: [{ text: `IELTS Writing TASK 2 (minimum 250 words)\nQUESTION:\n${question}\n\nCANDIDATE ANSWER (${words} words${words < 250 ? " - UNDER the minimum length" : ""}):\n${essay}` }],
    });
    clean = cleanEvaluation(raw, WRITING_KEYS, { offset: settings.calibration_offset, showRange: settings.show_range });
  } catch (err) {
    const code = err instanceof AIError ? err.code : "gemini_network";
    console.error("check-writing AI failure", code, err && err.status);
    return json(502, { error: aiMessage(code) });
  }
  clean.word_count = words;

  // Save (service client bypasses RLS; user_id comes from the verified token, so it can't be spoofed).
  const row = {
    user_id: user.id, question, essay,
    task_response: clean.task_response.band, coherence_cohesion: clean.coherence_cohesion.band,
    lexical_resource: clean.lexical_resource.band, grammatical_range_accuracy: clean.grammatical_range_accuracy.band,
    overall_band: clean.overall_band, word_count: words, feedback: clean,
  };
  const { data: saved, error: dbErr } = await db.from("submissions").insert(row).select("id, created_at").single();
  if (dbErr) {
    console.error("DB insert error", dbErr);
    return json(200, { ...clean, id: null, created_at: null, saved: false });
  }
  await db.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
  return json(200, { ...clean, id: saved.id, created_at: saved.created_at, saved: true });
};
