/* ============================================================================
   PIK//NEXUS — nexus-picker.js
   Model selection overlay: live :free catalog from OpenRouter ordered by
   context high->low (the exact view the user asked for), provider logos via
   CDN, search, keyboard nav, and the suggested Qwen 3.8 27B pinned.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function fmtCtx(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 2 : 0) + "M";
    if (n >= 1000) return Math.round(n / 1000) + "K";
    return n;
  }

  var Picker = {
    els: { chip: null, overlay: null, openBtn: null, search: null, list: null },
    list: [],
    selIdx: -1,
    open: false,

    mount: function (refs) {
      this.els = refs;
      var self = this;

      refs.openBtn.addEventListener("click", function () { self.show(); });
      refs.overlay.addEventListener("click", function (e) {
        if (e.target === refs.overlay) self.hide();
      });
      refs.search.addEventListener("input", function () { self.selIdx = -1; self._render(self._filtered()); });
      document.addEventListener("keydown", function (e) {
        if (!self.open) {
          if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); self.show(); }
          return;
        }
        if (e.key === "Escape") self.hide();
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          self.selIdx = Math.max(0, Math.min(self.list.length - 1, self.selIdx + (e.key === "ArrowDown" ? 1 : -1)));
          self._highlight();
        }
        if (e.key === "Enter" && self.selIdx >= 0 && self.list[self.selIdx]) self.pick(self.list[self.selIdx].id);
      });

      /* catalog updates -> re-render if open, always refresh chip */
      PIKModels.onChange(function () { self._render(self._filtered()); self._syncChip(); });

      /* suggested model as initial selection */
      this.setSelected(CFG.SUGGESTED_MODEL, true);
      this._syncChip();
    },

    _filtered: function () {
      var q = this.els.search.value.trim();
      return PIKModels.search(q);
    },

    show: function () {
      this.open = true;
      this.els.overlay.classList.add("is-open");
      this.els.search.value = "";
      this._render(this._filtered());
      var searchEl = this.els.search;
      setTimeout(function () { try { searchEl.focus(); } catch (e) {} }, 80);
      if (PIKModels.status !== "ready") PIKModels.load();
    },
    hide: function () { this.open = false; this.els.overlay.classList.remove("is-open"); },

    _render: function (models) {
      var self = this;
      this.list = models || [];
      var wrap = this.els.list;
      if (PIKModels.status === "loading" && !this.list.length) {
        wrap.innerHTML = '<div class="nx-skel"></div><div class="nx-skel"></div><div class="nx-skel"></div>';
        return;
      }
      if (!this.list.length) { wrap.innerHTML = '<p style="color:var(--nx-txt-faint);text-align:center;padding:30px">no match</p>'; return; }

      wrap.innerHTML = this.list.slice(0, 80).map(function (m, i) {
        var badges = ['<span class="nx-badge nx-badge--ctx">' + fmtCtx(m.ctx) + " ctx</span>"];
        if (m.reasoning) badges.push('<span class="nx-badge nx-badge--think">reasoning' +
          (m.efforts && m.efforts.indexOf("max") !== -1 ? " · MAX" : "") + "</span>");
        if (m.vision) badges.push('<span class="nx-badge">vision</span>');
        if (m.video) badges.push('<span class="nx-badge">video</span>');
        if (m.tools) badges.push('<span class="nx-badge">tools</span>');
        if (m.suggested) badges.unshift('<span class="nx-badge nx-badge--sug">SUGGESTED</span>');
        var logo = m.logo || PIKModels.faviconUrl(m.provider) ||
          (CFG.LOGO_FAVICON + encodeURIComponent(m.provider + ".com") + "&sz=64");
        return '<div class="nx-mrow fx-tilt' + (m.suggested ? " is-suggested" : "") +
          (m.id === self.currentId() ? " is-selected" : "") + '" data-id="' + esc(m.id) + '" data-i="' + i + '">' +
          '<div class="nx-mrow__logo"><img src="' + esc(logo) + '" alt="' + esc(m.provider) + ' logo" loading="lazy" ' +
            'onerror="this.src=\'' + esc(PIKModels.faviconUrl(m.provider) || "") + '\'"></div>' +
          '<div><div class="nx-mrow__name">' + esc(m.name) + '</div>' +
          '<div class="nx-mrow__id">' + esc(m.id) + '</div>' +
          '<div class="nx-mrow__badges">' + badges.join("") + "</div></div>" +
          '<div class="nx-mrow__cta">' + fmtCtx(m.ctx) + ' tok<br><span class="arrow">select &rarr;</span></div>' +
          "</div>";
      }).join("");

      wrap.querySelectorAll(".nx-mrow").forEach(function (row) {
        row.addEventListener("click", function () { self.pick(row.dataset.id); });
      });
      this.selIdx = this.list.findIndex ? this.list.findIndex(function (m) { return m.id === self.currentId(); }) : -1;
    },

    _highlight: function () {
      var rows = this.els.list.querySelectorAll(".nx-mrow");
      for (var i = 0; i < rows.length; i++) {
        rows[i].classList.toggle("is-kbd", i === this.selIdx);
      }
      if (rows[this.selIdx]) rows[this.selIdx].scrollIntoView({ block: "nearest" });
    },

    getSelected: function () { return this.currentId(); },
    /* hardened: micro-bootstrap.bindUI may call this before mount() has run,
       when els.chip is still undefined — never touch dataset blindly. */
    currentId: function () {
      try {
        var id = (this.els && this.els.chip && this.els.chip.dataset) ? this.els.chip.dataset.model : null;
        return id || CFG.SUGGESTED_MODEL;
      } catch (e) { return CFG.SUGGESTED_MODEL; }
    },

    setSelected: function (id, silent) {
      this.els.chip.dataset.model = id;
      if (!silent) NexusSettings.patch({ model: id });
      this._syncChip();
    },

    pick: function (id) {
      this.setSelected(id);
      this.hide();
      if (window.PIKToasts) PIKToasts.show({ type: "info", title: "Model armed", text: id });
    },

    _syncChip: function () {
      var m = PIKModels.get(this.currentId());
      var name = m ? m.name.split("(")[0].trim() : this.currentId().split("/").pop();
      var logo = m && (m.logo || PIKModels.faviconUrl(m.provider));
      this.els.chip.innerHTML =
        (logo ? '<img src="' + esc(logo) + '" alt="" ' +
          'onerror="this.onerror=null;this.src=\'' + esc(CFG.LOGO_FAVICON + "openrouter.ai&sz=64") + '\'">' : "") +
        "<span>" + esc(name) + "</span>" +
        (m && m.local ? '<span class="nx-chip--local"></span>' : "") +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>';
      document.dispatchEvent(new CustomEvent("pik:model", { detail: this.currentId() }));
    }
  };

  global.PIKPicker = Picker;
})(window);
