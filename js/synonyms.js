/* Synonym Trainer for IELTS B2-C1: odd one out, select all synonyms, match pairs, study.
   Data: window.SYN_SETS (see synonyms-data.js). A set = 3-5 expressions that mean the same; 'grp' = meaning family.
   Safety rule: an intruder / distractor ALWAYS comes from a different meaning family, so it can never be a hidden synonym. */
(function () {
  'use strict';
  var SETS = window.SYN_SETS || [];
  if (!SETS.length) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CATS = [['all', 'All'], ['connector', 'Linkers'], ['task1', 'Task 1 language'], ['pattern', 'Patterns'], ['topic', 'Topic vocabulary'], ['general', 'Core words'], ['speaking', 'Speaking']];
  var CATNAME = {}; CATS.forEach(function (c) { CATNAME[c[0]] = c[1]; });
  var LEVELS = [['all', 'B2 + C1'], ['B2', 'B2'], ['C1', 'C1']];
  var STAT_KEY = 'tj_syn_stats_v1';
  var BYID = {}; SETS.forEach(function (s) { BYID[s.id] = s; });
  var F = { cat: 'all', level: 'all' };
  var S = null;               // the running session
  var rng = Math.random;

  /* ---------- helpers ---------- */
  function ri(n) { return Math.floor(rng() * n); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = ri(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[ri(a.length)]; }
  function loadStats() { try { var s = JSON.parse(localStorage.getItem(STAT_KEY) || '{}') || {}; s.sets = s.sets || {}; return s; } catch (e) { return { sets: {} }; } }
  function saveStats(s) { try { localStorage.setItem(STAT_KEY, JSON.stringify(s)); } catch (e) {} }
  function record(setIds, ok) {
    var st = loadStats(); st.answered = (st.answered || 0) + 1; if (ok) st.correct = (st.correct || 0) + 1;
    setIds.forEach(function (id) { var r = st.sets[id] = st.sets[id] || { c: 0, w: 0 }; if (ok) r.c++; else r.w++; });
    saveStats(st);
  }
  function pool(f) {
    f = f || F;
    return SETS.filter(function (s) { return (f.cat === 'all' || s.cat === f.cat) && (f.level === 'all' || s.level === f.level || s.level === 'B2-C1'); });
  }
  function weight(id, st) { var r = (st.sets[id]) || { c: 0, w: 0 }; return Math.max(0.3, 1 + 1.5 * r.w - 0.4 * r.c); }
  function pickSet(p, used) {
    var st = loadStats(), cand = p.filter(function (s) { return !used || used.indexOf(s.id) < 0; });
    if (!cand.length) cand = p;
    var tot = cand.reduce(function (a, s) { return a + weight(s.id, st); }, 0), x = rng() * tot;
    for (var i = 0; i < cand.length; i++) { x -= weight(cand[i].id, st); if (x <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }
  function otherFamily(s, p) {   // sets from a DIFFERENT meaning family; same category preferred (harder, more realistic)
    var diff = p.filter(function (x) { return x.grp !== s.grp; });
    if (diff.length < 3) diff = SETS.filter(function (x) { return x.grp !== s.grp; });
    var same = diff.filter(function (x) { return x.cat === s.cat; });
    return same.length >= 3 ? same : diff;
  }
  function boldEx(it) {
    var key = it.k || it.t, ex = it.ex, i = ex.toLowerCase().indexOf(key.toLowerCase());
    if (i < 0) return esc(ex);
    return esc(ex.slice(0, i)) + '<b>' + esc(ex.slice(i, i + key.length)) + '</b>' + esc(ex.slice(i + key.length));
  }

  /* ---------- question builders (pure: no DOM) ---------- */
  function buildOdd(p, used) {
    var s = pickSet(p, used), three = shuffle(s.items).slice(0, 3);
    var y = pick(otherFamily(s, p)), bad = pick(y.items);
    var opts = shuffle(three.map(function (it) { return { t: it.t, pos: it.pos, setId: s.id }; }).concat([{ t: bad.t, pos: bad.pos, setId: y.id }]));
    return { type: 'odd', setId: s.id, otherId: y.id, options: opts, answer: opts.findIndex(function (o) { return o.setId === y.id; }) };
  }
  function buildHunt(p, used) {
    var s = pickSet(p, used), target = pick(s.items);
    var correct = s.items.filter(function (it) { return it !== target; });
    var need = Math.max(2, 6 - correct.length), dist = [], seenSets = {};
    shuffle(otherFamily(s, p)).forEach(function (x) { if (dist.length < need && !seenSets[x.id]) { seenSets[x.id] = 1; var it = pick(x.items); dist.push({ t: it.t, pos: it.pos, setId: x.id, correct: false }); } });
    var opts = shuffle(correct.map(function (it) { return { t: it.t, pos: it.pos, setId: s.id, correct: true }; }).concat(dist));
    return { type: 'hunt', setId: s.id, target: { t: target.t, pos: target.pos }, options: opts, need: correct.length };
  }
  function buildMatch(p, used) {
    var chosen = [], fams = {}, tries = 0;
    while (chosen.length < 4 && tries++ < 400) { var s = pickSet(p, used.concat(chosen.map(function (c) { return c.id; }))); if (!fams[s.grp] && chosen.indexOf(s) < 0) { fams[s.grp] = 1; chosen.push(s); } }
    if (chosen.length < 4) { SETS.forEach(function (s) { if (chosen.length < 4 && !fams[s.grp]) { fams[s.grp] = 1; chosen.push(s); } }); }
    var pairs = chosen.map(function (s) { var two = shuffle(s.items).slice(0, 2); return { setId: s.id, left: { t: two[0].t, pos: two[0].pos }, right: { t: two[1].t, pos: two[1].pos } }; });
    return { type: 'match', setIds: chosen.map(function (s) { return s.id; }), pairs: pairs, leftOrder: shuffle(pairs.map(function (_, i) { return i; })), rightOrder: shuffle(pairs.map(function (_, i) { return i; })) };
  }

  /* ---------- views ---------- */
  function root() { return $('synRoot'); }
  function setHtml(h) { var r = root(); if (r) { r.innerHTML = h; window.scrollTo({ top: 0, behavior: 'auto' }); } }

  function home() {
    S = null;
    var st = loadStats(), p = pool(), playable = p.length >= 4, answered = st.answered || 0, acc = answered ? Math.round(100 * (st.correct || 0) / answered) : 0;
    var mastered = SETS.filter(function (s) { var r = st.sets[s.id]; return r && r.c >= 2 && r.c >= 2 * r.w; }).length;
    var chips = function (arr, key) { return arr.map(function (c) { return '<button class="sy-chip' + (F[key] === c[0] ? ' on' : '') + '" data-f="' + key + '" data-v="' + c[0] + '">' + esc(c[1]) + '</button>'; }).join(''); };
    setHtml(
      '<div class="sy-stats"><div class="sy-stat"><b>' + answered + '</b><span>questions answered</span></div><div class="sy-stat"><b>' + acc + '%</b><span>accuracy</span></div>' +
      '<div class="sy-stat"><b>' + (st.bestStreak || 0) + '</b><span>best streak</span></div><div class="sy-stat"><b>' + mastered + '/' + SETS.length + '</b><span>sets mastered</span></div></div>' +
      '<div class="sy-sub">What do you want to practise?</div><div class="sy-chips">' + chips(CATS, 'cat') + '</div><div class="sy-chips">' + chips(LEVELS, 'level') + '</div>' +
      '<div class="mk-note" style="margin:-4px 0 14px">' + p.length + ' sets in this selection \u00B7 ' + p.reduce(function (a, s) { return a + s.items.length; }, 0) + ' expressions' + (playable ? '' : ' \u2014 <b>choose a wider selection to play the games</b> (you can still study these sets)') + '</div>' +
      '<div class="sy-modes">' +
      '<button class="sy-mode" data-mode="odd"' + (playable ? '' : ' disabled style="opacity:.5;cursor:not-allowed"') + '><span class="ic">\uD83D\uDD0D</span><b>Odd one out</b><span>Three expressions mean the same. Which one does not belong?</span></button>' +
      '<button class="sy-mode" data-mode="hunt"' + (playable ? '' : ' disabled style="opacity:.5;cursor:not-allowed"') + '><span class="ic">\uD83C\uDFAF</span><b>Synonym hunt</b><span>Select ALL the expressions that mean the same as the one shown.</span></button>' +
      '<button class="sy-mode" data-mode="match"' + (playable ? '' : ' disabled style="opacity:.5;cursor:not-allowed"') + '><span class="ic">\uD83D\uDD17</span><b>Match pairs</b><span>Connect four expressions with the one that means the same.</span></button>' +
      '<button class="sy-mode" data-mode="mix"' + (playable ? '' : ' disabled style="opacity:.5;cursor:not-allowed"') + '><span class="ic">\u26A1</span><b>Quick mix \u00B7 10</b><span>Ten mixed questions. Weak sets come back more often.</span></button>' +
      '<button class="sy-mode" data-mode="study"><span class="ic">\uD83D\uDCD6</span><b>Study sets</b><span>Browse every set with notes on tone, grammar and examples.</span></button></div>');
  }

  function startSession(mode, onlyIds) {
    var p = onlyIds ? SETS.filter(function (s) { return onlyIds.indexOf(s.id) >= 0; }) : pool();
    if (!p.length) return home();
    var total = mode === 'match' ? 4 : 10;
    S = { mode: mode, pool: p, i: 0, total: total, score: 0, correct: 0, streak: 0, best: 0, used: [], missed: [], q: null, done: false, onlyIds: onlyIds || null };
    next();
  }
  function build() {
    var m = S.mode === 'mix' ? (rng() < 0.5 ? 'odd' : 'hunt') : S.mode;
    var q = m === 'odd' ? buildOdd(S.pool, S.used) : m === 'hunt' ? buildHunt(S.pool, S.used) : buildMatch(S.pool, S.used);
    (q.setIds || [q.setId]).forEach(function (id) { S.used.push(id); }); if (S.used.length > Math.max(6, Math.floor(S.pool.length / 2))) S.used = S.used.slice(-Math.floor(S.pool.length / 2));
    return q;
  }
  function next() {
    if (S.i >= S.total) return finish();
    S.q = build(); S.q.answered = false; S.q.sel = []; S.q.wrong = 0; S.q.pickedLeft = null; S.q.doneIdx = [];
    drawQ();
  }
  function topInner() {
    var shown = Math.min(S.total, S.i + (S.q && S.q.answered ? 0 : 1));
    return '<span>Question <b>' + shown + '</b> of ' + S.total + ' \u00B7 Score <b>' + S.score + '</b>' + (S.streak > 1 ? ' \u00B7 \uD83D\uDD25 ' + S.streak + ' in a row' : '') + '</span><button class="sy-chip" data-act="quit">Quit</button>';
  }
  function barWidth() { return Math.round(100 * S.i / S.total); }
  function topBar() { return '<div class="sy-top">' + topInner() + '</div><div class="sy-bar"><i style="width:' + barWidth() + '%"></i></div>'; }
  function refreshTop() { var el = root() && root().querySelector('.sy-top'), bar = root() && root().querySelector('.sy-bar i'); if (el) el.innerHTML = topInner(); if (bar) bar.style.width = barWidth() + '%'; }
  function setBlock(s, title) {
    return '<div class="sy-fb-set"><ul class="sy-set">' + s.items.map(function (it) { return '<li><span class="t">' + esc(it.t) + '</span><span class="pos">' + esc(it.pos) + '</span><span class="ex">' + boldEx(it) + '</span></li>'; }).join('') + '</ul></div>' +
      '<div class="note"><b>' + esc(title || 'Good to know') + ':</b> ' + esc(s.note) + '</div>';
  }
  function drawQ() {
    var q = S.q, h = topBar();
    if (q.type === 'odd') {
      h += '<div class="sy-q"><h2>Which one does NOT belong?</h2><p class="hint">Three of these expressions mean the same. Choose the odd one out.</p><div class="sy-opts">' +
        q.options.map(function (o, i) { return '<button class="sy-opt" data-i="' + i + '">' + esc(o.t) + '<small>' + esc(o.pos) + '</small></button>'; }).join('') + '</div><div id="syFb"></div></div>';
    } else if (q.type === 'hunt') {
      h += '<div class="sy-q"><h2>' + esc(q.target.t) + '</h2><p class="hint">Select <b>all ' + q.need + '</b> expressions that mean the same as <b>' + esc(q.target.t) + '</b> <span style="opacity:.7">(' + esc(q.target.pos) + ')</span>.</p><div class="sy-opts">' +
        q.options.map(function (o, i) { return '<button class="sy-opt" data-i="' + i + '" aria-pressed="false">' + esc(o.t) + '<small>' + esc(o.pos) + '</small></button>'; }).join('') + '</div>' +
        '<div class="sy-next"><button class="wc-btn" data-act="check" id="syCheck" disabled>Check answer</button></div><div id="syFb"></div></div>';
    } else {
      h += '<div class="sy-q"><h2>Match the synonyms</h2><p class="hint">Tap an expression on the left, then the one on the right that means the same.</p><div class="sy-pairs"><div class="col">' +
        q.leftOrder.map(function (i) { return '<button class="sy-opt" data-l="' + i + '">' + esc(q.pairs[i].left.t) + '<small>' + esc(q.pairs[i].left.pos) + '</small></button>'; }).join('') + '</div><div class="col">' +
        q.rightOrder.map(function (i) { return '<button class="sy-opt" data-r="' + i + '">' + esc(q.pairs[i].right.t) + '<small>' + esc(q.pairs[i].right.pos) + '</small></button>'; }).join('') + '</div></div><div id="syFb"></div></div>';
    }
    setHtml(h);
  }
  function score(ok, points, setIds) {
    var q = S.q; q.answered = true; S.i++;
    if (ok) { S.correct++; S.streak++; S.best = Math.max(S.best, S.streak); } else { S.streak = 0; setIds.forEach(function (id) { if (S.missed.indexOf(id) < 0) S.missed.push(id); }); }
    S.score += points; record(setIds, ok);
    var st = loadStats(); if (S.best > (st.bestStreak || 0)) { st.bestStreak = S.best; saveStats(st); }
    refreshTop();
  }
  function nextBtn() { return '<div class="sy-next"><button class="wc-btn" data-act="next">' + (S.i >= S.total ? 'See my result' : 'Next question \u2192') + '</button></div>'; }
  function answerOdd(i) {
    var q = S.q; if (q.answered) return;
    var ok = i === q.answer; score(ok, ok ? 10 : 0, [q.setId, q.otherId]);
    Array.prototype.forEach.call(root().querySelectorAll('.sy-opt'), function (b, k) { b.disabled = true; if (k === q.answer) b.classList.add(ok ? 'ok' : 'miss'); if (k === i && !ok) b.classList.add('bad'); });
    var s = BYID[q.setId], y = BYID[q.otherId], odd = q.options[q.answer];
    $('syFb').innerHTML = '<div class="sy-fb ' + (ok ? 'good' : 'wrong') + '"><h3>' + (ok ? '\u2705 Correct!' : '\u274C Not quite') + ' \u2014 \u201C' + esc(odd.t) + '\u201D is the odd one out.</h3><div class="note">These three mean the same:</div>' + setBlock(s) +
      '<div class="note" style="margin-top:12px"><b>\u201C' + esc(odd.t) + '\u201D belongs with:</b> ' + esc(y.items.map(function (it) { return it.t; }).join(' \u00B7 ')) + '</div></div>' + nextBtn();
  }
  function toggleHunt(i) {
    var q = S.q; if (q.answered) return;
    var k = q.sel.indexOf(i); if (k >= 0) q.sel.splice(k, 1); else q.sel.push(i);
    Array.prototype.forEach.call(root().querySelectorAll('.sy-opt'), function (b, n) { var on = q.sel.indexOf(n) >= 0; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('syCheck').disabled = q.sel.length === 0;
  }
  function checkHunt() {
    var q = S.q; if (q.answered || !q.sel.length) return;
    var picked = q.sel.map(function (i) { return q.options[i]; }), rightPicked = picked.filter(function (o) { return o.correct; }).length, wrongPicked = picked.length - rightPicked;
    var ok = rightPicked === q.need && wrongPicked === 0;
    var pts = ok ? 10 : Math.max(0, Math.round(10 * (rightPicked - wrongPicked) / q.need / 2));
    var wrongSetIds = picked.filter(function (o) { return !o.correct; }).map(function (o) { return o.setId; });
    score(ok, pts, [q.setId].concat(ok ? [] : wrongSetIds));
    Array.prototype.forEach.call(root().querySelectorAll('.sy-opt'), function (b, n) {
      var o = q.options[n], on = q.sel.indexOf(n) >= 0; b.disabled = true; b.classList.remove('sel');
      if (on && o.correct) b.classList.add('ok'); else if (on) b.classList.add('bad'); else if (o.correct) b.classList.add('miss');
    });
    $('syCheck').parentNode.style.display = 'none';
    $('syFb').innerHTML = '<div class="sy-fb ' + (ok ? 'good' : 'wrong') + '"><h3>' + (ok ? '\u2705 Perfect! You found all ' + q.need + '.' : '\u274C You found ' + rightPicked + ' of ' + q.need + (wrongPicked ? ' and chose ' + wrongPicked + ' wrong' : '')) + '</h3><div class="note">These expressions all mean the same:</div>' + setBlock(BYID[q.setId]) + '</div>' + nextBtn();
  }
  function matchTap(attr, idx) {
    var q = S.q; if (q.answered) return;
    var btns = root().querySelectorAll('.sy-opt'), find = function (a, v) { return Array.prototype.filter.call(btns, function (b) { return b.getAttribute(a) === String(v); })[0]; };
    if (attr === 'l') {
      if (q.doneIdx.indexOf(idx) >= 0) return;
      q.pickedLeft = idx; Array.prototype.forEach.call(btns, function (b) { if (b.hasAttribute('data-l')) b.classList.remove('sel'); }); find('data-l', idx).classList.add('sel'); return;
    }
    if (q.pickedLeft === null || q.doneIdx.indexOf(idx) >= 0) return;
    var l = q.pickedLeft, lb = find('data-l', l), rb = find('data-r', idx);
    if (l === idx) { q.doneIdx.push(l); lb.classList.remove('sel'); lb.classList.add('done'); rb.classList.add('done'); q.pickedLeft = null; lb.disabled = rb.disabled = true;
      if (q.doneIdx.length === q.pairs.length) {
        var ok = q.wrong === 0, pts = Math.max(0, 10 - 3 * q.wrong); score(ok, pts, q.setIds);
        var fb = q.pairs.map(function (pr) { var s = BYID[pr.setId]; return '<div class="sy-fb" style="margin-top:10px"><h3>' + esc(pr.left.t) + ' = ' + esc(pr.right.t) + '</h3><div class="note">' + esc(s.note) + '</div></div>'; }).join('');
        $('syFb').innerHTML = '<div class="sy-fb ' + (ok ? 'good' : 'wrong') + '"><h3>' + (ok ? '\u2705 All four pairs, no mistakes!' : '\u2705 Done with ' + q.wrong + ' mistake' + (q.wrong === 1 ? '' : 's')) + '</h3></div>' + fb + nextBtn();
      }
    } else { q.wrong++; rb.classList.add('shake', 'bad'); lb.classList.remove('sel'); q.pickedLeft = null; setTimeout(function () { rb.classList.remove('shake', 'bad'); }, 450); }
  }
  function finish() {
    var st = loadStats(); st.sessions = (st.sessions || 0) + 1; saveStats(st);
    var acc = Math.round(100 * S.correct / S.total), missed = S.missed.slice();
    var h = '<div class="sy-q sy-res"><div class="big">' + S.score + '</div><p class="hint">points \u00B7 ' + S.correct + ' of ' + S.total + ' perfect (' + acc + '%) \u00B7 best streak ' + S.best + '</p>' +
      '<p>' + (acc >= 90 ? 'Excellent \u2014 these are exam-ready!' : acc >= 70 ? 'Good work. Review the sets below to lock them in.' : 'Keep going \u2014 repetition is how these stick. Review the sets below.') + '</p>' +
      '<div class="sy-next" style="justify-content:center"><button class="wc-btn" data-act="again">Play again</button>' + (missed.length ? '<button class="wc-btn ghost" data-act="missed">Practise ' + missed.length + ' missed set' + (missed.length === 1 ? '' : 's') + '</button>' : '') + '<button class="wc-btn ghost" data-act="home">Back</button></div></div>';
    if (missed.length) h += '<div class="sy-sub">Sets to review</div><div class="sy-study-grid">' + missed.map(function (id) { return cardHtml(BYID[id]); }).join('') + '</div>';
    S.done = true; S.finishedMissed = missed; setHtml(h);
  }
  function cardHtml(s) {
    return '<div class="sy-card"><div class="hd"><b>' + esc(s.topic) + '</b><span>' + esc(CATNAME[s.cat] || s.cat) + ' \u00B7 ' + esc(s.level) + '</span></div><div class="note">' + esc(s.note) + '</div>' +
      '<ul class="sy-set">' + s.items.map(function (it) { return '<li><span class="t">' + esc(it.t) + '</span><span class="pos">' + esc(it.pos) + '</span><span class="ex">' + boldEx(it) + '</span></li>'; }).join('') + '</ul></div>';
  }
  function study(q, limit) {
    q = (q || '').trim().toLowerCase(); limit = limit || 40;
    var p = pool().filter(function (s) { return !q || s.topic.toLowerCase().indexOf(q) >= 0 || s.note.toLowerCase().indexOf(q) >= 0 || s.items.some(function (it) { return it.t.toLowerCase().indexOf(q) >= 0 || it.ex.toLowerCase().indexOf(q) >= 0; }); });
    var shown = p.slice(0, limit);
    setHtml('<div class="sy-top" style="margin-bottom:12px"><button class="sy-chip" data-act="home">\u2190 Back</button><span>' + p.length + ' set' + (p.length === 1 ? '' : 's') + (F.cat !== 'all' ? ' in ' + esc(CATNAME[F.cat]) : '') + '</span></div>' +
      '<input id="sySearch" class="wc-input sy-search" placeholder="Search an expression, e.g. because of, soar, feel down\u2026" value="' + esc(q) + '" autocomplete="off">' +
      '<div class="sy-study-grid" style="margin-top:14px">' + (shown.map(cardHtml).join('') || '<div class="wc-empty">Nothing found. Try another word.</div>') + '</div>' +
      (p.length > shown.length ? '<div class="sy-next"><button class="wc-btn ghost" data-act="more" data-n="' + (limit + 40) + '">Show more (' + (p.length - shown.length) + ' left)</button></div>' : ''));
    var inp = $('sySearch'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  /* ---------- events (one delegated listener on the panel root) ---------- */
  function onClick(e) {
    var t = e.target.closest('button'); if (!t || !root() || !root().contains(t)) return;
    if (t.hasAttribute('data-f')) { var key = t.getAttribute('data-f'); F[key] = t.getAttribute('data-v'); if (!pool().length) { if (key === 'cat') F.level = 'all'; else F.cat = 'all'; } return home(); }
    if (t.hasAttribute('data-mode')) { var m = t.getAttribute('data-mode'); return m === 'study' ? study('') : startSession(m); }
    if (t.hasAttribute('data-l')) return matchTap('l', Number(t.getAttribute('data-l')));
    if (t.hasAttribute('data-r')) return matchTap('r', Number(t.getAttribute('data-r')));
    if (t.classList.contains('sy-opt') && t.hasAttribute('data-i') && S && S.q) return S.q.type === 'odd' ? answerOdd(Number(t.getAttribute('data-i'))) : toggleHunt(Number(t.getAttribute('data-i')));
    var a = t.getAttribute('data-act');
    if (a === 'next') return next();
    if (a === 'check') return checkHunt();
    if (a === 'quit') { if (window.confirm('Quit this session?')) home(); return; }
    if (a === 'home') return home();
    if (a === 'again') return startSession(S ? S.mode : 'mix', S ? S.onlyIds : null);
    if (a === 'missed') return startSession(S && S.mode === 'match' ? 'mix' : (S ? S.mode : 'mix'), S ? S.finishedMissed : null);
    if (a === 'more') return study(($('sySearch') || {}).value, Number(t.getAttribute('data-n')));
  }
  function onInput(e) { if (e.target.id === 'sySearch') study(e.target.value, 40); }
  function init() {
    var r = root(); if (!r || r.getAttribute('data-ready')) return;
    r.setAttribute('data-ready', '1'); r.addEventListener('click', onClick); r.addEventListener('input', onInput); home();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  new MutationObserver(function () { if (document.body.getAttribute('data-view') === 'synonyms') init(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  window.TJSyn = { sets: SETS, pool: pool, buildOdd: buildOdd, buildHunt: buildHunt, buildMatch: buildMatch, setRng: function (f) { rng = f || Math.random; }, filter: F, home: home, loadStats: loadStats, _session: function () { return S; } };
})();
