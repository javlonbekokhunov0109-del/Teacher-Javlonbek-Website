/* Grammar Tests: the 36 topics of the 3-month Grammar Course, 30 multiple-choice questions per topic.
   Questions live in js/grammar-m1.js, grammar-m2.js, grammar-m3.js (loaded when needed). Progress stays on the student's device.
   A topic is "passed" with 70% (21 of 30). Review topics (12, 24, 33) and the final test (36) draw 30 questions from earlier topics. */
(function () {
  'use strict';
  var KEY = 'tj_gram_v1', VER = '20261107', PASS = 0.7, QN = 30;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var rng = Math.random;
  var MONTHS = [
    { m: 1, title: 'Building Basic Sentences and Essential Tenses', weeks: 'Weeks 1\u20134', result: 'You can use basic sentence patterns, talk about your daily life and describe routines.', topics: [[1, 'To be (am/is/are) & have got', 'A1'], [2, 'Pronouns and word order', 'A1'], [3, 'Articles (a, an, the)', 'A1'], [4, 'Plurals and there is/are', 'A1'], [5, 'Present simple', 'A1'], [6, 'Present continuous', 'A1'], [7, 'Questions and short answers', 'A1'], [8, 'Prepositions of place and time', 'A1'], [9, 'Adverbs of frequency', 'A1'], [10, 'Past simple', 'A1'], [11, 'Past continuous', 'A2'], [12, 'Review & progress test', 'A1\u2013A2']] },
    { m: 2, title: 'Expanding Your Grammar and Communication', weeks: 'Weeks 5\u20138', result: 'You can talk about past events, future plans, obligations and make comparisons.', topics: [[13, 'Past simple vs past continuous', 'A2'], [14, 'Future forms (will / going to)', 'A2'], [15, 'Countable & uncountable nouns', 'A2'], [16, 'Quantifiers (some, any, much\u2026)', 'A2'], [17, 'Comparatives', 'A2'], [18, 'Superlatives', 'A2'], [19, 'Modal verbs (can, could, must\u2026)', 'A2'], [20, 'Gerunds and infinitives', 'A2'], [21, 'Present perfect', 'A2'], [22, 'Present perfect vs past simple', 'A2'], [23, 'Zero and first conditionals', 'A2'], [24, 'Review & progress test', 'A2']] },
    { m: 3, title: 'Connecting Ideas and Moving Towards B1', weeks: 'Weeks 9\u201312', result: 'You can build longer sentences, express your ideas more clearly and move towards B1 level.', topics: [[25, 'Present perfect (advanced use)', 'A2\u2013B1'], [26, 'Second conditionals', 'A2\u2013B1'], [27, 'Relative clauses (who, which, that)', 'A2\u2013B1'], [28, 'Passive voice (introduction)', 'A2\u2013B1'], [29, 'Conjunctions (because, although\u2026)', 'A2\u2013B1'], [30, 'Too / enough', 'A2\u2013B1'], [31, 'Basic reported speech', 'A2\u2013B1'], [32, 'Sentence linking (and, but, so\u2026)', 'A2\u2013B1'], [33, 'Review: key grammar points', 'A2\u2013B1'], [34, 'Speaking practice (real-life topics)', 'A2\u2013B1'], [35, 'Writing practice (emails / short essay)', 'A2\u2013B1'], [36, 'Final test & individual feedback', 'A2\u2013B1']] }
  ];
  var READY = { 1: true };                       // months whose question files exist (set to true as they are added)
  var S = { ses: null, loading: false };

  /* ---------- helpers ---------- */
  function ri(n) { return Math.floor(rng() * n); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = ri(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; s.t = s.t || {}; s.hist = s.hist || []; return s; } catch (e) { return { t: {}, hist: [] }; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function fmtTime(ms) { var s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m ? m + ' min ' + (s % 60 < 10 ? '0' : '') + (s % 60) + ' s' : s + ' s'; }
  function metaOf(n) { for (var i = 0; i < MONTHS.length; i++) for (var j = 0; j < MONTHS[i].topics.length; j++) if (MONTHS[i].topics[j][0] === n) return { n: n, title: MONTHS[i].topics[j][1], level: MONTHS[i].topics[j][2], month: MONTHS[i].m, monthTitle: MONTHS[i].title }; return null; }
  function monthOf(n) { return n <= 12 ? 1 : n <= 24 ? 2 : 3; }
  function isReview(n) { return n === 12 || n === 24 || n === 33 || n === 36; }
  function reviewSources(n) { var all = []; MONTHS.forEach(function (mo) { mo.topics.forEach(function (t) { all.push(t[0]); }); }); var okSrc = function (x) { return !isReview(x); };
    if (n === 12) return all.filter(function (x) { return x >= 1 && x <= 11; }); if (n === 24) return all.filter(function (x) { return x >= 13 && x <= 23; }); if (n === 33) return all.filter(function (x) { return x >= 25 && x <= 32; }); return all.filter(okSrc); }
  function topicReady(n) { if (isReview(n) && n === 36) return !!(READY[1] && READY[2] && READY[3]); return !!READY[monthOf(n)]; }

  /* ---------- data ---------- */
  function loadMonth(m) {
    return new Promise(function (resolve, reject) {
      if (window.GRAM && window.GRAM['m' + m]) return resolve(window.GRAM['m' + m]);
      var sc = document.createElement('script'); sc.src = '/js/grammar-m' + m + '.js?v=' + VER;
      sc.onload = function () { window.GRAM && window.GRAM['m' + m] ? resolve(window.GRAM['m' + m]) : reject(new Error('empty')); };
      sc.onerror = function () { reject(new Error('Could not load these questions. Check your internet connection and try again.')); };
      document.head.appendChild(sc);
    });
  }
  function topicData(n) { var d = window.GRAM && window.GRAM['m' + monthOf(n)]; if (!d) return null; for (var i = 0; i < d.topics.length; i++) if (d.topics[i].n === n) return d.topics[i]; return null; }
  function makeQ(n, i, raw) { return { id: n + '.' + i, topic: n, stem: raw[0], opts: shuffle([{ t: raw[1], ok: true }, { t: raw[2], ok: false }, { t: raw[3], ok: false }, { t: raw[4], ok: false }]), exp: raw[5], uz: raw[6] }; }
  // the 30 questions of a topic; for review topics: spread as evenly as possible over the source topics
  function buildQuestions(n) {
    var td = topicData(n); if (!td) return [];
    if (td.q) return shuffle(td.q.map(function (r, i) { return makeQ(n, i, r); }));
    var srcs = reviewSources(n).filter(function (x) { var d = topicData(x); return d && d.q; }); if (!srcs.length) return [];
    var base = Math.floor(QN / srcs.length), extra = QN - base * srcs.length, order = shuffle(srcs), out = [];
    order.forEach(function (x, k) { var d = topicData(x), take = Math.min(d.q.length, base + (k < extra ? 1 : 0)); shuffle(d.q.map(function (r, i) { return makeQ(x, i, r); })).slice(0, take).forEach(function (q) { out.push(q); }); });
    return shuffle(out).slice(0, QN);
  }
  // fill the blank(s) of a stem with the correct answer, for the feedback line
  function filled(stem, correct) {
    var parts = stem.split('___'); if (parts.length === 1) return esc(stem);
    var ans = parts.length === 2 ? [correct] : correct.split(' / '); if (ans.length !== parts.length - 1) return esc(stem).replace(/___/g, '<span class="grm-gap">\u2026</span>');
    return parts.map(function (p, i) { return esc(p) + (i < ans.length ? '<b class="grm-fill">' + esc(ans[i]) + '</b>' : ''); }).join('');
  }
  function stemHtml(stem) { return esc(stem).replace(/___/g, '<span class="grm-gap" aria-label="blank">&nbsp;</span>'); }

  /* ---------- render ---------- */
  function root() { return $('grmRoot'); }
  function setHtml(h, keep) { var r = root(); if (!r) return; r.innerHTML = h; if (r.parentNode && r.parentNode.classList) r.parentNode.classList.toggle('grm-live', !!S.ses); if (!keep) window.scrollTo({ top: 0, behavior: 'auto' }); }
  function home() {
    S.ses = null; var st = load(), passedAll = 0, tot = 0;
    var cards = MONTHS.map(function (mo) {
      var p = 0; mo.topics.forEach(function (t) { tot++; var r = st.t[t[0]]; if (r && r.passed) { p++; passedAll++; } });
      return '<section class="grm-month"><div class="grm-mh"><div><span class="grm-mbadge">Month ' + mo.m + '</span><span class="grm-weeks">' + mo.weeks + '</span><h2>' + esc(mo.title) + '</h2></div><div class="grm-mprog"><b>' + p + '</b> / 12 passed</div></div>' +
        '<div class="grm-topics">' + mo.topics.map(function (t) {
          var r = st.t[t[0]], ready = topicReady(t[0]), rev = isReview(t[0]);
          return '<button class="grm-topic' + (r && r.passed ? ' pass' : '') + (ready ? '' : ' soon') + (rev ? ' rev' : '') + '" data-gt="' + t[0] + '"' + (ready ? '' : ' disabled') + '><span class="grm-n">' + t[0] + '</span><span class="grm-tt">' + esc(t[1]) + '</span><span class="grm-lv">' + t[2] + (rev ? ' \u00B7 mixed' : '') + '</span>' +
            (ready ? (r ? '<span class="grm-best">' + (r.passed ? '\u2705 ' : '') + 'Best ' + r.best + '/' + QN + '</span>' : '<span class="grm-best">30 questions</span>') : '<span class="grm-best">Coming soon</span>') + '</button>';
        }).join('') + '</div></section>';
    }).join('');
    var hist = st.hist.slice(0, 5);
    setHtml('<div class="grm-sum"><b>' + passedAll + '</b> of ' + tot + ' topics passed \u00B7 Pass mark ' + Math.round(PASS * 100) + '% (' + Math.ceil(PASS * QN) + ' of ' + QN + ')</div>' + cards +
      (hist.length ? '<div class="sy-sub">Your recent tests</div><div class="grm-hist">' + hist.map(function (h) { var d = new Date(h.t); return '<div class="grm-hrow"><span class="grm-hd">' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</span><span><b>Topic ' + h.topic + '</b> \u00B7 ' + esc(h.title) + (h.practice ? ' \u00B7 mistakes only' : '') + '</span><span class="grm-hs">' + h.score + '/' + h.total + ' \u00B7 ' + h.pct + '%</span></div>'; }).join('') + '</div>' : ''), true);
  }
  function openTopic(n) {
    var mo = monthOf(n); if (S.loading) return; S.loading = true;
    setHtml('<div class="wc-loading"><span class="d"></span> Loading questions\u2026</div>');
    var need = [mo]; if (isReview(n)) reviewSources(n).forEach(function (x) { if (need.indexOf(monthOf(x)) < 0 && READY[monthOf(x)]) need.push(monthOf(x)); });
    Promise.all(need.map(loadMonth)).then(function () { S.loading = false; start(n); }).catch(function (e) { S.loading = false; setHtml('<div class="wc-err">' + esc(e.message) + '</div><div class="sy-next"><button class="wc-btn" data-act="home">Back</button></div>'); });
  }
  function start(n, only) {
    var qs = only || buildQuestions(n), m = metaOf(n); if (!qs.length) return home();
    S.ses = { n: n, meta: m, qs: qs, i: 0, right: 0, wrong: [], t0: Date.now(), practice: !!only, answered: false, streak: 0, best: 0 }; question();
  }
  function question() {
    var s = S.ses, q = s.qs[s.i]; s.answered = false;
    setHtml('<div class="sy-top"><span>Topic <b>' + s.n + '</b> \u00B7 ' + esc(s.meta.title) + ' \u00B7 Question <b>' + (s.i + 1) + '</b> of ' + s.qs.length + ' \u00B7 \u2705 ' + s.right + '</span><button class="sy-chip" data-act="quit">Quit</button></div><div class="sy-bar"><i style="width:' + pct(s.i, s.qs.length) + '%"></i></div>' +
      '<div class="sy-q"><p class="hint">' + (s.practice ? 'Practising your mistakes' : 'Choose the correct answer') + '</p><h2 class="grm-stem" id="grmStem">' + stemHtml(q.stem) + '</h2><div class="sy-opts">' +
      q.opts.map(function (o, k) { return '<button class="sy-opt" data-ans="' + k + '"><kbd>' + (k + 1) + '</kbd> ' + esc(o.t) + '</button>'; }).join('') + '</div><div id="grmFb"></div></div>', true);
  }
  function answer(k) {
    var s = S.ses; if (!s || s.answered) return; var q = s.qs[s.i], ok = !!q.opts[k].ok, right = q.opts.filter(function (o) { return o.ok; })[0]; s.answered = true;
    if (ok) { s.right++; s.streak++; s.best = Math.max(s.best, s.streak); } else { s.wrong.push({ q: q, picked: q.opts[k].t }); s.streak = 0; }
    Array.prototype.forEach.call(document.querySelectorAll('#grmRoot .sy-opt'), function (b, j) { b.disabled = true; if (q.opts[j].ok) b.classList.add(ok ? 'ok' : 'miss'); if (j === k && !ok) b.classList.add('bad'); });
    var st = $('grmStem'); if (st) st.innerHTML = filled(q.stem, right.t);
    $('grmFb').innerHTML = '<div class="sy-fb ' + (ok ? 'good' : 'wrong') + '"><h3>' + (ok ? '\u2705 Correct!' : '\u274C Not quite. The answer is: ' + esc(right.t)) + '</h3><p class="grm-exp">\uD83D\uDCA1 ' + esc(q.exp) + '</p><p class="grm-uz">\uD83C\uDDFA\uD83C\uDDFF ' + esc(q.uz) + '</p></div><div class="sy-next"><button class="wc-btn" data-act="next">' + (s.i + 1 >= s.qs.length ? 'See my result' : 'Next \u2192') + '</button></div>';
  }
  function finish() {
    var s = S.ses, total = s.qs.length, p = pct(s.right, total), passed = s.right / total >= PASS && !s.practice, ms = Date.now() - s.t0, mo = MONTHS[s.meta.month - 1];
    var st = load(), r = st.t[s.n] = st.t[s.n] || { best: 0, attempts: 0, passed: false };
    if (!s.practice) { r.attempts++; r.best = Math.max(r.best, s.right); r.last = s.right; r.at = Date.now(); if (s.right / total >= PASS) r.passed = true; }
    st.hist.unshift({ t: Date.now(), topic: s.n, title: s.meta.title, month: s.meta.month, score: s.right, total: total, pct: p, secs: Math.round(ms / 1000), practice: s.practice }); st.hist = st.hist.slice(0, 40); save(st); s.done = true;
    var rows = [['Topic', s.n + '. ' + s.meta.title], ['Month', 'Month ' + s.meta.month + ' \u00B7 ' + mo.title], ['Level', s.meta.level], ['Score', s.right + ' out of ' + total + ' (' + p + '%)'], ['Result', s.practice ? 'Practice (not counted)' : passed ? 'Passed \u2705' : 'Not yet (pass mark ' + Math.ceil(PASS * QN) + ' of ' + QN + ')'], ['Time', fmtTime(ms)], ['Date and time', new Date().toLocaleString()], ['Best streak', s.best]];
    setHtml('<div class="sy-q sy-res grm-result"><div class="grm-scorebox"><div class="big">' + s.right + '/' + total + '</div><div class="grm-pct ' + (p >= 70 ? 'ok' : '') + '">' + p + '%</div><p class="hint">' + (s.practice ? 'mistakes practised' : passed ? 'Topic passed! Well done.' : 'Keep practising. You need ' + Math.ceil(PASS * QN) + ' correct to pass.') + '</p></div>' +
      '<div class="dst-stats grm-stats" aria-label="Test statistics">' + rows.map(function (x) { return '<div class="dst-stat"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="sy-next" style="justify-content:center"><button class="wc-btn" data-act="again">Try again</button>' + (s.wrong.length ? '<button class="wc-btn ghost" data-act="mistakes">Practise my ' + s.wrong.length + ' mistake' + (s.wrong.length === 1 ? '' : 's') + '</button>' : '') + '<button class="wc-btn ghost" data-act="home">All topics</button></div></div>' +
      (s.wrong.length ? '<div class="sy-sub">Your mistakes</div><div class="grm-list">' + s.wrong.map(function (w) { var right = w.q.opts.filter(function (o) { return o.ok; })[0].t; return '<div class="grm-item"><div class="grm-iq">' + filled(w.q.stem, right) + '</div><div class="grm-ia"><span class="bad">You chose: ' + esc(w.picked) + '</span><span class="ok">Correct: ' + esc(right) + '</span></div><div class="grm-exp">\uD83D\uDCA1 ' + esc(w.q.exp) + '</div><div class="grm-uz">\uD83C\uDDFA\uD83C\uDDFF ' + esc(w.q.uz) + '</div></div>'; }).join('') + '</div>' : ''));
  }

  /* ---------- events ---------- */
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('button') : null; if (!t || !root() || !root().contains(t)) return;
    if (t.hasAttribute('data-gt')) return openTopic(Number(t.getAttribute('data-gt')));
    if (t.hasAttribute('data-ans')) return answer(Number(t.getAttribute('data-ans')));
    var a = t.getAttribute('data-act'), s = S.ses;
    if (a === 'next') { if (!s || !s.answered) return; s.i++; return s.i >= s.qs.length ? finish() : question(); }
    if (a === 'quit') { if (window.confirm('Leave this test? Your answers so far will not be counted.')) home(); return; }
    if (a === 'home') return home();
    if (a === 'again') return start(s.n);
    if (a === 'mistakes') { var qs = shuffle(s.wrong.map(function (w) { var q = w.q; return { id: q.id, topic: q.topic, stem: q.stem, opts: shuffle(q.opts), exp: q.exp, uz: q.uz }; })); return start(s.n, qs); }
  }
  function onKey(e) {
    if (document.body.getAttribute('data-view') !== 'grammar' || !S.ses || S.ses.done) return; var s = S.ses;
    if (/^[1-4]$/.test(e.key) && !s.answered) answer(Number(e.key) - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && s.answered) { e.preventDefault(); s.i++; s.i >= s.qs.length ? finish() : question(); }
  }
  function init() {
    var r = root(); if (!r || r.getAttribute('data-ready')) return; r.setAttribute('data-ready', '1');
    r.addEventListener('click', onClick); document.addEventListener('keydown', onKey); home();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (document.body.getAttribute('data-view') === 'grammar') init(); }); else if (document.body.getAttribute('data-view') === 'grammar') init();
  new MutationObserver(function () { if (document.body.getAttribute('data-view') === 'grammar') init(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  window.TJGrammar = { MONTHS: MONTHS, READY: READY, metaOf: metaOf, monthOf: monthOf, isReview: isReview, reviewSources: reviewSources, buildQuestions: buildQuestions, loadMonth: loadMonth, filled: filled, state: function () { return S; }, setRng: function (f) { rng = f || Math.random; }, init: init, home: home, PASS: PASS, QN: QN };
})();
