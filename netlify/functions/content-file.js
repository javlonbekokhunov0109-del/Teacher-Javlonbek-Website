// GET /.netlify/functions/content-file?id=<content_id>[&download=1]
// Verifies the caller may access this item, then returns a short-lived signed
// URL to the private storage object. Teachers (ADMIN_EMAILS) can access any
// item; students only what they're entitled to.

const {
  json,
  missingEnv,
  serviceClient,
  getUserFromRequest,
  isAdminEmail,
  BUCKET,
} = require("./_shared");
const { getAccess, canOpenMock } = require("./_access");

const EXPIRES = 60 * 60 * 3; // 3 hours

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });

  const id = (event.queryStringParameters || {}).id;
  const wantDownload = (event.queryStringParameters || {}).download;
  if (!id) return json(400, { error: "Missing id." });

  const db = serviceClient();
  try {
    const itemRes = await db
      .from("content_items")
      .select("id, storage_path, file_name, kind, mime_type, is_free, ready")
      .eq("id", id)
      .single();
    const item = itemRes.data;
    if (!item || !item.storage_path) return json(404, { error: "Not found." });

    const admin = isAdminEmail(user.email);
    if (!item.ready && !admin) return json(404, { error: "Not found." });

    // entitlement check for non-admins
    if (!admin && !item.is_free) {
      const [accessRes, access] = await Promise.all([
        db.from("content_access").select("student_id, class_id").eq("content_id", id),
        getAccess(db, user), // active classes only (end dates respected)
      ]);
      let ok = (accessRes.data || []).some(
        (r) => r.student_id === user.id || (r.class_id && access.activeClassIds.has(r.class_id))
      );
      if (!ok) {
        // A Listening/Reading file attached to a published mock the student is allowed to open.
        const mk = await db.from("mocks").select("id, is_free, published").eq("published", true).or(`listening_item.eq.${id},reading_item.eq.${id}`);
        ok = (mk.data || []).some((m) => canOpenMock(access, m));
      }
      if (!ok) return json(403, { error: "You don't have access to this item." });
    }

    const opts = {};
    if (wantDownload) opts.download = item.file_name || true;
    const signed = await db.storage.from(BUCKET).createSignedUrl(item.storage_path, EXPIRES, opts);
    if (signed.error || !signed.data) return json(500, { error: "Could not create link." });

    return json(200, {
      url: signed.data.signedUrl,
      kind: item.kind,
      mime_type: item.mime_type,
      file_name: item.file_name,
    });
  } catch (e) {
    console.error("content-file", e);
    return json(500, { error: "Could not open this item." });
  }
};
