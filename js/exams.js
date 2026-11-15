/* Real Exam Tests: Reading passages and full Listening tests that look like the real IELTS screen.
   Students: pick a test, it opens full screen inside one common exam frame (Teacher Javlonbek's Telegram link top right).
   Tests are private files; the server decides who may open them (IELTS WARRIORS class + free samples) and hands out short-lived links.
   Every finished test reports its score to the site (see HOOK) so the teacher can see it. Teacher tools (upload / access / results) show only for the teacher. */
(function () {
  'use strict';
  var FN = '/.netlify/functions/', TG = 'https://t.me/Javlonbek_Okhunov', TGN = '@Javlonbek_Okhunov', BUCKET = 'lesson-content', MARK = '__EXAM_AUDIO_URL__';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var E = { data: null, kind: 'reading', mode: 'lib', admin: null, up: [], busy: false, frame: null, cur: null, done: false, rfilter: { u: '', t: '' } };

  /* ---------- API ---------- */
  async function tok() { return (window.TJ && window.TJ.token) ? window.TJ.token() : null; }
  async function api(fn, opts) {
    opts = opts || {}; var t = await tok(), res;
    try { res = await fetch(FN + fn + (opts.qs ? '?' + new URLSearchParams(opts.qs).toString() : ''), { method: opts.body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + (t || ''), 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { throw new Error('No internet connection. Please try again.'); }
    var d = {}; try { d = await res.json(); } catch (e) {}
    if (!res.ok) { var er = new Error(d.error || 'Something went wrong. Please try again.'); er.status = res.status; er.data = d; throw er; }
    return d;
  }
  function root() { return $('exRoot'); }
  function user() { return window.TJ && window.TJ.getUser && window.TJ.getUser(); }
  function isAdmin() { return !!(window.TJ && window.TJ.isAdmin && window.TJ.isAdmin()); }
  function toast(m) { var t = $('exToast'); if (!t) { t = document.createElement('div'); t.id = 'exToast'; t.className = 'ex-toast'; document.body.appendChild(t); } t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 3200); }
  var tgIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.1 2.6 11.5c-1 .4-1 1.3-.2 1.6l4.9 1.5 1.9 5.8c.2.6.4.8.9.8.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.8-.8L23 5.2c.3-1.2-.4-1.7-1.1-1.1zM9.2 13.8l9.3-5.9c.4-.3.8-.1.5.2l-7.7 7-.3 3.2-1.8-4.5z"/></svg>';

  /* ---------- the little program that runs INSIDE each test page (added when the test opens; your files are never changed) ---------- */
  function HOOK(cfg) {
    var wasSub = null;
    function post(o) { try { parent.postMessage(Object.assign({ type: 'tj-exam-result', id: cfg.id }, o), '*'); } catch (e) {} }
    function hideCredit() { var a = document.querySelectorAll('a[href]'); for (var i = 0; i < a.length; i++) if (/t\.me\/ielts_volume/i.test(a[i].getAttribute('href') || '')) a[i].style.display = 'none'; }
    function setAudio() { if (!cfg.audio) return; var a = document.querySelectorAll('audio'); for (var i = 0; i < a.length; i++) { if (a[i].getAttribute('src') !== cfg.audio) { a[i].setAttribute('src', cfg.audio); try { a[i].load(); } catch (e) {} } } }
    function isW() { try { return typeof grade === 'function' && typeof NUMS !== 'undefined' && typeof TOTAL !== 'undefined' && typeof S !== 'undefined'; } catch (e) { return false; } }
    function isV() { try { return typeof checkAnswers === 'function' && typeof checked !== 'undefined'; } catch (e) { return false; } }
    function submitted() { try { if (isW()) return !!S.submitted; if (isV()) return !!checked; } catch (e) {} return null; }
    function domScore() {
      var ids = ['resultsSummary', 'summaryRow', 'resultSummary', 'resultsDetails'], i, el, t, m, b;
      for (i = 0; i < ids.length; i++) { el = document.getElementById(ids[i]); if (!el) continue; t = el.textContent || ''; m = t.match(/Score:?\s*(\d+)\s*\/\s*(\d+)/i); if (m) { b = t.match(/Band:?\s*([\d.]+)/i); return { score: +m[1], total: +m[2], band: b ? +b[1] : null }; } }
      return null;
    }
    function result() {
      try {
        if (isW()) return { score: S.score, total: TOTAL, band: null, q: NUMS.map(function (n) { return S.results && S.results[n] ? 1 : 0; }) };
        if (isV()) {
          var d = domScore(); if (!d) return null;
          var rows = document.querySelectorAll('.result-row'), q = [];
          for (var i = 0; i < rows.length; i++) q.push(/\b(good|correct)\b/.test(rows[i].className) && !/\b(bad|incorrect)\b/.test(rows[i].className) ? 1 : 0);
          if (q.length === d.total) d.q = q;
          return d;
        }
      } catch (e) {}
      return null;
    }
    function tick() { hideCredit(); setAudio(); var s = submitted(); if (s === null) return; if (wasSub === null) { wasSub = s; return; } if (s && !wasSub) { var r = result(); if (r) { post(r); wasSub = true; } } else if (!s) wasSub = false; }
    setAudio();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setAudio);
    window.addEventListener('load', function () { setAudio(); setInterval(tick, 700); });
  }
  function buildPage(html, audioUrl, id) {
    var used = html.indexOf(MARK) >= 0;
    if (audioUrl && used) html = html.split(MARK).join(audioUrl);
    var tag = '<script>(' + HOOK.toString() + ')(' + JSON.stringify({ id: id, audio: audioUrl && !used ? audioUrl : null }) + ')<' + '/script>';
    var i = html.lastIndexOf('</body>');
    return i < 0 ? html + tag : html.slice(0, i) + tag + html.slice(i);
  }

  /* ---------- student: library ---------- */
  function groupTests(list) {
    var series = {};
    list.forEach(function (t) { var s = (series[t.series || 'Tests'] = series[t.series || 'Tests'] || {}); (s[t.test_no] = s[t.test_no] || []).push(t); });
    return Object.keys(series).sort().map(function (name) {
      return { name: name, tests: Object.keys(series[name]).map(Number).sort(function (a, b) { return a - b; }).map(function (n) { return { no: n, items: series[name][n].sort(function (a, b) { return (a.passage_no || 0) - (b.passage_no || 0) || a.sort - b.sort; }) }; }) };
    });
  }
  function tile(t) {
    var m = t.mine, label = t.kind === 'listening' ? 'Full Listening test' : (t.passage_no ? 'Passage ' + t.passage_no : 'Full Reading test');
    var sub = t.kind === 'listening' ? '4 sections · ' + t.questions + ' questions · ' + t.minutes + ' min' : (t.passage_no ? t.questions + ' questions · ' + t.minutes + ' min' : '3 passages · ' + t.questions + ' questions · ' + t.minutes + ' min');
    var st = t.locked ? '<span class="ex-lock" title="IELTS WARRIORS students only"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg> Locked</span>'
      : m && m.best ? '<span class="ex-done">✓ ' + m.best.score + '/' + m.best.total + (m.best.band != null ? ' · band ' + Number(m.best.band).toFixed(1) : '') + '</span>' : '<span class="ex-new">Not tried</span>';
    return '<button class="ex-tile' + (t.locked ? ' locked' : '') + (m && m.best ? ' done' : '') + '" data-open="' + esc(t.id) + '"><span class="ex-tl">' + esc(label) + (t.is_free ? ' <i class="ex-free">FREE</i>' : '') + '</span><b>' + esc(t.title) + '</b><span class="ex-ts">' + esc(sub) + '</span>' + st + '</button>';
  }
  function libHtml() {
    var d = E.data, list = d.tests.filter(function (t) { return t.kind === E.kind; });
    var banner = d.admin ? '' : d.member ? '' : '<div class="ex-banner"><b>These tests are for IELTS WARRIORS students.</b> Tests marked FREE are open to everyone who is signed in. To join the course, message <a href="' + TG + '" target="_blank" rel="noopener">Teacher Javlonbek on Telegram</a>.</div>';
    var body = !list.length ? '<div class="ex-empty">No ' + E.kind + ' tests have been added yet.</div>' : groupTests(list).map(function (s) {
      return '<div class="ex-series"><div class="ex-sh">' + esc(s.name) + '</div>' + s.tests.map(function (tt) {
        return '<div class="ex-test"><div class="ex-tn">Test ' + tt.no + '</div><div class="ex-tiles">' + tt.items.map(tile).join('') + '</div></div>';
      }).join('') + '</div>';
    }).join('');
    return banner + '<div class="ex-seg" role="tablist"><button class="' + (E.kind === 'reading' ? 'on' : '') + '" data-kind="reading">Reading</button><button class="' + (E.kind === 'listening' ? 'on' : '') + '" data-kind="listening">Listening</button></div>' + body;
  }
  function modeBar() { return isAdmin() ? '<div class="ex-seg ex-mode"><button class="' + (E.mode === 'lib' ? 'on' : '') + '" data-mode="lib">Tests</button><button class="' + (E.mode === 'admin' ? 'on' : '') + '" data-mode="admin">Teacher tools</button></div>' : ''; }
  function setHtml(h) { var r = root(); if (r) r.innerHTML = h; }
  async function showLib() {
    if (!user()) return setHtml('<div class="ex-empty"><b>Please sign in to open the exam tests.</b><br><button class="wc-btn" data-go="auth" style="margin-top:12px">Sign in</button></div>');
    setHtml('<div class="ex-empty">Loading…</div>');
    try { E.data = await api('exam-list'); } catch (e) { return setHtml('<div class="ex-empty">' + esc(e.message) + ' <button class="wc-btn ghost" data-act="retry">Try again</button></div>'); }
    if (E.mode === 'admin' && isAdmin()) return showAdmin();
    E.mode = 'lib'; setHtml(modeBar() + libHtml());
  }

  /* ---------- student: the exam screen ---------- */
  function shell() {
    var s = $('exShell'); if (s) return s;
    s = document.createElement('div'); s.id = 'exShell'; s.className = 'ex-shell'; s.hidden = true;
    s.innerHTML = '<div class="ex-bar"><button class="ex-back" data-act="close">← <span>Tests</span></button><div class="ex-bt" id="exBt"></div><a class="ex-tg" href="' + TG + '" target="_blank" rel="noopener" title="Teacher Javlonbek on Telegram">' + tgIcon + '<span>' + TGN + '</span></a></div><div class="ex-stage" id="exStage"><div class="ex-load" id="exLoad">Opening your test…</div></div>';
    document.body.appendChild(s); return s;
  }
  async function openTest(id) {
    var t = E.data && E.data.tests.filter(function (x) { return x.id === id; })[0];
    if (t && t.locked) { window.scrollTo({ top: 0, behavior: 'smooth' }); var b = document.querySelector('.ex-banner'); if (b) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); } return toast('This test is for IELTS WARRIORS students.'); }
    var s = shell(); s.hidden = false; document.body.classList.add('ex-open'); E.done = false;
    $('exBt').textContent = t ? (t.series ? t.series + ' · Test ' + t.test_no + ' · ' : '') + t.title : '';
    var st = $('exStage'); st.innerHTML = '<div class="ex-load" id="exLoad">Opening your test…</div>';
    try {
      var o = await api('exam-open', { qs: { id: id } });
      var res = await fetch(o.html_url); if (!res.ok) throw new Error('Could not download the test. Please try again.');
      var html = await res.text();
      var fr = document.createElement('iframe'); fr.className = 'ex-frame'; fr.title = o.test.title;
      fr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads');
      fr.setAttribute('allow', 'fullscreen; autoplay');
      st.innerHTML = ''; st.appendChild(fr); E.frame = fr; E.cur = o.test; fr.srcdoc = buildPage(html, o.audio_url, o.test.id);
    } catch (e) {
      st.innerHTML = '<div class="ex-load">' + esc(e.status === 403 ? 'These tests are for IELTS WARRIORS students.' : e.message) + '<br><button class="wc-btn ghost" data-act="close" style="margin-top:12px">Back to tests</button></div>';
    }
  }
  function closeTest(force) {
    var s = $('exShell'); if (!s || s.hidden) return;
    if (!force && E.frame && !E.done && !window.confirm('Leave this test? Your answers are saved on this device, so you can continue later.')) return;
    s.hidden = true; document.body.classList.remove('ex-open'); var st = $('exStage'); if (st) st.innerHTML = ''; E.frame = null; E.cur = null;
    if (document.body.getAttribute('data-view') === 'exams') showLib();
  }
  window.addEventListener('message', async function (e) {
    var d = e.data; if (!d || d.type !== 'tj-exam-result' || !E.frame || e.source !== E.frame.contentWindow || !E.cur || d.id !== E.cur.id) return;
    E.done = true;
    try { await api('exam-result', { body: { test_id: d.id, score: d.score, total: d.total, band: d.band, q: d.q } }); toast('Result saved: ' + d.score + ' / ' + d.total + (d.band != null ? ' · band ' + Number(d.band).toFixed(1) : '')); }
    catch (er) { toast('Your score could not be saved: ' + er.message); }
  });

  /* ---------- teacher tools ---------- */
  function nm(id) { var s = (E.admin.students || []).filter(function (x) { return x.id === id; })[0]; return s ? (s.full_name || s.email || id) : id; }
  function testName(t) { return (t.series ? t.series + ' · ' : '') + 'Test ' + t.test_no + (t.passage_no ? ' · P' + t.passage_no : t.kind === 'reading' ? ' · full' : '') + ' · ' + t.title; }
  function titleCase(s) { return s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function guess(file) {
    var n = file.name.replace(/\.[^.]+$/, ''), o = { file: file, kind: /listen/i.test(n) ? 'listening' : 'reading', series: '', test_no: 1, passage_no: '', title: titleCase(n), minutes: 60, questions: 40, free: false }, m;
    if ((m = n.match(/^Reading_Passage_(\d)_(.+)$/i))) { o.kind = 'reading'; o.passage_no = +m[1]; o.title = titleCase(m[2]); }
    else if ((m = n.match(/^IELTS_WARRIORS_(Reading|Listening)_Test(\d+)(?:_Passage(\d))?(?:_Full)?$/i))) { o.series = 'IELTS WARRIORS'; o.kind = m[1].toLowerCase(); o.test_no = +m[2]; o.passage_no = m[3] ? +m[3] : ''; o.title = (o.kind === 'listening' ? 'Listening Test ' : 'Reading Test ') + m[2] + (m[3] ? ' – Passage ' + m[3] : ''); }
    else if ((m = n.match(/^Vol10_Test(\d+)_Reading_Passage(\d)_(.+)$/i))) { o.series = 'Volume 10'; o.kind = 'reading'; o.test_no = +m[1]; o.passage_no = +m[2]; o.title = titleCase(m[3]); }
    else if ((m = n.match(/^vol(?:ume)?_?(\d+)_test_?(\d+)_(reading|listening)/i))) { o.series = 'Volume ' + m[1]; o.test_no = +m[2]; o.kind = m[3].toLowerCase(); o.title = (o.kind === 'listening' ? 'Listening Test ' : 'Reading Test ') + m[2]; }
    if (o.kind === 'listening') { o.minutes = 40; o.questions = 40; o.passage_no = ''; } else if (o.passage_no) { o.minutes = 20; o.questions = 13; }
    return o;
  }
  async function showAdmin() {
    E.mode = 'admin'; setHtml(modeBar() + '<div class="ex-empty">Loading…</div>');
    try { E.admin = await api('exam-admin'); } catch (e) { return setHtml(modeBar() + '<div class="ex-empty">' + esc(e.message) + '</div>'); }
    drawAdmin();
  }
  function f(name, v, w, type) { return '<input class="ex-in" data-f="' + name + '" value="' + esc(v) + '" style="width:' + (w || 90) + 'px"' + (type ? ' type="' + type + '"' : '') + '>'; }
  function drawAdmin() {
    var A = E.admin, sel = new Set(A.class_ids || []);
    var access = '<div class="ex-card"><h3>Who can open the tests</h3><p class="ex-p">Students who are in an <b>active</b> class ticked here can open every test. Everyone else sees the tests locked, except the ones marked FREE.</p><div class="ex-checks">' +
      (A.classes.length ? A.classes.map(function (c) { return '<label><input type="checkbox" data-cls="' + esc(c.id) + '"' + (sel.has(c.id) ? ' checked' : '') + '> ' + esc(c.name) + '</label>'; }).join('') : '<i>No classes yet. Create your IELTS WARRIORS class in the Lessons manager first.</i>') +
      '</div><button class="wc-btn" data-act="save-classes">Save</button></div>';
    var up = '<div class="ex-card"><h3>Upload tests</h3><p class="ex-p">Choose the prepared <b>.html</b> files (and the <b>.mp3</b> for a Listening test, with the same file name). Check the names, then press Upload.</p>' +
      '<input type="file" id="exFiles" multiple accept=".html,.htm,.mp3,.m4a,.aac" class="ex-file"><div class="ex-defs">Apply to all rows: Series ' + f('d-series', '', 130) + ' Test no. ' + f('d-test', '', 60, 'number') + ' <button class="wc-btn ghost" data-act="apply-defaults">Apply</button></div>' +
      '<div id="exRows">' + upRows() + '</div></div>';
    var tests = '<div class="ex-card"><h3>Uploaded tests (' + A.tests.length + ')</h3>' + (A.tests.length ? '<div class="ex-tw"><table class="ex-t"><thead><tr><th>Test</th><th>Type</th><th>Free</th><th>Status</th><th></th></tr></thead><tbody>' + A.tests.map(function (t) {
      return '<tr data-tid="' + esc(t.id) + '"><td>' + esc(testName(t)) + '</td><td>' + esc(t.kind) + (t.audio_path ? ' ♪' : '') + '</td><td><input type="checkbox" data-free="' + esc(t.id) + '"' + (t.is_free ? ' checked' : '') + '></td><td>' + (t.ready ? 'Ready' : '<b style="color:#c0504d">Upload not finished</b>') + '</td><td><button class="wc-btn ghost sm" data-edit="' + esc(t.id) + '">Edit</button> <button class="wc-btn ghost sm" data-del="' + esc(t.id) + '">Delete</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="ex-p">Nothing uploaded yet.</p>') + '<div id="exEdit"></div></div>';
    setHtml(modeBar() + '<div class="ex-admin">' + access + up + tests + resultsHtml() + '</div>');
  }
  function resultsHtml() {
    var A = E.admin, rs = A.results.filter(function (r) { return (!E.rfilter.u || r.user_id === E.rfilter.u) && (!E.rfilter.t || r.test_id === E.rfilter.t); });
    var tmap = {}; A.tests.forEach(function (t) { tmap[t.id] = t; });
    var users = {}; A.results.forEach(function (r) { users[r.user_id] = 1; });
    var per = {}; A.results.forEach(function (r) { var p = (per[r.user_id] = per[r.user_id] || { n: 0, sum: 0, tests: {} }); p.n++; p.sum += r.score / r.total; p.tests[r.test_id] = 1; });
    var ranking = Object.keys(per).sort(function (a, b) { return Object.keys(per[b].tests).length - Object.keys(per[a].tests).length || per[b].sum / per[b].n - per[a].sum / per[a].n; });
    return '<div class="ex-card"><h3>Students’ results (' + A.results.length + ')</h3>' +
      (ranking.length ? '<div class="ex-sum">' + ranking.slice(0, 12).map(function (u) { var p = per[u]; return '<button class="ex-chip' + (E.rfilter.u === u ? ' on' : '') + '" data-ru="' + esc(u) + '">' + esc(nm(u)) + ' <b>' + Object.keys(p.tests).length + ' tests · ' + Math.round(100 * p.sum / p.n) + '%</b></button>'; }).join('') + '</div>' : '') +
      '<div class="ex-fil"><select class="ex-in" data-rf="t"><option value="">All tests</option>' + A.tests.map(function (t) { return '<option value="' + esc(t.id) + '"' + (E.rfilter.t === t.id ? ' selected' : '') + '>' + esc(testName(t)) + '</option>'; }).join('') + '</select>' + (E.rfilter.u || E.rfilter.t ? ' <button class="wc-btn ghost sm" data-act="clear-filter">Show all</button>' : '') + '</div>' +
      (rs.length ? '<div class="ex-tw"><table class="ex-t"><thead><tr><th>Student</th><th>Test</th><th>Score</th><th>Band</th><th>When</th><th></th></tr></thead><tbody>' + rs.slice(0, 300).map(function (r) {
        var t = tmap[r.test_id]; return '<tr><td>' + esc(nm(r.user_id)) + '</td><td>' + esc(t ? testName(t) : '(deleted)') + '</td><td><b>' + r.score + '/' + r.total + '</b></td><td>' + (r.band != null ? Number(r.band).toFixed(1) : '—') + '</td><td>' + esc(new Date(r.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</td><td><button class="wc-btn ghost sm" data-rdel="' + esc(r.id) + '">×</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="ex-p">No results yet.</p>') + '</div>';
  }
  function upRows() {
    if (!E.up.length) return '';
    return '<div class="ex-tw"><table class="ex-t"><thead><tr><th>File</th><th>Type</th><th>Series</th><th>Test</th><th>Passage</th><th>Name students see</th><th>Min</th><th>Qs</th><th>Free</th><th>Audio</th><th></th></tr></thead><tbody>' + E.up.map(function (r, i) {
      return '<tr data-ur="' + i + '"><td class="ex-fn">' + esc(r.file.name) + '</td><td><select class="ex-in" data-u="kind"><option' + (r.kind === 'reading' ? ' selected' : '') + '>reading</option><option' + (r.kind === 'listening' ? ' selected' : '') + '>listening</option></select></td><td>' + f('series', r.series, 120).replace('data-f', 'data-u') + '</td><td>' + f('test_no', r.test_no, 52, 'number').replace('data-f', 'data-u') + '</td><td>' + f('passage_no', r.passage_no, 52, 'number').replace('data-f', 'data-u') + '</td><td>' + f('title', r.title, 230).replace('data-f', 'data-u') + '</td><td>' + f('minutes', r.minutes, 52, 'number').replace('data-f', 'data-u') + '</td><td>' + f('questions', r.questions, 52, 'number').replace('data-f', 'data-u') + '</td><td><input type="checkbox" data-u="free"' + (r.free ? ' checked' : '') + '></td><td>' + (r.audio ? '♪ ' + esc(r.audio.name) : r.kind === 'listening' ? '<i style="color:#c0504d">none</i>' : '—') + '</td><td class="ex-st" id="exUp' + i + '">' + esc(r.status || '') + '</td></tr>';
    }).join('') + '</tbody></table></div><button class="wc-btn" data-act="upload"' + (E.busy ? ' disabled' : '') + '>' + (E.busy ? 'Uploading…' : 'Upload ' + E.up.length + ' test' + (E.up.length > 1 ? 's' : '')) + '</button>';
  }
  // Pages prepared for this site carry their own labels (series, test, passage, name, question count) in a <meta name="tj-exam"> tag.
  async function metaOf(file) {
    try {
      var t = await file.slice(0, 8000).text(), m = t.match(/<meta name="tj-exam" content="([^"]*)"/); if (!m) return null;
      var d = new DOMParser().parseFromString('<p title="' + m[1] + '"></p>', 'text/html').body.firstChild.getAttribute('title');
      return JSON.parse(d);
    } catch (e) { return null; }
  }
  async function pickFiles(files) {
    var htmls = [], audios = [];
    Array.prototype.forEach.call(files, function (f) { (/\.(html?)$/i.test(f.name) ? htmls : /\.(mp3|m4a|aac)$/i.test(f.name) ? audios : []).push(f); });
    var metas = await Promise.all(htmls.map(metaOf));
    E.up = htmls.map(function (h, i) {
      var r = guess(h), base = h.name.replace(/\.[^.]+$/, '').toLowerCase(), mt = metas[i];
      if (mt) { r.kind = mt.kind === 'listening' ? 'listening' : 'reading'; r.series = mt.series || ''; r.test_no = mt.test || 1; r.passage_no = mt.passage || ''; r.title = mt.title || r.title; r.minutes = mt.minutes || r.minutes; r.questions = mt.questions || r.questions; r.free = !!mt.free; }
      r.audio = audios.filter(function (a) { return a.name.replace(/\.[^.]+$/, '').toLowerCase() === base; })[0] || (htmls.length === 1 && audios.length === 1 ? audios[0] : null);
      if (r.audio) { r.kind = 'listening'; r.passage_no = ''; r.minutes = 40; r.questions = 40; }
      return r;
    });
    drawRows();
  }
  function drawRows() { var el = $('exRows'); if (el) el.innerHTML = upRows(); }
  function putFile(info, file, type, onp) {
    return new Promise(function (resolve, reject) {
      (async function attempt(n) {
        var t = await tok(), url = window.TJ.getUrl() + '/storage/v1/object/upload/sign/' + BUCKET + '/' + info.path.split('/').map(encodeURIComponent).join('/') + '?token=' + encodeURIComponent(info.token);
        var x = new XMLHttpRequest(); x.open('PUT', url); x.setRequestHeader('apikey', window.TJ.getAnonKey()); x.setRequestHeader('Authorization', 'Bearer ' + t); x.setRequestHeader('x-upsert', 'true');
        x.upload.onprogress = function (e) { if (e.lengthComputable) onp(Math.round(100 * e.loaded / e.total)); };
        x.onload = function () { if (x.status >= 200 && x.status < 300) return resolve(); var m = ''; try { m = JSON.parse(x.responseText).message || ''; } catch (e) {} if (x.status === 413 || /maximum/i.test(m)) return reject(new Error('File too big for the free storage plan (50 MB per file).')); if (x.status >= 500 && n < 2) return setTimeout(function () { attempt(n + 1); }, 1500); reject(new Error(m || 'Upload failed (' + x.status + ').')); };
        x.onerror = function () { if (n < 2) return setTimeout(function () { attempt(n + 1); }, 1500); reject(new Error('Connection lost.')); };
        var fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new File([file], file.name, { type: type })); x.send(fd);
      })(0);
    });
  }
  async function runUpload() {
    if (E.busy || !E.up.length) return; E.busy = true; drawRows();
    var ok = 0, failed = 0;
    for (var i = 0; i < E.up.length; i++) {
      var r = E.up[i], el = function () { return $('exUp' + i); }, set = function (s) { r.status = s; var e = el(); if (e) e.textContent = s; };
      if (r.done) continue;
      try {
        set('Preparing…');
        var c = await api('exam-admin', { body: { action: 'create-test', kind: r.kind, series: r.series, test_no: r.test_no, passage_no: r.passage_no, title: r.title, minutes: r.minutes, questions: r.questions, is_free: r.free, has_audio: !!r.audio } });
        await putFile(c.html, r.file, 'text/html', function (p) { set('Page ' + p + '%'); });
        if (r.audio && c.audio) await putFile(c.audio, r.audio, 'audio/mpeg', function (p) { set('Audio ' + p + '%'); });
        await api('exam-admin', { body: { action: 'confirm-test', id: c.id } });
        r.done = true; ok++; set('✓ Done');
      } catch (e) { failed++; set('✗ ' + e.message); }
    }
    E.busy = false; toast(ok + ' uploaded' + (failed ? ', ' + failed + ' failed (press Upload to retry them)' : '.'));
    if (!failed) E.up = []; var d = await api('exam-admin').catch(function () { return null; }); if (d) E.admin = d;
    if (!failed) drawAdmin(); else { var b = document.querySelector('[data-act="upload"]'); if (b) { b.disabled = false; b.textContent = 'Retry failed'; } }
  }
  function editForm(t) {
    return '<div class="ex-edit"><b>Edit: ' + esc(t.title) + '</b><div class="ex-er">Series ' + f('series', t.series, 130) + ' Test ' + f('test_no', t.test_no, 52, 'number') + ' Passage ' + f('passage_no', t.passage_no == null ? '' : t.passage_no, 52, 'number') + ' Min ' + f('minutes', t.minutes, 52, 'number') + ' Qs ' + f('questions', t.questions, 52, 'number') + ' Order ' + f('sort', t.sort, 60, 'number') + '</div><div class="ex-er">Name ' + f('title', t.title, 360) + '</div><button class="wc-btn" data-save="' + esc(t.id) + '">Save</button> <button class="wc-btn ghost" data-act="close-edit">Cancel</button></div>';
  }

  /* ---------- events ---------- */
  async function onClick(e) {
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-kind')) { E.kind = b.getAttribute('data-kind'); return setHtml(modeBar() + libHtml()); }
    if (b.hasAttribute('data-mode')) { E.mode = b.getAttribute('data-mode'); return E.mode === 'admin' ? showAdmin() : showLib(); }
    if (b.hasAttribute('data-open')) return openTest(b.getAttribute('data-open'));
    var a = b.getAttribute('data-act');
    if (a === 'retry') return showLib();
    try {
      if (a === 'save-classes') { var ids = [].map.call(document.querySelectorAll('[data-cls]:checked'), function (x) { return x.getAttribute('data-cls'); }); await api('exam-admin', { body: { action: 'set-classes', class_ids: ids } }); E.admin.class_ids = ids; return toast('Saved. These classes can open the tests.'); }
      if (a === 'apply-defaults') { var s = document.querySelector('[data-f="d-series"]').value.trim(), n = document.querySelector('[data-f="d-test"]').value; E.up.forEach(function (r) { if (s) r.series = s; if (n) r.test_no = +n; }); return drawRows(); }
      if (a === 'upload') return runUpload();
      if (a === 'close') return closeTest(false);
      if (a === 'clear-filter') { E.rfilter = { u: '', t: '' }; return drawAdmin(); }
      if (a === 'close-edit') { $('exEdit').innerHTML = ''; return; }
      if (b.hasAttribute('data-edit')) { var t = E.admin.tests.filter(function (x) { return x.id === b.getAttribute('data-edit'); })[0]; $('exEdit').innerHTML = editForm(t); $('exEdit').setAttribute('data-eid', t.id); $('exEdit').scrollIntoView({ block: 'center' }); return; }
      if (b.hasAttribute('data-save')) { var box = $('exEdit'), body = { action: 'update-test', id: b.getAttribute('data-save') }, old = E.admin.tests.filter(function (x) { return x.id === body.id; })[0]; [].forEach.call(box.querySelectorAll('[data-f]'), function (i) { body[i.getAttribute('data-f')] = i.value; }); body.kind = old.kind; body.is_free = old.is_free; await api('exam-admin', { body: body }); toast('Saved.'); return showAdmin(); }
      if (b.hasAttribute('data-del')) { if (!window.confirm('Delete this test and its file? Students’ results for it are deleted too.')) return; await api('exam-admin', { body: { action: 'delete-test', id: b.getAttribute('data-del') } }); toast('Deleted.'); return showAdmin(); }
      if (b.hasAttribute('data-rdel')) { if (!window.confirm('Delete this result?')) return; await api('exam-admin', { body: { action: 'delete-result', id: b.getAttribute('data-rdel') } }); E.admin.results = E.admin.results.filter(function (r) { return r.id !== b.getAttribute('data-rdel'); }); return drawAdmin(); }
      if (b.hasAttribute('data-ru')) { E.rfilter.u = E.rfilter.u === b.getAttribute('data-ru') ? '' : b.getAttribute('data-ru'); return drawAdmin(); }
    } catch (er) { toast(er.message); }
  }
  async function onChange(e) {
    var t = e.target;
    if (t.id === 'exFiles') return pickFiles(t.files);
    if (t.hasAttribute && t.hasAttribute('data-rf')) { E.rfilter.t = t.value; return drawAdmin(); }
    if (t.hasAttribute && t.hasAttribute('data-free')) { var id = t.getAttribute('data-free'), x = E.admin.tests.filter(function (y) { return y.id === id; })[0]; try { await api('exam-admin', { body: Object.assign({ action: 'update-test' }, x, { is_free: t.checked }) }); x.is_free = t.checked; toast(t.checked ? 'Now FREE for every signed-in student.' : 'Now only for course students.'); } catch (er) { t.checked = !t.checked; toast(er.message); } return; }
    if (t.hasAttribute && t.hasAttribute('data-u')) { var tr = t.closest('tr'), r = E.up[+tr.getAttribute('data-ur')], k = t.getAttribute('data-u'); r[k] = t.type === 'checkbox' ? t.checked : (t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value); if (k === 'kind') drawRows(); }
  }
  function init() {
    var r = root(); if (!r || r.getAttribute('data-ready')) return; r.setAttribute('data-ready', '1');
    r.addEventListener('click', onClick); r.addEventListener('change', onChange);
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('#exShell [data-act="close"]'); if (b) closeTest(false); });
  }
  function onView() { var v = document.body.getAttribute('data-view'); if (v !== 'exams') { closeTest(true); return; } init(); showLib(); }
  new MutationObserver(onView).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  document.addEventListener('DOMContentLoaded', function () { if (document.body.getAttribute('data-view') === 'exams') onView(); });
  window.TJExams = { HOOK: HOOK, buildPage: buildPage, guess: guess, groupTests: groupTests, MARK: MARK, state: function () { return E; }, showLib: showLib };
})();
