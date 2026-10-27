/* ============================================================================
   PIK//NEXUS — think-panel.js
   The "limited thinking space" controller:
     - inline panels stay height-capped (CSS clamp) with a fade mask
     - clicking any thinking panel opens the FULL reasoning trace in the
       thinkmodal overlay ([data-nx='thinkmodal']) with live streaming,
       word count, copy-all and Esc/backdrop close
     - also exposes PIKThinkPanel.capture(msgNode) so chat.js can register
       each message's raw reasoning for the modal
   ========================================================================= */
(function (global) {
  "use strict";

  var current = null;      // { text, model, engine, effort }
  var liveEl = null;       // body element while streaming
  var open = false;

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var Panel = {
    mount: function () {
      var modal = $("[data-nx='thinkmodal']");
      if (!modal) return;
      var self = this;

      $("[data-nx='thinkmodal-close']").addEventListener("click", function () { self.hide(); });
      modal.addEventListener("click", function (e) {
        if (e.target === modal) self.hide();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && open) self.hide();
      });
      $("[data-nx='thinkmodal-copy']").addEventListener("click", function () {
        var txt = current && typeof current.getText === "function"
          ? current.getText() : ((current && current.text) || "");
        var done = function () {
          if (window.PIKToasts) PIKToasts.show({ type: "success", title: "Reasoning copied", text: txt.length + " chars" });
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(done, done);
        } else done();
      });

      /* delegated click: any collapsed inline think body or its bar opens the modal */
      document.addEventListener("click", function (e) {
        var panel = e.target.closest(".nx-think");
        if (!panel) return;
        /* ignore clicks on interactive bits inside the modal itself */
        if (e.target.closest(".nx-thinkmodal")) return;
        var node = panel.__think || null;
        if (node) self.open(node);
      });
    },

    /* register a message's thinking data on its DOM node */
    bind: function (thinkEl, meta) {
      thinkEl.__think = meta; // { getText(), model, engine, effort }
    },

    open: function (meta) {
      var modal = $("[data-nx='thinkmodal']");
      if (!modal || !meta) return;
      current = meta;
      open = true;
      modal.hidden = false;
      requestAnimationFrame(function () { modal.classList.add("is-open"); });
      var body = $("[data-nx='thinkmodal-body']");
      liveEl = body;
      this.refresh();
      var mEl = $("[data-nx='thinkmodal-meta']");
      if (mEl) mEl.textContent = (meta.model || "") + (meta.engine ? " · " + meta.engine : "") +
        (meta.effort ? " · effort " + meta.effort : "");
      document.dispatchEvent(new CustomEvent("pik:thinkopen"));
    },

    hide: function () {
      var modal = $("[data-nx='thinkmodal']");
      if (!modal) return;
      open = false; liveEl = null;
      modal.classList.remove("is-open");
      setTimeout(function () { if (!open) modal.hidden = true; }, 260);
    },

    isOpen: function () { return open; },

    /* repaint modal body from the live source (call on rAF while streaming) */
    refresh: function () {
      if (!open || !liveEl || !current) return;
      var txt = typeof current.getText === "function" ? current.getText() : (current.text || "");
      if (global.PIKStream) {
        PIKStream.render(liveEl, txt || "(no reasoning tokens received from this engine yet)");
      } else {
        liveEl.innerHTML = "<p>" + esc(txt) + "</p>";
      }
      var cEl = $("[data-nx='thinkmodal-count']");
      if (cEl) cEl.textContent = txt.length.toLocaleString() + " chars · ~" +
        Math.round(txt.length / 4).toLocaleString() + " tok";
    },

    tick: function () { this.refresh(); }
  };

  document.addEventListener("DOMContentLoaded", function () { Panel.mount(); });
  global.PIKThinkPanel = Panel;
})(window);
