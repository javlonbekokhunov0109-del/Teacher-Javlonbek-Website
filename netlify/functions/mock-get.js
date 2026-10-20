// GET /.netlify/functions/mock-get?id=<mock id>
// Full mock (writing + speaking content, listening/reading file references) -- only if free or the student has the pass.
const { json, missingEnv, serviceClient, getUserFromRequest } = require("./_shared");
const { getAccess, canOpenMock, usedToday, limitFor } = require("./_access");
const { getSettings } = require("./_marking");

exports.handler = async (event) => {
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  const id = (event.queryStringParameters || {}).id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: "Missing mock id." });
  const db = serviceClient();
  try {
    const [access, settings] = await Promise.all([getAccess(db, user), getSettings(db)]);
    const { data: m, error } = await db.from("mocks").select("*").eq("id", id).maybeSingle();
    if (error || !m || (!m.published && !access.admin)) return json(404, { error: "Mock not found." });
    if (!canOpenMock(access, m)) return json(403, { locked: true, error: "This mock is part of the paid pack.", mock: { number: m.number, title: m.title } });

    const ids = [m.listening_item, m.reading_item].filter(Boolean);
    let items = {};
    if (ids.length) {
      const r = await db.from("content_items").select("id, title, kind, mime_type, ready").in("id", ids);
      (r.data || []).forEach((it) => { if (it.ready || access.admin) items[it.id] = { id: it.id, title: it.title, kind: it.kind, mime_type: it.mime_type }; });
    }
    const res = await db.from("mock_results").select("id, section, status, band, created_at").eq("user_id", user.id).eq("mock_id", id).order("created_at", { ascending: false }).limit(60);
    const used = await usedToday(db, user.id);
    return json(200, {
      mock: {
        id: m.id, number: m.number, title: m.title, description: m.description || "", is_free: !!m.is_free,
        listening: m.listening_item ? items[m.listening_item] || null : null,
        reading: m.reading_item ? items[m.reading_item] || null : null,
        writing: m.writing || {}, speaking: m.speaking || {},
      },
      results: res.data || [],
      usage: { used, limit: limitFor(settings, access) },
      settings: { speaking_enabled: !!settings.speaking_enabled, show_range: !!settings.show_range },
    });
  } catch (e) {
    console.error("mock-get", e);
    return json(500, { error: "Could not open this mock." });
  }
};
