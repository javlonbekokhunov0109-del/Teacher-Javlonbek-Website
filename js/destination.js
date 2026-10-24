/* Destination Vocabulary (A1, A2, B1, B2): pick a book, a range of units and a direction (English->Uzbek, Uzbek->English, mixed),
   then practise with flashcards (tap to flip), a multiple-choice quiz, match pairs, spelling, or a cover-and-test list.
   Data lives in js/dest-a1.js ... dest-b2.js (loaded only when a book is opened). Progress is kept on the student's device. */
(function () {
  'use strict';
  var BOOKS = [['a1', 'A1', 'Beginner \u00B7 Elementary'], ['a2', 'A2', 'Elementary'], ['b1', 'B1', 'Intermediate'], ['b2', 'B2', 'Upper-Intermediate']];
  var KEY = 'tj_dst_v1', VER = '20261024';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var rng = Math.random;
  var S = { book: 'a1', data: null, loading: false, pref: null, ses: null };

  /* ---------- helpers ---------- */
  function ri(n) { return Math.floor(rng() * n); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = ri(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\u2019\u2018`]/g, "'").replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9'\u0400-\u04ff\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; s.prefs = s.prefs || {}; s.cards = s.cards || {}; return s; } catch (e) { return { prefs: {}, cards: {} }; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function cardId(c) { return c.en.toLowerCase() + '|' + c.uz.toLowerCase().slice(0, 24); }
  function boxOf(book, c) { var r = (load().cards[book] || {})[cardId(c)]; return r ? r.b : 0; }
  function rate(book, c, ok) { var s = load(), m = s.cards[book] = s.cards[book] || {}, id = cardId(c), r = m[id] || { b: 0 }; r.b = ok ? Math.min(5, r.b + 1) : 0; r.t = Date.now(); m[id] = r; save(s); }
  function knownCount(book, deck) { var m = load().cards[book] || {}; return deck.filter(function (c) { var r = m[cardId(c)]; return r && r.b >= 3; }).length; }
  function speak(text) { try { if (!window.speechSynthesis) return; window.speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(String(text).replace(/\bsth\b/g, 'something').replace(/\bsb\b/g, 'somebody').replace(/\([^)]*\)/g, ' ')); u.lang = 'en-GB'; u.rate = 0.9; window.speechSynthesis.speak(u); } catch (e) {} }
  var TG = 'https://t.me/Javlonbek_Okhunov';
  function repBtn(c) { return '<button type="button" class="dst-rep" data-rep="' + esc(('Destination ' + S.book.toUpperCase() + ', unit ' + c.unit + ': ' + c.en + ' = ' + c.uz)) + '" title="Report a mistake in this card">\u2691 Report</button>'; }
  function report(btn) {
    var text = btn.getAttribute('data-rep') + '\n(mistake: ____ )';
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {}); } catch (e) {}
    try { window.open(TG, '_blank', 'noopener'); } catch (e) {}
    btn.textContent = 'Copied \u2713 paste it in Telegram'; btn.disabled = true; setTimeout(function () { btn.textContent = '\u2691 Report'; btn.disabled = false; }, 5000);
  }
  var canSpeak = function () { return typeof window !== 'undefined' && 'speechSynthesis' in window; };
  function bookMeta(id) { return BOOKS.filter(function (b) { return b[0] === id; })[0]; }

  /* ---------- data ---------- */
  function loadBook(id) {
    return new Promise(function (resolve, reject) {
      if (window.DEST && window.DEST[id]) return resolve(window.DEST[id]);
      var sc = document.createElement('script'); sc.src = '/js/dest-' + id + '.js?v=' + VER;
      sc.onload = function () { window.DEST && window.DEST[id] ? resolve(window.DEST[id]) : reject(new Error('empty')); };
      sc.onerror = function () { reject(new Error('Could not load this book. Check your internet connection and try again.')); };
      document.head.appendChild(sc);
    });
  }
  function defaultPref(data) { var u = data.units; return { from: u[0].n, to: u[u.length - 1].n, dir: 'en2uz', secs: data.secs.slice(), size: 30, order: 'random' }; }
  function getPref(id, data) { var p = load().prefs[id], d = defaultPref(data); if (!p) return d; var ns = data.units.map(function (u) { return u.n; }); return { from: ns.indexOf(p.from) >= 0 ? p.from : d.from, to: ns.indexOf(p.to) >= 0 ? p.to : d.to, dir: ['en2uz', 'uz2en', 'mixed'].indexOf(p.dir) >= 0 ? p.dir : 'en2uz', secs: (p.secs || []).filter(function (x) { return data.secs.indexOf(x) >= 0; }).length ? p.secs.filter(function (x) { return data.secs.indexOf(x) >= 0; }) : d.secs, size: p.size || 30, order: p.order === 'weak' ? 'weak' : 'random' }; }
  function setPref(id, p) { var s = load(); s.prefs[id] = p; s.last = id; save(s); }
  function buildDeck(data, pref) {
    var lo = Math.min(pref.from, pref.to), hi = Math.max(pref.from, pref.to), out = [], seen = {};
    data.units.forEach(function (u) {
      if (u.n < lo || u.n > hi) return;
      u.c.forEach(function (c) {
        var sec = data.secs[c[2]]; if (pref.secs.indexOf(sec) < 0) return;
        var card = { en: c[0], uz: c[1], sec: sec, unit: u.n, ex: c[3] || '', exuz: c[4] || '' }, id = cardId(card);
        if (seen[id]) return; seen[id] = 1; out.push(card);
      });
    });
    return out;
  }
  function pickSession(deck, pref, book) {
    var d = deck.slice();
    if (pref.order === 'weak') { var m = load().cards[book] || {}; d = shuffle(d).sort(function (a, b) { return ((m[cardId(a)] || { b: 0 }).b) - ((m[cardId(b)] || { b: 0 }).b); }); }
    else d = shuffle(d);
    var n = pref.size === 'all' ? d.length : Math.min(d.length, Number(pref.size) || 30);
    return d.slice(0, n);
  }
  function dirFor(card, dir, map) { if (dir !== 'mixed') return dir; var id = cardId(card); if (!map[id]) map[id] = rng() < 0.5 ? 'en2uz' : 'uz2en'; return map[id]; }

  /* ---------- question builders (pure) ---------- */
  function makeQuiz(card, pool, dir, all) {
    var ans = dir === 'en2uz' ? card.uz : card.en, key = norm(ans), promptKey = norm(dir === 'en2uz' ? card.en : card.uz);
    var field = dir === 'en2uz' ? 'uz' : 'en', other = dir === 'en2uz' ? 'en' : 'uz';
    var ok = function (c) { return c !== card && norm(c[field]) !== key && norm(c[other]) !== promptKey && norm(c[field]) && c[field] !== ans; };
    var cand = shuffle(pool.filter(ok)), pick = [], used = {}; used[norm(ans)] = 1;
    var take = function (list) { list.forEach(function (c) { if (pick.length < 3 && !used[norm(c[field])]) { used[norm(c[field])] = 1; pick.push(c); } }); };
    take(cand.filter(function (c) { return c.sec === card.sec && c.unit === card.unit; })); take(cand.filter(function (c) { return c.sec === card.sec; })); take(cand);
    if (pick.length < 3 && all) take(shuffle(all.filter(ok)));
    var opts = shuffle([{ t: ans, ok: true }].concat(pick.map(function (c) { return { t: c[field], ok: false }; })));
    return { card: card, dir: dir, prompt: dir === 'en2uz' ? card.en : card.uz, options: opts, answer: opts.findIndex(function (o) { return o.ok; }) };
  }
  function makeMatch(pool, n) {
    var cand = shuffle(pool.filter(function (c) { return c.en.length <= 34 && c.uz.length <= 44; })), en = {}, uz = {}, out = [];
    cand.forEach(function (c) { if (out.length >= n) return; var a = norm(c.en), b = norm(c.uz); if (!a || !b || en[a] || uz[b]) return; en[a] = uz[b] = 1; out.push(c); });
    return out;
  }
  function spellable(c) { return /^[A-Za-z][A-Za-z' -]*$/.test(c.en) && c.en.split(/\s+/).length <= 3 && !/\b(sth|sb|smw)\b/i.test(c.en); }
  function maskExample(c) { if (!c.ex) return ''; var w = c.en.replace(/[^A-Za-z' -]/g, '').trim(); if (!w) return ''; var stem = w.split(/\s+/)[0].replace(/(e|y)$/, ''); var re = new RegExp('\\b' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-z]*', 'ig'); return re.test(c.ex) ? c.ex.replace(re, '_____') : ''; }
  // British and American spellings are both accepted (organise/organize, colour/color, centre/center ...)
  function usNorm(s) {
    return s.replace(/(col|fav|neighb|hum|behavi|rum|lab|harb|flav|sav|vap)our/g, '$1or').replace(/(\w)is(e|ed|es|ing|ation|ations|er|ers)\b/g, '$1iz$2')
      .replace(/(\w)tre\b/g, '$1ter').replace(/(defen|offen|licen|preten)ce\b/g, '$1se').replace(/(catal|dial|prolog|monolog)ogue\b/g, '$1og').replace(/\bjewellery\b/g, 'jewelry').replace(/\bpyjamas?\b/g, 'pajama').replace(/\bcheque\b/g, 'check')
      .replace(/\bprogramme\b/g, 'program').replace(/\bgrey\b/g, 'gray').replace(/\b(trave|cance|labe|mode|fue|pane|signa|quarre)ll(ed|ing|er|ers)\b/g, '$1l$2').replace(/\bwoollen\b/g, 'woolen');
  }
  function sameAnswer(typed, c) { var a = usNorm(norm(typed).replace(/^to /, '')), b = usNorm(norm(c.en).replace(/^to /, '')); return !!a && (a === b || a.replace(/[ -]/g, '') === b.replace(/[ -]/g, '')); }

  /* ---------- rendering ---------- */
  function root() { return $('dstRoot'); }
  function setHtml(h, keepScroll) { var r = root(); if (r) { r.innerHTML = h; if (r.parentNode && r.parentNode.classList) r.parentNode.classList.toggle('dst-live', !!(S.ses && S.ses.mode !== 'ls')); if (!keepScroll) window.scrollTo({ top: 0, behavior: 'auto' }); } }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function tabsHtml() {
    var st = load();
    return '<div class="dst-books" role="tablist" aria-label="Destination books">' + BOOKS.map(function (b) {
      var k = (st.cards[b[0]] ? Object.keys(st.cards[b[0]]).filter(function (id) { return st.cards[b[0]][id].b >= 3; }).length : 0);
      return '<button class="dst-book' + (S.book === b[0] ? ' on' : '') + '" role="tab" aria-selected="' + (S.book === b[0]) + '" data-bk="' + b[0] + '"><b>' + b[1] + '</b><span>' + esc(b[2]) + '</span>' + (k ? '<i>' + k + ' known</i>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function home() {
    S.ses = null; var h = tabsHtml();
    if (S.loading) return setHtml(h + '<div class="wc-loading"><span class="d"></span> Loading ' + esc(bookMeta(S.book)[1]) + '\u2026</div>');
    if (!S.data) return setHtml(h);
    var d = S.data, p = S.pref, deck = buildDeck(d, p), known = knownCount(S.book, deck), size = p.size;
    var unitOpt = function (sel) { return d.units.map(function (u) { return '<option value="' + u.n + '"' + (u.n === sel ? ' selected' : '') + '>Unit ' + u.n + ' \u00B7 ' + esc(u.t) + '</option>'; }).join(''); };
    var seg = function (name, val, items) { return '<div class="dst-seg" role="group">' + items.map(function (it) { return '<button type="button" class="dst-segb' + (val === it[0] ? ' on' : '') + '" data-set="' + name + '" data-v="' + it[0] + '" aria-pressed="' + (val === it[0]) + '">' + it[1] + '</button>'; }).join('') + '</div>'; };
    var disabled = deck.length < 1;
    h += '<div class="dst-card-box"><div class="dst-lbl">1 \u00B7 Which units?</div><div class="dst-row"><label>From <select data-sel="from" aria-label="From unit">' + unitOpt(p.from) + '</select></label><label>to <select data-sel="to" aria-label="To unit">' + unitOpt(p.to) + '</select></label><button type="button" class="sy-chip" data-act="allunits">All units</button></div>' +
      '<div class="dst-lbl">2 \u00B7 What kind of words?</div><div class="sy-chips">' + d.secs.map(function (s) { return '<button type="button" class="sy-chip' + (p.secs.indexOf(s) >= 0 ? ' on' : '') + '" data-sec="' + esc(s) + '" aria-pressed="' + (p.secs.indexOf(s) >= 0) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
      '<div class="dst-lbl">3 \u00B7 Which way round?</div>' + seg('dir', p.dir, [['en2uz', 'English \u2192 Uzbek'], ['uz2en', 'Uzbek \u2192 English'], ['mixed', 'Mixed']]) +
      '<div class="dst-row" style="margin-top:12px"><label>Cards per round <select data-sel="size" aria-label="Cards per round">' + ['10', '20', '30', '50', '100', 'all'].map(function (n) { return '<option value="' + n + '"' + (String(size) === n ? ' selected' : '') + '>' + (n === 'all' ? 'All' : n) + '</option>'; }).join('') + '</select></label><label>Order <select data-sel="order" aria-label="Order"><option value="random"' + (p.order === 'random' ? ' selected' : '') + '>Random</option><option value="weak"' + (p.order === 'weak' ? ' selected' : '') + '>Weakest first</option></select></label></div>' +
      '<div class="dst-sum" id="dstSum"><b>' + deck.length + '</b> cards selected \u00B7 <b>' + known + '</b> known (' + pct(known, deck.length) + '%)</div></div>' +
      '<div class="sy-modes dst-modes">' +
      '<button class="sy-mode" data-md="fc"' + (disabled ? ' disabled' : '') + '><span class="ic">\uD83C\uDCCF</span><b>Flashcards</b><span>See one side, think, tap to flip. Mark what you knew.</span></button>' +
      '<button class="sy-mode" data-md="qz"' + (deck.length < 4 ? ' disabled' : '') + '><span class="ic">\uD83C\uDFAF</span><b>Quiz</b><span>Choose the right answer from four options.</span></button>' +
      '<button class="sy-mode" data-md="mt"' + (deck.length < 6 ? ' disabled' : '') + '><span class="ic">\uD83D\uDD17</span><b>Match pairs</b><span>Connect six English words with their Uzbek.</span></button>' +
      '<button class="sy-mode" data-md="sp"' + (deck.filter(spellable).length < 1 ? ' disabled' : '') + '><span class="ic">\u2328\uFE0F</span><b>Spelling</b><span>Read the Uzbek, type the English word.</span></button>' +
      '<button class="sy-mode" data-md="ls"' + (disabled ? ' disabled' : '') + '><span class="ic">\uD83D\uDCCB</span><b>List &amp; cover</b><span>Browse everything. Hide one side to test yourself.</span></button></div>' +
      (disabled ? '<div class="wc-empty">No cards for this selection. Pick more units or word types.</div>' : '') +
      '';
    setHtml(h, true);
  }
  function updateSummary() { var el = $('dstSum'); if (!el || !S.data) return; var deck = buildDeck(S.data, S.pref), k = knownCount(S.book, deck); el.innerHTML = '<b>' + deck.length + '</b> cards selected \u00B7 <b>' + k + '</b> known (' + pct(k, deck.length) + '%)'; var m = document.querySelectorAll('.dst-modes .sy-mode'); [deck.length < 1, deck.length < 4, deck.length < 6, deck.filter(spellable).length < 1, deck.length < 1].forEach(function (off, i) { if (m[i]) m[i].disabled = off; }); }
  function selectBook(id) {
    S.book = id; S.data = null; S.all = null; S.loading = true; home();
    return loadBook(id).then(function (d) { S.data = d; S.pref = getPref(id, d); S.loading = false; var s = load(); s.last = id; save(s); home(); }).catch(function (e) { S.loading = false; setHtml(tabsHtml() + '<div class="wc-err">' + esc(e.message) + '</div><div class="sy-next"><button class="wc-btn" data-bk="' + id + '">Try again</button></div>'); });
  }

  /* ---------- sessions ---------- */
  function startSession(mode) {
    var deck = buildDeck(S.data, S.pref); if (!deck.length) return;
    var cards = pickSession(deck, S.pref, S.book), map = {};
    S.ses = { mode: mode, deck: deck, cards: cards, i: 0, dirMap: map, right: 0, wrong: 0, missed: [], queue: cards.slice(), flipped: false, streak: 0, best: 0 };
    if (mode === 'ls') return listView('', 'none');
    if (mode === 'mt') { S.ses.boards = 3; S.ses.board = 0; return matchBoard(); }
    if (mode === 'sp') { S.ses.queue = shuffle(deck.filter(spellable)).slice(0, S.pref.size === 'all' ? 9999 : Math.min(Number(S.pref.size) || 30, 30)); S.ses.total = S.ses.queue.length; return spellQ(); }
    S.ses.total = cards.length; if (mode === 'qz') return quizQ(); return fcShow();
  }
  function topBar(label) { var s = S.ses; return '<div class="sy-top"><span>' + label + '</span><button class="sy-chip" data-act="quit">Quit</button></div><div class="sy-bar"><i style="width:' + pct(s.done || 0, s.total || 1) + '%"></i></div>'; }
  function exampleHtml(c, show) { return show && c.ex ? '<div class="dst-ex"><div>' + esc(c.ex) + '</div>' + (c.exuz ? '<div class="uz">' + esc(c.exuz) + '</div>' : '') + '</div>' : ''; }
  function spk(text) { return canSpeak() ? '<button type="button" class="dst-spk" data-say="' + esc(text) + '" aria-label="Pronounce">\uD83D\uDD0A</button>' : ''; }

  /* flashcards */
  function fcShow() {
    var s = S.ses; if (!s.queue.length) return fcDone(); var c = s.queue[0], dir = dirFor(c, S.pref.dir, s.dirMap), front = dir === 'en2uz' ? c.en : c.uz, back = dir === 'en2uz' ? c.uz : c.en;
    s.done = s.total - s.queue.length; s.flipped = false; s.cur = { c: c, dir: dir };
    var frontLang = dir === 'en2uz' ? 'English' : 'Uzbek', backLang = dir === 'en2uz' ? 'Uzbek' : 'English';
    setHtml(topBar('Card <b>' + (s.done + 1) + '</b> of ' + s.total + ' \u00B7 \u2705 ' + s.right + ' \u00B7 \uD83D\uDD01 ' + s.wrong) +
      '<div class="dst-stage"><button type="button" class="dst-flip" id="dstFlip" data-act="flip" aria-label="Tap to show the answer"><div class="dst-inner"><div class="dst-face dst-front"><small>' + frontLang + ' \u00B7 ' + esc(c.sec) + ' \u00B7 Unit ' + c.unit + '</small><div class="dst-big">' + esc(front) + '</div><em>Tap to flip</em></div>' +
      '<div class="dst-face dst-back"><small>' + backLang + '</small><div class="dst-big">' + esc(back) + '</div>' + exampleHtml(c, true) + '</div></div></button>' + '<div class="dst-repbar" id="dstRep" hidden>' + repBtn(c) + '</div>' +
      (dir === 'en2uz' ? '<div class="dst-spkrow">' + spk(c.en) + '</div>' : '') + '</div>' +
      '<div class="dst-rate" id="dstRate"><button class="wc-btn ghost" data-act="again" disabled>\uD83D\uDD01 Again <kbd>1</kbd></button><button class="wc-btn" data-act="know" disabled>\u2705 I knew it <kbd>2</kbd></button></div>' +
      '<p class="mk-note" style="text-align:center">Space = flip \u00B7 1 = again \u00B7 2 = knew it</p>', true);
  }
  function fcFlip() { var s = S.ses; if (!s || s.mode !== 'fc' || !s.cur) return; s.flipped = !s.flipped; var f = $('dstFlip'); if (!f) return; f.classList.toggle('flip', s.flipped); f.setAttribute('aria-label', s.flipped ? 'Tap to show the other side' : 'Tap to show the answer'); Array.prototype.forEach.call(document.querySelectorAll('#dstRate button'), function (b) { b.disabled = !s.flipped; }); var rb = $('dstRep'); if (rb) rb.hidden = !s.flipped; if (s.flipped && s.cur.dir === 'uz2en' && S.pref.speak !== false && canSpeak()) { /* no auto speech: only on tap */ } }
  function fcRate(ok) {
    var s = S.ses; if (!s || !s.cur || !s.flipped) return; var c = s.cur.c; s.queue.shift(); rate(S.book, c, ok);
    if (ok) s.right++; else { s.wrong++; if (s.missed.indexOf(c) < 0) s.missed.push(c); var at = Math.min(s.queue.length, 4 + ri(4)); s.queue.splice(at, 0, c); }   // missed cards come back a few cards later
    s.cur = null; fcShow();
  }
  function fcDone() {
    var s = S.ses, k = knownCount(S.book, s.deck);
    setHtml('<div class="sy-q sy-res"><div class="big">' + s.total + '</div><p class="hint">cards finished \u00B7 ' + s.missed.length + ' needed another look</p><p>' + (s.missed.length === 0 ? 'Perfect round!' : 'Good work. The tricky ones will come up more often next time.') + '</p>' +
      '<div class="sy-next" style="justify-content:center"><button class="wc-btn" data-act="again-round">Another round</button>' + (s.missed.length ? '<button class="wc-btn ghost" data-act="missed-round">Practise the ' + s.missed.length + ' tricky</button>' : '') + '<button class="wc-btn ghost" data-act="home">Back</button></div><p class="mk-note">Known in this selection: ' + k + ' of ' + s.deck.length + '</p></div>');
  }

  /* quiz */
  function quizQ() {
    var s = S.ses; if (s.i >= s.total) return quizDone(); var c = s.cards[s.i], dir = dirFor(c, S.pref.dir, s.dirMap), q = makeQuiz(c, s.deck, dir, S.all || (S.all = allCards())); s.q = q; q.answered = false; s.done = s.i;
    setHtml(topBar('Question <b>' + (s.i + 1) + '</b> of ' + s.total + ' \u00B7 \u2705 ' + s.right + (s.streak > 1 ? ' \u00B7 \uD83D\uDD25 ' + s.streak : '')) +
      '<div class="sy-q"><p class="hint">' + (dir === 'en2uz' ? 'What does this mean in Uzbek?' : 'Which English word or phrase is this?') + '</p><h2 class="dst-prompt">' + esc(q.prompt) + ' ' + (dir === 'en2uz' ? spk(c.en) : '') + '</h2><div class="sy-opts">' +
      q.options.map(function (o, i) { return '<button class="sy-opt" data-ans="' + i + '"><kbd>' + (i + 1) + '</kbd> ' + esc(o.t) + '</button>'; }).join('') + '</div><div id="dstFb"></div></div>', true);
  }
  function allCards() { return buildDeck(S.data, { from: S.data.units[0].n, to: S.data.units[S.data.units.length - 1].n, secs: S.data.secs }); }
  function quizAnswer(i) {
    var s = S.ses; if (!s || s.mode !== 'qz' || !s.q || s.q.answered) return; var q = s.q; q.answered = true; var ok = i === q.answer, c = q.card; rate(S.book, c, ok);
    if (ok) { s.right++; s.streak++; s.best = Math.max(s.best, s.streak); } else { s.wrong++; s.streak = 0; if (s.missed.indexOf(c) < 0) s.missed.push(c); }
    Array.prototype.forEach.call(document.querySelectorAll('.sy-opt'), function (b, k) { b.disabled = true; if (k === q.answer) b.classList.add(ok ? 'ok' : 'miss'); if (k === i && !ok) b.classList.add('bad'); });
    $('dstFb').innerHTML = '<div class="sy-fb ' + (ok ? 'good' : 'wrong') + '"><h3>' + (ok ? '\u2705 Correct!' : '\u274C Not quite') + '</h3><p style="margin:4px 0"><b>' + esc(c.en) + '</b> = ' + esc(c.uz) + '</p>' + exampleHtml(c, true) + repBtn(c) + '</div><div class="sy-next"><button class="wc-btn" data-act="qnext">' + (s.i + 1 >= s.total ? 'See my result' : 'Next \u2192') + '</button></div>';
  }
  function quizDone() { var s = S.ses; setHtml('<div class="sy-q sy-res"><div class="big">' + pct(s.right, s.total) + '%</div><p class="hint">' + s.right + ' of ' + s.total + ' correct \u00B7 best streak ' + s.best + '</p><div class="sy-next" style="justify-content:center"><button class="wc-btn" data-act="again-round">Play again</button>' + (s.missed.length ? '<button class="wc-btn ghost" data-act="missed-round">Practise the ' + s.missed.length + ' missed</button>' : '') + '<button class="wc-btn ghost" data-act="home">Back</button></div></div>' + (s.missed.length ? '<div class="sy-sub">Review</div><div class="dst-list">' + s.missed.map(rowHtml).join('') + '</div>' : '')); }

  /* match pairs */
  function matchBoard() {
    var s = S.ses; if (s.board >= s.boards) return matchDone(); var cards = makeMatch(s.deck, 6); if (cards.length < 3) return matchDone();
    s.m = { cards: cards, left: shuffle(cards.map(function (_, i) { return i; })), right: shuffle(cards.map(function (_, i) { return i; })), picked: null, done: [], wrong: 0 }; s.done = s.board; s.total = s.boards;
    var uzFirst = S.pref.dir === 'uz2en' || (S.pref.dir === 'mixed' && rng() < 0.5); s.m.uzFirst = uzFirst;
    setHtml(topBar('Board <b>' + (s.board + 1) + '</b> of ' + s.boards + ' \u00B7 mistakes ' + s.wrong) + '<div class="sy-q"><h2>Match the pairs</h2><p class="hint">Tap a word on the left, then its meaning on the right.</p><div class="sy-pairs"><div class="col">' +
      s.m.left.map(function (i) { return '<button class="sy-opt" data-ml="' + i + '">' + esc(uzFirst ? cards[i].uz : cards[i].en) + '</button>'; }).join('') + '</div><div class="col">' + s.m.right.map(function (i) { return '<button class="sy-opt" data-mr="' + i + '">' + esc(uzFirst ? cards[i].en : cards[i].uz) + '</button>'; }).join('') + '</div></div><div id="dstFb"></div></div>', true);
  }
  function matchTap(side, i) {
    var s = S.ses; if (!s || s.mode !== 'mt' || !s.m) return; var m = s.m, find = function (a, v) { return document.querySelector('[' + a + '="' + v + '"]'); };
    if (side === 'l') { if (m.done.indexOf(i) >= 0) return; m.picked = i; Array.prototype.forEach.call(document.querySelectorAll('[data-ml]'), function (b) { b.classList.remove('sel'); }); find('data-ml', i).classList.add('sel'); return; }
    if (m.picked === null || m.done.indexOf(i) >= 0) return; var l = m.picked, lb = find('data-ml', l), rb = find('data-mr', i);
    if (l === i) { m.done.push(l); lb.classList.remove('sel'); lb.classList.add('done'); rb.classList.add('done'); lb.disabled = rb.disabled = true; m.picked = null; rate(S.book, m.cards[l], m.wrong === 0);
      if (m.done.length === m.cards.length) { s.right += m.wrong === 0 ? 1 : 0; $('dstFb').innerHTML = '<div class="sy-fb ' + (m.wrong ? 'wrong' : 'good') + '"><h3>' + (m.wrong ? 'Done with ' + m.wrong + ' mistake' + (m.wrong === 1 ? '' : 's') : '\u2705 Perfect board!') + '</h3></div><div class="sy-next"><button class="wc-btn" data-act="mnext">' + (s.board + 1 >= s.boards ? 'Finish' : 'Next board \u2192') + '</button></div>'; } }
    else { m.wrong++; s.wrong++; rate(S.book, m.cards[l], false); rb.classList.add('shake', 'bad'); lb.classList.remove('sel'); m.picked = null; setTimeout(function () { rb.classList.remove('shake', 'bad'); }, 450); }
  }
  function matchDone() { var s = S.ses; setHtml('<div class="sy-q sy-res"><div class="big">' + s.right + '/' + s.boards + '</div><p class="hint">perfect boards \u00B7 ' + s.wrong + ' mistakes in total</p><div class="sy-next" style="justify-content:center"><button class="wc-btn" data-act="again-round">Play again</button><button class="wc-btn ghost" data-act="home">Back</button></div></div>'); }

  /* spelling */
  function spellQ() {
    var s = S.ses; if (!s.queue.length) return spellDone(); var c = s.queue[0]; s.cur = { c: c, hint: 0, tries: 0 }; s.done = s.total - s.queue.length;
    var mask = maskExample(c), shape = c.en.split(/\s+/).map(function (w) { return w.replace(/[A-Za-z]/g, '_ ').trim(); }).join('   ');
    setHtml(topBar('Word <b>' + (s.done + 1) + '</b> of ' + s.total + ' \u00B7 \u2705 ' + s.right) + '<div class="sy-q"><p class="hint">Type the English word or phrase for:</p><h2 class="dst-prompt">' + esc(c.uz) + '</h2>' + (mask ? '<div class="dst-ex"><div>' + esc(mask) + '</div></div>' : '') +
      '<div class="dst-shape" id="dstShape" aria-hidden="true">' + esc(shape) + '</div><div class="dst-row"><input id="dstType" class="wc-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Type here\u2026" aria-label="Your answer"><button class="wc-btn" data-act="scheck">Check</button></div>' +
      '<div class="sy-next"><button class="sy-chip" data-act="shint">\uD83D\uDCA1 Hint</button><button class="sy-chip" data-act="sshow">Show answer</button></div><div id="dstFb"></div></div>', true);
    var inp = $('dstType'); if (inp) inp.focus();
  }
  function spellCheck() {
    var s = S.ses; if (!s || !s.cur || s.cur.done) return; var inp = $('dstType'), c = s.cur.c; if (!inp || !inp.value.trim()) return;
    if (sameAnswer(inp.value, c)) { s.cur.done = true; var first = s.cur.tries === 0 && !s.cur.hint; rate(S.book, c, first); if (first) s.right++; else s.wrong++; spellReveal(true, first); }
    else { s.cur.tries++; inp.classList.add('dst-bad'); setTimeout(function () { inp.classList.remove('dst-bad'); }, 500); $('dstFb').innerHTML = '<div class="sy-fb wrong"><h3>Not quite. Try again, use a hint, or show the answer.</h3></div>'; }
  }
  function spellReveal(ok, first) { var s = S.ses, c = s.cur.c; s.queue.shift(); if (!ok) { s.wrong++; rate(S.book, c, false); if (s.missed.indexOf(c) < 0) s.missed.push(c); } s.cur.done = true; $('dstFb').innerHTML = '<div class="sy-fb ' + (ok ? 'good' : 'wrong') + '"><h3>' + (ok ? (first ? '\u2705 Correct!' : '\u2705 Correct (with help)') : 'The answer:') + ' <b>' + esc(c.en) + '</b> ' + spk(c.en) + '</h3>' + exampleHtml(c, true) + '</div><div class="sy-next"><button class="wc-btn" data-act="snext">' + (s.queue.length ? 'Next \u2192' : 'See my result') + '</button></div>'; var inp = $('dstType'); if (inp) inp.disabled = true; }
  function spellHint() { var s = S.ses; if (!s || !s.cur || s.cur.done) return; s.cur.hint++; var c = s.cur.c, k = Math.min(s.cur.hint, c.en.length), shown = c.en.slice(0, k); $('dstShape').textContent = shown + c.en.slice(k).replace(/[A-Za-z]/g, ' _').replace(/ {2,}/g, ' '); var inp = $('dstType'); if (inp) inp.focus(); }
  function spellDone() { var s = S.ses; setHtml('<div class="sy-q sy-res"><div class="big">' + pct(s.right, s.total) + '%</div><p class="hint">' + s.right + ' of ' + s.total + ' spelled correctly first time</p><div class="sy-next" style="justify-content:center"><button class="wc-btn" data-act="again-round">Play again</button><button class="wc-btn ghost" data-act="home">Back</button></div></div>'); }

  /* list + cover */
  function rowHtml(c) { return '<div class="dst-item"><div class="dst-l"><b>' + esc(c.en) + '</b> ' + spk(c.en) + '<small>' + esc(c.sec) + ' \u00B7 Unit ' + c.unit + '</small></div><div class="dst-r">' + esc(c.uz) + '</div>' + '<div class="dst-repi">' + repBtn(c) + '</div>' + (c.ex ? '<div class="dst-ex2">' + esc(c.ex) + (c.exuz ? '<span> \u2014 ' + esc(c.exuz) + '</span>' : '') + '</div>' : '') + '</div>'; }
  function listView(q, hide, limit) {
    var s = S.ses; s.listHide = hide; s.listQ = q; s.listLimit = limit || 60; var nq = norm(q), cards = s.deck.filter(function (c) { return !nq || norm(c.en).indexOf(nq) >= 0 || norm(c.uz).indexOf(nq) >= 0; });
    setHtml('<div class="sy-top" style="margin-bottom:10px"><button class="sy-chip" data-act="home">\u2190 Back</button><span><b>' + cards.length + '</b> cards</span></div><div class="dst-row"><input id="dstSearch" class="wc-input" type="search" placeholder="Search English or Uzbek\u2026" value="' + esc(q) + '" autocomplete="off" aria-label="Search"></div>' +
      '<div class="dst-seg" role="group" style="margin:10px 0 14px"><button class="dst-segb' + (hide === 'none' ? ' on' : '') + '" data-lh="none">Show both</button><button class="dst-segb' + (hide === 'uz' ? ' on' : '') + '" data-lh="uz">Hide Uzbek</button><button class="dst-segb' + (hide === 'en' ? ' on' : '') + '" data-lh="en">Hide English</button></div>' +
      '<div class="dst-list dst-hide-' + hide + '">' + (cards.slice(0, s.listLimit).map(rowHtml).join('') || '<div class="wc-empty">Nothing found.</div>') + '</div>' + (cards.length > s.listLimit ? '<div class="sy-next"><button class="wc-btn ghost" data-act="lmore">Show more (' + (cards.length - s.listLimit) + ' left)</button></div>' : ''), true);
    var inp = $('dstSearch'); if (inp && q) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
  }

  /* ---------- events ---------- */
  function onClick(e) {
    var t = e.target.closest('button'); if (!t || !root() || !root().contains(t)) return;
    if (t.hasAttribute('data-rep')) { report(t); e.stopPropagation(); return; }
    if (t.hasAttribute('data-say')) { speak(t.getAttribute('data-say')); e.stopPropagation(); return; }
    if (t.hasAttribute('data-bk')) return selectBook(t.getAttribute('data-bk'));
    if (t.hasAttribute('data-set')) { S.pref[t.getAttribute('data-set')] = t.getAttribute('data-v'); setPref(S.book, S.pref); return home(); }
    if (t.hasAttribute('data-sec')) { var sc = t.getAttribute('data-sec'), i = S.pref.secs.indexOf(sc); if (i >= 0) { if (S.pref.secs.length > 1) S.pref.secs.splice(i, 1); } else S.pref.secs.push(sc); setPref(S.book, S.pref); return home(); }
    if (t.hasAttribute('data-md')) return startSession(t.getAttribute('data-md'));
    if (t.hasAttribute('data-ans')) return quizAnswer(Number(t.getAttribute('data-ans')));
    if (t.hasAttribute('data-ml')) return matchTap('l', Number(t.getAttribute('data-ml')));
    if (t.hasAttribute('data-mr')) return matchTap('r', Number(t.getAttribute('data-mr')));
    if (t.hasAttribute('data-lh')) return listView(S.ses.listQ || '', t.getAttribute('data-lh'), S.ses.listLimit);
    var a = t.getAttribute('data-act'), s = S.ses;
    if (a === 'flip') return fcFlip();
    if (a === 'know') return fcRate(true);
    if (a === 'again') return fcRate(false);
    if (a === 'qnext') { s.i++; return quizQ(); }
    if (a === 'mnext') { s.board++; return matchBoard(); }
    if (a === 'scheck') return spellCheck();
    if (a === 'shint') return spellHint();
    if (a === 'sshow') { if (s && s.cur && !s.cur.done) { s.cur.done = true; spellReveal(false); } return; }
    if (a === 'snext') { s.cur = null; return spellQ(); }
    if (a === 'allunits') { S.pref.from = S.data.units[0].n; S.pref.to = S.data.units[S.data.units.length - 1].n; setPref(S.book, S.pref); return home(); }
    if (a === 'lmore') return listView(s.listQ, s.listHide, s.listLimit + 60);
    if (a === 'quit') { if (window.confirm('Leave this round? Your progress so far is saved.')) home(); return; }
    if (a === 'home') return home();
    if (a === 'again-round') return startSession(s.mode);
    if (a === 'missed-round') { var m = s.missed.slice(), mode = s.mode, deck = s.deck; S.ses = { mode: mode, deck: deck, cards: m, i: 0, dirMap: {}, right: 0, wrong: 0, missed: [], queue: m.slice(), flipped: false, streak: 0, best: 0, total: m.length }; return mode === 'qz' ? quizQ() : fcShow(); }
  }
  function onChange(e) {
    var el = e.target; if (!el.hasAttribute || !el.hasAttribute('data-sel') || !S.pref) return; var k = el.getAttribute('data-sel');
    if (k === 'from' || k === 'to') { S.pref[k] = Number(el.value); if (S.pref.from > S.pref.to) { if (k === 'from') S.pref.to = S.pref.from; else S.pref.from = S.pref.to; } }
    else if (k === 'size') S.pref.size = el.value === 'all' ? 'all' : Number(el.value); else if (k === 'order') S.pref.order = el.value;
    setPref(S.book, S.pref); home();
  }
  function onInput(e) { if (e.target.id === 'dstSearch' && S.ses && S.ses.mode === 'ls') listView(e.target.value, S.ses.listHide, 60); }
  function onKey(e) {
    var v = document.body.getAttribute('data-view'); if (v !== 'destination' || !S.ses) return; var tag = (e.target.tagName || '').toLowerCase(), s = S.ses;
    if (s.mode === 'fc' && tag !== 'input') { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fcFlip(); } else if (e.key === '1') fcRate(false); else if (e.key === '2') fcRate(true); }
    else if (s.mode === 'qz' && /^[1-4]$/.test(e.key) && tag !== 'input') quizAnswer(Number(e.key) - 1);
    else if (s.mode === 'qz' && e.key === 'Enter' && s.q && s.q.answered) { s.i++; quizQ(); }
    else if (s.mode === 'sp' && e.key === 'Enter') { if (s.cur && s.cur.done) { s.cur = null; spellQ(); } else spellCheck(); }
  }
  function init() {
    var r = root(); if (!r || r.getAttribute('data-ready')) return; r.setAttribute('data-ready', '1');
    r.addEventListener('click', onClick); r.addEventListener('change', onChange); r.addEventListener('input', onInput); document.addEventListener('keydown', onKey);
    var last = load().last; selectBook(BOOKS.some(function (b) { return b[0] === last; }) ? last : 'a1');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (document.body.getAttribute('data-view') === 'destination') init(); }); else if (document.body.getAttribute('data-view') === 'destination') init();
  new MutationObserver(function () { if (document.body.getAttribute('data-view') === 'destination') init(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  window.TJDest = { buildDeck: buildDeck, makeQuiz: makeQuiz, makeMatch: makeMatch, spellable: spellable, sameAnswer: sameAnswer, usNorm: usNorm, maskExample: maskExample, norm: norm, setRng: function (f) { rng = f || Math.random; }, state: function () { return S; }, selectBook: selectBook, loadBook: loadBook, init: init };
})();
