/* Admin -> Mocks tab: AI-marking settings (calibration, prompts, speaking switch, limits), mock editor (attach Listening/Reading,
   free/paid, publish, content JSON), recent student results. Everything saves through the mock-admin function. */
(function () {
  'use strict';
  var FN = '/.netlify/functions/mock-admin';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var D = null;

  async function call(body) {
    var t = await window.TJ.token();
    var res = await fetch(FN, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    var data = {}; try { data = await res.json(); } catch (e) {}
    if (!res.ok) { var er = new Error(data.error || 'Action failed.'); er.problems = data.problems; throw er; }
    return data;
  }
  function msg(id, ok, text, problems) {
    var el = $(id); if (!el) return;
    el.innerHTML = '<div class="' + (ok ? 'mka-ok' : 'mka-prob') + '">' + esc(text) + (problems && problems.length ? '<ul style="margin:6px 0 0 18px">' + problems.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
  }
  var TEMPLATE = {
    writing: { task1: { type: 'line', title: 'Chart title', min_words: 150, question: 'The line graph below shows ... Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', data: { x: [2000, 2010, 2020], unit: '%', ylabel: 'Percentage', series: [{ name: 'Country A', values: [10, 20, 30] }, { name: 'Country B', values: [5, 15, 25] }] } }, task2: { min_words: 250, question: 'Write your Task 2 question here (at least 30 characters).' } },
    speaking: { part1: [{ topic: 'Topic one', questions: ['Question one goes here?', 'Question two goes here?', 'Question three goes here?'] }], part2: { title: 'Describe something you like.', bullets: ['what it is', 'where you found it', 'why you like it'], roundoff: 'and explain how it makes you feel.' }, part3: ['Question one goes here?', 'Question two goes here?', 'Question three goes here?', 'Question four goes here?'] }
  };

  function itemOptions(sel) {
    return '<option value="">\u2014 none yet \u2014</option>' + (D.items || []).map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === sel ? ' selected' : '') + '>' + esc((i.course ? i.course + ' / ' : '') + i.title + ' (' + (i.kind || 'file') + ')' + (i.ready ? '' : ' [upload incomplete]')) + '</option>'; }).join('');
  }
  function mockCard(m, isNew) {
    var id = isNew ? 'new' : m.id, w = m.writing || TEMPLATE.writing, s = m.speaking || TEMPLATE.speaking;
    return '<div class="mka-card" data-mid="' + esc(id) + '"><div class="mka-row"><b style="font-size:16px">' + (isNew ? 'New mock' : 'Mock ' + esc(m.number) + ' \u2014 ' + esc(m.title)) + '</b>' + (isNew ? '' : '<span class="mk-badge ' + (m.is_free ? 'free' : 'paid') + '">' + (m.is_free ? 'Free' : 'Paid') + '</span><span class="mk-badge ' + (m.published ? 'free' : 'draft') + '">' + (m.published ? 'Published' : 'Draft') + '</span>') + '</div>' +
      '<div class="mka-row"><label>No.</label><input type="number" min="1" max="99" data-f="number" value="' + esc(m.number) + '" style="width:80px"><label>Title</label><input type="text" data-f="title" value="' + esc(m.title) + '" style="flex:1;min-width:200px"></div>' +
      '<div class="mka-row"><label>Short description</label><input type="text" data-f="description" value="' + esc(m.description || '') + '" style="flex:1;min-width:260px"></div>' +
      '<div class="mka-row"><label>Listening file</label><select data-f="listening_item">' + itemOptions(m.listening_item) + '</select><label>Reading file</label><select data-f="reading_item">' + itemOptions(m.reading_item) + '</select></div>' +
      '<div class="mka-row"><label class="cl-flag"><input type="checkbox" data-f="is_free"' + (m.is_free ? ' checked' : '') + '> Free for everyone</label><label class="cl-flag"><input type="checkbox" data-f="published"' + (m.published ? ' checked' : '') + '> Published (students can see it)</label></div>' +
      '<details style="margin:8px 0"><summary style="cursor:pointer;font-weight:600">Edit Writing and Speaking content (advanced)</summary><div class="mk-note">Question text, chart data and speaking cards. Charts: line, bar, pie, table or process. Click <b>Save</b> and any mistake is explained in plain words.</div>' +
      '<label class="wc-label">Writing (JSON)</label><textarea class="mka-json" data-f="writing">' + esc(JSON.stringify(w, null, 2)) + '</textarea><label class="wc-label">Speaking (JSON)</label><textarea class="mka-json" data-f="speaking">' + esc(JSON.stringify(s, null, 2)) + '</textarea></details>' +
      '<div class="mka-row"><button class="wc-btn" data-save style="width:auto;padding:10px 20px">Save</button>' + (isNew ? '' : '<button class="wc-btn ghost" data-del style="width:auto;padding:10px 20px">Delete</button>') + '</div><div data-out></div></div>';
  }
  function settingsCard() {
    var s = D.settings || {}, off = Number(s.calibration_offset) || 0;
    return '<div class="mka-card" id="mkaSettings"><h3 style="margin:0 0 4px;font-family:\'Cormorant Garamond\',serif;font-size:24px">AI marking settings</h3><div class="mk-note" style="margin:0 0 10px">These control the Writing checker everywhere (IELTS checker + mocks) and the Speaking check. Changes apply immediately, no deploy.</div>' +
      '<div class="mka-row"><label>Score calibration</label><select data-s="calibration_offset"><option value="0"' + (off === 0 ? ' selected' : '') + '>0 \u2014 as the AI marks (recommended)</option><option value="0.25"' + (off === 0.25 ? ' selected' : '') + '>+0.25 band</option><option value="0.5"' + (off === 0.5 ? ' selected' : '') + '>+0.5 band</option></select></div>' +
      '<div class="mk-note" style="margin:-2px 0 8px">If, after comparing with your own marking, the AI is consistently too strict, add 0.25 or 0.5. It lifts each criterion once; it never changes a 0 and never goes above 9.</div>' +
      '<div class="mka-row"><label class="cl-flag"><input type="checkbox" data-s="show_range"' + (s.show_range ? ' checked' : '') + '> Show a likely range (for example 6.0\u20137.0) next to the band</label></div>' +
      '<div class="mka-row"><label class="cl-flag"><input type="checkbox" data-s="speaking_enabled"' + (s.speaking_enabled ? ' checked' : '') + '> <b>Speaking AI check is ON</b> (students can send recordings)</label></div>' +
      '<div class="mka-row"><label>AI checks per day \u2014 free users</label><input type="number" min="0" max="200" data-s="daily_limit_free" value="' + esc(s.daily_limit_free) + '" style="width:80px"><label>members</label><input type="number" min="0" max="500" data-s="daily_limit_member" value="' + esc(s.daily_limit_member) + '" style="width:80px"></div>' +
      '<div class="mka-row"><label>Gemini model (leave empty for the default)</label><input type="text" data-s="gemini_model" value="' + esc(s.gemini_model || '') + '" placeholder="gemini-2.5-flash" style="width:220px"></div>' +
      '<details style="margin:10px 0"><summary style="cursor:pointer;font-weight:600">Examiner prompts (advanced)</summary><div class="mk-note">Empty = the built-in prompt, which is calibrated on the official Cambridge sample answers. If you write your own it must still tell the AI to reply as JSON (keep the OUTPUT part).</div>' +
      '<label class="wc-label">Writing examiner prompt</label><textarea class="mka-json" data-s="writing_prompt" placeholder="Empty = built-in prompt">' + esc(s.writing_prompt || '') + '</textarea><div class="mka-row"><button class="wc-btn ghost" data-showdefault="writing_prompt" style="width:auto;padding:8px 14px">Show built-in prompt</button><button class="wc-btn ghost" data-reset="writing" style="width:auto;padding:8px 14px">Reset to built-in</button></div>' +
      '<label class="wc-label">Speaking examiner prompt</label><textarea class="mka-json" data-s="speaking_prompt" placeholder="Empty = built-in prompt">' + esc(s.speaking_prompt || '') + '</textarea><div class="mka-row"><button class="wc-btn ghost" data-showdefault="speaking_prompt" style="width:auto;padding:8px 14px">Show built-in prompt</button><button class="wc-btn ghost" data-reset="speaking" style="width:auto;padding:8px 14px">Reset to built-in</button></div></details>' +
      '<div class="mka-row"><button class="wc-btn" data-savesettings style="width:auto;padding:10px 22px">Save settings</button></div><div id="mkaSetOut"></div></div>';
  }
  function recentCard() {
    var r = D.recent || [], names = { writing_t1: 'Writing T1', writing_t2: 'Writing T2', speaking: 'Speaking' };
    return '<div class="mka-card"><h3 style="margin:0 0 8px;font-size:17px">Recent student checks</h3>' + (r.length ? '<div style="overflow-x:auto"><table class="mk-table" style="min-width:420px"><thead><tr><th>Student</th><th>Mock</th><th>Section</th><th>Band</th><th>When</th></tr></thead><tbody>' +
      r.map(function (x) { return '<tr><td>' + esc(x.who) + '</td><td>' + esc(x.mock) + '</td><td>' + esc(names[x.section] || x.section) + (x.status !== 'done' ? ' (' + esc(x.status) + ')' : '') + '</td><td>' + (x.band == null ? '\u2014' : esc(Number(x.band).toFixed(1))) + '</td><td>' + esc(new Date(x.created_at).toLocaleString()) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="wc-empty">No checks yet.</div>') + '</div>';
  }
  function render() {
    var root = $('mkRoot2'); if (!root) return;
    if (D.setup_needed) { root.innerHTML = '<div class="mka-prob"><b>One step left:</b> run <code>db/migration_mocks.sql</code> in Supabase \u2192 SQL Editor, then reload this tab.</div>'; return; }
    var max = (D.mocks || []).reduce(function (a, m) { return Math.max(a, m.number); }, 0);
    root.innerHTML = '<div class="mka-grid">' + settingsCard() + '<h3 style="margin:10px 0 0;font-family:\'Cormorant Garamond\',serif;font-size:24px">Mocks</h3>' + (D.mocks || []).map(function (m) { return mockCard(m, false); }).join('') +
      '<div><button class="wc-btn ghost" data-newmock="' + (max + 1) + '" style="width:auto;padding:10px 20px">+ New mock</button></div><div id="mkaNew"></div>' + recentCard() + '</div>';
  }
  async function load() {
    var root = $('mkRoot2'); if (!root) return;
    root.innerHTML = '<div class="wc-loading"><span class="d"></span> Loading mocks\u2026</div>';
    try { D = await call(); render(); } catch (e) { root.innerHTML = '<div class="wc-err">' + esc(e.message) + '</div>'; }
  }
  function readCard(card) {
    var f = function (n) { return card.querySelector('[data-f="' + n + '"]'); }, o = {};
    o.number = Number(f('number').value); o.title = f('title').value; o.description = f('description').value; o.listening_item = f('listening_item').value || null; o.reading_item = f('reading_item').value || null;
    o.is_free = f('is_free').checked; o.published = f('published').checked;
    try { o.writing = JSON.parse(f('writing').value); } catch (e) { throw new Error('The Writing JSON has a typing mistake: ' + e.message); }
    try { o.speaking = JSON.parse(f('speaking').value); } catch (e) { throw new Error('The Speaking JSON has a typing mistake: ' + e.message); }
    return o;
  }
  async function onClick(e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-newmock')) { var n = $('mkaNew'); n.innerHTML = mockCard({ number: Number(t.getAttribute('data-newmock')), title: 'Mock Test ' + t.getAttribute('data-newmock'), description: '', is_free: false, published: false }, true); return; }
    var card = t.closest('[data-mid]'), out = card && card.querySelector('[data-out]');
    if (t.hasAttribute('data-save') && card) {
      t.disabled = true; try {
        var o = readCard(card); if (card.getAttribute('data-mid') !== 'new') o.id = card.getAttribute('data-mid'); o.action = 'save-mock';
        var r = await call(o); await load(); var again = document.querySelector('[data-mid="' + r.id + '"] [data-out]'); if (again) msg_el(again, true, 'Saved.' + (r.problems && r.problems.length ? ' It is still a draft because:' : ''), r.problems);
      } catch (er) { if (out) msg_el(out, false, er.message, er.problems); } finally { t.disabled = false; }
      return;
    }
    if (t.hasAttribute('data-del') && card) { if (!window.confirm('Delete this mock and all student results for it? This cannot be undone.')) return; try { await call({ action: 'delete-mock', id: card.getAttribute('data-mid') }); await load(); } catch (er) { if (out) msg_el(out, false, er.message); } return; }
    if (t.hasAttribute('data-showdefault')) { var k = t.getAttribute('data-showdefault'), ta = document.querySelector('[data-s="' + k + '"]'); if (ta && (!ta.value || window.confirm('Replace the text in the box with the built-in prompt?'))) ta.value = D.defaults[k]; return; }
    if (t.hasAttribute('data-reset')) { try { await call({ action: 'reset-prompt', which: t.getAttribute('data-reset') }); await load(); msg('mkaSetOut', true, 'Reset. The built-in prompt is now used.'); } catch (er) { msg('mkaSetOut', false, er.message); } return; }
    if (t.hasAttribute('data-savesettings')) {
      var body = { action: 'save-settings' };
      Array.prototype.forEach.call(document.querySelectorAll('#mkaSettings [data-s]'), function (el) { var k2 = el.getAttribute('data-s'); body[k2] = el.type === 'checkbox' ? el.checked : (el.type === 'number' || k2 === 'calibration_offset') ? Number(el.value) : el.value; });
      t.disabled = true; try { await call(body); msg('mkaSetOut', true, 'Settings saved. They are live now.'); D.settings = Object.assign({}, D.settings, body); } catch (er) { msg('mkaSetOut', false, er.message); } finally { t.disabled = false; }
    }
  }
  function msg_el(el, ok, text, problems) { el.innerHTML = '<div class="' + (ok ? 'mka-ok' : 'mka-prob') + '">' + esc(text) + (problems && problems.length ? '<ul style="margin:6px 0 0 18px">' + problems.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') + '</div>'; }
  function init() { var r = $('mkRoot2'); if (!r || r.getAttribute('data-ready')) return; r.setAttribute('data-ready', '1'); r.addEventListener('click', onClick); }
  init();
  window.TJMocksAdmin = { load: function () { init(); return load(); }, _D: function () { return D; } };
})();
