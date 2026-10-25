// POST /.netlify/functions/mock-attempt   { action, ... }
// One FULL MOCK IN ONE SITTING: Listening -> Reading -> Writing -> Speaking. Nothing is revealed until every section is done.
//   list            { mock_id? }                  the student's sittings (finished ones carry their overall band)
//   start           { mock_id }                   starts a sitting, or resumes the one already in progress
//   get             { id }                        one sitting (the final report once it is finished). The teacher may read any.
//   begin-section   { id, section }               starts that section's clock (idempotent: a resumed section keeps its deadline)
//   save-draft      { id, t1, t2 }                Writing autosave
//   save-section    { id, section, data }         submits a section and moves on (idempotent)
//   marking-status  { id }                        where each AI marking stands (Writing tasks, Speaking parts)
//   finish          { id, force? }                builds the final report from everything (bands, overall, review)
//   abandon         { id }                        gives up this sitting so a new one can start
const { json, missingEnv, serviceClient, getUserFromRequest, isAdminEmail } = require("./_shared");
const { getAccess, canOpenMock } = require("./_access");
const { getSettings } = require("./_marking");
const { simsFor } = require("./_sims");

const MINUTES = { listening: 35, reading: 60, writing: 60, speaking: 20 };   // Listening: 30 min + loading/transfer allowance
const LISTENING_BANDS = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [11, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1], [0, 0]];
const READING_BANDS = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1], [0, 0]];
const bandFrom = (table, n) => (table.find(([min]) => n >= min) || [0, 0])[1];
const half = (n) => Math.round(n * 2) / 2;
const UUID = /^[0-9a-f-]{36}$/i;
const SPEAK_KEYS = ["fluency_coherence", "lexical_resource", "grammatical_range_accuracy", "pronunciation"];
const str = (v, n) => String(v == null ? "" : v).slice(0, n);

