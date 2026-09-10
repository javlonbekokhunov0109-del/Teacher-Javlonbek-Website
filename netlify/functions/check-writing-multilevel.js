// POST /.netlify/functions/check-writing-multilevel
// Body EITHER:
//   { mode: "single", taskType: "1.1"|"1.2"|"2", question, essay }
// OR:
//   { mode: "full", tasks: { "1.1": {question,essay}, "1.2": {...}, "2": {...} } }
//
// Auth: Bearer <supabase access token>
//
// Each Multilevel task (1.1, 1.2, 2) is graded on its OWN single holistic
// band scale (not four analytic sub-scores) using the real descriptor
// tables below, transcribed from the images embedded in the teacher's
// uploaded "CEFR_MARKING_.docx". Max bands: Task 1.1 = 5, Task 1.2 = 6,
// Task 2 = 6. Those three maxima sum to exactly 17 — that IS the official
// "17-point" writing raw score, achieved only when all three tasks from
// one sitting are combined (mode "full"). A single task alone never
// reaches 17, so single-task mode reports that task's own band (out of 5
// or 6) and does NOT force a fake /75 conversion.
//
// The 17->75 conversion table and CEFR band thresholds are applied by
// THIS code (not trusted to the AI's arithmetic) so they always exactly
// match the official values.
//
// KNOWN GAP (told to the user): the source images did not fully show
// Task 1.2's bottom two bands (1 and 0). Those two entries below are
// reconstructed by pattern-matching against Task 1.1's and Task 2's
// equivalent bottom bands, which share near-identical wording at every
// other level — flagged here and in the site's chat reply, not silently
// presented as directly-sourced.

