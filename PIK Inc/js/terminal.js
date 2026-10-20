/* ============================================================================
   PIK//NEXUS — terminal.js + PIKNexusPane
   The bottom pane controller: tab switching (Terminal / Preview / Host),
   drag-resize, expand/collapse, command history with ↑/↓ + Tab completion,
   ANSI rendering through terminal-ansi.js, and the run/deploy bridge.
   ========================================================================= */
(function (global) {
  "use strict";

  var termEl, inputEl, ps1El, formEl, paneEl, labelEl;
  var history = [], hIdx = -1, running = false;
  var MAX_LINES = 400;

  function $(sel) { return document.querySelector(sel); }

  var Pane = {
    activeTab: "term",
    hidden: false,

    init: function () {
      termEl = $('[data-nx="term"]');
      inputEl = $('[data-nx="term-input"]');
      ps1El = $('[data-nx="term-ps1"]');
      formEl = $('[data-nx="term-form"]');
      paneEl = $('[data-nx="pane"]');
      labelEl = $('[data-nx="pane-label"]');
      if (!termEl) return;

      this.bindTabs();
      this.bindResize();
      this.bindTools();
      this.bindInput();
      this.banner();
      PIKWorkspace.subscribe(function () { Pane.refreshPs1(); });
    },

    banner: function () {
      var A = PIKTerminalAnsi;
      this.print(A.head("nexus-sh 5.15") + " · " + A.dim("the terminal sees exactly what NEXUS sees") + "\n" +
        A.dim("type ") + A.acc("help") + A.dim(" for commands · ") + A.acc("micro boot") + A.dim(" for the on-device core · ") +
        A.acc("run") + A.dim(" builds a live preview · ") + A.acc("deploy") + A.dim(" publishes to Nexus Pages") + "\n");
      this.refreshPs1();
    },

    refreshPs1: function () {
      var k = PIKTerminalKernel;
      if (ps1El) ps1El.textContent = "nexus@field:" + k.displayPath() + "$";
      if (labelEl && this.activeTab === "term") labelEl.textContent = "nexus-shell — workspace root";
    },

    print: function (textOrFrag, cls) {
      var line = document.createElement("div");
      line.className = "nx-term__line" + (cls ? " " + cls : "");
      if (typeof textOrFrag === "string") line.appendChild(PIKTerminalAnsi.render(textOrFrag));
      else line.appendChild(textOrFrag);
      termEl.appendChild(line);
      while (termEl.children.length > MAX_LINES) termEl.removeChild(termEl.firstChild);
      // keep scroll pinned only when user is at the bottom
      var nearBottom = termEl.scrollHeight - termEl.scrollTop - termEl.clientHeight < 80;
      if (nearBottom) termEl.scrollTop = termEl.scrollHeight;
    },

    echoCmd: function (cmd) {
      var frag = document.createDocumentFragment();
      var p = document.createElement("span");
      p.className = "nx-term__ps1-inline";
      p.textContent = PIKTerminalKernel.displayPath().replace(/^\//, "") + "$ ";
      frag.appendChild(p);
      var c = document.createElement("span");
      c.textContent = cmd;
      frag.appendChild(c);
      this.print(frag, "is-cmd");
    },

    bindInput: function () {
      var self = this;
      formEl.addEventListener("submit", async function (e) {
        e.preventDefault();
        var cmd = inputEl.value;
        inputEl.value = "";
        await self.submit(cmd);
      });
      inputEl.addEventListener("keydown", function (e) {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          if (!history.length) return;
          hIdx = hIdx <= 0 ? history.length - 1 : hIdx - 1;
          inputEl.value = history[hIdx];
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          hIdx = (hIdx + 1) % Math.max(1, history.length);
          inputEl.value = history[hIdx] || "";
        } else if (e.key === "Tab") {
          e.preventDefault();
          self.complete(inputEl);
        } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault(); self.clear();
        }
      });
      termEl.addEventListener("click", function () { inputEl.focus(); });
    },

    complete: function (input) {
      var val = input.value;
      var parts = val.split(/\s+/);
      var last = parts[parts.length - 1] || "";
      var pool;
      if (parts.length === 1) {
        pool = Object.keys(PIKTerminalCommands);
      } else {
        pool = PIKWorkspace.listFiles();
      }
      var hits = pool.filter(function (p) { return p.indexOf(last) === 0; });
      if (hits.length === 1) {
        parts[parts.length - 1] = hits[0];
        input.value = parts.join(" ");
      } else if (hits.length > 1) {
        this.print(PIKTerminalAnsi.dim(hits.slice(0, 24).join("   ")));
      }
    },

    submit: async function (cmd) {
      cmd = String(cmd || "").trim();
      if (!cmd) return;
      history.push(cmd);
      if (history.length > 120) history.shift();
      hIdx = 0;
      this.echoCmd(cmd);
      if (running) { this.print(PIKTerminalAnsi.warn("(queued — previous command still running)")); }
      running = true;
      termEl.classList.add("is-busy");
      try {
        var res = await PIKTerminalKernel.execLine(cmd, { history: history, onDelta: null });
        if (res.clear) this.clear();
        if (res.out) this.print(res.out.replace(/\n$/, ""));
        if (res.code !== 0) this.print(PIKTerminalAnsi.err("[exit " + res.code + "]"));
      } catch (e) {
        this.print(PIKTerminalAnsi.err("nexus-sh: " + String(e.message || e)));
      } finally {
        running = false;
        termEl.classList.remove("is-busy");
        this.refreshPs1();
      }
    },

    clear: function () { termEl.innerHTML = ""; this.banner(); },

    /* ---------- tabs ---------- */
    bindTabs: function () {
      var self = this;
      var tabs = document.querySelectorAll(".nx-pane__tab");
      Array.prototype.forEach.call(tabs, function (t) {
        t.addEventListener("click", function () { self.showTab(t.dataset.pane); });
      });
      this.showTab("term");
    },

    showTab: function (name) {
      this.activeTab = name;
      Array.prototype.forEach.call(document.querySelectorAll(".nx-pane__tab"), function (t) {
        t.classList.toggle("is-on", t.dataset.pane === name);
      });
      Array.prototype.forEach.call(document.querySelectorAll(".nx-pane__view"), function (v) {
        v.hidden = v.dataset.paneView !== name;
      });
      if (name === "host" && global.PIKHostingUI) PIKHostingUI.refresh();
      if (name === "preview" && global.PIKNexusPane) PIKNexusPane.ensurePreview();
      if (name === "term") this.refreshPs1();
    },

    /* ---------- resize ---------- */
    bindResize: function () {
      var grab = $('[data-nx="pane-grabber"]');
      if (!grab) return;
      var dragging = false, startY = 0, startH = 0;
      grab.addEventListener("pointerdown", function (e) {
        dragging = true; startY = e.clientY;
        startH = paneEl.getBoundingClientRect().height;
        grab.setPointerCapture(e.pointerId);
        document.body.classList.add("is-resizing-pane");
      });
      grab.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var h = Math.max(120, Math.min(window.innerHeight * 0.8, startH + (startY - e.clientY)));
        setPaneHeight(h);
      });
      grab.addEventListener("pointerup", function (e) {
        dragging = false;
        try { grab.releasePointerCapture(e.pointerId); } catch (err) {}
        document.body.classList.remove("is-resizing-pane");
        try { localStorage.setItem("pik.nexus.paneH", String(paneEl.style.getPropertyValue("--pane-h"))); } catch (err) {}
      });
      var saved = null;
      try { saved = localStorage.getItem("pik.nexus.paneH"); } catch (e) {}
      if (saved) paneEl.style.setProperty("--pane-h", saved);
    },

    bindTools: function () {
      var self = this;
      var closeBtn = $('[data-nx="pane-close"]');
      var maxBtn = $('[data-nx="pane-max"]');
      var reloadBtn = $('[data-nx="pane-reload"]');
      var dlBtn = $('[data-nx="pane-dl"]');
      if (closeBtn) closeBtn.addEventListener("click", function () { self.toggle(); });
      if (maxBtn) maxBtn.addEventListener("click", function () {
        paneEl.classList.toggle("is-max");
        if (paneEl.classList.contains("is-max")) setPaneHeight(window.innerHeight * 0.72);
        else { var s = null; try { s = localStorage.getItem("pik.nexus.paneH"); } catch (e) {} setPaneHeight(s || "300px"); }
      });
      if (reloadBtn) reloadBtn.addEventListener("click", function () {
        if (self.activeTab === "preview") self.runPreview(true);
        else if (self.activeTab === "host") PIKHostingUI.refresh();
        else self.print(PIKTerminalAnsi.dim("shell reinitialised"));
      });
      if (dlBtn) dlBtn.addEventListener("click", function () {
        if (global.PIKHosting) PIKHosting.downloadBundle();
      });
      document.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
          e.preventDefault(); self.toggle();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "`") {
          e.preventDefault();
          self.show();
          var ti = $('[data-nx="term-input"]'); if (ti) ti.focus();
        }
      });
    },

    toggle: function () { this.hidden ? this.show() : this.hide(); },
    hide: function () { this.hidden = true; document.body.classList.add("pane-hidden"); },
    show: function () { this.hidden = false; document.body.classList.remove("pane-hidden"); },

    /* ---------- preview bridge ---------- */
    ensurePreview: function () {
      var frame = $('[data-nx="preview-frame"]');
      if (frame && !frame.src && frame.dataset.builtAt == null) this.runPreview();
    },

    runPreview: async function (force) {
      var frame = $('[data-nx="preview-frame"]');
      var urlEl = $('[data-nx="preview-url"]');
      if (!frame) return { ok: false, error: "no frame" };
      var files = PIKWorkspace.listFiles();
      var htmlFile = null;
      for (var i = 0; i < files.length; i++) {
        if (/\.html?$/i.test(files[i])) { htmlFile = files[i]; break; }
      }
      if (!htmlFile) return { ok: false, error: "workspace has no .html entry — ask NEXUS to build something first" };
      var bundle = PIKLivePreview.bundle(htmlFile, force);
      if (!bundle || !bundle.url) return { ok: false, error: "bundle failed" };
      frame.src = bundle.url;
      frame.dataset.builtAt = String(Date.now());
      if (urlEl) urlEl.textContent = "blob:live-preview/" + htmlFile;
      this.showTab("preview");
      PIKToasts.show({ type: "success", title: "Preview rebuilt", text: htmlFile + " + " + (files.length - 1) + " asset(s)" });
      return { ok: true, files: files.length };
    }
  };

  function setPaneHeight(h) {
    var px = typeof h === "number" ? h + "px" : h;
    paneEl.style.setProperty("--pane-h", px);
  }

  global.PIKNexusPane = Pane;

  document.addEventListener("DOMContentLoaded", function () { Pane.init(); });
})(window);
