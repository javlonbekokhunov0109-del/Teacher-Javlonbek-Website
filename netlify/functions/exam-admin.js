// /.netlify/functions/exam-admin   (teacher only)
//   GET  -> tests, classes, which classes may open the tests, and every student's results
//   POST -> { action } create-test | confirm-test | update-test | delete-test | set-classes | delete-result
// File BYTES never pass through here: the browser uploads straight to storage with the signed upload URLs minted below.
const { json, missingEnv, serviceClient, getUserFromRequest, isAdminEmail, BUCKET, absoluteStorageUrl } = require("./_shared");
const { getExamSettings, cleanMeta } = require("./_exams");

async function requireAdmin(event) {
  if (missingEnv()) return { err: json(500, { error: "Backend not configured." }) };
  const user = await getUserFromRequest(event);
  if (!user) return { err: json(401, { error: "Not signed in." }) };
  if (!isAdminEmail(user.email)) return { err: json(403, { error: "Not authorised." }) };
  return { user };
}

exports.handler = async (event) => {
  const gate = await requireAdmin(event);
  if (gate.err) return gate.err;
  const db = serviceClient();

  if (event.httpMethod === "GET") {
    try {
      const [tests, classes, settings, results, profiles] = await Promise.all([
        db.from("exam_tests").select("*").order("kind").order("series").order("test_no").order("passage_no", { nullsFirst: true }),
        db.from("classes").select("id, name").order("name"),
        getExamSettings(db),
        db.from("exam_results").select("id, user_id, test_id, score, total, band, created_at").order("created_at", { ascending: false }).limit(3000),
        db.from("profiles").select("id, full_name, email"),
      ]);
      if (tests.error) throw tests.error;
      return json(200, { tests: tests.data || [], classes: classes.data || [], class_ids: settings.class_ids, results: results.data || [], students: profiles.data || [] });
    } catch (e) {
      console.error("exam-admin GET", e);
      return json(500, { error: "Could not load. Did you run the exams SQL in Supabase?" });
    }
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }

  try {
    switch (body.action) {
      case "create-test": {
        const m = cleanMeta(body);
        const ins = await db.from("exam_tests").insert({ ...m, ready: false }).select("id").single();
        if (ins.error) throw ins.error;
        const id = ins.data.id, htmlPath = `exams/${id}/test.html`, audioPath = body.has_audio ? `exams/${id}/audio.mp3` : null;
        await db.from("exam_tests").update({ html_path: htmlPath, audio_path: audioPath }).eq("id", id);
        const h = await db.storage.from(BUCKET).createSignedUploadUrl(htmlPath);
        if (h.error) throw h.error;
        const out = { id, html: { path: htmlPath, token: h.data.token, upload_url: absoluteStorageUrl(h.data.signedUrl) } };
        if (audioPath) {
          const a = await db.storage.from(BUCKET).createSignedUploadUrl(audioPath);
          if (a.error) throw a.error;
          out.audio = { path: audioPath, token: a.data.token, upload_url: absoluteStorageUrl(a.data.signedUrl) };
        }
        return json(200, out);
      }
      case "confirm-test": {
        if (!body.id) return json(400, { error: "Missing id." });
        const u = await db.from("exam_tests").update({ ready: true }).eq("id", body.id);
        if (u.error) throw u.error;
        return json(200, { ok: true });
      }
      case "update-test": {
        if (!body.id) return json(400, { error: "Missing id." });
        const u = await db.from("exam_tests").update(cleanMeta(body)).eq("id", body.id);
        if (u.error) throw u.error;
        return json(200, { ok: true });
      }
      case "delete-test": {
        if (!body.id) return json(400, { error: "Missing id." });
        const r = await db.from("exam_tests").select("html_path, audio_path").eq("id", body.id).maybeSingle();
        const paths = [r.data && r.data.html_path, r.data && r.data.audio_path].filter(Boolean);
        if (paths.length) await db.storage.from(BUCKET).remove(paths);
        await db.from("exam_tests").delete().eq("id", body.id);
        return json(200, { ok: true });
      }
      case "set-classes": {
        const ids = (Array.isArray(body.class_ids) ? body.class_ids : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
        const u = await db.from("exam_settings").upsert({ id: 1, class_ids: ids });
        if (u.error) throw u.error;
        return json(200, { ok: true });
      }
      case "delete-result": {
        if (!body.id) return json(400, { error: "Missing id." });
        await db.from("exam_results").delete().eq("id", body.id);
        return json(200, { ok: true });
      }
      default: return json(400, { error: "Unknown action." });
    }
  } catch (e) {
    console.error("exam-admin POST", body.action, e);
    return json(500, { error: "Action failed. Please try again." });
  }
};