const { json, missingEnv, getUserFromRequest, serviceClient } = require("./_shared");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function countWords(str) {
  const m = String(str || "").trim().match(/\b[\w'-]+\b/g);
  return m ? m.length : 0;
}

// Exact 17 -> 75 conversion table (0.5-point steps), as supplied by the user.
const CONVERSION_TABLE = [
  [17, 75], [16.5, 74], [16, 72], [15.5, 69], [15, 67], [14.5, 65], [14, 63],
  [13.5, 62], [13, 61], [12.5, 59], [12, 57], [11.5, 56], [11, 54], [10.5, 53],
  [10, 51], [9.5, 50], [9, 49], [8.5, 47], [8, 45], [7.5, 43], [7, 42],
  [6.5, 40], [6, 38], [5.5, 35], [5, 32], [4.5, 29], [4, 26], [3.5, 23],
  [3, 21], [2.5, 18], [2, 15], [1.5, 13], [1, 11], [0.5, 10], [0, 0],
];
function convertRawTo75(raw) {
  let r = Math.round(Number(raw) * 2) / 2;
  r = Math.max(0, Math.min(17, isFinite(r) ? r : 0));
  const hit = CONVERSION_TABLE.find((row) => row[0] === r);
  return hit ? hit[1] : 0;
}
// CEFR bands for the /75 scale, from Uzbekistan's official National
// Testing Center document (uzbmb.uz) — the uploaded materials for this
// tool didn't include CEFR thresholds themselves.
function cefrFor75(score75) {
  if (score75 >= 65) return "C1";
  if (score75 >= 51) return "B2";
  if (score75 >= 38) return "B1";
  return "Below B1";
}

// ---- Real band-descriptor tables (transcribed from the docx's images) ----
const BANDS = {
  "1.1": {
    max: 5,
    prompt: "Task 1.1 is an informal reply to a friend's message (~50 words).",
    table: [
      [5, "B2 or above", "Performance is likely to be above B1 level."],
      [4, "Higher B1", "Response is on topic and shows the following features: Register may not be consistently appropriate. Good control of simple grammatical structures, errors occur when attempting complex structures. Punctuation and spelling are mostly accurate; errors do not cause misunderstanding. Vocabulary is sufficient to respond to the task. Uses simple cohesive devices to organize the response as a linear sequence of sentences."],
      [3, "Lower B1", "Response is partially on topic and shows the following features: Register may not be consistently appropriate. Good control of simple grammatical structures, errors occur when attempting complex structures. Punctuation and spelling are mostly accurate; errors do not cause misunderstanding. Vocabulary is sufficient to respond to the task. Uses simple cohesive devices to organize the response as a linear sequence of sentences."],
      [2, "A2", "Response may be partially on topic and shows the following features: Uses simple grammatical structures to produce writing at the sentence level. Errors with simple structures are common and sometimes impede understanding. Punctuation and spelling mistakes are noticeable. Vocabulary is not sufficient to respond to the task. Inappropriate lexical choices are noticeable and sometimes impede understanding. Response may not be organized as a cohesive text."],
      [1, "A1 or lower", "Performance is below A2, or substantial use of L1, or no meaningful language, or the response is completely off-topic (e.g. memorized script, guessing)."],
      [0, "—", "No attempt (answer sheet is blank)."],
    ],
  },
  "1.2": {
    max: 6,
    prompt: "Task 1.2 is a formal/semi-formal reply to the sender of the original message, reusing and expanding the same content for a different, more formal audience (~120-150 words).",
    table: [
      [6, "C2", "Performance is likely to be above C1 level."],
      [5, "C1", "Response is on topic and shows the following features: Register is consistently appropriate. A range of complex grammar constructions is used accurately; some minor errors occur, but do not impede understanding. No errors in spelling and punctuation. A range of vocabulary is used to discuss the topics required by the task; some awkward usage or slightly inappropriate lexical choices. A range of cohesive devices is used to indicate the links between ideas."],
      [4, "Higher B2", "Response is on topic and shows the following features: Register is consistently appropriate. Some complex grammar constructions are used accurately; errors do not lead to misunderstanding. Minor errors in punctuation and spelling occur but do not impede understanding. Sufficient range of vocabulary to discuss the topics required by the task; inappropriate lexical choices do not lead to misunderstanding. A limited number of cohesive devices are used to indicate the links between ideas."],
      [3, "Lower B2", "Response may be partially on topic and shows the following features: Register may not be consistently appropriate. Some complex grammar constructions are used accurately; errors do not lead to misunderstanding. Minor errors in punctuation and spelling occur but do not impede understanding. Sufficient range of vocabulary to discuss the topics required by the task; inappropriate lexical choices do not lead to misunderstanding. A limited number of cohesive devices are used to indicate the links between ideas."],
      [2, "B1", "Response may be partially on topic and shows the following features: Register may not be consistently appropriate. Good control of simple grammatical structures, errors occur when attempting complex structures. Punctuation and spelling are mostly accurate; errors do not cause misunderstanding. Vocabulary is sufficient to respond to the task. Uses simple cohesive devices to organize the response as a linear sequence of sentences. [Reconstructed by pattern-match with Task 1.1's band 4 — the source image was cut off here.]"],
      [1, "A2", "Response may be partially on topic and shows the following features: uses simple grammatical structures with errors that are common and sometimes impede understanding; punctuation and spelling mistakes are noticeable; vocabulary is not sufficient and inappropriate lexical choices sometimes impede understanding; response may not be organized as a cohesive text. [Reconstructed by analogy with Task 1.1's band 2 — not directly captured in the source images.]"],
      [0, "—", "No meaningful language, substantial use of L1, completely off-topic (e.g. memorized script, guessing), or no attempt. [Reconstructed by analogy — not directly captured in the source images.]"],
    ],
  },
  "2": {
    max: 6,
    prompt: "Task 2 (Part 2) is a discursive online-discussion post with a clear personal stance, developed reasons and concrete examples (180-200 words).",
    table: [
      [6, "C2", "Performance is likely to be above C1 level."],
      [5, "C1", "Response shows the following features: Fully addresses the question with clear stance and relevant arguments. A range of complex grammar constructions is used accurately; some minor errors occur, but do not impede understanding. A range of vocabulary is used to discuss the topics required by the task; some awkward usage or slightly inappropriate lexical choices. Well-structured post or article with clear paragraphs; smooth flow of ideas and use of linking expressions."],
      [4, "Higher B2", "Response shows the following features: Addresses the question clearly with minor digressions; stance is evident. Some complex grammar constructions are used accurately; errors do not lead to misunderstanding. Minor errors in punctuation and spelling occur but do not impede understanding. Sufficient range of vocabulary to discuss the topics required by the task; inappropriate lexical choices do not lead to misunderstanding. Clear structure with some use of connectors and logical flow."],
      [3, "Lower B2", "Response shows the following features: Mostly relevant but may lack clarity in stance or have minor off-topic parts. Some complex grammar constructions are used accurately; errors do not lead to misunderstanding. Minor errors in punctuation and spelling occur but do not impede understanding. Sufficient range of vocabulary to discuss the topics required by the task; inappropriate lexical choices do not lead to misunderstanding. Some organization; transitions may be unclear or mechanical."],
      [2, "B1", "Response shows the following features: Mostly relevant but may lack clarity in stance or have minor off-topic parts. Good control of simple grammatical structures, errors occur when attempting complex structures. Punctuation and spelling are mostly accurate; errors do not cause misunderstanding. Vocabulary is sufficient to respond to the task. Uses simple cohesive devices to organize the response as a linear sequence of sentences. [The vocabulary/cohesion bullets were reconstructed by pattern-match — the source image was cut off here.]"],
      [1, "A2", "Response shows the following features: Limited focus on task; ideas may be unclear or partly off-topic. Uses simple grammatical structures to produce writing at the sentence level; errors with simple structures are common and sometimes impede understanding. Punctuation and spelling mistakes are noticeable. Vocabulary is not sufficient to respond to the task; inappropriate lexical choices are noticeable and sometimes impede understanding. Response may not be organized as a cohesive text."],
      [0, "—", "No meaningful language, or substantial use of L1, or the response is completely off-topic (e.g. memorized script, guessing), or no attempt (answer sheet is blank)."],
    ],
  },
};

function descriptorBlock(taskType) {
  const b = BANDS[taskType];
  return b.table
    .map((row) => `Band ${row[0]} (${row[1]}): ${row[2]}`)
    .join("\n");
}

function systemPromptFor(taskType) {
  const b = BANDS[taskType];
  return `You are a strict, experienced Multilevel CEFR Writing examiner (the Uzbekistan national English proficiency exam), assessing Task ${taskType}.

${b.prompt}

Score the response using ONLY this official holistic band scale (0 to ${b.max} — an INTEGER, these are NOT sub-criteria to add up, pick the ONE band whose description best matches the response as a whole):

${descriptorBlock(taskType)}

Be objective, consistent, and evidence-based — not a cheerleader. Do not inflate scores. Do not reward length, difficult vocabulary, or many linking words for their own sake. Judge the response against the band descriptions above, choosing the closest match even if it doesn't match every bullet perfectly.

Return ONLY a valid JSON object (no markdown, no commentary) with EXACTLY this shape:
{
  "band": <integer, 0 to ${b.max}>,
  "band_label": "<the label from the table for that exact band, e.g. 'Higher B2'>",
  "comment": "<2-3 sentences, evidence-based, citing what the student actually wrote and which descriptor features justify this band>",
  "corrections": [
    { "original": "<exact phrase from the response>", "correction": "<improved version>", "explanation": "<why, short>" }
  ],
  "weaknesses": [ "<specific weakness: what's wrong, why it matters, how to fix>", "..." ],
  "improvements": [ "<concrete, actionable advice>", "..." ]
}

Rules:
- Provide 3 to 6 of the most useful corrections. "original" must be copied verbatim from the response.
- Provide 2 to 4 weaknesses and 2 to 4 improvements.
- If the response is off-topic, far too short, memorised, or blank, reflect that honestly and strictly in the band — do not award points for merely writing in English.`;
}

async function gradeOneTask(taskType, question, essay) {
  const words = countWords(essay);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPromptFor(taskType) }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `TASK PROMPT:\n${question}\n\nSTUDENT RESPONSE (${words} words):\n${essay}`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error("Gemini error", resp.status, detail);
    throw new Error("gemini_unavailable");
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  let content = parts.map((p) => (p && p.text) || "").join("").trim();
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  if (!content) throw new Error("gemini_empty");

  const evaluation = JSON.parse(content);
  const max = BANDS[taskType].max;
  const band = Math.max(0, Math.min(max, Math.round(Number(evaluation.band) || 0)));
  const tableRow = BANDS[taskType].table.find((r) => r[0] === band);

  return {
    task_type: `Task ${taskType}`,
    word_count: words,
    band,
    max_band: max,
    band_label: tableRow ? tableRow[1] : String(evaluation.band_label || ""),
    comment: String(evaluation.comment || ""),
    corrections: Array.isArray(evaluation.corrections) ? evaluation.corrections.slice(0, 6) : [],
    weaknesses: Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses.slice(0, 4) : [],
    improvements: Array.isArray(evaluation.improvements) ? evaluation.improvements.slice(0, 4) : [],
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (missingEnv() || !process.env.GEMINI_API_KEY) {
    return json(500, {
      error: "Backend not fully configured. Check SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY in Netlify.",
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

  const mode = body.mode === "full" ? "full" : "single";

  try {
    if (mode === "single") {
      const taskType = String(body.taskType || "").trim();
      const question = String(body.question || "").trim();
      const essay = String(body.essay || "").trim();
      if (!BANDS[taskType]) return json(400, { error: "Please choose a task type: 1.1, 1.2, or 2." });
      if (!question) return json(400, { error: "Please paste the task question." });
      if (!essay) return json(400, { error: "Please paste your response." });
      if (countWords(essay) < 3) return json(400, { error: "Your response is too short to assess." });
      if (countWords(essay) > 800) return json(400, { error: "That response is unusually long. Please trim it." });

      const result = await gradeOneTask(taskType, question, essay);
      try{
        const db = serviceClient();
        await db.from("multilevel_submissions").insert({
          user_id: user.id,
          mode: "single",
          task_type: taskType,
          raw_score: result.band,
          max_score: result.max_band,
          converted_score: null,
          cefr_level: null,
          payload: { question, ...result },
        });
      }catch(e){ console.error("multilevel save (single) failed", e); }
      return json(200, { mode: "single", ...result });
    }

    const tasks = body.tasks || {};
    const order = ["1.1", "1.2", "2"];
    for (const t of order) {
      if (!tasks[t] || !String(tasks[t].question || "").trim() || !String(tasks[t].essay || "").trim()) {
        return json(400, { error: `Please fill in the task question and response for Task ${t}.` });
      }
    }

    const results = {};
    for (const t of order) {
      results[t] = await gradeOneTask(t, tasks[t].question, tasks[t].essay);
    }

    const rawScore = results["1.1"].band + results["1.2"].band + results["2"].band;
    const converted = convertRawTo75(rawScore);
    const cefr = cefrFor75(converted);

    try{
      const db = serviceClient();
      await db.from("multilevel_submissions").insert({
        user_id: user.id,
        mode: "full",
        task_type: null,
        raw_score: rawScore,
        max_score: 17,
        converted_score: converted,
        cefr_level: cefr,
        payload: { tasks: Object.fromEntries(order.map((t) => [t, { question: tasks[t].question, ...results[t] }])) },
      });
    }catch(e){ console.error("multilevel save (full) failed", e); }

    return json(200, {
      mode: "full",
      raw_score: rawScore,
      max_raw_score: 17,
      converted_score: converted,
      max_converted_score: 75,
      cefr_level: cefr,
      tasks: results,
    });
  } catch (err) {
    console.error("check-writing-multilevel failure", err);
    return json(502, { error: "Could not evaluate the writing. Please try again shortly." });
  }
};
