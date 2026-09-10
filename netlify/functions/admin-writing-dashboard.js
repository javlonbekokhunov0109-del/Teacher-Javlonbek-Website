// GET /.netlify/functions/admin-writing-dashboard
// Auth: Bearer <supabase access token> belonging to an ADMIN_EMAILS account.
// Returns every IELTS and Multilevel writing check across all students,
// each with the student's name/email, so the teacher can see who checked
// what, their score, essay, feedback and mistakes — split by exam type.

const { json, missingEnv, serviceClient, getUserFromRequest, isAdminEmail } = require("./_shared");

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });

  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Not signed in." });
  if (!isAdminEmail(user.email)) return json(403, { error: "Not authorised." });

  const db = serviceClient();

  const { data: profiles, error: pErr } = await db
    .from("profiles")
    .select("id, full_name, email");
  if (pErr) return json(500, { error: "Could not load students." });
  const nameById = {};
  for (const p of profiles || []) {
    nameById[p.id] = {
      name: (p.full_name && p.full_name.trim()) || (p.email || "").split("@")[0] || "Student",
      email: p.email || "",
    };
  }

  const { data: ieltsRows, error: iErr } = await db
    .from("submissions")
    .select(
      "id, user_id, created_at, question, essay, word_count, overall_band, task_response, coherence_cohesion, lexical_resource, grammatical_range_accuracy, feedback"
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (iErr) return json(500, { error: "Could not load IELTS checks." });

  const { data: mlRows, error: mErr } = await db
    .from("multilevel_submissions")
    .select("id, user_id, created_at, mode, task_type, raw_score, max_score, converted_score, cefr_level, payload")
    .order("created_at", { ascending: false })
    .limit(300);
  if (mErr) return json(500, { error: "Could not load Multilevel checks." });

  const ielts = (ieltsRows || []).map((s) => {
    const who = nameById[s.user_id] || { name: "Unknown student", email: "" };
    return {
      id: s.id,
      student_name: who.name,
      student_email: who.email,
      created_at: s.created_at,
      question: s.question,
      essay: s.essay,
      word_count: s.word_count,
      overall_band: s.overall_band,
      task_response: s.task_response,
      coherence_cohesion: s.coherence_cohesion,
      lexical_resource: s.lexical_resource,
      grammatical_range_accuracy: s.grammatical_range_accuracy,
      summary: s.feedback && s.feedback.summary,
      corrections: (s.feedback && s.feedback.corrections) || [],
      weaknesses: (s.feedback && s.feedback.weaknesses) || [],
      improvements: (s.feedback && s.feedback.improvements) || [],
    };
  });

  const multilevel = (mlRows || []).map((s) => {
    const who = nameById[s.user_id] || { name: "Unknown student", email: "" };
    return {
      id: s.id,
      student_name: who.name,
      student_email: who.email,
      created_at: s.created_at,
      mode: s.mode,
      task_type: s.task_type,
      raw_score: s.raw_score,
      max_score: s.max_score,
      converted_score: s.converted_score,
      cefr_level: s.cefr_level,
      payload: s.payload,
    };
  });

  return json(200, { ielts, multilevel });
};
