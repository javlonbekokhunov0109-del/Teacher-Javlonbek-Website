/* Mock Tests (students): list + paywall, Listening/Reading files, Writing with generated charts + AI marking, Speaking recorder
   + AI marking (when the teacher switches it on), and a results history. All data and rules come from the server functions. */
(function () {
  'use strict';
  var FN = '/.netlify/functions/', TELEGRAM = 'https://t.me/Javlonbek_Okhunov';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var COLORS = ['#B8901E', '#2f7d55', '#c0504d', '#4a6fa5', '#8064a2', '#e08a2c'];
  var M = { list: null, mock: null, tab: 'overview', results: [], settings: {}, usage: {}, rec: {}, busy: {}, timers: {}, part: 1 };

  /* ---------- API ---------- */
  async function tok() { return (window.TJ && window.TJ.token) ? window.TJ.token() : null; }
  async function api(fn, opts) {
    opts = opts || {}; var t = await tok();
    var url = FN + fn + (opts.qs ? '?' + new URLSearchParams(opts.qs).toString() : '');
    var res;
    try { res = await fetch(url, { method: opts.body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + (t || ''), 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { var er = new Error('No internet connection. Please try again.'); er.network = true; throw er; }
    var data = {}; try { data = await res.json(); } catch (e) {}
    if (!res.ok) { var err = new Error(data.error || 'Something went wrong. Please try again.'); err.status = res.status; err.data = data; throw err; }
    return data;
  }
  async function apiText(fn, qs) {
    var t = await tok(), res;
    try { res = await fetch(FN + fn + '?' + new URLSearchParams(qs).toString(), { headers: { Authorization: 'Bearer ' + (t || '') } }); }
    catch (e) { throw new Error('No internet connection. Please try again.'); }
    if (!res.ok) { var d = {}; try { d = await res.json(); } catch (e) {} var er = new Error(d.error || 'Could not open this test.'); er.status = res.status; throw er; }
    return res.text();
  }
  function root() { return $('mkRoot'); }
  function setHtml(h) { var r = root(); if (r) r.innerHTML = h; }
  function band(n) { return (Number(n) || 0).toFixed(1); }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function words(t) { var m = String(t || '').trim().match(/\b[\w'\u2019-]+\b/g); return m ? m.length : 0; }
  function clearTimers() { Object.keys(M.timers).forEach(function (k) { clearInterval(M.timers[k].iv); }); M.timers = {}; }
  function stopRecorders() { Object.keys(M.rec).forEach(function (k) { var r = M.rec[k]; if (r && r.mr && r.mr.state === 'recording') { try { r.mr.stop(); } catch (e) {} } if (r && r.stream) r.stream.getTracks().forEach(function (t) { t.stop(); }); }); }

  /* ---------- charts (pure SVG/HTML strings; colours come from the series palette, text from the page theme) ---------- */
  function niceMax(v) { if (v <= 0) return 10; var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e, n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10; return n * e; }
  function legend(series) { return '<div class="mk-legend">' + series.map(function (s, i) { return '<span><i style="background:' + COLORS[i % COLORS.length] + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>'; }
  function axes(W, H, L, R, T, B, max, unit, ylabel) {
    var s = '', steps = 5, ph = H - T - B;
    for (var i = 0; i <= steps; i++) { var y = T + ph - (ph * i / steps), val = max * i / steps; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="currentColor" stroke-opacity="' + (i ? .12 : .45) + '"/><text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="currentColor" fill-opacity=".75">' + (Math.round(val * 100) / 100) + '</text>'; }
    if (ylabel) s += '<text transform="rotate(-90 14 ' + (T + ph / 2) + ')" x="14" y="' + (T + ph / 2) + '" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity=".75">' + esc(ylabel) + '</text>';
    return s;
  }
  function chartLine(d) {
    var W = 680, H = 340, L = 60, R = 24, T = 20, B = 46, all = [].concat.apply([], d.series.map(function (s) { return s.values; })), max = niceMax(Math.max.apply(null, all)), pw = W - L - R, ph = H - T - B, n = d.x.length;
    var X = function (i) { return L + (n === 1 ? pw / 2 : pw * i / (n - 1)); }, Y = function (v) { return T + ph - ph * v / max; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Line graph">' + axes(W, H, L, R, T, B, max, d.unit, d.ylabel);
    d.x.forEach(function (lab, i) { svg += '<text x="' + X(i) + '" y="' + (H - B + 20) + '" text-anchor="middle" font-size="11.5" fill="currentColor" fill-opacity=".8">' + esc(lab) + '</text>'; });
    d.series.forEach(function (s, k) { var c = COLORS[k % COLORS.length]; svg += '<polyline fill="none" stroke="' + c + '" stroke-width="2.6" stroke-linejoin="round" points="' + s.values.map(function (v, i) { return X(i) + ',' + Y(v); }).join(' ') + '"/>' + s.values.map(function (v, i) { return '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="3.6" fill="' + c + '"/>'; }).join(''); });
    return '<div class="mk-chart">' + svg + '</svg>' + legend(d.series) + '</div>';
  }
  function wrap2(label) { var w = String(label).split(' '); if (w.length < 2 || label.length < 11) return [label]; var h = Math.ceil(w.length / 2); return [w.slice(0, h).join(' '), w.slice(h).join(' ')]; }
  function chartBar(d) {
    var W = 680, H = 360, L = 60, R = 20, T = 20, B = 64, all = [].concat.apply([], d.series.map(function (s) { return s.values; })), max = niceMax(Math.max.apply(null, all)), pw = W - L - R, ph = H - T - B, n = d.categories.length, gw = pw / n, k = d.series.length, bw = Math.min(40, (gw * 0.78) / k);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart">' + axes(W, H, L, R, T, B, max, d.unit, d.ylabel);
    d.categories.forEach(function (cat, i) {
      var cx = L + gw * i + gw / 2; wrap2(cat).forEach(function (ln, j) { svg += '<text x="' + cx + '" y="' + (H - B + 18 + j * 13) + '" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity=".85">' + esc(ln) + '</text>'; });
      d.series.forEach(function (s, j) { var v = s.values[i], h = ph * v / max, x = cx - (k * bw) / 2 + j * bw; svg += '<rect x="' + x + '" y="' + (T + ph - h) + '" width="' + (bw - 2) + '" height="' + h + '" rx="2" fill="' + COLORS[j % COLORS.length] + '"/>'; });
    });
    return '<div class="mk-chart">' + svg + '</svg>' + legend(d.series) + '</div>';
  }
  function chartPie(d) {
    return '<div class="mk-chart"><div class="mk-pies">' + d.pies.map(function (pie) {
      var cx = 150, cy = 150, r = 120, a = -Math.PI / 2, svg = '<svg viewBox="0 0 300 300" role="img" aria-label="Pie chart ' + esc(pie.title) + '">';
      pie.slices.forEach(function (s, i) {
        var ang = 2 * Math.PI * s.value / 100, b = a + ang, large = ang > Math.PI ? 1 : 0, mid = a + ang / 2;
        svg += '<path d="M' + cx + ' ' + cy + ' L' + (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + (cx + r * Math.cos(b)).toFixed(2) + ' ' + (cy + r * Math.sin(b)).toFixed(2) + ' Z" fill="' + COLORS[i % COLORS.length] + '" stroke="#fff" stroke-width="1.5"/>';
        if (s.value >= 5) svg += '<text x="' + (cx + r * 0.66 * Math.cos(mid)).toFixed(1) + '" y="' + (cy + r * 0.66 * Math.sin(mid) + 4).toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">' + s.value + '%</text>';
        a = b;
      });
      return '<figure>' + '<div class="ct">' + esc(pie.title) + '</div>' + svg + '</svg><div class="mk-legend">' + pie.slices.map(function (s, i) { return '<span><i style="background:' + COLORS[i % COLORS.length] + '"></i>' + esc(s.label) + ' (' + s.value + '%)</span>'; }).join('') + '</div></figure>';
    }).join('') + '</div></div>';
  }
  function chartTable(d) {
    return '<div class="mk-chart"><table class="mk-table"><thead><tr>' + d.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      d.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>' + (d.caption ? '<caption>' + esc(d.caption) + '</caption>' : '') + '</table></div>';
  }
  function chartProcess(d) {
    return '<div class="mk-chart"><div class="mk-flow">' + d.steps.map(function (s, i) { return '<div class="mk-step"><b>' + (i + 1) + '</b>' + esc(s.label) + (s.detail ? '<br><small>' + esc(s.detail) + '</small>' : '') + '</div>' + (i < d.steps.length - 1 ? '<div class="mk-arrow" aria-hidden="true">\u2192</div>' : ''); }).join('') + '</div>' + (d.loop ? '<div class="mk-note" style="text-align:center">The process then starts again from stage 1.</div>' : '') + '</div>';
  }
  function chartHtml(t1) {
    var d = t1.data || {}, h = '<div class="ct" style="text-align:center;font-weight:700;margin-top:8px">' + esc(t1.title) + '</div>';
    if (t1.type === 'line') return h + chartLine(d); if (t1.type === 'bar') return h + chartBar(d); if (t1.type === 'pie') return h + chartPie(d); if (t1.type === 'table') return h + chartTable(d); if (t1.type === 'process') return h + chartProcess(d);
    return '';
  }

  /* ---------- result rendering ---------- */
  function resultHtml(ev, kind) {
    if (!ev) return '';
    var crit = kind === 'speaking'
      ? [['fluency_coherence', 'Fluency & Coherence'], ['lexical_resource', 'Vocabulary'], ['grammatical_range_accuracy', 'Grammar'], ['pronunciation', 'Pronunciation (estimate)']]
      : [[ 'task_response', kind === 'writing_t1' ? 'Task Achievement' : 'Task Response'], ['coherence_cohesion', 'Coherence & Cohesion'], ['lexical_resource', 'Vocabulary'], ['grammatical_range_accuracy', 'Grammar']];
    var h = '<div class="mk-res"><div class="mk-overall"><span class="n">' + band(ev.overall_band) + '</span><span class="r">estimated band' + (ev.overall_range ? ' \u00B7 likely range ' + band(ev.overall_range.low) + '\u2013' + band(ev.overall_range.high) : '') + '</span></div>';
    if (ev.under_length) h += '<div class="mka-prob">Your answer is shorter than the ' + esc(ev.min_words) + ' words required. In the real exam this lowers your Task ' + (kind === 'writing_t1' ? 'Achievement' : 'Response') + ' score.</div>';
    h += '<div class="mk-bands">' + crit.map(function (c) { var x = ev[c[0]] || {}; return '<div class="mk-band"><div class="l">' + esc(c[1]) + '</div><b>' + band(x.band) + '</b><p>' + esc(x.comment) + '</p></div>'; }).join('') + '</div>';
    if (ev.summary) h += '<p>' + esc(ev.summary) + '</p>';
    var list = function (t, a) { return a && a.length ? '<h4>' + t + '</h4><ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; };
    h += list('What you did well', ev.strengths) + list('To improve', ev.weaknesses) + list('How to improve', ev.improvements);
    if (ev.corrections && ev.corrections.length) h += '<h4>Corrections</h4>' + ev.corrections.map(function (c) { return '<div class="mk-fix"><s>' + esc(c.original) + '</s> \u2192 <b>' + esc(c.correction) + '</b><div class="n">' + esc(c.explanation) + '</div></div>'; }).join('');
    if (kind === 'speaking' && ev.transcript) h += '<h4>What the AI heard</h4><p class="mk-note" style="white-space:pre-wrap">' + esc(ev.transcript) + '</p>';
    h += '<div class="mk-note">AI marking is an estimate to guide your practice. It is not an official IELTS score.</div></div>';
    return h;
  }

  /* ---------- list ---------- */
  async function showList() {
    clearTimers(); stopRecorders(); M.mock = null;
    setHtml('<div class="wc-loading"><span class="d"></span> Loading mock tests\u2026</div>');
    var d; try { d = await api('mock-list'); } catch (e) { return setHtml('<div class="wc-err">' + esc(e.message) + '</div>'); }
    M.list = d; M.settings = d.settings || {}; M.usage = d.usage || {};
    if (d.setup_needed) return setHtml('<div class="mk-banner"><b>Mock tests are being set up.</b> They will appear here very soon.</div>');
    var a = d.access || {}, banner = a.mocks ? '<div class="mk-banner pass">\u2705 <b>Full mock pack active</b>' + (a.until ? ' until <b>' + esc(fmtDate(a.until)) + '</b>' : '') + '. You can use every mock below.</div>'
      : a.expired ? '<div class="mk-banner"><b>Your mock pack has ended.</b> Message <a href="' + TELEGRAM + '" target="_blank" rel="noopener">Teacher Javlonbek</a> to renew it.</div>'
      : '<div class="mk-banner"><b>Mock 1 is free for everyone.</b> The rest are part of the paid pack \u2014 message <a href="' + TELEGRAM + '" target="_blank" rel="noopener">Teacher Javlonbek on Telegram</a> to unlock them.</div>';
    var cards = (d.mocks || []).map(function (m) {
      var tags = ['Listening', 'Reading', 'Writing', 'Speaking'].filter(function (t) { return t === 'Writing' || t === 'Speaking' || (t === 'Listening' && m.has_listening) || (t === 'Reading' && m.has_reading); });
      var my = (d.my || {})[m.id];
      return '<button class="mk-card' + (m.locked ? ' locked' : '') + '" data-open="' + esc(m.id) + '"><div style="display:flex;justify-content:space-between;align-items:center"><span class="mk-num">' + esc(m.number) + '</span>' +
        (!m.published ? '<span class="mk-badge draft">Draft</span>' : m.is_free ? '<span class="mk-badge free">Free</span>' : m.locked ? '<span class="mk-badge lock">\uD83D\uDD12 Locked</span>' : '<span class="mk-badge paid">Unlocked</span>') + '</div>' +
        '<h3>' + esc(m.title) + '</h3><p>' + esc(m.description) + '</p><div class="mk-tags" style="margin:0">' + tags.map(function (t) { return '<span class="mk-tag">' + t + '</span>'; }).join('') + '</div>' +
        (my ? '<div class="mk-note" style="margin:0">' + my.count + ' AI check' + (my.count === 1 ? '' : 's') + ' done</div>' : '') + '</button>';
    }).join('');
    setHtml(banner + (cards ? '<div class="mk-grid">' + cards + '</div>' : '<div class="wc-empty">No mock tests yet.</div>') + '<div class="mk-note" style="margin-top:14px">AI checks left today: <b>' + Math.max(0, (M.usage.limit || 0) - (M.usage.used || 0)) + '</b> of ' + (M.usage.limit >= 9999 ? 'unlimited' : M.usage.limit) + '.</div>');
  }

  /* ---------- one mock ---------- */
  async function openMock(id, tab) {
    clearTimers(); stopRecorders(); M.rec = {}; M.part = 1;
    setHtml('<div class="wc-loading"><span class="d"></span> Opening mock\u2026</div>');
    var d;
    try { d = await api('mock-get', { qs: { id: id } }); }
    catch (e) {
      if (e.status === 403 && e.data && e.data.locked) return lockedHtml(e.data.mock || {});
      return setHtml('<div class="wc-err">' + esc(e.message) + '</div><div class="mk-tabs"><button class="mk-tab" data-mkback>\u2190 All mocks</button></div>');
    }
    M.mock = d.mock; M.results = d.results || []; M.settings = d.settings || {}; M.usage = d.usage || {}; M.tab = tab || 'overview';
    drawMock();
  }
  function lockedHtml(m) {
    setHtml('<div class="mk-tabs"><button class="mk-tab" data-mkback>\u2190 All mocks</button></div><div class="mk-lockbox"><div class="ic">\uD83D\uDD12</div><h2 style="margin:8px 0">Mock ' + esc(m.number || '') + ' \u2014 ' + esc(m.title || '') + '</h2>' +
      '<p>This mock is part of the <b>paid mock pack</b>: full Listening, Reading, Writing and Speaking, with AI marking.</p><p><a class="wc-btn" style="display:inline-block;width:auto;padding:12px 22px" href="' + TELEGRAM + '" target="_blank" rel="noopener">Message the teacher on Telegram</a></p>' +
      '<p class="mk-note">Already paid? Ask the teacher to add you to the pack, then reload this page.</p></div>');
  }
  var TABS = [['overview', 'Overview'], ['listening', 'Listening'], ['reading', 'Reading'], ['writing', 'Writing'], ['speaking', 'Speaking'], ['results', 'My results']];
  function drawMock() {
    var m = M.mock;
    setHtml('<div class="mk-tabs"><button class="mk-tab" data-mkback>\u2190 All mocks</button></div><h2 style="margin:0 0 4px">Mock ' + esc(m.number) + ' \u2014 ' + esc(m.title) + '</h2>' +
      '<div class="mk-tabs" id="mkTabs">' + TABS.map(function (t) { return '<button class="mk-tab' + (M.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div id="mkBody"></div>');
    drawTab();
  }
  function usageNote() { var left = Math.max(0, (M.usage.limit || 0) - (M.usage.used || 0)); return '<div class="mk-note">AI checks left today: <b>' + left + '</b>' + (M.usage.limit >= 9999 ? '' : ' of ' + M.usage.limit) + '.</div>'; }
  function drawTab() {
    clearTimers(); var m = M.mock, b = $('mkBody'); if (!b) return;
    Array.prototype.forEach.call(document.querySelectorAll('#mkTabs .mk-tab'), function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === M.tab); });
    if (M.tab === 'overview') b.innerHTML = overviewHtml();
    else if (M.tab === 'listening' || M.tab === 'reading') b.innerHTML = fileHtml(M.tab);
    else if (M.tab === 'writing') { b.innerHTML = writingHtml(); wireWriting(); }
    else if (M.tab === 'speaking') { b.innerHTML = speakingHtml(); }
    else resultsHtml();
  }
  function overviewHtml() {
    var m = M.mock, sims = simsOf(), st = function (ok, t) { return '<li>' + (ok ? '\u2705 ' : '\u23F3 ') + t + '</li>'; };
    return '<div class="mk-sec"><h3>What is in this mock</h3><p class="sub">' + esc(m.description) + '</p><ul class="mk-q-list" style="list-style:none;padding:0">' +
      st(!!m.listening, 'Listening' + (m.listening ? (sims.listening ? ' \u2014 full test, 40 questions' : '') : ' \u2014 coming soon')) + st(!!(m.reading || sims.reading.length), 'Reading' + (sims.reading.length ? ' \u2014 ' + sims.reading.length + ' passages' : m.reading ? '' : ' \u2014 coming soon')) +
      st(true, 'Writing Task 1 + Task 2 \u2014 AI marked') + st(true, 'Speaking Parts 1\u20133' + (M.settings.speaking_enabled ? ' \u2014 AI marked' : ' \u2014 record yourself (AI marking opens soon)')) + '</ul></div>' +
      '<div class="mk-sec"><h3>How to use it</h3><ol class="mk-q-list"><li>Do Listening and Reading under exam conditions.</li><li>Write Task 1 (20 min) and Task 2 (40 min). Use the timer, then press <b>Check my writing</b>.</li><li>Record your Speaking answers and review the feedback.</li><li>Find every result later under <b>My results</b>.</li></ol>' + usageNote() + '</div>';
  }
  function simsOf() { var x = (M.mock && M.mock.sims) || {}; return { listening: x.listening || null, reading: x.reading || [] }; }
  function fileHtml(kind) {
    var it = M.mock[kind], label = kind === 'listening' ? 'Listening' : 'Reading', sims = simsOf();
    if (kind === 'listening' && sims.listening) {
      if (!it) return '<div class="mk-sec"><h3>Listening</h3><p class="sub">The recording for this test is being prepared. Check back soon.</p></div>';
      return '<div class="mk-sec"><h3>Listening</h3><p class="sub">' + esc(sims.listening.title) + ' \u00B7 4 sections, 40 questions, about 30 minutes. Use headphones and a quiet room.</p><button class="wc-btn" style="width:auto;padding:12px 22px" data-sim="listening" data-n="1">Start Listening test</button><div id="mkSim" style="margin-top:14px"></div></div>';
    }
    if (kind === 'reading' && sims.reading.length) {
      return '<div class="mk-sec"><h3>Reading</h3><p class="sub">Three passages, 60 minutes in the real exam. Open a passage to start.</p><div class="mk-hist">' + sims.reading.map(function (r) { return '<button data-sim="reading" data-n="' + esc(r.n) + '"><span>' + esc(r.title) + '</span><span class="bd">Open \u2192</span></button>'; }).join('') + '</div><div id="mkSim" style="margin-top:14px"></div></div>';
    }
    if (!it) return '<div class="mk-sec"><h3>' + label + '</h3><p class="sub">The ' + label + ' part of this mock is being prepared. Check back soon.</p></div>';
    return '<div class="mk-sec"><h3>' + label + '</h3><p class="sub">' + esc(it.title) + '</p><button class="wc-btn" style="width:auto;padding:12px 22px" data-file="' + esc(it.id) + '" data-kind="' + esc(it.kind || '') + '">Open ' + label + '</button><div id="mkFile" style="margin-top:14px"></div></div>';
  }
  async function openSim(part, n) {
    var box = $('mkSim'); if (!box || M.busy.sim) return; M.busy.sim = true;
    box.innerHTML = '<div class="wc-loading"><span class="d"></span> Opening the test\u2026</div>';
    try {
      var page = await apiText('mock-sim', { id: M.mock.id, part: part, n: n });
      box.innerHTML = '<div class="mk-rec" style="margin:0 0 8px"><button class="sy-chip" data-simfs>\u26F6 Full screen</button><button class="sy-chip" data-simclose>Close test</button></div><iframe id="mkSimFrame" title="' + esc(part) + ' test" allow="autoplay; fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads" style="width:100%;height:84vh;min-height:520px;border:1.5px solid var(--tj-line);border-radius:14px;background:#fff"></iframe>';
      $('mkSimFrame').srcdoc = page; box.scrollIntoView && box.scrollIntoView({ block: 'start' });
    } catch (e) { box.innerHTML = '<div class="wc-err">' + esc(e.message) + '</div>'; }
    finally { M.busy.sim = false; }
  }
  async function openFile(id, kind, btn) {
    var box = $('mkFile'); if (!box) return; box.innerHTML = '<div class="wc-loading"><span class="d"></span> Opening\u2026</div>';
    try {
      var d = await api('content-file', { qs: { id: id } });
      if (d.kind === 'audio') box.innerHTML = '<audio src="' + esc(d.url) + '" controls style="width:100%"></audio>';
      else if (d.kind === 'video') box.innerHTML = '<video src="' + esc(d.url) + '" controls playsinline style="width:100%;border-radius:12px"></video>';
      else { box.innerHTML = '<a class="wc-btn" style="display:inline-block;width:auto;padding:10px 18px" target="_blank" rel="noopener" href="' + esc(d.url) + '">Open in a new tab</a>'; window.open(d.url, '_blank', 'noopener'); }
    } catch (e) { box.innerHTML = '<div class="wc-err">' + esc(e.message) + '</div>'; }
  }

  /* ---------- writing ---------- */
  function draftKey(t) { return 'tj_mock_draft_' + M.mock.id + '_' + t; }
  function taskBlock(n, t) {
    var min = t.min_words || (n === 1 ? 150 : 250), mins = n === 1 ? 20 : 40;
    var saved = ''; try { saved = localStorage.getItem(draftKey(n)) || ''; } catch (e) {}
    return '<div class="mk-sec" data-task="' + n + '"><h3>Writing Task ' + n + '</h3><p class="sub">You should spend about ' + mins + ' minutes on this task. Write at least ' + min + ' words.</p>' +
      '<div class="mk-question">' + esc(t.question) + '</div>' + (n === 1 ? chartHtml(t) : '') +
      '<div class="mk-meta"><span>Words: <b id="mkWc' + n + '">' + words(saved) + '</b> / ' + min + ' <span id="mkWcOk' + n + '"></span></span><span><button class="sy-chip" data-timer="' + n + '" data-min="' + mins + '">\u23F1 Start ' + mins + ':00 timer</button> <span class="mk-timer" id="mkTm' + n + '"></span></span></div>' +
      '<textarea class="mk-ta" id="mkTa' + n + '" data-min="' + min + '" placeholder="Write your answer here\u2026 (your draft is saved on this device)" spellcheck="true">' + esc(saved) + '</textarea>' +
      '<div class="sy-next"><button class="wc-btn" data-check="' + n + '" style="width:auto;padding:12px 22px">Check my writing</button></div><div id="mkOut' + n + '"></div></div>';
  }
  function writingHtml() { var w = M.mock.writing || {}; return (w.task1 ? taskBlock(1, w.task1) : '') + (w.task2 ? taskBlock(2, w.task2) : '') + usageNote(); }
  function updateWc(n) {
    var ta = $('mkTa' + n); if (!ta) return; var wc = words(ta.value), min = Number(ta.getAttribute('data-min'));
    $('mkWc' + n).textContent = wc; $('mkWcOk' + n).innerHTML = wc >= min ? '<span class="ok">\u2713 length ok</span>' : '<span class="warn">' + (min - wc) + ' more needed</span>';
    try { localStorage.setItem(draftKey(n), ta.value); } catch (e) {}
  }
  function wireWriting() { [1, 2].forEach(function (n) { if ($('mkTa' + n)) updateWc(n); }); }
  function startTimer(n, mins) {
    var key = 'w' + n; if (M.timers[key]) { clearInterval(M.timers[key].iv); delete M.timers[key]; }
    var end = Date.now() + mins * 60000, el = $('mkTm' + n);
    var tick = function () { var left = Math.max(0, Math.round((end - Date.now()) / 1000)), mm = Math.floor(left / 60), ss = left % 60; if ($('mkTm' + n)) { $('mkTm' + n).textContent = mm + ':' + (ss < 10 ? '0' : '') + ss + (left === 0 ? ' \u2014 time is up' : ''); } if (left === 0) { clearInterval(M.timers[key].iv); } };
    M.timers[key] = { iv: setInterval(tick, 1000) }; tick();
  }
  async function checkWriting(n, btn) {
    var ta = $('mkTa' + n), out = $('mkOut' + n); if (!ta || M.busy['w' + n]) return;
    var txt = ta.value.trim(); if (words(txt) < 20) { out.innerHTML = '<div class="wc-err" style="margin-top:12px">Write a little more first (at least 20 words).</div>'; return; }
    M.busy['w' + n] = true; btn.disabled = true; var old = btn.textContent; btn.textContent = 'Marking\u2026'; out.innerHTML = '<div class="wc-loading"><span class="d"></span> The AI examiner is reading your answer (about 10 seconds)\u2026</div>';
    try {
      var d = await api('mock-check-writing', { body: { mock_id: M.mock.id, task: n, text: txt } });
      M.usage = d.usage || M.usage; if (d.id) M.results.unshift({ id: d.id, section: 'writing_t' + n, status: 'done', band: d.evaluation.overall_band, created_at: d.created_at || new Date().toISOString() });
      out.innerHTML = resultHtml(d.evaluation, 'writing_t' + n) + usageNote();
    } catch (e) { out.innerHTML = '<div class="wc-err" style="margin-top:12px">' + esc(e.message) + '</div>'; if (e.data && e.data.usage) M.usage = e.data.usage; }
    finally { M.busy['w' + n] = false; btn.disabled = false; btn.textContent = old; }
  }

  /* ---------- speaking ---------- */
  function speakingHtml() {
    var sp = M.mock.speaking || {}, p = M.part, h = '<div class="mk-tabs">' + [1, 2, 3].map(function (n) { return '<button class="mk-tab' + (p === n ? ' on' : '') + '" data-part="' + n + '">Part ' + n + '</button>'; }).join('') + '</div><div class="mk-sec">';
    if (p === 1) { h += '<h3>Part 1 \u2014 Introduction and interview</h3><p class="sub">Answer each question in 2\u20133 sentences, as in the real test (4\u20135 minutes in total).</p>' + (sp.part1 || []).map(function (t) { return '<h4 style="margin:14px 0 4px">' + esc(t.topic) + '</h4><ol class="mk-q-list">' + t.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>'; }).join(''); }
    else if (p === 2) { var c = sp.part2 || {}; h += '<h3>Part 2 \u2014 Long turn</h3><p class="sub">You have 1 minute to prepare, then speak for 1\u20132 minutes.</p><div class="mk-cue"><b>' + esc(c.title) + '</b><div style="margin-top:8px">You should say:</div><ul>' + (c.bullets || []).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' + (c.roundoff ? '<div>' + esc(c.roundoff) + '</div>' : '') + '</div><div class="mk-meta"><span><button class="sy-chip" data-timer="prep">\u23F1 1-minute preparation</button> <span class="mk-timer" id="mkTmprep"></span></span></div>'; }
    else h += '<h3>Part 3 \u2014 Discussion</h3><p class="sub">Give reasoned, developed answers (4\u20135 minutes in total).</p><ol class="mk-q-list">' + (sp.part3 || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>';
    h += '<h4 style="margin:18px 0 6px">Record your answer</h4>' + recorderHtml(p) + '</div>' + usageNote();
    return h;
  }
  function recorderControls(p) {
    var r = M.rec[p] || {}, can = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    if (!can) return '<div class="mk-banner">Recording is not supported in this browser. Please open this page in Chrome or Safari.</div>';
    var h = '<div class="mk-rec" id="mkRec">';
    if (r.state === 'recording') h += '<span class="dot"></span><b id="mkRecT">0:00</b><button class="wc-btn" data-rec="stop" style="width:auto;padding:10px 18px">Stop</button>';
    else if (r.url) h += '<audio controls src="' + esc(r.url) + '"></audio><button class="wc-btn ghost" data-rec="start" style="width:auto;padding:10px 18px">Record again</button>' + (M.settings.speaking_enabled ? '<button class="wc-btn" data-rec="submit" style="width:auto;padding:10px 18px">Get AI feedback</button>' : '');
    else h += '<button class="wc-btn" data-rec="start" style="width:auto;padding:10px 18px">\u25CF Start recording</button>';
    return h + '</div>';
  }
  function redrawRec() { var w = $('mkRecWrap'); if (w) w.innerHTML = recorderControls(M.part); }
  function recorderHtml(p) {
    return '<div id="mkRecWrap">' + recorderControls(p) + '</div>' + (M.settings.speaking_enabled ? '' : '<div class="mk-note">AI marking for Speaking is opening soon. For now you can record yourself, listen back, and compare with the questions.</div>') + '<div id="mkSpkOut"></div>';
  }
  async function recStart() {
    var p = M.part, old = M.rec[p]; if (old && old.url) { try { URL.revokeObjectURL(old.url); } catch (e) {} }
    var out = $('mkSpkOut'); if (out) out.innerHTML = '';
    var stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { if (out) out.innerHTML = '<div class="wc-err">We could not use your microphone. Please allow microphone access in your browser and try again.</div>'; return; }
    var mr = new MediaRecorder(stream), chunks = [], r = { state: 'recording', mr: mr, stream: stream, started: Date.now() };
    M.rec[p] = r; var max = p === 2 ? 180 : 300;
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = function () { clearInterval(r.iv); stream.getTracks().forEach(function (t) { t.stop(); }); var blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); r.blob = blob; r.url = URL.createObjectURL(blob); r.duration = (Date.now() - r.started) / 1000; r.state = 'stopped'; if (M.part === p) redrawRec(); };
    r.iv = setInterval(function () { var s = Math.floor((Date.now() - r.started) / 1000); if ($('mkRecT')) $('mkRecT').textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); if (s >= max && mr.state === 'recording') mr.stop(); }, 500);
    mr.start(); redrawRec();
  }
  function recStop() { var r = M.rec[M.part]; if (r && r.mr && r.mr.state === 'recording') r.mr.stop(); }

  function encodeWav(pcm, rate) {
    var n = pcm.length, dv = new DataView(new ArrayBuffer(44 + n * 2)), w = function (o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var s = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
    return new Blob([dv], { type: 'audio/wav' });
  }
  async function toWav16k(blob) {
    var AC = window.AudioContext || window.webkitAudioContext, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ctx = new AC();
    var ab = await blob.arrayBuffer();
    var buf = await new Promise(function (res, rej) { var p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
    try { ctx.close(); } catch (e) {}
    var rate = 16000, off = new OAC(1, Math.max(1, Math.ceil(buf.duration * rate)), rate), src = off.createBufferSource();
    src.buffer = buf; src.connect(off.destination); src.start(0);
    var rendered = await off.startRendering();
    return encodeWav(rendered.getChannelData(0), rate);
  }
  async function submitSpeaking() {
    var p = M.part, r = M.rec[p], out = $('mkSpkOut'); if (!r || !r.blob || M.busy.spk) return;
    M.busy.spk = true; out.innerHTML = '<div class="wc-loading"><span class="d"></span> Preparing your recording\u2026</div>';
    try {
      var wav = await toWav16k(r.blob);
      var slot = await api('mock-speaking-upload', { body: { mock_id: M.mock.id, part: p, duration_sec: r.duration } });
      out.innerHTML = '<div class="wc-loading"><span class="d"></span> Uploading\u2026</div>';
      var sb = window.TJ.getSb(), up = await sb.storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.token, wav, { contentType: 'audio/wav', upsert: true });
      if (up.error) throw new Error('Upload failed. Please try again.');
      var t = await tok(); await fetch(FN + 'mock-check-speaking-background', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: slot.id }) });
      out.innerHTML = '<div class="wc-loading"><span class="d"></span> The AI examiner is listening (this can take up to a minute)\u2026</div>';
      var res = await pollResult(slot.id);
      if (res.status === 'done') { M.results.unshift({ id: res.id, section: 'speaking', status: 'done', band: res.band, created_at: res.created_at }); M.usage.used = (M.usage.used || 0) + 1; out.innerHTML = resultHtml(res.payload.evaluation, 'speaking'); }
      else out.innerHTML = '<div class="wc-err">' + esc(res.error || 'We could not mark this recording. Please try again.') + '</div>';
    } catch (e) { out.innerHTML = '<div class="wc-err">' + esc(e.message || 'Something went wrong.') + '</div>'; }
    finally { M.busy.spk = false; }
  }
  async function pollResult(id) {
    var started = Date.now(), wait = M.pollMs || 3000;
    while (Date.now() - started < 6 * 60000) {
      await new Promise(function (r) { setTimeout(r, wait); });
      var d = await api('mock-result', { qs: { id: id } });
      if (d.result.status !== 'pending') return d.result;
    }
    return { status: 'error', error: 'This is taking longer than usual. Open "My results" in a minute to see it.' };
  }

  /* ---------- results ---------- */
  function resultsHtml() {
    var b = $('mkBody'), names = { writing_t1: 'Writing Task 1', writing_t2: 'Writing Task 2', speaking: 'Speaking' };
    var rows = (M.results || []).filter(function (r) { return r.status === 'done'; });
    b.innerHTML = '<div class="mk-sec"><h3>My results</h3><p class="sub">Every AI check you ran on this mock.</p>' + (rows.length ? '<div class="mk-hist">' + rows.map(function (r) { return '<button data-result="' + esc(r.id) + '"><span>' + esc(names[r.section] || r.section) + ' \u00B7 ' + esc(fmtDate(r.created_at)) + '</span><span class="bd">' + band(r.band) + '</span></button>'; }).join('') + '</div>' : '<div class="wc-empty">No results yet. Check a Writing task or record a Speaking part to see them here.</div>') + '<div id="mkResOut"></div></div>';
  }
  async function showResult(id) {
    var out = $('mkResOut'); out.innerHTML = '<div class="wc-loading"><span class="d"></span> Loading\u2026</div>';
    try { var d = await api('mock-result', { qs: { id: id } }), r = d.result, ev = r.payload && r.payload.evaluation;
      out.innerHTML = ev ? (r.section !== 'speaking' && r.payload.text ? '<h4 class="sy-sub">Your answer</h4><div class="mk-question">' + esc(r.payload.text) + '</div>' : '') + resultHtml(ev, r.section) : '<div class="wc-err">This result has no details.</div>';
    } catch (e) { out.innerHTML = '<div class="wc-err">' + esc(e.message) + '</div>'; }
  }

  /* ---------- events ---------- */
  function onClick(e) {
    var t = e.target.closest('button'); if (!t || !root() || !root().contains(t)) return;
    if (t.hasAttribute('data-open')) return openMock(t.getAttribute('data-open'));
    if (t.hasAttribute('data-mkback')) return showList();
    if (t.hasAttribute('data-tab')) { stopRecorders(); M.tab = t.getAttribute('data-tab'); return drawTab(); }
    if (t.hasAttribute('data-sim')) return openSim(t.getAttribute('data-sim'), Number(t.getAttribute('data-n')));
    if (t.hasAttribute('data-simfs')) { var fr = $('mkSimFrame'); if (fr && fr.requestFullscreen) fr.requestFullscreen(); return; }
    if (t.hasAttribute('data-simclose')) { var sb = $('mkSim'); if (sb) sb.innerHTML = ''; return; }
    if (t.hasAttribute('data-file')) return openFile(t.getAttribute('data-file'), t.getAttribute('data-kind'), t);
    if (t.hasAttribute('data-timer')) { var k = t.getAttribute('data-timer'); if (k === 'prep') { var key = 'prep'; if (M.timers[key]) clearInterval(M.timers[key].iv); var end = Date.now() + 60000; var tick = function () { var l = Math.max(0, Math.round((end - Date.now()) / 1000)); if ($('mkTmprep')) $('mkTmprep').textContent = '0:' + (l < 10 ? '0' : '') + l + (l === 0 ? ' \u2014 start speaking!' : ''); if (l === 0) clearInterval(M.timers[key].iv); }; M.timers[key] = { iv: setInterval(tick, 1000) }; tick(); return; } return startTimer(Number(k), Number(t.getAttribute('data-min'))); }
    if (t.hasAttribute('data-check')) return checkWriting(Number(t.getAttribute('data-check')), t);
    if (t.hasAttribute('data-part')) { stopRecorders(); M.part = Number(t.getAttribute('data-part')); return drawTab(); }
    if (t.hasAttribute('data-rec')) { var a = t.getAttribute('data-rec'); return a === 'start' ? recStart() : a === 'stop' ? recStop() : submitSpeaking(); }
    if (t.hasAttribute('data-result')) return showResult(t.getAttribute('data-result'));
  }
  function onInput(e) { if (/^mkTa[12]$/.test(e.target.id)) updateWc(Number(e.target.id.slice(-1))); }
  function init() { var r = root(); if (!r || r.getAttribute('data-ready')) return; r.setAttribute('data-ready', '1'); r.addEventListener('click', onClick); r.addEventListener('input', onInput); }
  function onView() { var v = document.body.getAttribute('data-view'); if (v === 'mocks') { init(); if (window.TJ && window.TJ.getUser && window.TJ.getUser()) showList(); } else { clearTimers(); stopRecorders(); } }
  init();
  new MutationObserver(onView).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  window.TJMocks = { chartHtml: chartHtml, resultHtml: resultHtml, encodeWav: encodeWav, toWav16k: toWav16k, showList: showList, openMock: openMock, _M: M, setPollMs: function (n) { M.pollMs = n; } };
})();
