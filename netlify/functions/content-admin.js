// /.netlify/functions/content-admin
//   GET  -> everything the teacher needs: items, classes (+members), students
//   POST -> { action, ... } to create/update/delete items and classes
// Teacher-only (ADMIN_EMAILS). Large file BYTES never pass through here — the
// browser uploads straight to storage using a short-lived signed upload URL
// that this function mints.

const {
  json,
  missingEnv,
  serviceClient,
  getUserFromRequest,
  isAdminEmail,
  BUCKET,
  kindFromMime,
  sanitizeName,
  absoluteStorageUrl,
} = require("./_shared");

async function requireAdmin(event) {
  if (missingEnv()) return { err: json(500, { error: "Backend not configured." }) };
  const user = await getUserFromRequest(event);
  if (!user) return { err: json(401, { error: "Not signed in." }) };
  if (!isAdminEmail(user.email)) return { err: json(403, { error: "Not authorised." }) };
  return { user };
}

// ---------- GET: full state for the manager ----------
async function getState(db) {
  const [items, access, classes, members, students] = await Promise.all([
    db.from("content_items").select("*").order("course").order("lesson").order("created_at", { ascending: false }),
    db.from("content_access").select("content_id, student_id, class_id"),
    db.from("classes").select("id, name, created_at").order("name"),
    db.from("class_members").select("class_id, student_id"),
    db.from("profiles").select("id, full_name, email").order("full_name"),
  ]);

  const accByContent = {};
  (access.data || []).forEach((r) => {
    const b = (accByContent[r.content_id] = accByContent[r.content_id] || { student_ids: [], class_ids: [] });
    if (r.student_id) b.student_ids.push(r.student_id);
    if (r.class_id) b.class_ids.push(r.class_id);
  });

  const memByClass = {};
  (members.data || []).forEach((m) => {
    (memByClass[m.class_id] = memByClass[m.class_id] || []).push(m.student_id);
  });

  return {
    items: (items.data || []).map((it) => ({
      ...it,
      student_ids: (accByContent[it.id] || {}).student_ids || [],
      class_ids: (accByContent[it.id] || {}).class_ids || [],
    })),
    classes: (classes.data || []).map((c) => ({ ...c, member_ids: memByClass[c.id] || [] })),
    students: students.data || [],
  };
}

async function writeAccess(db, contentId, isFree, studentIds, classIds) {
  await db.from("content_access").delete().eq("content_id", contentId);
  if (isFree) return;
  const rows = [];
  (studentIds || []).forEach((s) => rows.push({ content_id: contentId, student_id: s }));
  (classIds || []).forEach((c) => rows.push({ content_id: contentId, class_id: c }));
  if (rows.length) await db.from("content_access").insert(rows);
}

exports.handler = async (event) => {
  const gate = await requireAdmin(event);
  if (gate.err) return gate.err;
  const user = gate.user;
  const db = serviceClient();

  if (event.httpMethod === "GET") {
    try {
      return json(200, await getState(db));
    } catch (e) {
      console.error("content-admin GET", e);
      return json(500, { error: "Could not load content." });
    }
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Invalid request." }); }
  const action = body.action;

  try {
    switch (action) {
      // ----- create an item + return a signed upload URL for the file -----
      case "create-item": {
        const title = String(body.title || "").trim();
        if (!title) return json(400, { error: "Title is required." });
        const mime = String(body.mime_type || "").trim();
        const kind = kindFromMime(mime);
        const fileName = sanitizeName(body.file_name || "file");

        const ins = await db
          .from("content_items")
          .insert({
            course: String(body.course || "").trim() || null,
            lesson: String(body.lesson || "").trim() || null,
            title,
            description: String(body.description || "").trim() || null,
            kind,
            mime_type: mime || null,
            file_name: fileName,
            size_bytes: Number(body.size_bytes) || null,
            is_free: !!body.is_free,
            ready: false,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (ins.error) throw ins.error;

        const id = ins.data.id;
        const path = `${id}/${fileName}`;
        await db.from("content_items").update({ storage_path: path }).eq("id", id);
        await writeAccess(db, id, !!body.is_free, body.student_ids, body.class_ids);

        const signed = await db.storage.from(BUCKET).createSignedUploadUrl(path);
        if (signed.error) throw signed.error;

        return json(200, {
          id,
          path,
          token: signed.data.token,
          upload_url: absoluteStorageUrl(signed.data.signedUrl),
        });
      }

      // ----- mark upload finished -----
      case "confirm-item": {
        const id = body.id;
        if (!id) return json(400, { error: "Missing id." });
        const upd = await db.from("content_items").update({ ready: true }).eq("id", id);
        if (upd.error) throw upd.error;
        return json(200, { ok: true });
      }

      // ----- edit metadata + access (no file change) -----
      case "update-item": {
        const id = body.id;
        if (!id) return json(400, { error: "Missing id." });
        const upd = await db
          .from("content_items")
          .update({
            course: String(body.course || "").trim() || null,
            lesson: String(body.lesson || "").trim() || null,
            title: String(body.title || "").trim() || "Untitled",
            description: String(body.description || "").trim() || null,
            is_free: !!body.is_free,
          })
          .eq("id", id);
        if (upd.error) throw upd.error;
        await writeAccess(db, id, !!body.is_free, body.student_ids, body.class_ids);
        return json(200, { ok: true });
      }

      // ----- delete item (storage object + rows) -----
      case "delete-item": {
        const id = body.id;
        if (!id) return json(400, { error: "Missing id." });
        const row = await db.from("content_items").select("storage_path").eq("id", id).single();
        if (row.data && row.data.storage_path) {
          await db.storage.from(BUCKET).remove([row.data.storage_path]);
        }
        await db.from("content_items").delete().eq("id", id);
        return json(200, { ok: true });
      }

      // ----- classes -----
      case "create-class": {
        const name = String(body.name || "").trim();
        if (!name) return json(400, { error: "Class name is required." });
        const ins = await db.from("classes").insert({ name, created_by: user.id }).select("id").single();
        if (ins.error) throw ins.error;
        return json(200, { id: ins.data.id });
      }
      case "rename-class": {
        if (!body.id) return json(400, { error: "Missing id." });
        const upd = await db.from("classes").update({ name: String(body.name || "").trim() || "Class" }).eq("id", body.id);
        if (upd.error) throw upd.error;
        return json(200, { ok: true });
      }
      case "delete-class": {
        if (!body.id) return json(400, { error: "Missing id." });
        await db.from("classes").delete().eq("id", body.id);
        return json(200, { ok: true });
      }
      case "set-class-members": {
        const classId = body.class_id;
        if (!classId) return json(400, { error: "Missing class_id." });
        await db.from("class_members").delete().eq("class_id", classId);
        const ids = Array.isArray(body.student_ids) ? body.student_ids : [];
        if (ids.length) {
          await db.from("class_members").insert(ids.map((s) => ({ class_id: classId, student_id: s })));
        }
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: "Unknown action." });
    }
  } catch (e) {
    console.error("content-admin POST", action, e);
    return json(500, { error: "Action failed. Please try again." });
  }
};
