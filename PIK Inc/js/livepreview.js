/* ============================================================================
   PIK//NEXUS — livepreview.js
   VS Code-style "Run / Show preview": assembles the workspace files into a
   single self-contained HTML document and renders it in a sandboxed iframe
   (srcdoc) inside a resizable bottom panel of the IDE dock. Relative links
   between project files are intercepted so index.html -> app.js -> styles.css
   all resolve from the virtual filesystem. Also powers the per-file Download
   button (Blob + object URL).
   ========================================================================= */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var MIME_BY_EXT = {
    html: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript",
    json: "application/json", md: "text/markdown", txt: "text/plain", svg: "image/svg+xml",
    xml: "application/xml", yml: "text/yaml", yaml: "text/yaml", py: "text/x-python",
    ico: "image/x-icon", png: "image/png", jpg: "image/jpeg"
  };

  var Preview = {
    els: {},
    openState: false,

    mount: function (refs) {
      this.els = refs;
      var self = this;
      if (!refs.panel) return false;

      refs.runBtn.addEventListener("click", function () { self.toggle(); });
      refs.closeBtn.addEventListener("click", function () { self.hide(); });
      refs.reloadBtn.addEventListener("click", function () { self.refresh(); });
      refs.dlBtn.addEventListener("click", function () { self.downloadBundle(); });

      /* drag-resize the panel height */
      var dragging = false, startY = 0, startH = 0;
      refs.grabber.addEventListener("pointerdown", function (e) {
        dragging = true; startY = e.clientY;
        startH = self.els.panel.offsetHeight;
        refs.grabber.setPointerCapture(e.pointerId);
      });
      refs.grabber.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var h = Math.max(120, Math.min(window.innerHeight - 260, startH + (startY - e.clientY)));
        self.els.panel.style.flexBasis = h + "px";
      });
      refs.grabber.addEventListener("pointerup", function () { dragging = false; });

      /* re-render automatically when the agent finishes writing files */
      document.addEventListener("pik:agentfiles", function () {
        if (self.openState) self.refresh();
      });
      return true;
    },

    toggle: function () { this.openState ? this.hide() : this.show(); },

    show: function () {
      this.openState = true;
      this.els.panel.hidden = false;
      this.els.runBtn.classList.add("is-on");
      this.els.runBtn.title = "Hide live page (Ctrl/Cmd+B)";
      this.refresh();
    },
    hide: function () {
      this.openState = false;
      this.els.panel.hidden = true;
      this.els.runBtn.classList.remove("is-on");
      if (this.els.frame) this.els.frame.srcdoc = "";
    },
    isOpen: function () { return this.openState; },

    /* ---------- blob-URL bundle API (used by terminal runPreview + hosting) ----------
       Same assembly as the srcdoc preview, but returned as an object URL so a
       real iframe src / deploy step can consume it. Cached per build stamp. */
    _blobUrl: null,
    _blobAt: 0,
    bundle: function (entryPath, force) {
      var W = PIKWorkspace;
      var entry = entryPath || this._entry();
      if (!entry) return { ok: false, error: "no html entry in workspace" };
      var b = this._bundle(entry);
      var latest = 0;
      try {
        Object.keys(W.project.files).forEach(function (p) {
          var f = W.project.files[p];
          if (f && f.updatedAt && f.updatedAt > latest) latest = f.updatedAt;
        });
      } catch (e) {}
      if (!force && this._blobUrl && this._blobAt >= latest) {
        return { ok: true, url: this._blobUrl, path: entry };
      }
      try {
        if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
        var blob = new Blob([b.html + "\n" + this._bridge()], { type: "text/html;charset=utf-8" });
        this._blobUrl = URL.createObjectURL(blob);
        this._blobAt = Date.now();
        return { ok: true, url: this._blobUrl, path: entry };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },

    /* ---------- pick the entry document ---------- */
    _entry: function () {
      var files = PIKWorkspace.listFiles().filter(function (p) {
        return p.indexOf(".nexus/") !== 0 && p.indexOf("attachments/") !== 0 && /\.html?$/i.test(p);
      });
      if (!files.length) return null;
      var byName = {};
      files.forEach(function (f) { byName[f.toLowerCase()] = f; });
      return byName["index.html"] || byName[Object.keys(byName).filter(function (k) { return /(^|\/)index\.html?$/.test(k); })[0]] || files[0];
    },

    /* ---------- assemble one self-contained document ---------- */
    _bundle: function (entryPath) {
      var W = PIKWorkspace;
      var dir = entryPath.indexOf("/") === -1 ? "" : entryPath.slice(0, entryPath.lastIndexOf("/") + 1);
      var doc = W.readFile(entryPath) || "";

      function resolve(rel) {
        rel = String(rel || "").split("?")[0].split("#")[0];
        if (/^(https?:|data:|mailto:|\/\/)/i.test(rel)) return null;
        var stack = (dir + rel).split("/"), out = [];
        for (var i = 0; i < stack.length; i++) {
          var seg = stack[i];
          if (seg === "." || seg === "") continue;
          if (seg === "..") out.pop(); else out.push(seg);
        }
        return out.join("/");
      }

      /* inline <link rel=stylesheet href=local.css> */
      doc = doc.replace(/<link\b[^>]*>/gi, function (tag) {
        var mRel = /rel\s*=\s*["']?stylesheet["']?/i.exec(tag);
        var mHref = /href\s*=\s*["']([^"']+)["']/i.exec(tag);
        if (!mHref) return tag;
        if (!mRel && !/\.css(["']?\s*>|["'])/i.test(mHref[1])) return tag;
        var p = resolve(mHref[1]);
        var css = p != null ? W.readFile(p) : null;
        if (css == null) return tag;
        return "<style data-src=\"" + esc(p) + "\">" + css + "</style>";
      });

      /* inline <script src=local.js> (skip modules that import other files) */
      doc = doc.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (all, attrs, inner) {
        var mSrc = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (!mSrc) return all;
        var p = resolve(mSrc[1]);
        var code = p != null ? W.readFile(p) : null;
        if (code == null) return all;
        var isModule = /type\s*=\s*["']module["']/i.test(attrs);
        var importsOther = /(?:^|\n)\s*(?:import\s|export\s)/.test(code);
        if (isModule && importsOther) {
          return "<!-- script " + esc(p) + " uses ESM imports; kept as-is -->" + all;
        }
        var safe = code.replace(/<\/script/gi, "<\\/script");
        return "<script data-src=\"" + esc(p) + "\"" + (isModule ? ' type="module"' : "") + ">" + safe + "</script>";
      });

      /* rewrite anchor hrefs to local files so inter-page nav works */
      doc = doc.replace(/<a\b([^>]*)href\s*=\s*["']([^"']+\.(?:html?|md|txt))["']([^>]*)>/gi, function (all, pre, href, post) {
        var p = resolve(href);
        if (p == null || W.readFile(p) == null) return all;
        return '<a' + pre + 'href="#file:' + esc(p) + '"' + post + ">";
      });

      return { path: entryPath, html: doc, dir: dir, resolve: resolve };
    },

    refresh: function () {
      if (!this.openState) return;
      var entry = this._entry();
      if (!entry) {
        this.els.frame.srcdoc = this._placeholder("No HTML file in the workspace yet.",
          "Ask NEXUS to build something — every .html / .css / .js file it writes appears here instantly.");
        this._label(null);
        return;
      }
      var b = this._bundle(entry);
      this._label(b.path);
      this._current = b;
      this.els.frame.srcdoc = b.html + "\n" + this._bridge();
    },

    /* small script injected into the sandbox so in-frame links to project
       files get handled by the parent window */
    _bridge: function () {
      return '<script>(function(){document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest(\'a[href^="#file:"]\');if(a){e.preventDefault();parent.postMessage({pik:"openfile",path:a.getAttribute("href").slice(6)},"*");}},true);})();<\/script>';
    },

    _placeholder: function (title, sub) {
      return '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="margin:0;height:100vh;display:grid;place-content:center;gap:8px;text-align:center;' +
        'font-family:ui-sans-serif,system-ui;color:#9ea4ad;background:#08080a">' +
        '<div style="font-size:1rem;color:#dfe2e6;font-weight:600">' + esc(title) + "</div>" +
        '<div style="font-size:.78rem;max-width:34ch">' + esc(sub) + "</div></body>";
    },

    _label: function (path) {
      var l = this.els.label;
      if (!l) return;
      l.textContent = path ? "preview · " + path : "preview · idle";
      l.title = path || "";
    },

    /* ---------- downloads ---------- */
    downloadFile: function (path) {
      var f = PIKWorkspace.project.files[PIKWorkspace._clean(path)];
      if (!f) return;
      var blob, name = path.split("/").pop();
      if (f.binary && f.dataUrl) {
        var arr = f.dataUrl.split(","), mime = (arr[0].match(/:(.*?);/) || [])[1] || "application/octet-stream";
        var bin = atob(arr[1]), u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        blob = new Blob([u8], { type: mime });
      } else {
        blob = new Blob([f.content || ""], { type: MIME_BY_EXT[(name.split(".").pop() || "").toLowerCase()] || "text/plain" });
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
      if (window.PIKToasts) PIKToasts.show({ type: "success", title: "Download started", text: name });
    },

    downloadBundle: function () {
      var W = PIKWorkspace;
      var files = W.listFiles().filter(function (p) {
        var f = W.project.files[p];
        return f && !f.binary && typeof f.content === "string";
      });
      if (!files.length) {
        if (window.PIKToasts) PIKToasts.show({ type: "warn", title: "Nothing to export", text: "The workspace has no text files yet." });
        return;
      }
      var parts = files.map(function (p) {
        return "-----BEGIN FILE: " + p + "-----\n" + W.readFile(p) + "\n-----END FILE: " + p + "-";
      });
      this._saveText((W.project.name || "pik-project") + ".pikbundle.txt", parts.join("\n\n"));
      /* also offer a ready-to-open single-file page when an entry exists */
      var entry = this._entry();
      if (entry) this._saveText(entry.split("/").pop(), this._bundle(entry).html);
    },

    _saveText: function (name, content) {
      var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
    }
  };

  global.PIKPreview = Preview;
  /* alias: terminal + hosting modules reference the bundle API as PIKLivePreview */
  global.PIKLivePreview = Preview;
  /* hosting-backend.js calls PIKLivePreviewBundle(entryPath, files) directly —
     expose a standalone function that builds the single self-contained doc. */
  global.PIKLivePreviewBundle = function (entryPath, files) {
    try {
      var list = Array.isArray(files) ? files.slice() : [];
      if (list.indexOf(entryPath) === -1) list.unshift(entryPath);
      /* hosting deploys always bundle the active project, which is already
         resident in PIKWorkspace — build the single self-contained doc. */
      return Preview._bundle(entryPath);
    } catch (e) {
      return { html: "<!doctype html><meta charset=utf-8><title>deploy error</title><pre>" +
        String(e && e.message || e).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>" };
    }
  };
})(window);
