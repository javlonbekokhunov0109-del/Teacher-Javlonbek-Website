// Who may open what: class membership (with optional end dates) and the mock-test pass.
const { isAdminEmail } = require("./_shared");

const tashkentToday = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
const tashkentDayStartISO = () => new Date(tashkentToday() + "T00:00:00+05:00").toISOString();

// Works before AND after the "valid_until / includes_mocks" columns exist (falls back to no end date / no mock pass).
async function getAccess(db, user) {
  const admin = isAdminEmail(user.email), today = tashkentToday();
  let q = await db.from("class_members").select("class_id, valid_until").eq("student_id", user.id);
  if (q.error) q = await db.from("class_members").select("class_id").eq("student_id", user.id);
  const rows = q.data || [], ids = rows.map((r) => r.class_id);
  let classes = [];
  if (ids.length) {
    let c = await db.from("classes").select("id, name, includes_mocks").in("id", ids);
    if (c.error) c = await db.from("classes").select("id, name").in("id", ids);
    classes = c.data || [];
  }
  const byId = Object.fromEntries(classes.map((c) => [c.id, c]));
  const active = new Set(), expired = []; let mocks = false, unlimited = false, until = null, expiredMocks = false;
  rows.forEach((r) => {
    const c = byId[r.class_id] || {}; const live = !r.valid_until || String(r.valid_until) >= today;
    if (live) {
      active.add(r.class_id);
      if (c.includes_mocks) { mocks = true; if (!r.valid_until) unlimited = true; else if (!until || r.valid_until > until) until = r.valid_until; }
    } else { expired.push({ class_id: r.class_id, name: c.name || "", valid_until: r.valid_until }); if (c.includes_mocks) expiredMocks = true; }
  });
  return { admin, activeClassIds: active, expired, mocks: admin || mocks, mocksUntil: unlimited ? null : until, expiredMocks: !mocks && expiredMocks };
}
const canOpenMock = (access, mock) => !!(access.admin || mock.is_free || access.mocks);

async function usedToday(db, userId) {
  const r = await db.from("mock_results").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("status", "error").gte("created_at", tashkentDayStartISO());
  return r.count || 0;
}
const limitFor = (settings, access) => (access.admin ? 9999 : access.mocks ? settings.daily_limit_member : settings.daily_limit_free);

module.exports = { tashkentToday, tashkentDayStartISO, getAccess, canOpenMock, usedToday, limitFor };
