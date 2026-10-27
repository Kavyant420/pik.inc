/* ============================================================================
   PIK//NEXUS — hosting-ui.js
   The Host tab inside the bottom pane: lists every Nexus Pages deployment
   (multi-tenant), with per-row open / copy-url / redeploy / delete actions,
   a live count, and the "pikinc.vercel.app/nexus.html/<project>" URL scheme.
   Talks to PIKHosting (IndexedDB backend) + PIKHostingSecurity (keyless
   Cloudflare-style hardening summary).
   ========================================================================= */
(function (global) {
  "use strict";

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return "—";
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }

  function ago(ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return Math.round(s) + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return (s / 3600).toFixed(1) + "h ago";
    return new Date(ts).toLocaleDateString();
  }

  var UI = {
    _timer: 0,

    init: function () {
      var self = this;
      var deployBtn = $("[data-nx='host-deploy']");
      if (deployBtn) deployBtn.addEventListener("click", function () { self.deploy(); });
      this.refresh();
      /* gentle refresh while the host tab is visible */
      clearInterval(this._timer);
      this._timer = setInterval(function () {
        var view = document.querySelector("[data-pane-view='host']");
        if (view && !view.hidden) self.refresh();
      }, 15000);
      document.addEventListener("pik:deployed", function () { self.refresh(); });
    },

    urlFor: function (project) {
      var origin = location.origin || "https://pikinc.vercel.app";
      return origin + "/nexus.html/" + encodeURIComponent(project) + "/";
    },

    async deploy() {
      if (!global.PIKHosting) return;
      var btn = $("[data-nx='host-deploy']");
      if (btn) { btn.classList.add("is-busy"); btn.textContent = "Deploying…"; }
      try {
        var res = await PIKHosting.deployCurrent();
        if (window.PIKToasts) PIKToasts.show({
          type: res && res.url ? "success" : "warn",
          title: res && res.url ? "Deployed to Nexus Pages" : "Nothing to deploy",
          text: res && res.url ? res.url : "Add an index.html first — ask NEXUS to build one."
        });
        if (res && res.url && global.PIKNexusPane) {
          PIKNexusPane.print("deployed → " + res.url + "  (rev " + String(res.digest || "").slice(0, 10) + ")");
        }
      } catch (e) {
        if (window.PIKToasts) PIKToasts.show({ type: "error", title: "Deploy failed", text: String(e.message || e).slice(0, 140) });
      } finally {
        if (btn) { btn.classList.remove("is-busy"); btn.textContent = "Deploy current project"; }
        this.refresh();
      }
    },

    refresh: async function () {
      var list = $("[data-nx='host-list']");
      var count = $("[data-nx='host-count']");
      if (!list || !global.PIKHosting) return;
      var rows = [];
      try { rows = await PIKHosting.list(); } catch (e) {}
      if (count) count.textContent = rows.length + " deployment" + (rows.length === 1 ? "" : "s");

      if (!rows.length) {
        list.innerHTML = '<div class="nx-host__empty">' +
          "<b>No deployments yet</b><span>Press “Deploy current project” — every project gets its own slot under " +
          "nexus.html/&lt;project&gt;/ and the backend serves many projects at once.</span></div>";
        return;
      }

      list.innerHTML = rows.map(function (r, i) {
        var url = r.url || UI.urlFor(r.project);
        return '<div class="nx-hrow fx-spot" data-i="' + i + '" style="animation-delay:' + (i * 45) + 'ms">' +
          '<div class="nx-hrow__id">' +
            '<b>' + esc(r.project) + "</b>" +
            '<span class="nx-hrow__url">' + esc(url.replace(/^https?:\/\//, "")) + "</span>" +
          "</div>" +
          '<div class="nx-hrow__meta">' +
            '<span class="nx-hbadge">sha ' + esc(String(r.digest || "").slice(0, 8)) + "</span>" +
            "<span>" + fmtBytes(r.bytes) + "</span>" +
            "<span>" + ago(r.ts || Date.now()) + "</span>" +
            '<span class="nx-hbadge nx-hbadge--sec" title="edge WAF · bot filter · rate limiting · CSP injected — all keyless">protected</span>' +
          "</div>" +
          '<div class="nx-hrow__acts">' +
            '<button class="nx-ibtn nx-ibtn--sm" data-act="open" title="Open hosted site"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg></button>' +
            '<button class="nx-ibtn nx-ibtn--sm" data-act="copy" title="Copy URL"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button>' +
            '<button class="nx-ibtn nx-ibtn--sm" data-act="redeploy" title="Redeploy latest workspace"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6"/></svg></button>' +
            '<button class="nx-ibtn nx-ibtn--sm nx-ibtn--danger" data-act="del" title="Delete deployment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14"/></svg></button>' +
          "</div></div>";
      }).join("");

      var self = this;
      Array.prototype.forEach.call(list.querySelectorAll(".nx-hrow"), function (row) {
        var r = rows[+row.dataset.i];
        row.addEventListener("click", async function (e) {
          var act = e.target.closest("[data-act]");
          if (!act) return;
          var url = r.url || self.urlFor(r.project);
          if (act.dataset.act === "open") {
            if (global.PIKHosting && global.PIKHosting.open) PIKHosting.open(r.project);
            else window.open(url, "_blank", "noopener");
          } else if (act.dataset.act === "copy") {
            if (navigator.clipboard) navigator.clipboard.writeText(url);
            if (window.PIKToasts) PIKToasts.show({ type: "info", title: "URL copied", text: url });
          } else if (act.dataset.act === "redeploy") {
            await self.deploy();
          } else if (act.dataset.act === "del") {
            try {
              await PIKHosting.remove(r.project);
              if (window.PIKToasts) PIKToasts.show({ type: "warn", title: "Deployment removed", text: r.project });
            } catch (err) {}
            self.refresh();
          }
        });
      });
    }
  };

  document.addEventListener("DOMContentLoaded", function () { UI.init(); });
  global.PIKHostingUI = UI;
})(window);
