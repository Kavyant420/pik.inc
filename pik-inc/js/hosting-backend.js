/* ============================================================================
   PIK//NEXUS — hosting-backend.js
   The Nexus Pages origin server. A real multi-tenant static host that lives
   in the browser: every deployment is a content-addressed bundle stored under
   IDB namespace `pik.nexus.hosting`, served through blob URLs, and addressed
   by the canonical URL shape the workbench promises:

       pikinc.vercel.app/nexus.html/<project>/        ← stable alias
       pikinc.vercel.app/nexus.html/<project>@<sha>/  ← immutable revision

   Because a pure front-end cannot bind a domain, the same engine also emits
   a drop-in Vercel rewrite config (vercel.json) + an edge middleware stub so
   deploying this repo to Vercel reproduces the exact routes for real traffic.
   Multiple projects coexist; per-project quotas and LRU eviction keep storage
   sane; each deploy is version-hashed like everything else in NEXUS.
   ========================================================================= */
(function (global) {
  "use strict";

  var DB_NAME = "pik.nexus.hosting", STORE = "bundles", META = "meta";
  var MAX_PROJECTS = 24;
  var HOST_ROOT = "pikinc.vercel.app/nexus.html/";

  function openDB() {
    return new Promise(function (res, rej) {
      var rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () {
        var db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function tx(db, store, mode, fn) {
    return new Promise(function (res, rej) {
      var t = db.transaction(store, mode), o = t.objectStore(store);
      var r = fn(o);
      t.oncomplete = function () { res(r && r.result !== undefined ? r.result : null); };
      t.onerror = t.onabort = function () { rej(t.error || new Error("tx aborted")); };
    });
  }

  var Backend = {
    _db: null,
    _live: {},          // projectUrl -> blob url (session live table)

    async db() { return this._db || (this._db = await openDB()); },

    slug: function (name) {
      return String(name || "untitled").toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "untitled";
    },

    /* ---------- deploy a set of files ---------- */
    async deploy(files, opts) {
      opts = opts || {};
      var db = await this.db();
      var name = this.slug(opts.project || PIKWorkspace.project || "nexus-site");
      var entry = pickEntry(files);
      if (!entry) throw new Error("no html file to serve");

      // security gate BEFORE anything is written
      var scan = PIKHostingSecurity.scan(files);
      if (!scan.ok && scan.blocked) throw new Error("blocked at edge WAF: " + scan.reason);

      var bundle = PIKLivePreviewBundle(entry.path, files);   // single self-contained doc
      var digest = await PIKCrypto.sha256Hex(bundle.html);
      var revKey = name + "@" + digest.slice(0, 12);
      var aliasKey = name;

      var record = {
        project: name, digest: digest, bytes: bundle.html.length,
        files: Object.keys(files).length, entry: entry.path,
        ts: Date.now(), notes: opts.notes || "", warnings: scan.warnings,
        headers: PIKHostingSecurity.responseHeaders(bundle.html)
      };

      await tx(db, STORE, "readwrite", function (o) { o.put(bundle.html, revKey); });
      await tx(db, STORE, "readwrite", function (o) { o.put(bundle.html, aliasKey); });
      await tx(db, META, "readwrite", function (o) { o.put(record, revKey); });
      await tx(db, META, "readwrite", function (o) { o.put(record, aliasKey); });

      // registry index for the Host tab
      var index = (await tx(db, META, "readonly", function (o) { o.get("__index__"); })) || { list: [] };
      index.list = index.list.filter(function (r) { return r.project !== name || r.digest !== digest; });
      index.list.unshift(record);
      index.list = index.list.slice(0, 120);
      await tx(db, META, "readwrite", function (o) { o.put(index, "__index__"); });

      await this.enforceQuota();

      var url = "/" + HOST_ROOT + name + "/";
      this._live[url] = URL.createObjectURL(new Blob([bundle.html], { type: "text/html" }));
      return { ok: true, project: name, url: url, liveUrl: this._live[url], digest: digest, record: record, warnings: scan.warnings };
    },

    async deployCurrent(opts) {
      var files = {};
      PIKWorkspace.listFiles().forEach(function (f) { files[f] = PIKWorkspace.readFile(f); });
      if (!Object.keys(files).length) return { ok: false, error: "workspace is empty — build something first" };
      try {
        return await this.deploy(files, Object.assign({ project: PIKWorkspace.project }, opts));
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },

    /* ---------- resolve a hosted path ---------- */
    async resolve(pathname) {
      // /nexus.html/<project>/... or /nexus.html/<project>@<rev>/...
      var m = String(pathname || "").match(/nexus\.html\/([^/?#]+)(?:\/.*)?$/);
      if (!m) return { ok: false, status: 404, body: page404(pathname) };
      var key = decodeURIComponent(m[1]).replace(/@.*$/, "") || m[1];
      var db = await this.db();
      var html = await tx(db, STORE, "readonly", function (o) { o.get(key); });
      if (html == null) return { ok: false, status: 404, body: page404(pathname) };
      var verdict = PIKHostingSecurity.inspect(html);
      if (verdict.blocked) return { ok: false, status: 403, body: page403(pathname, verdict.reason) };
      return { ok: true, status: 200, html: html, headers: PIKHostingSecurity.responseHeaders(html) };
    },

    async list() {
      var db = await this.db();
      var index = await tx(db, META, "readonly", function (o) { o.get("__index__"); });
      return (index && index.list) || [];
    },

    async rollback(project, digest) {
      var db = await this.db();
      var revKey = project + "@" + digest.slice(0, 12);
      var html = await tx(db, STORE, "readonly", function (o) { o.get(revKey); });
      if (html == null) return { ok: false, error: "revision not found" };
      await tx(db, STORE, "readwrite", function (o) { o.put(html, project); });
      var meta = await tx(db, META, "readonly", function (o) { o.get(revKey); });
      if (meta) await tx(db, META, "readwrite", function (o) { o.put(meta, project); });
      return { ok: true, project: project, digest: digest };
    },

    async remove(project) {
      var db = await this.db();
      var idx = await this.list();
      var keys = [project].concat(idx.filter(function (r) { return r.project === project; }).map(function (r) { return project + "@" + r.digest.slice(0, 12); }));
      for (var i = 0; i < keys.length; i++) {
        await tx(db, STORE, "readwrite", function (o) { o.delete(keys[i]); });
        await tx(db, META, "readwrite", function (o) { o.delete(keys[i]); });
      }
      var index = (await tx(db, META, "readonly", function (o) { o.get("__index__"); })) || { list: [] };
      index.list = index.list.filter(function (r) { return r.project !== project; });
      await tx(db, META, "readwrite", function (o) { o.put(index, "__index__"); });
      return { ok: true };
    },

    /* ---------- quota + LRU eviction ---------- */
    async enforceQuota() {
      var db = await this.db();
      var index = (await tx(db, META, "readonly", function (o) { o.get("__index__"); })) || { list: [] };
      var projects = {};
      index.list.forEach(function (r) { projects[r.project] = Math.max(projects[r.project] || 0, r.ts); });
      var names = Object.keys(projects);
      if (names.length <= MAX_PROJECTS) return;
      names.sort(function (a, b) { return projects[a] - projects[b]; });
      var evict = names.slice(0, names.length - MAX_PROJECTS);
      for (var i = 0; i < evict.length; i++) await this.remove(evict[i]);
    },

    /* ---------- vercel routing artifact (real-world mirror) ---------- */
    vercelConfig: function () {
      return JSON.stringify({
        rewrites: [
          { source: "/nexus.html/:project/", destination: "/nexus-pages/index.html" },
          { source: "/nexus.html/:project/:path*", destination: "/nexus-pages/index.html" }
        ],
        headers: [
          { source: "/(.*)", headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "SAMEORIGIN" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
            { key: "Cross-Origin-Resource-Policy", value: "same-origin" }
          ] }
        ]
      }, null, 2);
    },

    downloadBundle: function () {
      var files = {};
      PIKWorkspace.listFiles().forEach(function (f) { files[f] = PIKWorkspace.readFile(f); });
      var entry = pickEntry(files);
      if (!entry) { PIKToasts.show({ type: "warn", title: "Nothing to bundle", text: "The workspace has no html entry yet." }); return; }
      var bundle = PIKLivePreviewBundle(entry.path, files);
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bundle.html], { type: "text/html" }));
      a.download = (PIKWorkspace.project || "nexus-site") + ".html";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      PIKToasts.show({ type: "success", title: "Bundle downloaded", text: a.download });
    }
  };

  function pickEntry(files) {
    var paths = Object.keys(files);
    var htmls = paths.filter(function (p) { return /\.html?$/i.test(p); });
    if (!htmls.length) return null;
    htmls.sort(function (a, b) { return (a.indexOf("index") === -1 ? 1 : 0) - (b.indexOf("index") === -1 ? 1 : 0); });
    return { path: htmls[0] };
  }

  function page404(p) {
    return "<!doctype html><meta charset='utf-8'><title>404</title><body style='background:#060607;color:#dfe2e6;font-family:ui-monospace,monospace;display:grid;place-items:center;height:100vh;margin:0'>" +
      "<div style='text-align:center'><h1 style='font-weight:600'>404</h1><p style='opacity:.6'>" + escapeHtml(p) + " is not deployed on Nexus Pages.</p></div>";
  }
  function page403(p, why) {
    return "<!doctype html><meta charset='utf-8'><title>403</title><body style='background:#060607;color:#dfe2e6;font-family:ui-monospace,monospace;display:grid;place-items:center;height:100vh;margin:0'>" +
      "<div style='text-align:center'><h1 style='font-weight:600'>403 · blocked by edge protection</h1><p style='opacity:.6'>" + escapeHtml(String(why || "")) + "</p></div>";
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  global.PIKHosting = Backend;
})(window);
