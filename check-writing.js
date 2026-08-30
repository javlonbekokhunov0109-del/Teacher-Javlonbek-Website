// POST /.netlify/functions/check-writing
// Body: { question, essay }
// Auth: Bearer <supabase access token>
// Verifies the student, sends the essay to Google Gemini for an IELTS Task 2
// evaluation, saves the result to the database, and returns it.
// The Gemini API key stays server-side (GEMINI_API_KEY in Netlify) and is
// never sent to the browser.

const {
  json,
  missingEnv,
  serviceClient,
  getUserFromRequest,
} = require("./_shared");

// Free-tier Gemini model via the Gemini Developer API (Google AI Studio key).
// Override with GEMINI_MODEL if you ever want gemini-2.5-flash-lite or a newer one.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function countWords(str) {
  const m = String(str || "").trim().match(/\b[\w'-]+\b/g);
  return m ? m.length : 0;
}

// Force a band into a valid IELTS value: 0–9 in 0.5 steps.
function normBand(v) {
  let n = Number(v);
  if (!isFinite(n)) n = 0;
  n = Math.max(0, Math.min(9, n));
  return Math.round(n * 2) / 2;
}

// IELTS overall = average of the four criteria, rounded to the nearest 0.5.
function overallBand(a, b, c, d) {
  const avg = (a + b + c + d) / 4;
  return Math.round(avg * 2) / 2;
}

const SYSTEM_PROMPT = `You are a strict, experienced IELTS Writing examiner. You assess IELTS Academic/General Writing Task 2 essays using the official public band descriptors for the four criteria:
- Task Response (TR)
- Coherence and Cohesion (CC)
- Lexical Resource (LR)
- Grammatical Range and Accuracy (GRA)

Be fair but rigorous, like a real examiner. Bands are 0–9 in 0.5 steps. Do not inflate scores. Judge the essay only, in the context of the given question.

Return ONLY a valid JSON object (no markdown, no commentary) with EXACTLY this shape:
{
  "task_response": { "band": <number>, "comment": "<1-2 sentences>" },
  "coherence_cohesion": { "band": <number>, "comment": "<1-2 sentences>" },
  "lexical_resource": { "band": <number>, "comment": "<1-2 sentences>" },
  "grammatical_range_accuracy": { "band": <number>, "comment": "<1-2 sentences>" },
  "corrections": [
    { "original": "<exact phrase from the essay>", "correction": "<improved version>", "explanation": "<why, short>" }
  ],
  "weaknesses": [ "<specific weakness>", "..." ],
  "improvements": [ "<concrete, actionable advice>", "..." ],
  "summary": "<2-3 sentence overall verdict and what to prioritise>"
}

Rules:
- Provide 4 to 8 of the most useful corrections (grammar, word choice, collocation, cohesion). "original" must be copied verbatim from the essay.
- Provide 3 to 5 weaknesses and 3 to 5 improvements.
- Keep every string concise and specific. No band scores inside comments unless natural.
- If the essay is off-topic, too short, or memorised, reflect that honestly in TR and the bands.`;

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

  const question = String(body.question || "").trim();
  const essay = String(body.essay || "").trim();

  if (!question) return json(400, { error: "Please paste the Task 2 question." });
  if (!essay) return json(400, { error: "Please paste your essay." });

  const words = countWords(essay);
  if (words < 20) {
    return json(400, { error: "Your essay is too short to assess (minimum 20 words)." });
  }
  if (words > 1200) {
    return json(400, { error: "That essay is unusually long (over 1200 words). Please trim it." });
  }
  if (question.length > 2000) {
    return json(400, { error: "The question is too long." });
  }

  // ---- Call Google Gemini ----
  // Gemini Developer API. The key travels only in the server-side request
  // header (x-goog-api-key), never in a URL or to the browser. We force a
  // JSON reply with responseMimeType so the output shape stays identical.
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
                  `IELTS Writing Task 2 QUESTION:\n${question}\n\n` +
                  `STUDENT ESSAY (${words} words):\n${essay}`,
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
    // Gemini returns candidates[0].content.parts[]; concatenate any text parts.
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let content = parts.map((p) => (p && p.text) || "").join("").trim();
    // Defensive: strip a ```json fence if the model ever adds one.
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    if (!content) {
      console.error("Gemini empty response", JSON.stringify(data).slice(0, 500));
      return json(502, {
        error: "The AI examiner returned an empty result. Please try again shortly.",
      });
    }
    evaluation = JSON.parse(content);
  } catch (err) {
    console.error("check-writing Gemini failure", err);
    return json(502, {
      error: "Could not evaluate the essay. Please try again shortly.",
    });
  }

  // ---- Normalise the AI output so the data is always clean ----
  const tr = normBand(evaluation?.task_response?.band);
  const cc = normBand(evaluation?.coherence_cohesion?.band);
  const lr = normBand(evaluation?.lexical_resource?.band);
  const gra = normBand(evaluation?.grammatical_range_accuracy?.band);
  const overall = overallBand(tr, cc, lr, gra);

  const clean = {
    task_response: {
      band: tr,
      comment: String(evaluation?.task_response?.comment || "").trim(),
    },
    coherence_cohesion: {
      band: cc,
      comment: String(evaluation?.coherence_cohesion?.comment || "").trim(),
    },
    lexical_resource: {
      band: lr,
      comment: String(evaluation?.lexical_resource?.comment || "").trim(),
    },
    grammatical_range_accuracy: {
      band: gra,
      comment: String(evaluation?.grammatical_range_accuracy?.comment || "").trim(),
    },
    overall_band: overall,
    corrections: Array.isArray(evaluation?.corrections)
      ? evaluation.corrections.slice(0, 12).map((c) => ({
          original: String(c?.original || "").trim(),
          correction: String(c?.correction || "").trim(),
          explanation: String(c?.explanation || "").trim(),
        }))
      : [],
    weaknesses: Array.isArray(evaluation?.weaknesses)
      ? evaluation.weaknesses.slice(0, 8).map((w) => String(w).trim()).filter(Boolean)
      : [],
    improvements: Array.isArray(evaluation?.improvements)
      ? evaluation.improvements.slice(0, 8).map((w) => String(w).trim()).filter(Boolean)
      : [],
    summary: String(evaluation?.summary || "").trim(),
    word_count: words,
  };

  // ---- Save to the database (service client bypasses RLS safely; we set
  //      user_id ourselves from the verified token, so it can't be spoofed) ----
  const db = serviceClient();
  const row = {
    user_id: user.id,
    question,
    essay,
    task_response: clean.task_response.band,
    coherence_cohesion: clean.coherence_cohesion.band,
    lexical_resource: clean.lexical_resource.band,
    grammatical_range_accuracy: clean.grammatical_range_accuracy.band,
    overall_band: clean.overall_band,
    word_count: words,
    feedback: clean, // full JSON kept for the detail view
  };

  const { data: saved, error: dbErr } = await db
    .from("submissions")
    .insert(row)
    .select("id, created_at")
    .single();

  if (dbErr) {
    console.error("DB insert error", dbErr);
    // The evaluation still succeeded — return it, but tell the client it wasn't saved.
    return json(200, { ...clean, id: null, created_at: null, saved: false });
  }

  // keep the student's presence fresh
  await db
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  return json(200, {
    ...clean,
    id: saved.id,
    created_at: saved.created_at,
    saved: true,
  });
};
