// Shared AI-marking helpers for the IELTS Writing checker, the mock tests and the Speaking check.
// Prompts, calibration offset, limits and the speaking switch come from the mock_settings row
// (editable in Admin -> Mocks), falling back to safe built-in defaults if the table is missing.
const { WRITING_PROMPT, SPEAKING_PROMPT } = require("./_prompts");

const DEFAULTS = {
  writing_prompt: null, speaking_prompt: null, calibration_offset: 0, ml_offset: 0, show_range: true,
  speaking_enabled: false, daily_limit_free: 6, daily_limit_member: 30, gemini_model: null,
};

async function getSettings(db) {
  try {
    const { data, error } = await db.from("mock_settings").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return { ...DEFAULTS };
    return { ...DEFAULTS, ...data, calibration_offset: Math.min(1, Math.max(-0.5, Number(data.calibration_offset) || 0)), ml_offset: Math.min(2, Math.max(-2, Number(data.ml_offset) || 0)) };
  } catch (e) { return { ...DEFAULTS }; }
}
const modelOf = (s) => (s && s.gemini_model) || process.env.GEMINI_MODEL || "gemini-2.5-flash";
const writingPromptOf = (s) => (s && s.writing_prompt && s.writing_prompt.trim()) || WRITING_PROMPT;
const speakingPromptOf = (s) => (s && s.speaking_prompt && s.speaking_prompt.trim()) || SPEAKING_PROMPT;

function countWords(str) { const m = String(str || "").trim().match(/\b[\w'’-]+\b/g); return m ? m.length : 0; }

// ---------- Gemini ----------
class AIError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }

// timeoutMs is the TOTAL time budget (a Netlify sync function is killed at ~10 s, so we give up gracefully before that).
async function callGemini({ system, parts, model, timeoutMs = Number(process.env.AI_SYNC_BUDGET_MS) || 9000, retries = 1 }) {
  const base = (process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(Math.max(500, deadline - Date.now())),
      });
      if (!resp.ok) {
        const e = new AIError("gemini_http", resp.status);
        // quick failures (rate limit / server error) are retried once if there is still time; a timeout never is
        if ((resp.status === 429 || resp.status >= 500) && attempt < retries && deadline - Date.now() > 2500) { lastErr = e; await new Promise((r) => setTimeout(r, 400)); continue; }
        throw e;
      }
      const data = await resp.json();
      const text = ((data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
        .map((p) => (p && p.text) || "").join("").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      if (!text) throw new AIError("gemini_empty");
      try { return JSON.parse(text); } catch (e) { throw new AIError("gemini_bad_json"); }
    } catch (e) {
      if (e instanceof AIError) throw e;
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AIError("gemini_timeout");
      throw new AIError("gemini_network");
    }
  }
  throw lastErr || new AIError("gemini_network");
}
const AI_MESSAGES = {
  gemini_http: "The AI examiner is busy right now. Please try again in a minute.",
  gemini_empty: "The AI examiner returned an empty result. Please try again.",
  gemini_bad_json: "The AI examiner returned an unreadable result. Please try again.",
  gemini_timeout: "The AI examiner took too long. Please try again.",
  gemini_network: "Could not reach the AI examiner. Please try again shortly.",
  bad_shape: "The AI examiner returned an incomplete result. Please try again.",
  not_assessable: "We couldn't hear enough speech to mark. Check your microphone and record again.",
};
const aiMessage = (code) => AI_MESSAGES[code] || AI_MESSAGES.gemini_network;

// ---------- bands ----------
function normBand(v) { let n = Number(v); if (!isFinite(n)) n = 0; n = Math.max(0, Math.min(9, n)); return Math.round(n * 2) / 2; }
// teacher's calibration (-0.5 .. +1), never applied to a zero and never outside 0 .. 9
function adjust(band, offset) { if (band <= 0) return 0; return Math.max(0, Math.min(9, Math.round((band + (offset || 0)) * 2) / 2)); }
function overallOf(bands) { const avg = bands.reduce((a, b) => a + b, 0) / bands.length; return Math.round(avg * 2) / 2; }
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const strList = (v, max, n = 400) => (Array.isArray(v) ? v.slice(0, max).map((x) => str(x, n)).filter(Boolean) : []);

const WRITING_KEYS = ["task_response", "coherence_cohesion", "lexical_resource", "grammatical_range_accuracy"];
const SPEAKING_KEYS = ["fluency_coherence", "lexical_resource", "grammatical_range_accuracy", "pronunciation"];

function cleanEvaluation(raw, keys, { offset = 0, showRange = true } = {}) {
  if (!raw || typeof raw !== "object") throw new AIError("bad_shape");
  const out = {}; const bands = []; let valid = 0;
  for (const k of keys) {
    const c = raw[k]; const given = c && c.band !== undefined && c.band !== null && c.band !== "" && isFinite(Number(c.band));
    if (given) valid++;
    const b = adjust(normBand(c && c.band), offset);
    out[k] = { band: b, comment: str(c && c.comment, 700) };
    bands.push(b);
  }
  if (valid < 3) throw new AIError("bad_shape");
  const overall = overallOf(bands);
  out.overall_band = overall;
  out.overall_range = showRange ? { low: Math.max(0, overall - 0.5), high: Math.min(9, overall + 0.5) } : null;
  out.corrections = Array.isArray(raw.corrections) ? raw.corrections.slice(0, 12).map((c) => ({ original: str(c && c.original, 300), correction: str(c && c.correction, 300), explanation: str(c && c.explanation, 400) })).filter((c) => c.original) : [];
  out.strengths = strList(raw.strengths, 6);
  out.weaknesses = strList(raw.weaknesses, 8);
  out.improvements = strList(raw.improvements, 8);
  out.summary = str(raw.summary, 900);
  out.calibration = { offset: offset || 0 };
  return out;
}

module.exports = {
  DEFAULTS, getSettings, modelOf, writingPromptOf, speakingPromptOf, countWords, callGemini, AIError, aiMessage,
  normBand, adjust, overallOf, cleanEvaluation, WRITING_KEYS, SPEAKING_KEYS, WRITING_PROMPT, SPEAKING_PROMPT,
};
