// GET /.netlify/functions/content-list
// Returns the ready content items the signed-in student is entitled to,
// grouped by course/lesson on the client. Entitlement = free OR assigned to
// the student OR assigned to a class the student is in. Never returns storage
// paths — the student fetches a signed URL per item via content-file.

const {
  json,
  missingEnv,
  serviceClient,
  getUserFromRequest,
} = require("./_shared");
const { getAccess } = require("./_access");

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });

  const db = serviceClient();
  try {
    const [itemsRes, accessRes, access] = await Promise.all([
      db.from("content_items")
        .select("id, course, lesson, title, description, kind, mime_type, file_name, size_bytes, is_free, created_at")
        .eq("ready", true),
      db.from("content_access").select("content_id, student_id, class_id"),
      getAccess(db, user), // only classes that are still active (end date not passed)
    ]);

    const myClasses = access.activeClassIds;
    const allow = new Set();
    (accessRes.data || []).forEach((r) => {
      if (r.student_id === user.id) allow.add(r.content_id);
      else if (r.class_id && myClasses.has(r.class_id)) allow.add(r.content_id);
    });

    const items = (itemsRes.data || [])
      .filter((it) => it.is_free || allow.has(it.id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Classes whose access has ended (so the page can say "your access ended on ..." instead of showing nothing).
    const expired = access.expired.map((e) => ({ name: e.name, valid_until: e.valid_until }));
    return json(200, { items, expired });
  } catch (e) {
    console.error("content-list", e);
    return json(500, { error: "Could not load your lessons." });
  }
};
