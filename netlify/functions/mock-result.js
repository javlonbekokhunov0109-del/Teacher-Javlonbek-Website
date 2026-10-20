// GET /.netlify/functions/mock-result?id=<result id>   (only the owner, or the teacher)
const { json, missingEnv, serviceClient, getUserFromRequest, isAdminEmail } = require("./_shared");

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  const id = (event.queryStringParameters || {}).id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: "Missing id." });
  const db = serviceClient();
  const { data, error } = await db.from("mock_results").select("id, user_id, mock_id, section, status, band, payload, error, created_at").eq("id", id).maybeSingle();
  if (error || !data) return json(404, { error: "Result not found." });
  if (data.user_id !== user.id && !isAdminEmail(user.email)) return json(403, { error: "Not allowed." });
  const { user_id, ...rest } = data;
  return json(200, { result: rest });
};
