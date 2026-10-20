/* ============================================================================
   PIK//NEXUS — nexus.js
   Boot orchestrator for the agentic workbench: wires the workspace tree,
   editor dock, chat loop, model picker, GitHub panel, settings drawer, FX
   layer and status bar together. No emojis anywhere; all imagery is CDN or
   inline SVG.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var Nexus = {
    tabs: [],
    activeTab: null,

    async boot() {
      var self = this;

      /* ---------- workspace + project card ---------- */
      await PIKWorkspace.init();
      if (!PIKWorkspace.project) PIKWorkspace.newProject("nexus-field", "local");
      this._renderProject();
      PIKWorkspace.onChange(function () { self._renderTree(); self._renderProject(); });
      document.addEventListener("pik:project", function () { self._renderProject(); self._renderTree(); });

      /* ---------- models catalog ---------- */
      PIKModels.load(); // live fetch, offline snapshot fallback inside

      /* ---------- picker ---------- */
      PIKPicker.mount({
        overlay: $("[data-nx='overlay']"),
        openBtn: $("[data-nx='modelchip']"),
        chip: $("[data-nx='modelchip']"),
        search: $("[data-nx='search']"),
        list: $("[data-nx='pickerlist']")
      });
      /* restore saved model once catalog arrives */
      NexusSettings.get().then(function (s) { if (s.model) PIKPicker.setSelected(s.model, true); });

      /* ---------- editor dock ---------- */
      PIKEditor.mount("[data-nx='editor']");
      this._wireDock();
      document.addEventListener("pik:openfile", function (e) { self.openFile(e.detail); });

      /* ---------- chat ---------- */
      PIKChat.mount({
        thread: $("[data-nx='thread']"),
        input: $("[data-nx='prompt']"),
        send: $("[data-nx='send']"),
        ladder: $("[data-nx='ladder']"),
        orb: $("[data-fx='orb']"),
        attlist: $("[data-nx='attlist']"),
        fileIn: $("[data-nx='fileinput']"),
        modelchip: $("[data-nx='modelchip']")
      });
      NexusSettings.get().then(function (s) { PIKChat.setEffort(s.thinking || "high"); });

      /* quick-start chips seed the prompt */
      $$("[data-nx='chip']").forEach(function (c) {
        c.addEventListener("click", function () {
          var ta = $("[data-nx='prompt']");
          ta.value = c.dataset.chip;
          ta.focus();
        });
      });

      /* ---------- github rail ---------- */
      PIKGHUI.mount({
        panel: $("[data-nx='ghpanel']"),
        connect: $("[data-nx='gh-connect']"),
        deviceBox: $("[data-nx='gh-device']"),
        patForm: $("[data-nx='patform']"),
        pat: $("[data-nx='pat']"),
        who: $("[data-nx='gh-who']"),
        repos: $("[data-nx='repos']"),
        forkBtn: $("[data-nx='mode-fork']"),
        importBtn: $("[data-nx='mode-import']"),
        railTitle: $("[data-nx='repotitle']"),
        logout: $("[data-nx='gh-logout']")
      });
      var pushBtn = $("[data-nx='push']");
      pushBtn.addEventListener("click", function () { PIKGHUI.pushAll($("[data-nx='branch']")); });

      /* ---------- new project / rename ---------- */
      $("[data-nx='newproj']").addEventListener("click", function () {
        var name = prompt("Project name");
        if (name) { PIKWorkspace.newProject(name, "local"); }
      });

      /* ---------- settings drawer ---------- */
      var drawer = $("[data-nx='drawer']");
      $("[data-nx='open-settings']").addEventListener("click", function () { drawer.classList.add("is-open"); });
      $("[data-nx='close-settings']").addEventListener("click", function () { drawer.classList.remove("is-open"); });
      NexusSettings.bindDrawer(drawer);

      /* ---------- engine pill + status bar ---------- */
      this._wireStatus();

      /* ---------- fx layer ---------- */
      PIKFX.init();
      PIKFX.orb($("[data-fx='orb']"), "high");
      PIKFX.ripple && PIKFX.ripple();
      $("[data-fx='orb']").classList.add("is-idle");

      /* ---------- keyboard: Ctrl/Cmd+I toggles dock on narrow screens ---- */
      document.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
          e.preventDefault();
          Nexus._setDockOpen(!Nexus.dockState.open);
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
          e.preventDefault();
          if (window.PIKPreview) PIKPreview.toggle();
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault(); // nothing to lose: writes are auto-persisted + hashed
          if (window.PIKToasts) PIKToasts.show({ type: "success", title: "Autosaved", text: "Every version is hashed & persisted locally." });
        }
      });

      /* ---------- boot curtain ---------- */
      setTimeout(function () { $("[data-nx='boot']").classList.add("is-done"); }, 900);
    },

    /* ================= project card ================= */
    _renderProject: function () {
      var p = PIKWorkspace.project || {};
      $("[data-nx='projname']").textContent = p.name || "untitled";
      $("[data-nx='projmeta']").textContent =
        (p.files ? Object.keys(p.files).length : 0) + " files · " + (p.source || "local");
      var src = $("[data-nx='projsrc']");
      src.innerHTML = p.repo
        ? '<img src="' + CFG.LOGO_FAVICON + 'github.com&sz=64" alt="">' + p.repo.owner + "/" + p.repo.name
        : '<img src="' + CFG.LOGO_FAVICON + 'openrouter.ai&sz=64" alt="">' + (p.source || "local");
    },

    /* ================= file tree ================= */
    _renderTree: function () {
      var wrap = $("[data-nx='tree']");
      var files = PIKWorkspace.listFiles();
      if (!files.length) { wrap.innerHTML = '<div class="nx-tree__row dir">empty field — ask the agent to build something</div>'; return; }
      wrap.innerHTML = files.map(function (f) {
        var meta = PIKWorkspace.fileMeta(f);
        var v = meta && meta.history ? meta.history.length : 0;
        return '<div class="nx-tree__row' + (f === Nexus.activeTab ? " is-active" : "") + '" data-path="' + f + '">' +
          '<span>' + f.replace(/[^/]+\//g, "\u00a0\u00a0") + "</span>" +
          '<span class="meta">v' + v + "</span></div>";
      }).join("");
      wrap.querySelectorAll("[data-path]").forEach(function (row) {
        row.addEventListener("click", function () { Nexus.openFile(row.dataset.path); });
      });
    },

    /* ================= dock / tabs ================= */
    DOCK_KEY: "pik.nexus.docksize",
    dockState: { w: null, max: false, open: true },

    _saveDock: function () {
      try { localStorage.setItem(this.DOCK_KEY, JSON.stringify(this.dockState)); } catch (e) {}
    },
    _loadDock: function () {
      try {
        var s = JSON.parse(localStorage.getItem(this.DOCK_KEY) || "null");
        if (s && typeof s === "object") this.dockState = Object.assign(this.dockState, s);
      } catch (e) {}
    },

    _applyDock: function (animate) {
      var d = $("[data-nx='dock']");
      var shell = $(".nx-shell");
      var reopen = $("[data-nx='dock-reopen']");
      var st = this.dockState;
      if (!animate) d.style.transition = "none";
      if (window.innerWidth > 1280) {
        // the grid column drives the width -> drag / min / max all set one CSS var
        var w = !st.open ? 0 : st.max ? Math.round(window.innerWidth * 0.72) : (st.w || 340);
        shell.style.setProperty("--nx-right-w", w + "px");
        d.classList.toggle("is-open", !!st.open);
        d.classList.toggle("is-max", !!st.max);
        d.style.display = st.open ? "" : "none";
      } else {
        d.style.display = "";
        d.classList.toggle("is-open", !!st.open);
        d.classList.toggle("is-max", !!st.max);
      }
      if (reopen) reopen.classList.toggle("is-shown", !st.open);
      if (!animate) requestAnimationFrame(function () { d.style.transition = ""; });
      this._saveDock();
      if (window.PIKEditor && PIKEditor.sync) PIKEditor.sync();
    },

    _setDockOpen: function (open) {
      this.dockState.open = open;
      if (open) this.dockState.w = this.dockState.w || 340;
      this._applyDock(true);
      if (open) this._renderTabs();
    },

    _wireDock: function () {
      var self = this;
      this._loadDock();

      /* topbar toggle */
      $("[data-nx='dock-toggle']").addEventListener("click", function () {
        self._setDockOpen(!self.dockState.open);
      });
      /* close button in the dock head */
      $("[data-nx='dock-close']").addEventListener("click", function () {
        self._setDockOpen(false);
      });
      /* collapse-to-strip button */
      $("[data-nx='dock-min']").addEventListener("click", function () {
        self._setDockOpen(false);
      });
      /* maximize / restore button */
      $("[data-nx='dock-max']").addEventListener("click", function () {
        self.dockState.max = !self.dockState.max;
        self.dockState.open = true;
        self._applyDock(true);
      });
      /* floating reopen tab */
      $("[data-nx='dock-reopen']").addEventListener("click", function () {
        self._setDockOpen(true);
      });

      /* -------- drag the resizer to expand/contract the IDE freely -------- */
      var grab = $("[data-nx='dock-resizer']");
      var dragging = false, startX = 0, startW = 0;
      grab.addEventListener("pointerdown", function (e) {
        dragging = true;
        startX = e.clientX;
        var d = $("[data-nx='dock']");
        startW = d.getBoundingClientRect().width || 340;
        grab.setPointerCapture(e.pointerId);
        document.body.classList.add("is-resizing-dock");
      });
      grab.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var w = Math.round(Math.min(Math.max(240, startW + (startX - e.clientX)),
                                    window.innerWidth * 0.85));
        self.dockState.w = w;
        self.dockState.max = false;
        self.dockState.open = true;
        $(".nx-shell").style.setProperty("--nx-right-w", w + "px");
      });
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove("is-resizing-dock");
        self._applyDock(true);
      }
      grab.addEventListener("pointerup", endDrag);
      grab.addEventListener("pointercancel", endDrag);
      grab.addEventListener("dblclick", function () {   // dbl-click toggles full width
        self.dockState.max = !self.dockState.max;
        self.dockState.open = true;
        self._applyDock(true);
      });

      /* keep sane on window resize */
      window.addEventListener("resize", function () { self._applyDock(false); });

      document.addEventListener("pik:log", function (e) { self._log(e.detail); });

      /* live-preview panel inside the dock (Run button) */
      if (window.PIKPreview) {
        PIKPreview.mount({
          panel: $("[data-nx='preview-panel']"),
          frame: $("[data-nx='preview-frame']"),
          label: $("[data-nx='preview-label']"),
          runBtn: $("[data-nx='preview-run']"),
          closeBtn: $("[data-nx='preview-close']"),
          reloadBtn: $("[data-nx='preview-reload']"),
          dlBtn: $("[data-nx='preview-dl']"),
          grabber: $("[data-nx='preview-grabber']")
        });
      }

      // open a README-ish welcome file so the IDE isn't empty
      if (!PIKWorkspace.readFile(".nexus/README.md")) {
        PIKWorkspace.writeFile(".nexus/README.md", [
          "# PIK//NEXUS field manual",
          "",
          "- The agent writes files into this tree when you ask it to.",
          "- Every save is versioned and hashed with SHA-256 (see the status strip).",
          "- Drag the IDE's left edge to resize it; use the head buttons to",
          "  collapse, expand to full width, or close it. A floating IDE tab",
          "  always brings it back (Ctrl/Cmd+I does too).",
          "- Fork or import from GitHub in the left rail; push back with one click.",
          "- Thinking effort: low -> medium -> high -> max drives the core above.",
          "- The shimmering 'Thinking...' under a reply can be clicked to watch",
          "  the model's reasoning stream live.",
          "",
          "```js",
          "// scratch example - edit me, I autosave",
          "export const pik = (x) => x * 2;",
          "```"
        ].join("\n"), { by: "system", note: "seed" });
      }
      this._applyDock(false);
      this.openFile(".nexus/README.md");
    },

    _renderTabs: function () {
      var wrap = $("[data-nx='tabs']"), self = this;
      wrap.innerHTML = this.tabs.map(function (t) {
        return '<div class="nx-tab' + (t === self.activeTab ? " is-active" : "") + '" data-tab="' + t + '">' +
          '<i class="dotdir"></i><span>' + t.split("/").pop() + '</span><em class="x" data-close="' + t + '">\u00d7</em></div>';
      }).join("");
      wrap.querySelectorAll("[data-tab]").forEach(function (el) {
        el.addEventListener("click", function (ev) {
          if (ev.target.dataset.close) { self.closeTab(ev.target.dataset.close); return; }
          self.openFile(el.dataset.tab);
        });
      });
    },

    closeTab: function (path) {
      this.tabs = this.tabs.filter(function (t) { return t !== path; });
      if (this.activeTab === path) {
        this.activeTab = this.tabs[this.tabs.length - 1] || null;
        if (this.activeTab) PIKEditor.open(this.activeTab);
      }
      this._renderTabs();
    },

    openFile: function (path) {
      path = PIKWorkspace._clean(path);
      if (!PIKWorkspace.readFile(path) && path.indexOf("attachments/") !== 0) return;
      if (this.tabs.indexOf(path) === -1) this.tabs.push(path);
      this.activeTab = path;
      PIKEditor.open(path);
      this._renderTabs();
      this._renderTree();
      if (window.innerWidth <= 1280) $("[data-nx='dock']").classList.add("is-open");
    },

    _log: function (line) {
      var box = $("[data-nx='log']");
      if (!box) return;
      var d = document.createElement("div");
      var ts = new Date().toISOString().slice(11, 19);
      d.innerHTML = "<b>" + ts + "</b> " + String(line).replace(/</g, "&lt;");
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
    },

    /* ================= status bar / engine pill ================= */
    _wireStatus: function () {
      var pill = $("[data-nx='engine']"), budget = $("[data-nx='budget']"), self = this;
      function paint() {
        pill.dataset.engine = PIKRouter.engine;
        pill.querySelector("span").textContent = PIKRouter.engine.toUpperCase();
        var eng = PIKRouter.engine;
        budget.textContent = (eng === "pollinations" || eng === "polli-alt" || eng === "polli-get")
          ? "free-tier failover · pollinations.ai"
          : eng === "deepinfra-free"
            ? "free-tier failover · deepinfra public API"
            : "openrouter free tier · key optional";
      }
      paint();
      document.addEventListener("pik:engine", paint);
      document.addEventListener("pik:model", function (e) {
        var m = PIKModels.get(e.detail);
        $("[data-nx='status-model']").textContent = m ? m.id : e.detail;
        $("[data-nx='status-ctx']").textContent = m ? (m.ctx / 1000).toFixed(0) + "K ctx" : "";
      });
      setInterval(function () {
        $("[data-nx='clock']").textContent = new Date().toLocaleTimeString([], { hour12: false });
      }, 1000);
      this._log("nexus online · engine=" + PIKRouter.engine);
    }
  };

  global.PIKNexus = Nexus;
  document.addEventListener("DOMContentLoaded", function () { Nexus.boot(); });
})(window);
