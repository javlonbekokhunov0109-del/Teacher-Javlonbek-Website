// GET /.netlify/functions/admin-data              -> overview + all students
// GET /.netlify/functions/admin-data?student_id=X -> one student's full detail
// Auth: Bearer <supabase access token> belonging to an ADMIN_EMAILS account.
// This is the REAL lock on the admin data: a student token is rejected here,
// no matter what the browser UI shows.

const {
  json,
  missingEnv,
  serviceClient,
  getUserFromRequest,
  isAdminEmail,
} = require("./_shared");

const ONLINE_MS = 5 * 60 * 1000; // "online" = active in the last 5 minutes

function avg(nums) {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return Math.round((s / nums.length) * 100) / 100;
}

exports.handler = async (event) => {
  if (missingEnv()) {
    return json(500, { error: "Backend not configured." });
  }

  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Not signed in." });
  if (!isAdminEmail(user.email)) {
    return json(403, { error: "Not authorised." });
  }

  const db = serviceClient();
  const now = Date.now();
  const studentId = (event.queryStringParameters || {}).student_id;

  // ---------- Single student detail ----------
  if (studentId) {
    const { data: profile, error: pErr } = await db
      .from("profiles")
      .select("id, full_name, email, created_at, last_seen_at")
      .eq("id", studentId)
      .single();
    if (pErr || !profile) return json(404, { error: "Student not found." });

    const { data: subs, error: sErr } = await db
      .from("submissions")
      .select(
        "id, created_at, question, essay, word_count, overall_band, task_response, coherence_cohesion, lexical_resource, grammatical_range_accuracy, feedback"
      )
      .eq("user_id", studentId)
      .order("created_at", { ascending: false });
    if (sErr) return json(500, { error: "Could not load submissions." });

    const bands = (subs || []).map((s) => Number(s.overall_band)).filter(isFinite);
    return json(200, {
      student: {
        ...profile,
        online: profile.last_seen_at
          ? now - new Date(profile.last_seen_at).getTime() < ONLINE_MS
          : false,
        checks: subs.length,
        avg_band: avg(bands),
      },
      submissions: subs,
    });
  }

  // ---------- Overview ----------
  const { data: profiles, error: pErr } = await db
    .from("profiles")
    .select("id, full_name, email, created_at, last_seen_at");
  if (pErr) return json(500, { error: "Could not load students." });

  const { data: subs, error: sErr } = await db
    .from("submissions")
    .select("user_id, overall_band, created_at")
    .order("created_at", { ascending: true });
  if (sErr) return json(500, { error: "Could not load submissions." });

  // per-student aggregation
  const byUser = {};
  for (const s of subs) {
    (byUser[s.user_id] = byUser[s.user_id] || []).push(s);
  }

  const students = (profiles || [])
    .map((p) => {
      const list = byUser[p.id] || [];
      const bands = list.map((x) => Number(x.overall_band)).filter(isFinite);
      const lastCheck = list.length ? list[list.length - 1].created_at : null;
      return {
        id: p.id,
        full_name: p.full_name || "(no name)",
        email: p.email,
        created_at: p.created_at,
        last_seen_at: p.last_seen_at,
        online: p.last_seen_at
          ? now - new Date(p.last_seen_at).getTime() < ONLINE_MS
          : false,
        checks: list.length,
        avg_band: avg(bands),
        last_check_at: lastCheck,
      };
    })
    .sort((a, b) => {
      // online first, then most recently active
      if (a.online !== b.online) return a.online ? -1 : 1;
      const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return tb - ta;
    });

  const allBands = subs.map((s) => Number(s.overall_band)).filter(isFinite);

  // timeline: last 30 days, checks + avg band per day
  const dayMap = {};
  for (const s of subs) {
    const d = new Date(s.created_at).toISOString().slice(0, 10);
    (dayMap[d] = dayMap[d] || []).push(Number(s.overall_band));
  }
  const timeline = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const arr = dayMap[d] || [];
    timeline.push({
      date: d,
      checks: arr.length,
      avg_band: arr.length ? avg(arr.filter(isFinite)) : null,
    });
  }

  return json(200, {
    stats: {
      total_students: profiles.length,
      online_now: students.filter((s) => s.online).length,
      total_checks: subs.length,
      avg_band: avg(allBands),
    },
    timeline,
    students,
  });
};
