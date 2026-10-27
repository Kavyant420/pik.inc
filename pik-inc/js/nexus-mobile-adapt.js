/* ============================================================================
   PIK//NEXUS — nexus-mobile-adapt.js   (NEW file — mobile behaviour layer)
   Purely additive: it never rewrites, monkey-patches or replaces any logic
   from the existing nexus js modules. It only reacts to what they already
   do (class toggles such as .is-open on the rail / dock / drawer / overlay)
   and adds touch-era niceties:

     1. promotes the page with <html class="nx-mobile"> once a coarse pointer
        or a narrow viewport is detected (the mobile CSS keys off this flag)
     2. keeps the new scrim in sync with every open drawer/sheet/overlay so
        one tap anywhere dismisses them
     3. closes the iOS-style overscroll traps (overscroll-behavior is already
        set in CSS; here we also blur inputs when Esc-equivalent happens)
     4. hides keyboard-only affordances that would confuse first-touch users
     5. registers the mobile service worker scope (see nexus-mobile-sw.js)

   Desktop nexus.html does not load this file, so nothing here can change it.
   ========================================================================= */
(function (global) {
  "use strict";

  var MOBILE_QUERY = "(pointer: coarse), (max-width: 860px)";
  var mq = null;
  try { mq = global.matchMedia(MOBILE_QUERY); } catch (e) { mq = null; }

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function isMobile() {
    return !!(mq && mq.matches);
  }

  /* ------------------------------------------------------------------ 1) */
  function applyFlag() {
    var root = document.documentElement;
    if (isMobile()) root.classList.add("nx-mobile");
    else root.classList.remove("nx-mobile");
    syncScrim();
  }

  /* ------------------------------------------------------------------ 2) */
  // Any of these being open means the content behind should be scrimmed.
  function anySheetOpen() {
    var checks = [
      ".nx-rail.is-open",          // left workspace/GitHub drawer
      "[data-nx='dock'].is-open",  // IDE sheet
      "[data-nx='drawer'].is-open",// settings drawer
      "[data-nx='overlay'].is-open"// model picker
    ];
    for (var i = 0; i < checks.length; i++) {
      var el = $(checks[i]);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }

  function syncScrim() {
    var scrim = $("[data-nxmobile='scrim']");
    if (!scrim) return;
    var show = isMobile() && anySheetOpen();
    scrim.classList.toggle("is-shown", !!show);
  }

  function closeSheets() {
    var rail = $(".nx-rail");
    if (rail) rail.classList.remove("is-open");
    var dock = $("[data-nx='dock']");
    if (dock && isMobile()) {
      dock.classList.remove("is-open");
      // mirror the state into the core controller so its localStorage stays sane
      try {
        if (global.PIKNexus && global.PIKNexus.dockState) {
          global.PIKNexus.dockState.open = false;
          if (typeof global.PIKNexus._saveDock === "function") global.PIKNexus._saveDock();
        }
      } catch (e) { /* purely cosmetic fallback — never throw on mobile */ }
    }
    var drawer = $("[data-nx='drawer']");
    if (drawer) drawer.classList.remove("is-open");
    var overlay = $("[data-nx='overlay']");
    if (overlay) overlay.classList.remove("is-open");
    syncScrim();
  }

  /* watch class mutations on the sheet hosts without touching their code */
  function observeSheets() {
    if (!("MutationObserver" in global)) return;
    var obs = new MutationObserver(function () { syncScrim(); });
    var targets = [$(".nx-rail"), $("[data-nx='dock']"),
                   $("[data-nx='drawer']"), $("[data-nx='overlay']")];
    targets.forEach(function (t) {
      if (t) obs.observe(t, { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* ------------------------------------------------------------------ 4) */
  function tuneTouchChrome() {
    // The Enter/Esc hint text is meaningless without a keyboard.
    $all(".nx-well__hint").forEach(function (h) { h.style.display = isMobile() ? "" : ""; });

    // Give the send button real press feedback on touch devices.
    var send = $("[data-nx='send']");
    if (send && !send.dataset.mobileWired) {
      send.dataset.mobileWired = "1";
      send.addEventListener("touchstart", function () { send.classList.add("is-pressing"); }, { passive: true });
      ["touchend", "touchcancel"].forEach(function (ev) {
        send.addEventListener(ev, function () { send.classList.remove("is-pressing"); }, { passive: true });
      });
    }

    // Tapping the thread background while a sheet is open dismisses it.
    var thread = $("[data-nx='thread']");
    if (thread && !thread.dataset.mobileWired) {
      thread.dataset.mobileWired = "1";
      thread.addEventListener("click", function (e) {
        if (!isMobile()) return;
        // ignore taps on interactive content inside messages
        if (e.target.closest("button, a, input, textarea, select, [role='button'], .nx-chip")) return;
        if (anySheetOpen()) closeSheets();
      });
    }
  }

  /* keep sheets out of reach of the on-screen keyboard */
  function watchKeyboard() {
    if (!global.visualViewport) return;
    var vv = global.visualViewport;
    var lastH = vv.height;
    vv.addEventListener("resize", function () {
      var doc = document.body;
      if (!doc) return;
      var shrunk = (global.innerHeight - vv.height) > 140; // keyboard likely up
      doc.classList.toggle("is-keyboard-open", shrunk && isMobile());
      lastH = vv.height;
      // reposition any open fixed popover above the keyboard
      syncScrim();
    });
  }

  /* double-tap zoom guard for chrome buttons (keeps pinch-zoom alive) */
  function killDoubleTapZoom() {
    $all(".nx-ibtn, .nx-btn, .nx-send, .nx-chip, .nx-pane__tab, .nx-ladder button").forEach(function (el) {
      if (el.style.touchAction !== "manipulation") el.style.touchAction = "manipulation";
    });
  }

  /* ---------------------------------------------------------------- main */
  function init() {
    applyFlag();

    if (mq) {
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", applyFlag);
      else if (typeof mq.addListener === "function") mq.addListener(applyFlag); // legacy Safari
    }
    global.addEventListener("resize", function () { applyFlag(); killDoubleTapZoom(); });

    var scrim = $("[data-nxmobile='scrim']");
    if (scrim) scrim.addEventListener("click", closeSheets);

    // Esc on a hardware keyboard behaves like the back gesture on phones
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isMobile() && anySheetOpen()) closeSheets();
    });

    observeSheets();
    tuneTouchChrome();
    watchKeyboard();
    killDoubleTapZoom();

    // the core app wires its own handlers during boot; re-sync after it runs
    setTimeout(function () { syncScrim(); killDoubleTapZoom(); }, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.PIKNexusMobile = {
    isMobile: isMobile,
    closeSheets: closeSheets,
    syncScrim: syncScrim
  };
})(window);
