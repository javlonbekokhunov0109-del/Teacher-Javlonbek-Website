// POST /.netlify/functions/share-writing-toggle
// Body: { id, enable }
// Auth required. Flips is_public on the CALLER'S OWN submission only —
// the update is scoped by both id and user_id so nobody can publish
// someone else's essay.

const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (missingEnv()) return json(500, { error: "Backend not configured." });

  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request." });
  }
  const id = String(body.id || "").trim();
  const enable = !!body.enable;
  if (!id) return json(400, { error: "Missing submission id." });

  const db = serviceClient();
  const { data, error } = await db
    .from("submissions")
    .update({ is_public: enable })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, is_public")
    .single();

  if (error || !data) return json(404, { error: "Submission not found." });
  return json(200, { id: data.id, is_public: data.is_public });
};