function cleanReview(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 200).map((r) => ({
    ids: (Array.isArray(r && r.ids) ? r.ids : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 40).slice(0, 4),
    user: str(r && r.user, 160), correct: str(r && r.correct, 220),
    score: Math.max(0, Math.min(9, Number(r && r.score) || 0)), max: Math.max(1, Math.min(9, Number(r && r.max) || 1)),
  })).filter((r) => r.ids.length).slice(0, 60);
}
const words = (t) => { const m = String(t || "").trim().match(/\b[\w'’-]+\b/g); return m ? m.length : 0; };

// what the browser may see while a sitting is running (no review answers, no other student's data)
function view(row) {
  const st = row.state || {}, sections = {};
  Object.keys(st.sections || {}).forEach((k) => { const s = st.sections[k]; sections[k] = { status: s.status, started_at: s.started_at || null, deadline: s.deadline || null, ended_at: s.ended_at || null }; });
  const out = { id: row.id, mock_id: row.mock_id, status: row.status, started_at: row.started_at, finished_at: row.finished_at, order: st.order || [], idx: st.idx || 0, minutes: st.minutes || MINUTES, sections, speaking_skipped: st.speaking_skipped || null };
  if (st.data && st.data.writing) out.drafts = { t1: st.data.writing.t1 || "", t2: st.data.writing.t2 || "" };
  if (row.status === "done" && row.final) out.final = row.final;
  return out;
}
function mockContent(m) {
  const x = simsFor(m.number);
  return { id: m.id, number: m.number, title: m.title, is_free: !!m.is_free, writing: m.writing || {}, speaking: m.speaking || {}, sims: { listening: x.listening ? { title: x.listening.title, minutes: x.listening.minutes || 30 } : null, reading: x.reading ? { title: x.reading.title, minutes: x.reading.minutes || 60 } : null } };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (missingEnv()) return json(500, { error: "Backend not configured." });
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { error: "Please sign in." });
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }
  const db = serviceClient(), admin = isAdminEmail(user.email), action = body.action;

  const load = async (id) => {
    if (!UUID.test(String(id || ""))) return { err: json(400, { error: "Missing sitting id." }) };
    const { data, error } = await db.from("mock_attempts").select("*").eq("id", id).maybeSingle();
    if (error) return { err: json(500, { error: "The full-mock tables are not set up yet (run the new SQL)." }) };
    if (!data || (data.user_id !== user.id && !admin)) return { err: json(404, { error: "Sitting not found." }) };
    return { row: data };
  };
  const save = async (row, patch) => { const r = await db.from("mock_attempts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single(); if (r.error) throw r.error; return r.data; };

  try {
    if (action === "list") {
      let q = db.from("mock_attempts").select("id, mock_id, status, started_at, finished_at, final").eq("user_id", user.id).neq("status", "abandoned").order("started_at", { ascending: false }).limit(60);
      if (body.mock_id && UUID.test(body.mock_id)) q = q.eq("mock_id", body.mock_id);
      const { data, error } = await q; if (error) return json(200, { attempts: [], setup_needed: true });
      return json(200, { attempts: (data || []).map((a) => ({ id: a.id, mock_id: a.mock_id, status: a.status, started_at: a.started_at, finished_at: a.finished_at, overall: a.final ? a.final.overall : null, bands: a.final ? Object.fromEntries(Object.entries(a.final.sections || {}).map(([k, v]) => [k, v.band])) : null })) });
    }

    if (action === "start") {
      const [access, settings] = await Promise.all([getAccess(db, user), getSettings(db)]);
      const { data: mock } = await db.from("mocks").select("*").eq("id", String(body.mock_id || "")).maybeSingle();
      if (!mock || (!mock.published && !access.admin)) return json(404, { error: "Mock not found." });
      if (!canOpenMock(access, mock)) return json(403, { locked: true, error: "This mock is part of the paid pack." });
      const ex = await db.from("mock_attempts").select("*").eq("user_id", user.id).eq("mock_id", mock.id).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1);
      if (ex.error) return json(500, { error: "The full-mock tables are not set up yet (run the new SQL)." });
      if (ex.data && ex.data[0]) return json(200, { attempt: view(ex.data[0]), mock: mockContent(mock), resumed: true });
      const sims = simsFor(mock.number), w = mock.writing || {}, sp = mock.speaking || {}, order = [];
      if (sims.listening) order.push("listening");
      if (sims.reading) order.push("reading");
      if (w.task1 && w.task2) order.push("writing");
      let speakingSkipped = null;
      if (sp.part1 && sp.part2 && sp.part3) { if (settings.speaking_enabled) order.push("speaking"); else speakingSkipped = "The Speaking AI check is not open yet, so this sitting has no Speaking part."; }
      if (!order.length) return json(400, { error: "This mock has nothing to sit yet." });
      const state = { order, minutes: MINUTES, idx: 0, speaking_skipped: speakingSkipped, sections: Object.fromEntries(order.map((s) => [s, { status: "ready" }])), data: {} };
      const ins = await db.from("mock_attempts").insert({ user_id: user.id, mock_id: mock.id, state }).select("*").single();
      if (ins.error) throw ins.error;
      return json(200, { attempt: view(ins.data), mock: mockContent(mock), resumed: false });
    }

    const { row, err } = await load(body.id); if (err) return err;
    const st = row.state || {}, order = st.order || [];

    if (action === "get") {
      const { data: mock } = await db.from("mocks").select("*").eq("id", row.mock_id).maybeSingle();
      return json(200, { attempt: view(row), mock: mock ? mockContent(mock) : null });
    }
    if (row.user_id !== user.id) return json(403, { error: "Only the student can change a sitting." });
    if (action === "abandon") { if (row.status === "in_progress") await save(row, { status: "abandoned" }); return json(200, { ok: true }); }
    if (row.status !== "in_progress" && action !== "marking-status") return json(409, { error: "This sitting is already finished." });

    const cur = order[st.idx];
    if (action === "begin-section") {
      if (body.section !== cur) return json(409, { error: "That is not the current section." });
      const sec = st.sections[cur];
      if (sec.status === "ready") { const now = Date.now(); sec.status = "active"; sec.started_at = now; sec.deadline = now + MINUTES[cur] * 60000; row.state = st; const r = await save(row, { state: st }); return json(200, { attempt: view(r) }); }
      return json(200, { attempt: view(row) });
    }
    if (action === "save-draft") {
      if (cur !== "writing" || !st.sections.writing || st.sections.writing.status !== "active") return json(409, { error: "Writing is not open." });
      st.data = st.data || {}; st.data.writing = { ...(st.data.writing || {}), t1: str(body.t1, 20000), t2: str(body.t2, 20000), saved_at: Date.now() };
      await save(row, { state: st }); return json(200, { ok: true });
    }
    if (action === "save-section") {
      const section = String(body.section || "");
      if (!order.includes(section)) return json(400, { error: "Unknown section." });
      const sec = st.sections[section];
      if (sec.status === "done") return json(200, { attempt: view(row), already: true });
      if (section !== cur || sec.status !== "active") return json(409, { error: "That section is not open." });
      const d = body.data || {}; st.data = st.data || {};
      if (section === "listening" || section === "reading") {
        const score = Math.max(0, Math.min(40, Math.round(Number(d.score) || 0)));
        st.data[section] = { score, total: 40, review: cleanReview(d.review) };
      } else if (section === "writing") {
        const old = st.data.writing || {};
        st.data.writing = { t1: str(d.t1 != null ? d.t1 : old.t1, 20000), t2: str(d.t2 != null ? d.t2 : old.t2, 20000) };
      } else st.data.speaking = { parts: Array.isArray(d.parts) ? d.parts.map(Number).filter((n) => [1, 2, 3].includes(n)) : [] };
      sec.status = "done"; sec.ended_at = Date.now(); st.idx = Math.min(order.length, (st.idx || 0) + 1);
      const r = await save(row, { state: st }); return json(200, { attempt: view(r) });
    }

    // results linked to this sitting (the marking that happened during/after it)
    const results = async () => {
      const { data } = await db.from("mock_results").select("id, section, status, band, payload, error, created_at").eq("attempt_id", row.id).order("created_at", { ascending: false });
      const w = {}, sp = {};
      (data || []).forEach((r) => {
        if (r.section === "writing_t1" || r.section === "writing_t2") { const k = r.section === "writing_t1" ? "t1" : "t2"; if (!w[k] || (r.status === "done" && w[k].status !== "done")) w[k] = r; }
        else if (r.section === "speaking") { const p = String((r.payload && r.payload.part) || ""); if (p && (!sp[p] || (r.status === "done" && sp[p].status !== "done"))) sp[p] = r; }
      });
      return { w, sp };
    };
    const need = () => ({ writing: order.includes("writing"), speaking: order.includes("speaking") });

    if (action === "marking-status") {
      const { w, sp } = await results(), n = need();
      const brief = (r) => (r ? { id: r.id, status: r.status, band: r.band == null ? null : Number(r.band), error: r.error || null } : { status: "none" });
      return json(200, { writing: n.writing ? { t1: brief(w.t1), t2: brief(w.t2) } : null, speaking: n.speaking ? { 1: brief(sp[1]), 2: brief(sp[2]), 3: brief(sp[3]) } : null });
    }

    if (action === "finish") {
      if (st.idx < order.length) return json(409, { error: "Finish every section first." });
      const { w, sp } = await results(), n = need(), missing = [], pending = [];
      if (n.writing) ["t1", "t2"].forEach((k) => { const r = w[k]; if (!r) missing.push("writing_" + k); else if (r.status === "pending") pending.push("writing_" + k); else if (r.status !== "done") missing.push("writing_" + k); });
      if (n.speaking) { const recorded = (st.data.speaking && st.data.speaking.parts) || []; [1, 2, 3].filter((p) => recorded.includes(p)).forEach((p) => { const r = sp[p]; if (!r) missing.push("speaking_" + p); else if (r.status === "pending") pending.push("speaking_" + p); else if (r.status !== "done") missing.push("speaking_" + p); }); }
      if (pending.length) return json(200, { ready: false, pending, missing });
      if (missing.length && !body.force) return json(200, { ready: false, pending, missing });
      const secs = (k) => { const s = st.sections[k]; return s && s.started_at && s.ended_at ? Math.round((s.ended_at - s.started_at) / 1000) : null; };
      const sections = {};
      ["listening", "reading"].forEach((k) => { if (order.includes(k)) { const d = st.data[k] || { score: 0, total: 40, review: [] }; sections[k] = { score: d.score, total: 40, band: bandFrom(k === "listening" ? LISTENING_BANDS : READING_BANDS, d.score), secs: secs(k), review: d.review || [] }; } });
      if (n.writing) {
        const t = (k) => { const r = w[k]; if (!r || r.status !== "done") return null; const p = r.payload || {}; return { band: Number(r.band), text: p.text || "", word_count: p.word_count || words(p.text), evaluation: p.evaluation || null }; };
        const t1 = t("t1"), t2 = t("t2"), band = t1 && t2 ? half((t1.band + 2 * t2.band) / 3) : t2 ? t2.band : t1 ? t1.band : null;
        const dr = st.data.writing || {};
        sections.writing = { band, secs: secs("writing"), t1: t1 || { band: null, text: dr.t1 || "", word_count: words(dr.t1), evaluation: null }, t2: t2 || { band: null, text: dr.t2 || "", word_count: words(dr.t2), evaluation: null }, note: "Task 2 counts twice as much as Task 1." };
      }
      if (n.speaking) {
        const parts = [1, 2, 3].map((p) => sp[p]).filter((r) => r && r.status === "done").map((r) => ({ part: Number(r.payload.part), band: Number(r.band), evaluation: r.payload.evaluation }));
        let criteria = null, band = null;
        if (parts.length) { criteria = {}; SPEAK_KEYS.forEach((k) => { criteria[k] = Math.round((parts.reduce((a, p) => a + (Number(p.evaluation && p.evaluation[k] && p.evaluation[k].band) || 0), 0) / parts.length) * 100) / 100; }); band = half(SPEAK_KEYS.reduce((a, k) => a + criteria[k], 0) / SPEAK_KEYS.length); }
        sections.speaking = { band, criteria, parts, secs: secs("speaking") };
      }
      const bands = Object.values(sections).map((s) => s.band).filter((b) => b != null);
      const overall = bands.length ? half(bands.reduce((a, b) => a + b, 0) / bands.length) : null;
      const firstStart = Math.min(...Object.values(st.sections).map((s) => s.started_at || Infinity)), lastEnd = Math.max(...Object.values(st.sections).map((s) => s.ended_at || 0));
      const final = { version: 1, overall, sections, missing, speaking_skipped: st.speaking_skipped || null, finished_at: new Date().toISOString(), total_secs: isFinite(firstStart) && lastEnd ? Math.round((lastEnd - firstStart) / 1000) : null };
      const r = await save(row, { status: "done", final, finished_at: final.finished_at });
      return json(200, { ready: true, attempt: view(r) });
    }
    return json(400, { error: "Unknown action." });
  } catch (e) {
    console.error("mock-attempt", action, e);
    return json(500, { error: "Could not do that. Please try again." });
  }
};
