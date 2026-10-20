// GET /.netlify/functions/mock-list
// All published mocks with a "locked" flag for this student, plus their pass status and today's AI-check allowance.
const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");
const { getAccess, canOpenMock, usedToday, limitFor } = require("./_access");
const { getSettings } = require("./_marking");
const { simsFor } = require("./_sims");

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  const db = serviceClient();
  try {
    const [access, settings] = await Promise.all([getAccess(db, user), getSettings(db)]);
    let q = db.from("mocks").select("id, number, title, description, is_free, published, listening_item, reading_item").order("number");
    if (!access.admin) q = q.eq("published", true);
    const { data, error } = await q;
    if (error) {
      // The mock tables don't exist yet (SQL not run): show an empty, friendly list rather than an error.
      return json(200, { mocks: [], setup_needed: true, access: { mocks: false }, usage: { used: 0, limit: 0 }, settings: {} });
    }
    const mocks = (data || []).map((m) => ({
      id: m.id, number: m.number, title: m.title, description: m.description || "", is_free: !!m.is_free,
      locked: !canOpenMock(access, m), published: !!m.published,
      has_listening: !!m.listening_item, has_reading: !!m.reading_item || simsFor(m.number).reading.length > 0,
    }));
    const my = {};
    if (mocks.length) {
      const r = await db.from("mock_results").select("mock_id, section, band, created_at").eq("user_id", user.id).eq("status", "done").order("created_at", { ascending: false }).limit(500);
      (r.data || []).forEach((x) => { const b = (my[x.mock_id] = my[x.mock_id] || { count: 0, last: null }); b.count++; if (!b.last) b.last = x.created_at; });
    }
    const used = await usedToday(db, user.id);
    return json(200, {
      mocks, my,
      access: { mocks: access.mocks, until: access.mocksUntil, expired: access.expiredMocks },
      usage: { used, limit: limitFor(settings, access) },
      settings: { speaking_enabled: !!settings.speaking_enabled, show_range: !!settings.show_range },
    });
  } catch (e) {
    console.error("mock-list", e);
    return json(500, { error: "Could not load the mocks." });
  }
};
