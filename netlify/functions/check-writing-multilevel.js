// POST /.netlify/functions/check-writing-multilevel
// Body: { taskType: "1.1"|"1.2"|"2", question, essay }
// Auth: Bearer <supabase access token>
//
// Assesses a Multilevel CEFR writing task (Task 1.1, Task 1.2, or Task 2)
// using Gemini for the qualitative judgement (raw score /17, criteria
// breakdown, corrections, weaknesses, tips), then converts that raw score
// to /75 and a CEFR level using fixed lookup tables in THIS file — never
// via the model's own arithmetic — so the conversion always exactly
// matches the official table.
//
// IMPORTANT — read before changing scoring behaviour:
// The per-criterion point split below (Task Achievement/Organisation/
// Vocabulary/Grammar out of 17) is NOT from an official document — the
// official Multilevel criteria descriptors for Task 1.1/1.2/2 were not
// supplied. It's a reasonable placeholder split. If Javlonbek provides the
// real official criteria, replace SYSTEM_PROMPT's rubric section with it.

const { json, missingEnv, getUserFromRequest } = require("./_shared");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function countWords(str) {
  const m = String(str || "").trim().match(/\b[\w'-]+\b/g);
  return m ? m.length : 0;
}

// Exact 17 -> 75 conversion table, as supplied (0.5-point steps).
const CONVERSION_TABLE = [
  [17, 75], [16.5, 74], [16, 72], [15.5, 69], [15, 67], [14.5, 65], [14, 63],
  [13.5, 62], [13, 61], [12.5, 59], [12, 57], [11.5, 56], [11, 54], [10.5, 53],
  [10, 51], [9.5, 50], [9, 49], [8.5, 47], [8, 45], [7.5, 43], [7, 42],
  [6.5, 40], [6, 38], [5.5, 35], [5, 32], [4.5, 29], [4, 26], [3.5, 23],
  [3, 21], [2.5, 18], [2, 15], [1.5, 13], [1, 11], [0.5, 10], [0, 0],
];

function convertRawTo75(raw) {
  // Snap to nearest 0.5 step in range, then look up the exact table value.
  let r = Math.round(Number(raw) * 2) / 2;
  r = Math.max(0, Math.min(17, isFinite(r) ? r : 0));
  const hit = CONVERSION_TABLE.find((row) => row[0] === r);
  return hit ? hit[1] : 0;
}

// CEFR bands sourced from Uzbekistan's official National Testing Center
// document (uzbmb.uz) for the /75 scale, since the uploaded materials for
// this tool didn't include CEFR thresholds themselves.
function cefrFor75(score75) {
  if (score75 >= 65) return "C1";
  if (score75 >= 51) return "B2";
  if (score75 >= 38) return "B1";
  return "Below B1";
}

const TASK_GUIDANCE = {
  "1.1":
    "Task 1.1: an informal reply to a friend's message. Typical length ~50 words. Register: informal/friendly. Every requested point in the prompt must be addressed.",
  "1.2":
    "Task 1.2: a formal or semi-formal reply to the sender of the original message, reusing and expanding the same content for a different, more formal audience. Typical length ~120-150 words. Register: formal/semi-formal, consistent throughout.",
  "2":
    "Task 2: a discursive essay with a clear personal stance, developed reasons and concrete examples, organised into clear paragraphs. Typical length ~180-200 words.",
};

const SYSTEM_PROMPT = `You are a strict, experienced Multilevel CEFR Writing examiner (the Uzbekistan national English proficiency exam), assessing one of: Task 1.1, Task 1.2, or Task 2.

Score using FOUR criteria that must sum to a raw score out of 17:
- Task Achievement (0-5): does the response fulfil the task, address every required point, use the right register/audience for this specific task type, and stay on topic?
- Organisation & Cohesion (0-4): paragraphing, logical progression, linking, clarity of relationships between ideas.
- Vocabulary (0-4): range, precision, appropriacy, collocation, word formation, repetition, lexical errors.
- Grammar (0-4): range and accuracy of structures, whether errors interfere with communication.

Be objective and consistent, not a cheerleader. Do not inflate scores. Do not reward length, difficult vocabulary, or many linking words for their own sake — reward accurate, appropriate, task-fulfilling writing. A raw score may use 0.5 steps per criterion if needed, but the four criteria must sum to a value between 0 and 17.

Return ONLY a valid JSON object (no markdown, no commentary) with EXACTLY this shape:
{
  "task_achievement": { "score": <number 0-5>, "comment": "<1-2 sentences, evidence-based>" },
  "organisation_cohesion": { "score": <number 0-4>, "comment": "<1-2 sentences>" },
  "vocabulary": { "score": <number 0-4>, "comment": "<1-2 sentences>" },
  "grammar": { "score": <number 0-4>, "comment": "<1-2 sentences>" },
  "raw_score": <number 0-17, the exact sum of the four scores above>,
  "corrections": [
    { "original": "<exact phrase from the essay>", "correction": "<improved version>", "explanation": "<why, short>" }
  ],
  "weaknesses": [ "<specific weakness, what's wrong, why it matters, how to fix>", "..." ],
  "improvements": [ "<concrete, actionable advice>", "..." ],
  "summary": "<2-3 sentence overall verdict, objective and evidence-based>"
}

Rules:
- Provide 4 to 8 of the most useful corrections. "original" must be copied verbatim from the essay.
- Provide 3 to 5 weaknesses and 3 to 5 improvements.
- If the response is off-topic, far too short, memorised, or otherwise clearly deficient, reflect that honestly and strictly in the scores — do not award points for merely writing in English.
- Keep every string concise, specific, and evidence-based (quote or paraphrase what the student actually wrote).`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }
  if (missingEnv() || !process.env.GEMINI_API_KEY) {
    return json(500, {
      error:
        "Backend not fully configured. Check SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY in Netlify.",
    });
  }

  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in to check your writing." });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request." });
  }

  const taskType = String(body.taskType || "").trim();
  const question = String(body.question || "").trim();
  const essay = String(body.essay || "").trim();

  if (!["1.1", "1.2", "2"].includes(taskType)) {
    return json(400, { error: "Please choose a task type: 1.1, 1.2, or 2." });
  }
  if (!question) return json(400, { error: "Please paste the task prompt." });
  if (!essay) return json(400, { error: "Please paste your response." });

  const words = countWords(essay);
  if (words < 5) {
    return json(400, { error: "Your response is too short to assess." });
  }
  if (words > 1200) {
    return json(400, { error: "That response is unusually long (over 1200 words). Please trim it." });
  }
  if (question.length > 2000) {
    return json(400, { error: "The task prompt is too long." });
  }

  let evaluation;
  try {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        GEMINI_MODEL
      )}:generateContent`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `TASK TYPE: Task ${taskType}\n` +
                  `TASK GUIDANCE: ${TASK_GUIDANCE[taskType]}\n\n` +
                  `TASK PROMPT:\n${question}\n\n` +
                  `STUDENT RESPONSE (${words} words):\n${essay}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("Gemini error", resp.status, detail);
      return json(502, {
        error: "The AI examiner is unavailable right now. Please try again shortly.",
      });
    }

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let content = parts.map((p) => (p && p.text) || "").join("").trim();
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    if (!content) {
      console.error("Gemini empty response", JSON.stringify(data).slice(0, 500));
      return json(502, {
        error: "The AI examiner returned an empty result. Please try again shortly.",
      });
    }
    evaluation = JSON.parse(content);
  } catch (err) {
    console.error("check-writing-multilevel Gemini failure", err);
    return json(502, {
      error: "Could not evaluate the response. Please try again shortly.",
    });
  }

  // The AI's own raw_score is only a sanity fallback — recompute from the
  // four criteria ourselves so the total is always exactly consistent.
  const ta = Math.max(0, Math.min(5, Number(evaluation.task_achievement?.score) || 0));
  const oc = Math.max(0, Math.min(4, Number(evaluation.organisation_cohesion?.score) || 0));
  const vo = Math.max(0, Math.min(4, Number(evaluation.vocabulary?.score) || 0));
  const gr = Math.max(0, Math.min(4, Number(evaluation.grammar?.score) || 0));
  const rawScore = Math.round((ta + oc + vo + gr) * 2) / 2;
  const converted = convertRawTo75(rawScore);
  const cefr = cefrFor75(converted);

  const clean = {
    task_type: `Task ${taskType}`,
    word_count: words,
    raw_score: rawScore,
    max_raw_score: 17,
    converted_score: converted,
    max_converted_score: 75,
    cefr_level: cefr,
    criteria: {
      task_achievement: { score: ta, max: 5, comment: String(evaluation.task_achievement?.comment || "") },
      organisation_cohesion: { score: oc, max: 4, comment: String(evaluation.organisation_cohesion?.comment || "") },
      vocabulary: { score: vo, max: 4, comment: String(evaluation.vocabulary?.comment || "") },
      grammar: { score: gr, max: 4, comment: String(evaluation.grammar?.comment || "") },
    },
    corrections: Array.isArray(evaluation.corrections) ? evaluation.corrections.slice(0, 8) : [],
    weaknesses: Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses.slice(0, 5) : [],
    improvements: Array.isArray(evaluation.improvements) ? evaluation.improvements.slice(0, 5) : [],
    summary: String(evaluation.summary || ""),
  };

  return json(200, clean);
};
