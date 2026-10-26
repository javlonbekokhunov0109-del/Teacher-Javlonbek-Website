/* FULL MOCK IN ONE SITTING: Listening -> Reading -> Writing -> Speaking, nothing revealed until the end.
   Needs js/mocks.js (it shares its helpers through window.TJMocks). The server side is netlify/functions/mock-attempt.js. */
(function () {
  'use strict';
  var T = window.TJMocks; if (!T) return;
  var esc = T.esc, band = T.band, api = T.api, apiText = T.apiText, TG = T.TELEGRAM;
  var $ = function (id) { return document.getElementById(id); };
  var NAMES = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };
  var S = { attempt: null, mock: null, notice: '', timers: {}, spk: {}, wm: {}, wmErr: {}, wmTried: {}, pollMs: 3000, graceMs: 45000, msg: null, frame: null, retry: null, draftDirty: false, busy: false };
  var FN = '/.netlify/functions/';

  /* ---------- small helpers ---------- */
  function fmtClock(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60), x = s % 60; return (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }   // minutes only, like an exam clock
  function fmtSecs(s) { if (s == null) return '\u2014'; s = Math.round(s); var m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m ? m + ' min ' + (s % 60 < 10 ? '0' : '') + (s % 60) + ' s' : s + ' s'; }
  function words(t) { var m = String(t || '').trim().match(/\b[\w'\u2019-]+\b/g); return m ? m.length : 0; }
  function clearTimers() { Object.keys(S.timers).forEach(function (k) { clearInterval(S.timers[k]); clearTimeout(S.timers[k]); }); S.timers = {}; }
  function secState() { var a = S.attempt; return a && a.order[a.idx] ? { name: a.order[a.idx], st: a.sections[a.order[a.idx]] } : null; }
  function stepsHtml() {
    var a = S.attempt;
    return '<div class="mk-steps" aria-label="Progress">' + a.order.map(function (s, i) { var st = a.sections[s].status, cls = st === 'done' ? 'done' : i === a.idx ? 'cur' : ''; return '<span class="' + cls + '"><i>' + (st === 'done' ? '\u2713' : (i + 1)) + '</i>' + NAMES[s] + '</span>'; }).join('<em></em>') + '</div>';
  }
  function barHtml(title) { return '<div class="mk-sit-bar"><button class="mk-sit-leave" data-sit="leave">\u2039 Leave</button><b>' + esc(title) + '</b><span class="mk-sit-clock" id="mkSitClock" aria-live="off"></span></div>'; }

  /* ---------- overlay ---------- */
  function overlay() {
    var o = $('mkSit'); if (o) return o;
    o = document.createElement('div'); o.id = 'mkSit'; o.className = 'mk-sit'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Full mock');
    document.body.appendChild(o); document.body.classList.add('mk-exam-open'); o.addEventListener('click', onClick); o.addEventListener('input', onInput);
    if (!S.msg) { S.msg = function (e) { onMessage(e); }; window.addEventListener('message', S.msg); }
    return o;
  }
  function setBody(html, cls) { var o = overlay(); o.className = 'mk-sit ' + (cls || ''); o.innerHTML = html; }
  function closeOverlay() {
    clearTimers(); stopRec(); var o = $('mkSit'); if (o) o.remove(); document.body.classList.remove('mk-exam-open');
    if (S.msg) { window.removeEventListener('message', S.msg); S.msg = null; } S.frame = null;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
  }
  function loading(t) { setBody('<div class="mk-sit-center"><div class="wc-loading"><span class="d"></span> ' + esc(t) + '</div></div>'); }
  function errorScreen(msg, retryLabel) { setBody('<div class="mk-sit-center"><div class="wc-err" style="max-width:520px">' + esc(msg) + '</div><div class="mk-sit-actions">' + (retryLabel ? '<button class="wc-btn" data-sit="retry">' + esc(retryLabel) + '</button>' : '') + '<button class="wc-btn ghost" data-sit="leave">Leave</button></div></div>'); }

  /* ---------- the clock of the running section ---------- */
  function startClock(onZero) {
    clearInterval(S.timers.clock); var st = secState(); if (!st || !st.st.deadline) return; var dl = st.st.deadline, fired = false;
    var tick = function () { var el = $('mkSitClock'), left = dl - Date.now(); if (el) { el.textContent = fmtClock(left); el.classList.toggle('warn', left < 5 * 60000); } if (left <= 0 && !fired) { fired = true; clearInterval(S.timers.clock); if (onZero) onZero(); } };
    S.timers.clock = setInterval(tick, 500); tick();
  }

  /* ---------- start / resume ---------- */
  async function start(mockId) {
    overlay(); loading('Opening your full mock\u2026');
    try { var r = await api('mock-attempt', { body: { action: 'start', mock_id: mockId } }); S.attempt = r.attempt; S.mock = r.mock; S.notice = r.resumed ? 'Welcome back. Your sitting was saved.' : ''; route(); }
    catch (e) { errorScreen(e.status === 403 ? 'This mock is part of the paid pack.' : e.message, null); }
  }
  async function resume(id) {
    overlay(); loading('Opening your sitting\u2026');
    try { var r = await api('mock-attempt', { body: { action: 'get', id: id } }); S.attempt = r.attempt; S.mock = r.mock; S.notice = 'Welcome back. Your sitting was saved.'; route(); }
    catch (e) { errorScreen(e.message, null); }
  }
  function route() {
    clearTimers(); stopRec(); var a = S.attempt;
    if (a.status === 'done') return showFinal();
    if (a.idx >= a.order.length) return finishFlow();
    var sec = a.order[a.idx], st = a.sections[sec];
    if (st.status === 'ready') return intro(sec);
    runSection(sec, st);
  }

  /* ---------- intro screen of a section ---------- */
  var RULES = {
    listening: function (m) { var q = m && m.sims && m.sims.listening; return { lead: '4 parts, 40 questions, about 30 minutes. The audio plays once, like the real exam.', rules: ['Use headphones and sit somewhere quiet.', 'Answer while you listen. There is no time to go back to the audio.', 'When you submit, the next section starts. You will see your answers only at the very end.'] }; },
    reading: function () { return { lead: '3 passages, 40 questions, 60 minutes.', rules: ['The clock starts when you press Start.', 'You can highlight text in the passage and in the questions.', 'When you submit, the next section starts. You will see your answers only at the very end.'] }; },
    writing: function () { return { lead: 'Task 1 (about 20 minutes, at least 150 words) and Task 2 (about 40 minutes, at least 250 words). One clock of 60 minutes for both.', rules: ['Move between the two tasks with the tabs. Your text is saved as you type.', 'Task 2 counts twice as much as Task 1 in your Writing band.', 'The AI examiner marks your Writing while you do the Speaking.'] }; },
    speaking: function () { return { lead: '3 parts, about 11\u201314 minutes. You record your answers and the AI examiner marks them.', rules: ['You need a quiet room and a microphone. The browser will ask for permission.', 'Part 2 has a 1-minute preparation timer. Speak for 1\u20132 minutes.', 'Each recording is uploaded as soon as you press Upload, so marking starts while you continue.'] }; }
  };
  function intro(sec) {
    var a = S.attempt, info = RULES[sec](S.mock), mins = a.minutes[sec], st = a.sections[sec];
    var n = S.notice; S.notice = '';
    setBody(barHtml('Mock ' + esc(S.mock.number) + ' \u00B7 Full mock') + '<div class="mk-sit-card">' + stepsHtml() + (n ? '<div class="mk-sit-notice">' + esc(n) + '</div>' : '') + '<h2>' + NAMES[sec] + '</h2><p class="lead">' + esc(info.lead) + '</p><ul>' + info.rules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul><p class="mk-note">Time allowed here: <b>' + (sec === 'listening' ? '30 minutes (+5 to load)' : mins + ' minutes') + '</b>. ' + (a.speaking_skipped && sec === 'writing' ? esc(a.speaking_skipped) : '') + '</p>' +
      '<div class="mk-sit-actions"><button class="wc-btn" data-sit="begin">Start ' + NAMES[sec] + '</button><button class="wc-btn ghost" data-sit="leave">Leave (the sitting is saved)</button></div></div>');
  }
  async function begin() {
    var st = secState(); if (!st || S.busy) return; S.busy = true;
    try { var o = overlay(); if (o.requestFullscreen) { var f = o.requestFullscreen(); if (f && f.catch) f.catch(function () {}); } } catch (e) {}
    try { var r = await api('mock-attempt', { body: { action: 'begin-section', id: S.attempt.id, section: st.name } }); S.attempt = r.attempt; S.busy = false; route(); }
    catch (e) { S.busy = false; errorScreen(e.message, 'Try again'); S.retry = begin; }
  }

  /* ---------- run a section ---------- */
  function runSection(sec, st) {
    if (sec === 'listening' || sec === 'reading') return openFrame(sec, st);
    if (sec === 'writing') return writingScreen(st);
    return speakingScreen(st);
  }
  async function openFrame(sec, st) {
    loading('Opening ' + NAMES[sec] + '\u2026');
    try {
      var page = await apiText('mock-sim', { id: S.mock.id, part: sec, attempt: S.attempt.id });
      var o = overlay(); o.className = 'mk-sit fr'; o.innerHTML = '';
      var fr = document.createElement('iframe'); fr.id = 'mkSitFrame'; fr.title = NAMES[sec] + ' test'; fr.setAttribute('allow', 'autoplay; fullscreen'); fr.setAttribute('allowfullscreen', '');
      fr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads'); o.appendChild(fr); S.frame = fr; fr.srcdoc = page;
      // safety net: the page submits itself at the deadline; if it never does, we close the section ourselves
      clearTimeout(S.timers.fs); S.timers.fs = setTimeout(function () { if (secState() && secState().name === sec) submitSection(sec, { score: 0, review: [], timed_out: true }); }, Math.max(0, (st.deadline || Date.now()) - Date.now()) + S.graceMs);
    } catch (e) { errorScreen(e.status === 409 ? 'This part is not open any more.' : e.message, 'Try again'); S.retry = function () { route(); }; }
  }
  function onMessage(e) {
    var d = e && e.data; if (!d || !S.attempt || !S.frame || e.source !== S.frame.contentWindow) return;
    var cur = secState(); if (!cur) return;
    if (d.type === 'section-submit' && d.section === cur.name) return submitSection(cur.name, { score: d.score, review: d.review || [], timed_out: !!d.timed_out });
    if (d.type === 'exam-exit') return paused(cur.name);
  }
  function paused(sec) {
    clearTimeout(S.timers.fs); S.frame = null;
    setBody(barHtml('Paused') + '<div class="mk-sit-card">' + stepsHtml() + '<h2>' + NAMES[sec] + ' is paused</h2><p class="lead">The clock keeps running, like in a real exam. Your answers are saved on this device.</p><div class="mk-sit-actions"><button class="wc-btn" data-sit="back">Go back to ' + NAMES[sec] + '</button><button class="wc-btn ghost" data-sit="leave">Leave (come back later)</button></div></div>');
  }
  async function submitSection(sec, data) {
    if (S.busy) return; S.busy = true; clearTimeout(S.timers.fs); S.frame = null; loading('Saving your ' + NAMES[sec] + '\u2026');
    try {
      var r = await api('mock-attempt', { body: { action: 'save-section', id: S.attempt.id, section: sec, data: data } });
      S.attempt = r.attempt; S.busy = false; S.notice = NAMES[sec] + ' submitted.'; if (sec === 'writing') markWriting(); route();
    } catch (e) { S.busy = false; S.retry = function () { submitSection(sec, data); }; errorScreen('We could not save your ' + NAMES[sec] + ' (' + e.message + '). Your work is safe on this device. Check your internet and try again.', 'Try again'); }
  }

  /* ---------- Writing ---------- */
  function wKey() { return 'tj_sit_w_' + S.attempt.id; }
  function writingScreen(st) {
    var w = S.mock.writing || {}, local = null; try { local = JSON.parse(localStorage.getItem(wKey()) || 'null'); } catch (e) {}
    var d = S.attempt.drafts || {}, t1 = local ? local.t1 : d.t1 || '', t2 = local ? local.t2 : d.t2 || '', min1 = (w.task1 && w.task1.min_words) || 150, min2 = (w.task2 && w.task2.min_words) || 250;
    S.wState = { tab: 1, min1: min1, min2: min2 };
    setBody(barHtml('Writing') + '<div class="mk-sit-scroll">' + stepsHtml() + '<div class="mk-tabs" id="mkWTabs"><button class="mk-tab on" data-sit="wtab" data-n="1">Task 1</button><button class="mk-tab" data-sit="wtab" data-n="2">Task 2</button></div>' +
      '<div class="mk-wpane" id="mkWP1"><p class="sub">Spend about 20 minutes. Write at least ' + min1 + ' words.</p><div class="mk-question">' + esc((w.task1 || {}).question) + '</div>' + (w.task1 ? T.chartHtml(w.task1) : '') + wBox(1, t1, min1) + '</div>' +
      '<div class="mk-wpane" id="mkWP2" hidden><p class="sub">Spend about 40 minutes. Write at least ' + min2 + ' words.</p><div class="mk-question">' + esc((w.task2 || {}).question) + '</div>' + wBox(2, t2, min2) + '</div>' +
      '<div class="mk-sit-actions"><button class="wc-btn" data-sit="wsubmit">Submit Writing and continue</button></div><p class="mk-note">Your text is saved as you type. When you submit, the AI examiner marks it while you do the Speaking. You will see the result at the end.</p></div>', 'wr');
    updateW(1); updateW(2); startClock(function () { submitWriting(true); });
    clearInterval(S.timers.draft); S.timers.draft = setInterval(saveDraft, 15000);
  }
  function wBox(n, text, min) { return '<div class="mk-meta"><span>Words: <b id="mkSw' + n + '">' + words(text) + '</b> / ' + min + ' <span id="mkSwOk' + n + '"></span></span></div><textarea class="mk-ta" id="mkSTa' + n + '" data-min="' + min + '" placeholder="Write your answer here\u2026" spellcheck="true">' + esc(text) + '</textarea>'; }
  function updateW(n) { var ta = $('mkSTa' + n); if (!ta) return; var wc = words(ta.value), min = Number(ta.getAttribute('data-min')); $('mkSw' + n).textContent = wc; $('mkSwOk' + n).innerHTML = wc >= min ? '<span class="ok">\u2713 length ok</span>' : '<span class="warn">' + (min - wc) + ' more needed</span>'; }
  function wVals() { return { t1: ($('mkSTa1') || {}).value || '', t2: ($('mkSTa2') || {}).value || '' }; }
  function onInput(e) { if (/^mkSTa[12]$/.test(e.target.id)) { updateW(Number(e.target.id.slice(-1))); try { localStorage.setItem(wKey(), JSON.stringify(wVals())); } catch (x) {} S.draftDirty = true; } }
  async function saveDraft() { if (!S.draftDirty || !$('mkSTa1')) return; S.draftDirty = false; var v = wVals(); try { await api('mock-attempt', { body: { action: 'save-draft', id: S.attempt.id, t1: v.t1, t2: v.t2 } }); } catch (e) { S.draftDirty = true; } }
  function submitWriting(auto) {
    if (S.busy) return; var v = wVals(), w1 = words(v.t1), w2 = words(v.t2);
    if (!auto) { var msg = 'Task 1: ' + w1 + ' words (minimum ' + S.wState.min1 + '). Task 2: ' + w2 + ' words (minimum ' + S.wState.min2 + ').\n\nSubmit your Writing and continue? You cannot change it after this.'; if (!window.confirm(msg)) return; }
    clearInterval(S.timers.draft); try { localStorage.removeItem(wKey()); } catch (e) {} submitSection('writing', { t1: v.t1, t2: v.t2 });
  }

  /* ---------- marking of Writing (starts the moment Writing is submitted) ---------- */
  function markTask(k) {
    if (S.wm[k]) return S.wm[k]; delete S.wmErr[k]; S.wmTried[k] = true;   // each task is tried once on its own; again only when the student presses Try again
    S.wm[k] = api('mock-check-writing', { body: { mock_id: S.mock.id, attempt_id: S.attempt.id, task: k === 't1' ? 1 : 2 } }).then(function () { return true; }, function (e) { delete S.wm[k]; S.wmErr[k] = e.message; return false; });
    return S.wm[k];
  }
  function markWriting() { markTask('t1').then(function () { return markTask('t2'); }); }

  /* ---------- Speaking ---------- */
  function stopRec() { Object.keys(S.spk).forEach(function (p) { var r = S.spk[p]; if (r && r.mr && r.mr.state === 'recording') { try { r.mr.onstop = null; r.mr.stop(); } catch (e) {} } if (r && r.stream) r.stream.getTracks().forEach(function (t) { t.stop(); }); }); }
  async function speakingScreen(st) {
    S.sp = { part: 1 }; S.spk = {};
    setBody(barHtml('Speaking') + '<div class="mk-sit-center"><div class="wc-loading"><span class="d"></span> Preparing Speaking\u2026</div></div>');
    try { var ms = await api('mock-attempt', { body: { action: 'marking-status', id: S.attempt.id } }); [1, 2, 3].forEach(function (p) { var x = ms.speaking && ms.speaking[p]; if (x && x.status !== 'none') S.spk[p] = { state: 'uploaded', id: x.id }; }); } catch (e) {}
    drawSpeaking(); startClock(function () { finishSpeaking(true); });
  }
  var MAXS = { 1: 300, 2: 180, 3: 300 };
  function drawSpeaking() {
    var sp = S.mock.speaking || {}, p = S.sp.part, r = S.spk[p] || {}, can = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder), body;
    if (p === 1) body = '<h3>Part 1 \u2014 Introduction and interview</h3><p class="sub">Answer each question in 2\u20133 sentences (4\u20135 minutes in total). Record all the answers in one go.</p><ol class="mk-q-list">' + (sp.part1 || []).map(function (t) { return '<li><b>' + esc(t.topic || '') + '</b><ul>' + (t.questions || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></li>'; }).join('') + '</ol>';
    else if (p === 2) { var c = sp.part2 || {}; body = '<h3>Part 2 \u2014 Long turn</h3><p class="sub">You have 1 minute to prepare, then speak for 1\u20132 minutes.</p><div class="mk-cue"><b>' + esc(c.title) + '</b><div style="margin-top:8px">You should say:</div><ul>' + (c.points || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div><div class="mk-meta"><button class="sy-chip" data-sit="prep">\u23F1 Start 1:00 preparation</button> <span class="mk-timer" id="mkPrep"></span></div>'; }
    else body = '<h3>Part 3 \u2014 Discussion</h3><p class="sub">Give reasoned, developed answers (4\u20135 minutes in total).</p><ol class="mk-q-list">' + (sp.part3 || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>';
    var ctl;
    if (!can) ctl = '<div class="mk-banner">Recording is not supported in this browser. Please open this page in Chrome or Safari.</div>';
    else if (r.state === 'recording') ctl = '<div class="mk-rec"><span class="dot"></span><b id="mkRecT">0:00</b><button class="wc-btn" data-sit="recstop" style="width:auto;padding:10px 18px">Stop</button></div>';
    else if (r.state === 'recorded' || r.state === 'error') ctl = '<div class="mk-rec"><audio controls src="' + esc(r.url) + '"></audio><button class="wc-btn ghost" data-sit="recstart" style="width:auto;padding:10px 18px">Record again</button><button class="wc-btn" data-sit="upload" style="width:auto;padding:10px 18px">Upload this recording</button></div>' + (r.err ? '<div class="wc-err" style="margin-top:10px">' + esc(r.err) + '</div>' : '');
    else if (r.state === 'uploading') ctl = '<div class="wc-loading"><span class="d"></span> Uploading\u2026</div>';
    else if (r.state === 'uploaded') ctl = '<div class="mk-sit-notice">\u2705 Part ' + p + ' is uploaded. The AI examiner is listening in the background.</div><div class="mk-rec"><button class="wc-btn ghost" data-sit="recstart" style="width:auto;padding:10px 18px">Record this part again</button></div>';
    else ctl = '<div class="mk-rec"><button class="wc-btn" data-sit="recstart" style="width:auto;padding:10px 18px">\u25CF Start recording</button></div>';
    var n = Object.keys(S.spk).filter(function (k) { return S.spk[k].state === 'uploaded'; }).length;
    setBody(barHtml('Speaking') + '<div class="mk-sit-scroll">' + stepsHtml() + '<div class="mk-tabs">' + [1, 2, 3].map(function (i) { var u = S.spk[i] && S.spk[i].state === 'uploaded'; return '<button class="mk-tab' + (p === i ? ' on' : '') + '" data-sit="spart" data-n="' + i + '">Part ' + i + (u ? ' \u2713' : '') + '</button>'; }).join('') + '</div><div class="mk-sec">' + body + '<h4 style="margin:18px 0 6px">Record your answer</h4><div id="mkRecWrap">' + ctl + '</div><div id="mkSpkOut"></div></div>' +
      '<div class="mk-sit-actions"><button class="wc-btn" data-sit="spfinish">' + (n === 3 ? 'Finish Speaking' : 'Finish Speaking (' + n + ' of 3 parts uploaded)') + '</button></div></div>', 'sp');
  }
  async function recStart() {
    var p = S.sp.part, old = S.spk[p]; if (old && old.url) { try { URL.revokeObjectURL(old.url); } catch (e) {} } var stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { var o = $('mkSpkOut'); if (o) o.innerHTML = '<div class="wc-err">We could not use your microphone. Please allow microphone access in your browser and try again.</div>'; return; }
    var mr = new MediaRecorder(stream), chunks = [], r = { state: 'recording', mr: mr, stream: stream, started: Date.now() }; S.spk[p] = r;
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = function () { clearInterval(r.iv); stream.getTracks().forEach(function (t) { t.stop(); }); var blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); r.blob = blob; r.url = URL.createObjectURL(blob); r.duration = Math.max(1, Math.round((Date.now() - r.started) / 1000)); r.state = 'recorded'; if (S.sp && S.sp.part === p && $('mkRecWrap')) drawSpeaking(); if (r.afterStop) r.afterStop(); };
    r.iv = setInterval(function () { var s = Math.floor((Date.now() - r.started) / 1000); var el = $('mkRecT'); if (el) el.textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); if (s >= MAXS[p] && mr.state === 'recording') mr.stop(); }, 500);
    mr.start(); drawSpeaking();
  }
  function recStop() { var r = S.spk[S.sp.part]; if (r && r.mr && r.mr.state === 'recording') r.mr.stop(); }
  async function uploadPart(p) {
    var r = S.spk[p]; if (!r || !r.blob || r.state === 'uploading') return true; r.state = 'uploading'; r.err = ''; if (S.sp && S.sp.part === p) drawSpeaking();
    try {
      if (r.duration < 3) throw new Error('That recording is too short. Please record your answer again.');
      var wav = await T.toWav16k(r.blob), slot = await api('mock-speaking-upload', { body: { mock_id: S.mock.id, attempt_id: S.attempt.id, part: p, duration_sec: r.duration } });
      var sb = window.TJ.getSb(), up = await sb.storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.token, wav, { contentType: 'audio/wav', upsert: true }); if (up.error) throw new Error('The upload failed. Please try again.');
      var t = await window.TJ.token(); fetch(FN + 'mock-check-speaking-background', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: slot.id }) }).catch(function () {});
      r.state = 'uploaded'; r.id = slot.id; r.err = ''; if (S.sp && S.sp.part === p && $('mkRecWrap')) drawSpeaking(); return true;
    } catch (e) { r.state = 'error'; r.err = e.message || 'The upload failed.'; if (S.sp && S.sp.part === p && $('mkRecWrap')) drawSpeaking(); return false; }
  }
  async function finishSpeaking(auto) {
    if (S.busy) return;
    var rec = Object.keys(S.spk).filter(function (k) { return S.spk[k].state === 'recording'; });
    for (var i = 0; i < rec.length; i++) { var r = S.spk[rec[i]]; await new Promise(function (res) { r.afterStop = res; try { r.mr.stop(); } catch (e) { res(); } }); }
    var pending = Object.keys(S.spk).filter(function (k) { return S.spk[k].state === 'recorded' && S.spk[k].blob; });
    if (!auto) {
      var n = Object.keys(S.spk).filter(function (k) { return S.spk[k].state === 'uploaded'; }).length + pending.length;
      var warn = pending.length ? pending.length + ' recording(s) have not been uploaded yet; they will be uploaded now. ' : '';
      if (!window.confirm(warn + (n < 3 ? 'Only ' + n + ' of 3 parts are recorded. Parts you skip are not marked.\n\n' : '') + 'Finish Speaking and see your results?')) return;
    }
    for (var j = 0; j < pending.length; j++) await uploadPart(Number(pending[j]));
    var parts = Object.keys(S.spk).filter(function (k) { return S.spk[k].state === 'uploaded'; }).map(Number);
    clearInterval(S.timers.draft); submitSection('speaking', { parts: parts });
  }

  /* ---------- marking screen, then the report ---------- */
  var MARK_LABEL = { writing_t1: 'Writing Task 1', writing_t2: 'Writing Task 2', speaking_1: 'Speaking Part 1', speaking_2: 'Speaking Part 2', speaking_3: 'Speaking Part 3' };
  async function finishFlow() {
    clearTimers(); S.busy = false; var a = S.attempt, stop = false;
    var draw = function (items, note, canForce) {
      setBody('<div class="mk-sit-center"><div class="mk-sit-card">' + stepsHtml() + '<h2>All sections done</h2><p class="lead">The AI examiner is marking your ' + (a.order.indexOf('writing') >= 0 ? 'Writing' : '') + (a.order.indexOf('speaking') >= 0 ? ' and Speaking' : '') + '. This takes about a minute.</p><ul class="mk-marks">' + items.map(function (i) { return '<li class="' + i.cls + '"><span class="ic">' + (i.cls === 'done' ? '\u2713' : i.cls === 'bad' ? '!' : '') + '</span>' + esc(i.label) + (i.msg ? ' <small>' + esc(i.msg) + '</small>' : '') + '</li>'; }).join('') + '</ul>' + (note ? '<p class="mk-note">' + esc(note) + '</p>' : '') + ((canForce) ? '<div class="mk-sit-actions"><button class="wc-btn" data-sit="mretry">Try again</button><button class="wc-btn ghost" data-sit="mforce">See my results without these</button></div>' : '') + '</div></div>');
    };
    S.mretry = function () { S.wmTried = {}; S.wmErr = {}; finishFlow(); }; S.mforce = function () { doFinish(true); };
    var spoken = a.order.indexOf('speaking') >= 0, wrote = a.order.indexOf('writing') >= 0, t0 = Date.now();
    while (!stop) {
      var ms; try { ms = await api('mock-attempt', { body: { action: 'marking-status', id: a.id } }); } catch (e) { ms = null; }
      var items = [], pend = 0, bad = 0;
      if (wrote) {
        if (ms && ms.writing) for (var k = 0; k < 2; k++) { var key = ['t1', 't2'][k], x = ms.writing[key]; if (x.status === 'none' && !S.wm[key] && !S.wmTried[key]) markTask(key); }
        ['t1', 't2'].forEach(function (key) { var x = ms && ms.writing && ms.writing[key]; if (x && x.status === 'done') items.push({ cls: 'done', label: MARK_LABEL['writing_' + key] }); else if (S.wmErr[key]) { bad++; items.push({ cls: 'bad', label: MARK_LABEL['writing_' + key], msg: S.wmErr[key] }); } else { pend++; items.push({ cls: 'wait', label: MARK_LABEL['writing_' + key] }); } });
      }
      if (spoken && ms && ms.speaking) [1, 2, 3].forEach(function (p) { var x = ms.speaking[p]; if (!x || x.status === 'none') return; if (x.status === 'done') items.push({ cls: 'done', label: MARK_LABEL['speaking_' + p] }); else if (x.status === 'pending') { pend++; items.push({ cls: 'wait', label: MARK_LABEL['speaking_' + p] }); } else { bad++; items.push({ cls: 'bad', label: MARK_LABEL['speaking_' + p], msg: x.error || 'could not be marked' }); } });
      if (!ms) { pend++; items.push({ cls: 'wait', label: 'Connecting\u2026' }); }
      draw(items, '', false);
      if (!pend) { if (bad) { draw(items, 'Something could not be marked. You can try again or see your results without it.', true); return; } return doFinish(false); }
      if (Date.now() - t0 > 8 * 60000) { draw(items, 'This is taking longer than usual.', true); return; }
      await new Promise(function (r) { S.timers.poll = setTimeout(r, S.pollMs); });
      if (!$('mkSit')) return;
    }
  }
  async function doFinish(force) {
    loading('Putting your results together\u2026');
    try { var r = await api('mock-attempt', { body: { action: 'finish', id: S.attempt.id, force: !!force } });
      if (!r.ready) { if (!force) { return finishFlow(); } return errorScreen('Not everything is marked yet. Please try again in a minute.', 'Try again'); }
      S.attempt = r.attempt; showFinal(); }
    catch (e) { S.retry = function () { doFinish(force); }; errorScreen(e.message, 'Try again'); }
  }
  function showFinal() { closeOverlay(); renderReport(S.attempt, S.mock); }
  async function openResult(id) {
    var root = $('mkRoot'); if (root) root.innerHTML = '<div class="wc-loading"><span class="d"></span> Loading your result\u2026</div>';
    try { var r = await api('mock-attempt', { body: { action: 'get', id: id } }); S.attempt = r.attempt; S.mock = r.mock; renderReport(r.attempt, r.mock); }
    catch (e) { if (root) root.innerHTML = '<div class="wc-err">' + esc(e.message) + '</div>'; }
  }

  /* ---------- the final report ---------- */
  function reviewTable(rows) {
    if (!rows || !rows.length) return '<p class="mk-note">No answer details were saved for this section.</p>';
    return '<div class="mk-rv"><table><thead><tr><th>Q</th><th>Your answer</th><th>Correct answer</th><th></th></tr></thead><tbody>' + rows.map(function (r) { var q = r.ids.length > 1 ? r.ids[0] + '\u2013' + r.ids[r.ids.length - 1] : r.ids[0], ok = r.score >= r.max, part = r.score > 0 && !ok; return '<tr class="' + (ok ? 'ok' : part ? 'part' : 'no') + '"><td>' + q + '</td><td>' + (esc(r.user) || '\u2014') + '</td><td>' + esc(r.correct) + '</td><td>' + (ok ? '\u2713' : part ? r.score + '/' + r.max : '\u2717') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function renderReport(a, mock) {
    var f = a.final || {}, s = f.sections || {}, root = $('mkRoot'); if (!root) return;
    var card = function (name, big, line, secs) { return '<div class="mk-rep-card"><div class="l">' + name + '</div><b>' + big + '</b><p>' + line + '</p><small>Time: ' + fmtSecs(secs) + '</small></div>'; };
    var cards = '';
    if (s.listening) cards += card('Listening', band(s.listening.band), s.listening.score + ' / 40', s.listening.secs);
    if (s.reading) cards += card('Reading', band(s.reading.band), s.reading.score + ' / 40', s.reading.secs);
    if (s.writing) cards += card('Writing', s.writing.band == null ? '\u2014' : band(s.writing.band), 'Task 1: ' + (s.writing.t1.band == null ? 'not marked' : band(s.writing.t1.band)) + ' \u00B7 Task 2: ' + (s.writing.t2.band == null ? 'not marked' : band(s.writing.t2.band)), s.writing.secs);
    if (s.speaking) cards += card('Speaking', s.speaking.band == null ? '\u2014' : band(s.speaking.band), s.speaking.parts && s.speaking.parts.length ? s.speaking.parts.length + ' of 3 parts marked' : 'not marked', s.speaking.secs);
    var det = '';
    if (s.listening) det += '<details class="mk-det"><summary>Listening: review every answer</summary>' + reviewTable(s.listening.review) + '</details>';
    if (s.reading) det += '<details class="mk-det"><summary>Reading: review every answer</summary>' + reviewTable(s.reading.review) + '</details>';
    if (s.writing) ['t1', 't2'].forEach(function (k, i) { var t = s.writing[k]; det += '<details class="mk-det"><summary>Writing Task ' + (i + 1) + (t.band == null ? ': not marked' : ': Band ' + band(t.band)) + '</summary><h4 class="sy-sub">Your answer (' + (t.word_count || 0) + ' words)</h4><div class="mk-question" style="white-space:pre-wrap">' + esc(t.text) + '</div>' + (t.evaluation ? T.resultHtml(t.evaluation, 'writing_' + k) : '<div class="mk-note">This task could not be marked.</div>') + '</details>'; });
    if (s.speaking && s.speaking.parts) s.speaking.parts.forEach(function (p) { det += '<details class="mk-det"><summary>Speaking Part ' + p.part + ': Band ' + band(p.band) + '</summary>' + T.resultHtml(p.evaluation, 'speaking') + '</details>'; });
    var notes = '';
    if (f.speaking_skipped) notes += '<div class="mk-banner">' + esc(f.speaking_skipped) + ' Your overall band is the average of the sections you sat.</div>';
    if (f.missing && f.missing.length) notes += '<div class="mk-banner"><b>Not marked:</b> ' + f.missing.map(function (m) { return esc(MARK_LABEL[m] || m); }).join(', ') + '. Your overall band uses what could be marked.</div>';
    root.innerHTML = '<div class="mk-tabs"><button class="mk-tab" data-mkback>\u2190 All mocks</button></div><div class="mk-rep"><h2 style="margin:0 0 4px">Mock ' + esc(mock ? mock.number : '') + ' \u2014 Full mock result</h2><p class="mk-note" style="margin:0 0 14px">' + esc(T.fmtDate(a.finished_at || a.started_at)) + ' \u00B7 total time ' + fmtSecs(f.total_secs) + '</p>' +
      '<div class="mk-rep-overall"><span class="n">' + (f.overall == null ? '\u2014' : band(f.overall)) + '</span><span class="r">Overall band (estimate)</span></div>' + notes + '<div class="mk-rep-grid">' + cards + '</div>' + det +
      '<div class="mk-note" style="margin-top:16px">Writing: Task 2 counts twice as much as Task 1. Overall = the average of your sections, rounded to the nearest half band. AI marking is an estimate to guide your practice, not an official IELTS score.</div>' +
      '<div class="mk-sit-actions" style="justify-content:flex-start"><button class="wc-btn" data-mkback style="width:auto;padding:12px 22px">Back to all mocks</button></div></div>';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------- the hub (the "Full mock" tab of the list) ---------- */
  function hubHtml(d, atts) {
    var sp = d.settings && d.settings.speaking_enabled;
    var intro = '<div class="mk-banner pass"><b>A full mock is one sitting:</b> Listening \u2192 Reading \u2192 Writing' + (sp ? ' \u2192 Speaking' : '') + '. Your answers and scores appear <b>only after the last section</b>. You can pause and come back, but the clocks keep running. Use headphones' + (sp ? ', a quiet room and a microphone' : '') + '.</div>';
    var cards = (d.mocks || []).map(function (m) {
      var mins = (m.has_listening ? 35 : 0) + (m.has_reading ? 60 : 0) + 60 + (sp ? 20 : 0), h = Math.floor(mins / 60), mm = mins % 60;
      var tags = ['Listening', 'Reading', 'Writing', 'Speaking'].filter(function (t) { return (t === 'Writing') || (t === 'Speaking' && sp) || (t === 'Listening' && m.has_listening) || (t === 'Reading' && m.has_reading); });
      var mine = (atts || []).filter(function (a) { return a.mock_id === m.id; }), prog = mine.filter(function (a) { return a.status === 'in_progress'; })[0], done = mine.filter(function (a) { return a.status === 'done'; });
      var btn = m.locked ? '<a class="wc-btn" style="width:auto;padding:11px 20px;display:inline-block" href="' + TG + '" target="_blank" rel="noopener">\uD83D\uDD12 Unlock on Telegram</a>' : prog ? '<button class="wc-btn" data-sit="resume" data-id="' + esc(prog.id) + '" style="width:auto;padding:11px 22px">Resume your sitting</button>' : '<button class="wc-btn" data-sit="start" data-mock="' + esc(m.id) + '" style="width:auto;padding:11px 22px">Start full mock</button>';
      return '<div class="mk-card mk-full' + (m.locked ? ' locked' : '') + '"><div style="display:flex;justify-content:space-between;align-items:center"><span class="mk-num">' + esc(m.number) + '</span>' + (!m.published ? '<span class="mk-badge draft">Draft</span>' : m.is_free ? '<span class="mk-badge free">Free</span>' : m.locked ? '<span class="mk-badge lock">\uD83D\uDD12 Locked</span>' : '<span class="mk-badge paid">Unlocked</span>') + '</div><h3>' + esc(m.title) + '</h3><p>' + esc(m.description) + '</p>' +
        '<div class="mk-tags" style="margin:0">' + tags.map(function (t) { return '<span class="mk-tag">' + t + '</span>'; }).join('') + '</div><p class="mk-note" style="margin:6px 0 10px">About ' + h + ' h ' + (mm < 10 ? '0' : '') + mm + ' min in one sitting</p><div>' + btn + '</div>' +
        (prog ? '<p class="mk-note" style="margin:8px 0 0">In progress since ' + esc(T.fmtDate(prog.started_at)) + '</p>' : '') +
        (done.length ? '<div class="mk-past"><b>Your results</b>' + done.map(function (a) { return '<button data-sit="result" data-id="' + esc(a.id) + '"><span>' + esc(T.fmtDate(a.finished_at)) + '</span><b>' + (a.overall == null ? '\u2014' : band(a.overall)) + '</b></button>'; }).join('') + '</div>' : '') + '</div>';
    }).join('');
    return intro + (cards ? '<div class="mk-grid">' + cards + '</div>' : '<div class="wc-empty">No mock tests yet.</div>');
  }
  async function hubData() { try { var r = await api('mock-attempt', { body: { action: 'list' } }); return r.attempts || []; } catch (e) { return []; } }

  /* ---------- clicks ---------- */
  function leave() { if (!window.confirm('Leave the sitting? Your progress is saved, but the clock keeps running. You can resume from the Mock Tests page.')) return; closeOverlay(); S.attempt = null; if (T.showList) T.showList(); }
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-sit]') : null; if (!t) return; var a = t.getAttribute('data-sit');
    if (a === 'begin') return begin();
    if (a === 'leave') return leave();
    if (a === 'back') return route();
    if (a === 'retry') { var f = S.retry; S.retry = null; return f ? f() : route(); }
    if (a === 'wtab') { var n = t.getAttribute('data-n'); [1, 2].forEach(function (i) { $('mkWP' + i).hidden = String(i) !== n; }); Array.prototype.forEach.call(document.querySelectorAll('#mkWTabs .mk-tab'), function (b) { b.classList.toggle('on', b.getAttribute('data-n') === n); }); return; }
    if (a === 'wsubmit') return submitWriting(false);
    if (a === 'spart') { S.sp.part = Number(t.getAttribute('data-n')); return drawSpeaking(); }
    if (a === 'recstart') return recStart();
    if (a === 'recstop') return recStop();
    if (a === 'upload') return uploadPart(S.sp.part);
    if (a === 'spfinish') return finishSpeaking(false);
    if (a === 'prep') { var end = Date.now() + 60000; clearInterval(S.timers.prep); var pt = function () { var l = Math.max(0, Math.ceil((end - Date.now()) / 1000)), el = $('mkPrep'); if (el) el.textContent = Math.floor(l / 60) + ':' + (l % 60 < 10 ? '0' : '') + (l % 60) + (l === 0 ? ' \u2014 start speaking' : ''); if (l === 0) clearInterval(S.timers.prep); }; S.timers.prep = setInterval(pt, 250); pt(); return; }
    if (a === 'mretry') return S.mretry && S.mretry();
    if (a === 'mforce') return S.mforce && S.mforce();
  }
  // buttons that live on the Mock Tests page itself (the hub and the report)
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('#mkRoot [data-sit]') : null; if (!t) return; var a = t.getAttribute('data-sit');
    if (a === 'start') return start(t.getAttribute('data-mock'));
    if (a === 'resume') return resume(t.getAttribute('data-id'));
    if (a === 'result') return openResult(t.getAttribute('data-id'));
  });
  window.TJSitting = { _saveDraft: saveDraft, hubHtml: hubHtml, hubData: hubData, start: start, resume: resume, openResult: openResult, close: closeOverlay, _S: S, setPollMs: function (n) { S.pollMs = n; }, setGraceMs: function (n) { S.graceMs = n; } };
})();
