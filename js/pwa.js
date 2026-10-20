/* Install-as-app helper: a polite one-time banner (after sign-in) + an "Install app" item in the account menu.
   Android/desktop Chrome: real install prompt. iPhone: how-to (Add to Home Screen). In-app browsers (Telegram...): open-in-browser hint. */
(function () {
  'use strict';
  var KEY = 'tj_pwa_snooze', deferred = null;
  var UA = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var inApp = /Telegram|Instagram|FBAN|FBAV|Line\/|; wv\)|WebView/i.test(UA);
  var standalone = function () { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; };
  var canInstall = function () { return !standalone() && (!!deferred || isIOS || inApp); };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function steps() {
    if (deferred) return 'Add it to your home screen for one-tap access, full-screen mode and faster loading.';
    if (inApp) return 'To install, open this page in <b>Chrome</b> or <b>Safari</b> (menu \u22EE \u2192 \u201COpen in browser\u201D), then tap Install.';
    if (isIOS) return 'On iPhone: tap the <b>Share</b> button in Safari, then <b>\u201CAdd to Home Screen\u201D</b>.';
    return 'Add it to your home screen for one-tap access.';
  }
  function body() { document.body.classList.toggle('tj-can-install', canInstall()); }

  function removeBanner() { var b = document.getElementById('tjInstallBanner'); if (b) b.remove(); }
  function showBanner() {
    if (document.getElementById('tjInstallBanner') || !canInstall()) return;
    var b = document.createElement('div'); b.id = 'tjInstallBanner'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Install app');
    b.innerHTML = '<svg class="ib-crown" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 34h32l2 6H6l2-6z" fill="#C9A227"/><path d="M6 12l8 9 10-15 10 15 8-9-4 22H10L6 12z" fill="#E9C46A"/></svg>' +
      '<div class="ib-txt"><b>Install Teacher Javlonbek</b><span>' + steps() + '</span></div>' +
      '<div class="ib-btns">' + (deferred ? '<button class="ib-go" data-install>Install</button>' : '') + '<button class="ib-no" data-install-later>' + (deferred ? 'Not now' : 'Got it') + '</button></div>';
    document.body.appendChild(b);
  }
  function snooze(days) { ls(KEY, String(Date.now() + days * 864e5)); removeBanner(); }
  async function install() {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; removeBanner(); body(); }
    else { showBanner(); var b = document.getElementById('tjInstallBanner'); if (b) b.classList.add('pulse'); }
  }
  function maybeAutoShow() {
    if (!canInstall()) return;
    var until = Number(ls(KEY) || 0); if (until && Date.now() < until) return;
    var TJ = window.TJ; if (!(TJ && TJ.getUser && TJ.getUser())) return;   // only after sign-in, never on the first visit
    showBanner();
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; body(); setTimeout(maybeAutoShow, 2500); });
  window.addEventListener('appinstalled', function () { deferred = null; removeBanner(); body(); ls(KEY, String(Date.now() + 3650 * 864e5)); });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-install]')) { e.preventDefault(); install(); }
    else if (e.target.closest('[data-install-later]')) snooze(14);
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
  body();
  // iOS / in-app browsers never fire beforeinstallprompt: offer the hint a few seconds after sign-in is known
  var tries = 0, iv = setInterval(function () { tries++; if (tries > 24 || standalone()) return clearInterval(iv); if (window.TJ && window.TJ.getUser && window.TJ.getUser()) { clearInterval(iv); if (!deferred) maybeAutoShow(); body(); } }, 2500);
  window.TJInstall = { canInstall: canInstall, install: install, _state: function () { return { deferred: !!deferred, isIOS: isIOS, inApp: inApp }; } };
})();
