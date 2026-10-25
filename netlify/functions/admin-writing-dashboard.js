// GET /.netlify/functions/admin-writing-dashboard
// Auth: Bearer <supabase access token> belonging to an ADMIN_EMAILS account.
// Returns every IELTS and Multilevel writing check across all students,
// each with the student's name/email, so the teacher can see who checked
// what, their score, essay, feedback and mistakes — split by exam type.

const { json, missingEnv, serviceClient, getUserFromRequest, isAdminEmail } = require("./_shared");
const { getSettings } = require("./_marking");
const { convertRawTo75, cefrFor75 } = require("./check-writing-multilevel");

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });

  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Not signed in." });
  if (!isAdminEmail(user.email)) return json(403, { error: "Not authorised." });

  const db = serviceClient();

  // ---- POST: the teacher changes one student's score (the student then simply sees the new score) ----
  if (event.httpMethod === "POST") {
    let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }
    const id = String(body.id || ""); if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: "Missing id." });
    const half = (n) => Math.round(n * 2) / 2;
    if (body.action === "set-ielts-band") {
      const band = Number(body.band); if (!isFinite(band) || band < 0 || band > 9 || half(band) !== band) return json(400, { error: "The band must be between 0 and 9, in steps of 0.5." });
      const { data: row } = await db.from("submissions").select("id, overall_band, feedback").eq("id", id).maybeSingle();
      if (!row) return json(404, { error: "Result not found." });
      const fb = row.feedback && typeof row.feedback === "object" ? { ...row.feedback } : {};
      if (fb.original_overall_band == null) fb.original_overall_band = Number(row.overall_band);   // what the AI said (only the teacher ever sees this)
      fb.overall_band = band;
      const up = await db.from("submissions").update({ overall_band: band, feedback: fb }).eq("id", id);
      if (up.error) return json(500, { error: "Could not save." });
      return json(200, { ok: true, band });
    }
    if (body.action === "set-multilevel-score") {
      const { data: row } = await db.from("multilevel_submissions").select("id, mode, raw_score, max_score, converted_score, cefr_level, payload").eq("id", id).maybeSingle();
      if (!row) return json(404, { error: "Result not found." });
      const raw = Number(body.raw), max = Number(row.max_score) || 17;
      if (!isFinite(raw) || raw < 0 || raw > max || half(raw) !== raw) return json(400, { error: `The score must be between 0 and ${max}, in steps of 0.5.` });
      const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
      if (!payload.original) payload.original = { raw_score: row.raw_score, converted_score: row.converted_score, cefr_level: row.cefr_level };
      const patch = { raw_score: raw, payload };
      if (row.mode === "full") { patch.converted_score = convertRawTo75(raw); patch.cefr_level = cefrFor75(patch.converted_score); }
      const up = await db.from("multilevel_submissions").update(patch).eq("id", id);
      if (up.error) return json(500, { error: "Could not save." });
      return json(200, { ok: true, raw_score: raw, converted_score: patch.converted_score == null ? null : patch.converted_score, cefr_level: patch.cefr_level || null });
    }
    return json(400, { error: "Unknown action." });
  }

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
      original_band: s.feedback && s.feedback.original_overall_band != null ? s.feedback.original_overall_band : null,
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
      original: s.payload && s.payload.original ? s.payload.original : null,
    };
  });

  const cal = await getSettings(db);
  return json(200, { ielts, multilevel, calibration: { ielts_offset: cal.calibration_offset, ml_offset: cal.ml_offset } });
};
