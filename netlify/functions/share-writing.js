// GET /.netlify/functions/share-writing?id=<uuid>
// PUBLIC — no sign-in required. Only returns data for a submission whose
// owner explicitly set is_public = true via share-writing-toggle.

const { json, missingEnv, serviceClient } = require("./_shared");

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });

  const id = String((event.queryStringParameters || {}).id || "").trim();
  if (!id) return json(400, { error: "Missing id." });

  const db = serviceClient();
  const { data: sub, error } = await db
    .from("submissions")
    .select(
      "id, user_id, question, essay, task_response, coherence_cohesion, lexical_resource, grammatical_range_accuracy, overall_band, word_count, feedback, created_at, is_public"
    )
    .eq("id", id)
    .single();

  if (error || !sub || !sub.is_public) {
    return json(404, { error: "This result isn't available or hasn't been shared." });
  }

  const { data: profile } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", sub.user_id)
    .single();

  return json(200, {
    name: (profile && profile.full_name && profile.full_name.trim()) || "A Premium English student",
    question: sub.question,
    essay: sub.essay,
    task_response: sub.task_response,
    coherence_cohesion: sub.coherence_cohesion,
    lexical_resource: sub.lexical_resource,
    grammatical_range_accuracy: sub.grammatical_range_accuracy,
    overall_band: sub.overall_band,
    word_count: sub.word_count,
    summary: (sub.feedback && sub.feedback.summary) || "",
    created_at: sub.created_at,
  });
};
