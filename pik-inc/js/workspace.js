/* ============================================================================
   PIK//NEXUS — workspace.js
   The virtual project filesystem. Agent output is parsed for fenced code
   blocks whose info string carries a path (```src/app.py) and those files are
   written into the tree; everything is persisted AES-256-GCM at rest with a
   SHA-256 digest per file version (immutable history, diffable).
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  function extLang(path) {
    var m = /\.([a-z0-9]+)$/i.exec(path);
    return (m ? m[1] : "").toLowerCase();
  }

  var LANG_BY_EXT = {
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", py: "python", rb: "ruby", go: "go",
    rs: "rust", java: "java", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp",
    cs: "csharp", php: "php", html: "html", css: "css", scss: "scss",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown", sh: "bash",
    bash: "bash", zsh: "bash", sql: "sql", toml: "toml", xml: "xml",
    svg: "xml", txt: "text", env: "ini", ini: "ini", dockerfile: "docker",
    vue: "html", svelte: "html"
  };

  var Workspace = {
    project: null,      // { name, source, repo:{owner,name}, files:{path:{content,digest,history:[]}} }
    listeners: [],
    activePath: null,

    async init() {
      var saved = await PIKCrypto.SecureStore.get(CFG.LS.PROJECTS);
      if (saved && saved.current) this.project = saved.current;
      if (!this.project) this.newProject("untitled");
      this._emit();
    },

    _persist() {
      PIKCrypto.SecureStore.set(CFG.LS.PROJECTS, { current: this.project });
    },

    newProject(name, source, repo) {
      this.project = {
        name: name || "untitled",
        source: source || "local",       // local | github-fork | github-import
        repo: repo || null,              // { owner, name, branch }
        createdAt: Date.now(),
        files: {}
      };
      this.activePath = null;
      this._persist();
      this._emit();
      return this.project;
    },

    /* ---------- file ops ---------- */
    writeFile(path, content, meta) {
      path = this._clean(path);
      var f = this.project.files[path];
      if (!f) f = this.project.files[path] = { history: [] };
      var last = f.history[f.history.length - 1];
      if (last && last.content === content) return f; // no-op dedupe
      var self = this;
      var p = PIKCrypto.sha256(content).then(function (digest) {
        f.history.push({
          content: content,
          digest: digest,
          ts: Date.now(),
          by: (meta && meta.by) || "user",
          note: (meta && meta.note) || ""
        });
        if (f.history.length > 40) f.history.splice(0, f.history.length - 40);
        f.digest = digest;
        self._persist();
        self._emit();
        return f;
      });
      f.content = content; // optimistic sync view
      return f;
    },

    readFile(path) {
      var f = this.project.files[this._clean(path)];
      return f ? f.content : null;
    },

    deleteFile(path) {
      delete this.project.files[this._clean(path)];
      this._persist();
      this._emit();
    },

    listFiles() {
      return Object.keys(this.project.files).sort();
    },

    fileMeta(path) { return this.project.files[this._clean(path)] || null; },

    langFor(path) {
      var e = extLang(path);
      if (/(^|\/)dockerfile$/i.test(path)) return "docker";
      return LANG_BY_EXT[e] || "text";
    },

    _clean(p) {
      return String(p || "").replace(/^\.?\//, "").replace(/\\/g, "/").trim();
    },

    /* ---------- parse agent text for file blocks ---------- */
    /**
     * Accepts: ```path/to/file.ext  /  ```file=path/to/file.ext  /
     *          ```ext (writes to scratch/unnamed-N.ext)
     * Returns array of { path, content, lang }
     */
    extractFiles(text) {
      var out = [], unnamed = 0;
      var re = /```([^\n`]*)\n([\s\S]*?)```/g;
      var m;
      while ((m = re.exec(text)) !== null) {
        var info = (m[1] || "").trim();
        var body = m[2];
        var pathMatch = /^(?:file=)?([\w\-./@]+\.[A-Za-z0-9]{1,8}|[\w\-./]+\/(?:Dockerfile|Makefile))(?::|\s|$)/.exec(info);
        var path = null, lang = info.split(/[:\s]/)[0].toLowerCase();
        if (pathMatch) {
          path = this._clean(pathMatch[1]);
          lang = this.langFor(path);
        } else if (LANG_BY_EXT[lang] || lang === "python" || lang === "javascript") {
          unnamed++;
          path = "scratch/unnamed-" + unnamed + "." + ({ python: "py", javascript: "js" }[lang] || lang);
        } else {
          continue; // plain markdown fence, not a file
        }
        out.push({ path: path, content: body.replace(/\n$/, ""), lang: lang });
      }
      return out;
    },

    /* Write extracted files into the tree; returns them */
    ingestAgentText(text) {
      var files = this.extractFiles(text);
      for (var i = 0; i < files.length; i++) {
        this.writeFile(files[i].path, files[i].content, { by: "agent", note: "model output" });
      }
      if (files.length) this._emit();
      return files;
    },

    /* ---------- attachments (accept any file type) ---------- */
    attachFile(fileObj) {
      // store small text-ish files as content; binaries become metadata stubs
      var self = this;
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () {
          var result = String(reader.result);
          var isText = !(fileObj.type && fileObj.type.indexOf("image/") === 0) || result.indexOf("data:") !== 0;
          var path = "attachments/" + (fileObj.name || "blob");
          if (isText && result.indexOf("data:") !== 0) {
            self.writeFile(path, result, { by: "attach", note: fileObj.type });
          } else {
            PIKCrypto.sha256(result).then(function (d) {
              self.project.files[self._clean(path)] = {
                content: "", binary: true, dataUrl: result.slice(0, 400000),
                digest: d, mime: fileObj.type, history: [{ content: "<binary>", digest: d, ts: Date.now(), by: "attach" }]
              };
              self._persist(); self._emit();
              resolve(path);
            });
            return path;
          }
          resolve(path);
        };
        if (fileObj.type && fileObj.type.indexOf("image/") === 0) reader.readAsDataURL(fileObj);
        else reader.readAsText(fileObj);
      });
    },

    /* ---------- events ---------- */
    onChange(fn) { this.listeners.push(fn); },
    /* alias: terminal.js and older modules call subscribe() — same contract */
    subscribe(fn) { this.listeners.push(fn); },
    _emit() {
      var s = this;
      this.listeners.forEach(function (fn) { try { fn(s.project); } catch (e) {} });
    }
  };

  global.PIKWorkspace = Workspace;
})(window);
