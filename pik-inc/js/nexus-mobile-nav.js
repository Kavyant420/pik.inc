/* ============================================================================
   PIK//NEXUS — nexus-mobile-nav.js   (NEW file — mobile view switcher)
   Drives the brand-new bottom tab bar in nexus-mobile.html. It never edits
   the desktop modules; it only *calls* their existing public APIs:

     chat      -> closes every sheet, shows the thread + prompt well
     files     -> opens .nx-rail (workspace tree + GitHub panel)
     ide       -> opens [data-nx='dock'] via PIKNexus._setDockOpen(true)
     terminal  -> dock open + PIKNexusPane.showTab('term')
     preview   -> dock open + PIKNexusPane.showTab('preview')
     host      -> dock open + PIKNexusPane.showTab('host')

   Everything degrades gracefully if a core module is unavailable.
   ========================================================================= */
(function (global) {
  "use strict";

  function $(sel) { return document.querySelector(sel); }

  var VIEW_KEY = "pik.nexus.mobile.view";
  var current = "chat";

  function isMobile() {
    return !!(global.PIKNexusMobile && global.PIKNexusMobile.isMobile());
  }

  /* ---------- small helpers over the untouched core controllers ---------- */
  function setDock(open) {
    var nx = global.PIKNexus;
    if (nx && typeof nx._setDockOpen === "function") {
      // let the real controller own the state (it persists + animates)
      if (!!open !== !!nx.dockState.open) nx._setDockOpen(!!open);
      else if (open) nx._applyDock && nx._applyDock(true);
    } else {
      var d = $("[data-nx='dock']");
      if (d) d.classList.toggle("is-open", !!open);
    }
  }

  function setRail(open) {
    var rail = $(".nx-rail");
    if (rail) rail.classList.toggle("is-open", !!open);
  }

  function showPaneTab(name) {
    var pane = global.PIKNexusPane;
    if (pane && typeof pane.showTab === "function") {
      if (pane.hidden && typeof pane.show === "function") pane.show();
      pane.showTab(name);
    }
  }

  /* ---------- view router ---------- */
  function go(view) {
    current = view;
    try { localStorage.setItem(VIEW_KEY, view); } catch (e) {}

    if (!isMobile()) return;

    switch (view) {
      case "chat":
        setRail(false);
        setDock(false);
        break;
      case "files":
        setDock(false);
        setRail(true);
        break;
      case "ide":
        setRail(false);
        setDock(true);
        break;
      case "terminal":
        setRail(false);
        setDock(true);
        showPaneTab("term");
        focusTerm();
        break;
      case "preview":
        setRail(false);
        setDock(true);
        showPaneTab("preview");
        break;
      case "host":
        setRail(false);
        setDock(true);
        showPaneTab("host");
        break;
    }

    paintTabs();
    if (global.PIKNexusMobile) global.PIKNexusMobile.syncScrim();
  }

  function focusTerm() {
    // gentle nudge: tapping "Term" implies you want to type. Only on phones,
    // and never auto-focus on narrow desktop windows (keyboard would pop there).
    if (global.matchMedia && global.matchMedia("(pointer: coarse)").matches) {
      var input = $("[data-nx='term-input']");
      if (input) setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) {} }, 350);
    }
  }

  function paintTabs() {
    var tabs = document.querySelectorAll("[data-nxmobile='view']");
    Array.prototype.forEach.call(tabs, function (t) {
      t.classList.toggle("is-on", t.dataset.view === current);
    });
  }

  /* ---------- boot ---------- */
  function init() {
    var nav = $("[data-nxmobile='nav']");
    if (!nav) return;

    nav.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-nxmobile='view']");
      if (!btn) return;
      go(btn.dataset.view);
      // re-tapping the active tab returns to its top anchor
      if (current === "chat") {
        var th = $("[data-nx='thread']");
        if (th) th.scrollTop = th.scrollHeight;
      }
    });

    // restore last view (persisted per device)
    try {
      var saved = localStorage.getItem(VIEW_KEY);
      if (saved) current = saved;
    } catch (e) {}
    paintTabs();

    // apply the saved view once the core app has finished booting
    setTimeout(function () { if (isMobile()) go(current); }, 1100);

    // the topbar IDE toggle should keep the nav bar highlight honest
    var toggle = $("[data-nx='dock-toggle']");
    if (toggle) {
      toggle.addEventListener("click", function () {
        setTimeout(function () {
          var d = $("[data-nx='dock']");
          var open = !!(d && d.classList.contains("is-open"));
          var next = open ? "ide" : "chat";
          current = next;
          paintTabs();
          try { localStorage.setItem(VIEW_KEY, next); } catch (e) {}
        }, 60);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.PIKNexusMobileNav = { go: go, current: function () { return current; } };
})(window);
