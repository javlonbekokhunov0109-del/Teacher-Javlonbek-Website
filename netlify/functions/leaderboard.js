// GET /.netlify/functions/leaderboard
// Auth: any signed-in user. Returns everyone's total time today and this
// month, sorted by today's time (most active first).

const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");

exports.handler = async (event) => {
  if (missingEnv()) {
    return json(500, { error: "Backend not configured." });
  }

  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Not signed in." });

  const db = serviceClient();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  const { data: logs, error: lErr } = await db
    .from("time_logs")
    .select("user_id, day, seconds")
    .gte("day", monthStart);
  if (lErr) return json(500, { error: "Could not load activity." });

  const { data: profiles, error: pErr } = await db
    .from("profiles")
    .select("id, full_name, email");
  if (pErr) return json(500, { error: "Could not load students." });

  const nameById = {};
  for (const p of profiles || []) {
    nameById[p.id] = (p.full_name && p.full_name.trim()) || (p.email || "").split("@")[0] || "Student";
  }

  const byUser = {};
  for (const l of logs || []) {
    const u = (byUser[l.user_id] = byUser[l.user_id] || { today: 0, month: 0 });
    u.month += l.seconds;
    if (l.day === todayStr) u.today += l.seconds;
  }

  const rows = Object.keys(byUser)
    .map((uid) => ({
      user_id: uid,
      name: nameById[uid] || "Student",
      today_seconds: byUser[uid].today,
      month_seconds: byUser[uid].month,
    }))
    .filter((r) => r.month_seconds > 0)
    .sort((a, b) => b.today_seconds - a.today_seconds || b.month_seconds - a.month_seconds);

  return json(200, { today: todayStr, leaderboard: rows });
};
