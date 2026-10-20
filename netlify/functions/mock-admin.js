// /.netlify/functions/mock-admin   (teacher only: ADMIN_EMAILS)
//   GET  -> all mocks (incl. drafts), content files to attach, AI-marking settings (+ built-in prompts), recent results
//   POST -> { action: save-mock | set-mock-flags | delete-mock | save-settings | reset-prompt }
const { json, missingEnv, serviceClient, getUserFromRequest, isAdminEmail } = require("./_shared");
const { getSettings, DEFAULTS, WRITING_PROMPT, SPEAKING_PROMPT } = require("./_marking");
const { validateWriting, validateSpeaking } = require("./_mockdata");

async function requireAdmin(event) {
  if (missingEnv()) return { err: json(500, { error: "Backend not configured." }) };
  const user = await getUserFromRequest(event);
  if (!user) return { err: json(401, { error: "Not signed in." }) };
  if (!isAdminEmail(user.email)) return { err: json(403, { error: "Not authorised." }) };
  return { user };
}
const UUID = /^[0-9a-f-]{36}$/i;
const clampInt = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

exports.handler = async (event) => {
  const a = await requireAdmin(event); if (a.err) return a.err;
  const db = serviceClient();

  if (event.httpMethod === "GET") {
    const mk = await db.from("mocks").select("*").order("number");
    if (mk.error) return json(200, { setup_needed: true, mocks: [], items: [], settings: { ...DEFAULTS }, defaults: { writing_prompt: WRITING_PROMPT, speaking_prompt: SPEAKING_PROMPT }, recent: [] });
    const [items, settings, results, profs] = await Promise.all([
      db.from("content_items").select("id, title, kind, course, lesson, ready").order("created_at", { ascending: false }).limit(300),
      getSettings(db),
      db.from("mock_results").select("id, user_id, mock_id, section, status, band, created_at").order("created_at", { ascending: false }).limit(40),
      db.from("profiles").select("id, full_name, email"),
    ]);
    const pmap = Object.fromEntries((profs.data || []).map((p) => [p.id, p])); const mmap = Object.fromEntries((mk.data || []).map((m) => [m.id, m]));
    const raw = await db.from("mock_settings").select("*").eq("id", 1).maybeSingle();
    return json(200, {
      mocks: mk.data || [], items: items.data || [],
      settings: { ...settings, writing_prompt: (raw.data && raw.data.writing_prompt) || "", speaking_prompt: (raw.data && raw.data.speaking_prompt) || "" },
      defaults: { writing_prompt: WRITING_PROMPT, speaking_prompt: SPEAKING_PROMPT },
      settings_row_exists: !!raw.data,
      recent: (results.data || []).map((r) => ({ id: r.id, section: r.section, status: r.status, band: r.band, created_at: r.created_at, who: (pmap[r.user_id] || {}).full_name || (pmap[r.user_id] || {}).email || "?", mock: (mmap[r.mock_id] || {}).number || "?" })),
    });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }

  try {
    switch (body.action) {
      case "save-mock": {
        const number = clampInt(body.number, 1, 99); if (!number) return json(400, { error: "Mock number must be 1-99." });
        const title = String(body.title || "").trim(); if (title.length < 3 || title.length > 120) return json(400, { error: "Title must be 3-120 characters." });
        const row = {
          number, title, description: String(body.description || "").trim().slice(0, 400) || null,
          is_free: !!body.is_free, published: !!body.published,
          listening_item: body.listening_item || null, reading_item: body.reading_item || null,
          writing: body.writing && typeof body.writing === "object" ? body.writing : {}, speaking: body.speaking && typeof body.speaking === "object" ? body.speaking : {},
          updated_at: new Date().toISOString(),
        };
        for (const k of ["listening_item", "reading_item"]) {
          if (row[k]) { if (!UUID.test(row[k])) return json(400, { error: "Invalid file reference." }); const ci = await db.from("content_items").select("id").eq("id", row[k]).maybeSingle(); if (!ci.data) return json(400, { error: "That Listening/Reading file no longer exists." }); }
        }
        const problems = [...validateWriting(row.writing), ...validateSpeaking(row.speaking)];
        if (row.published && problems.length) return json(400, { error: "Fix these before publishing:", problems });
        let id = body.id && UUID.test(body.id) ? body.id : null;
        const res = id ? await db.from("mocks").update(row).eq("id", id).select("id").single() : await db.from("mocks").insert(row).select("id").single();
        if (res.error) { if (res.error.code === "23505") return json(409, { error: "Another mock already uses number " + number + "." }); throw res.error; }
        return json(200, { id: res.data.id, problems });
      }
      case "set-mock-flags": {
        if (!UUID.test(String(body.id || ""))) return json(400, { error: "Missing id." });
        const patch = {}; if (typeof body.is_free === "boolean") patch.is_free = body.is_free;
        if (typeof body.published === "boolean") {
          if (body.published) { const { data: m } = await db.from("mocks").select("writing, speaking").eq("id", body.id).maybeSingle(); const pr = m ? [...validateWriting(m.writing), ...validateSpeaking(m.speaking)] : ["Mock not found."]; if (pr.length) return json(400, { error: "Fix these before publishing:", problems: pr }); }
          patch.published = body.published;
        }
        if (!Object.keys(patch).length) return json(400, { error: "Nothing to change." });
        patch.updated_at = new Date().toISOString();
        const r = await db.from("mocks").update(patch).eq("id", body.id); if (r.error) throw r.error; return json(200, { ok: true });
      }
      case "delete-mock": {
        if (!UUID.test(String(body.id || ""))) return json(400, { error: "Missing id." });
        const r = await db.from("mocks").delete().eq("id", body.id); if (r.error) throw r.error; return json(200, { ok: true });
      }
      case "save-settings": {
        const off = Number(body.calibration_offset);
        if (!isFinite(off) || off < 0 || off > 0.5 || Math.round(off * 4) / 4 !== off) return json(400, { error: "Calibration offset must be 0, 0.25 or 0.5." });
        const lf = clampInt(body.daily_limit_free, 0, 200), lm = clampInt(body.daily_limit_member, 0, 500);
        if (lf === null || lm === null) return json(400, { error: "Daily limits must be whole numbers (free 0-200, members 0-500)." });
        const wp = String(body.writing_prompt || ""), sp = String(body.speaking_prompt || "");
        if (wp.length > 14000 || sp.length > 14000) return json(400, { error: "A prompt is too long (max 14,000 characters)." });
        if (wp.trim() && !/json/i.test(wp)) return json(400, { error: "The Writing prompt must tell the AI to return JSON (keep the OUTPUT section). Use 'Reset to built-in' if unsure." });
        if (sp.trim() && !/json/i.test(sp)) return json(400, { error: "The Speaking prompt must tell the AI to return JSON (keep the OUTPUT section). Use 'Reset to built-in' if unsure." });
        const row = { id: 1, writing_prompt: wp.trim() || null, speaking_prompt: sp.trim() || null, calibration_offset: off, show_range: !!body.show_range, speaking_enabled: !!body.speaking_enabled, daily_limit_free: lf, daily_limit_member: lm, gemini_model: String(body.gemini_model || "").trim().slice(0, 60) || null, updated_at: new Date().toISOString() };
        const r = await db.from("mock_settings").upsert(row, { onConflict: "id" });
        if (r.error) return json(500, { error: "Could not save. Run the mocks SQL in Supabase first." });
        return json(200, { ok: true });
      }
      case "reset-prompt": {
        const col = body.which === "speaking" ? "speaking_prompt" : body.which === "writing" ? "writing_prompt" : null; if (!col) return json(400, { error: "Unknown prompt." });
        const r = await db.from("mock_settings").update({ [col]: null, updated_at: new Date().toISOString() }).eq("id", 1); if (r.error) throw r.error; return json(200, { ok: true });
      }
      default: return json(400, { error: "Unknown action." });
    }
  } catch (e) {
    console.error("mock-admin", body.action, e);
    return json(500, { error: "Action failed. Please try again." });
  }
};
