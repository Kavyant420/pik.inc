/* ============================================================================
   PIK//NEXUS — editor.js
   A dependency-free, VS Code-flavoured code surface:
     - tokenizer-based syntax highlighting (js/ts/py/html/css/json/md/bash/go/
       rust/java/sql/yaml) rendered as a highlighted layer under a transparent
       textarea caret overlay -> real editing, real colors
     - line numbers, active-line glow, minimap strip, tab bar, dirty markers
     - agent "diff" view: shows SHA-256 of each version + who wrote it
   ========================================================================= */
(function (global) {
  "use strict";

  /* ---------------- tokenizers ---------------- */
  var KEYWORDS = {
    javascript: "const let var function return if else for while do break continue class new this extends super async await try catch finally throw typeof instanceof in of delete void yield switch case default import export from as static get set null undefined true false",
    typescript: "const let var function return if else for while do break continue class new this extends super async await try catch finally throw typeof instanceof keyof infer implements interface enum type namespace declare readonly public private protected abstract static null undefined true false import export from as void never unknown any string number boolean",
    python: "def class return if elif else for while break continue pass import from as with try except finally raise lambda yield global nonlocal assert del in is not and or None True False async await self",
    ruby: "def class module return if elsif else end for while do begin rescue ensure raise require require_relative attr_accessor nil true false self yield unless until then when case",
    go: "package import func return if else for range switch case default var const type struct interface map chan go defer nil true false string int int64 float64 bool error byte rune make new select",
    rust: "fn let mut const struct enum impl trait for while loop if else match return pub use mod crate self super where as dyn ref move async await unsafe true false Some None Ok Err Vec String",
    java: "public private protected class interface extends implements return if else for while do switch case default new this static final void int long double float boolean char String import package try catch finally throw throws abstract synchronized true false null",
    csharp: "using namespace class public private protected internal static void var new return if else for foreach while do switch case default try catch finally throw async await override virtual abstract sealed true false null string int bool",
    php: "function class return if else elseif foreach for while do new echo print public private protected static abstract interface trait namespace use try catch finally throw as instanceof null true false",
    bash: "if then else elif fi for while do done case esac function return export local source in",
    sql: "SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE DROP ALTER ADD JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET AS AND OR NOT NULL IS DISTINCT UNION ALL INDEX VIEW PRIMARY KEY FOREIGN REFERENCES",
    yaml: "", docker: "FROM RUN CMD COPY ADD ENTRYPOINT WORKDIR ENV EXPOSE USER VOLUME ARG AS",
    json: "", css: "", html: "", markdown: "", text: "", ini: "", xml: ""
  };

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function hlJs(code, lang) {
    var kw = KEYWORDS[lang] || KEYWORDS.javascript;
    var kwRe = kw ? new RegExp("\\b(?:" + kw.split(/\s+/).join("|") + ")\\b", "g") : null;
    var out = "", i = 0;
    var re = /(\/\/[^\n]*|#[^\n{]*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(#[0-9a-fA-F]{3,8}\b|\b0x[0-9a-fA-F]+\b)/gm;
    // simple approach: split into comments/strings/numbers via regex passes on masked copy
    var tokens = [];
    var m;
    var last = 0;
    while ((m = re.exec(code)) !== null) {
      if (m.index > last) tokens.push({ t: "code", v: code.slice(last, m.index) });
      var cls = m[1] ? "cm" : m[2] ? "st" : m[3] ? "nu" : "nu";
      tokens.push({ t: cls, v: m[0] });
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (last < code.length) tokens.push({ t: "code", v: code.slice(last) });

    out = tokens.map(function (tk) {
      if (tk.t === "code") {
        var v = esc(tk.v);
        if (kwRe) v = v.replace(kwRe, '<span class="tk-k">$&</span>');
        v = v.replace(/\b([A-Za-z_$][\w$]*)(?=\s*\()/g, '<span class="tk-f">$1</span>');
        v = v.replace(/\b([A-Z][A-Za-z0-9_]{2,})\b/g, '<span class="tk-t">$1</span>');
        return v;
      }
      return '<span class="tk-' + tk.t + '">' + esc(tk.v) + "</span>";
    }).join("");
    return out;
  }

  function hlHtml(code) {
    var out = esc(code);
    out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tk-cm">$1</span>');
    out = out.replace(/(&lt;\/?)([a-zA-Z][\w:-]*)/g, '$1<span class="tk-t">$2</span>');
    out = out.replace(/([a-zA-Z-][\w:-]*)=(&quot;|")(.*?)(\2)/g, '<span class="tk-k">$1</span>=$2<span class="tk-st">$3</span>$4');
    out = out.replace(/(&lt;script[\s\S]*?&gt;)([\s\S]*?)(&lt;\/script&gt;)/g, function (_, a, b, c) {
      return a + hlJs(b, "javascript") + c;
    });
    out = out.replace(/(&lt;style[\s\S]*?&gt;)([\s\S]*?)(&lt;\/style&gt;)/g, function (_, a, b, c) {
      return a + hlCss(b) + c;
    });
    return out;
  }

  function hlCss(code) {
    var out = esc(code);
    out = out.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tk-cm">$1</span>');
    out = out.replace(/("[^"]*"|'[^']*')/g, '<span class="tk-st">$1</span>');
    out = out.replace(/(@[\w-]+)/g, '<span class="tk-k">$1</span>');
    out = out.replace(/([-\w]+)(\s*:)/g, '<span class="tk-f">$1</span>$2');
    out = out.replace(/(#[0-9a-fA-F]{3,8}|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)/g, '<span class="tk-nu">$1</span>');
    out = out.replace(/(\.[\w-]+|#\w+|::?[\w-]+)/g, function (m0) {
      if (/tk-/.test(m0)) return m0;
      return '<span class="tk-t">' + m0 + "</span>";
    });
    return out;
  }

  function hlJson(code) {
    var out = esc(code);
    out = out.replace(/("(?:[^"\\]|\\.)*")(\s*:)?/g, function (_, s, colon) {
      return '<span class="' + (colon ? "tk-f" : "tk-st") + '">' + s + "</span>" + (colon || "");
    });
    out = out.replace(/\b(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/g, '<span class="tk-nu">$1</span>');
    out = out.replace(/\b(true|false|null)\b/g, '<span class="tk-k">$1</span>');
    return out;
  }

  function hlMd(code) {
    var out = esc(code);
    out = out.replace(/^(#{1,6} .*)$/gm, '<span class="tk-k">$1</span>');
    out = out.replace(/(\*\*[^*]+\*\*|`[^`]+`)/g, '<span class="tk-t">$1</span>');
    out = out.replace(/^(&gt; .*)$/gm, '<span class="tk-cm">$1</span>');
    out = out.replace(/(!?\[[^\]]*\]\([^)]*\))/g, '<span class="tk-st">$1</span>');
    return out;
  }

  function hlYaml(code) {
    var out = esc(code);
    out = out.replace(/(#[^\n]*)/g, '<span class="tk-cm">$1</span>');
    out = out.replace(/^([\w.-]+)(\s*:)/gm, '<span class="tk-f">$1</span>$2');
    out = out.replace(/("[^"]*"|'[^']*')/g, '<span class="tk-st">$1</span>');
    out = out.replace(/\b(true|false|null|~)\b/g, '<span class="tk-k">$1</span>');
    out = out.replace(/(^|\s)(- )/g, "$1<span class=\"tk-k\">- </span>");
    return out;
  }

  function highlight(code, lang) {
    switch (lang) {
      case "javascript": case "typescript": case "json5": return hlJs(code, lang === "typescript" ? "typescript" : "javascript");
      case "python": case "ruby": case "go": case "rust": case "java":
      case "csharp": case "php": case "bash": case "sql": case "docker":
      case "ini": return hlJs(code, lang);
      case "html": return hlHtml(code);
      case "css": case "scss": return hlCss(code);
      case "json": return hlJson(code);
      case "markdown": return hlMd(code);
      case "yaml": return hlYaml(code);
      default: return esc(code);
    }
  }

  /* ---------------- Editor controller ---------------- */
  var Editor = {
    els: {},
    path: null,
    dirty: false,
    onChangeCb: null,

    mount(rootSel) {
      var root = document.querySelector(rootSel);
      this.els.root = root;
      this.els.pre = root.querySelector("[data-ed='hl']");
      this.els.ta = root.querySelector("[data-ed='ta']");
      this.els.gutter = root.querySelector("[data-ed='lines']");
      this.els.status = root.querySelector("[data-ed='status']");
      this.els.minimap = root.querySelector("[data-ed='minimap']");

      var ta = this.els.ta, pre = this.els.pre, gut = this.els.gutter;

      ta.addEventListener("input", () => this._render());
      ta.addEventListener("scroll", () => {
        pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
        gut.scrollTop = ta.scrollTop;
        if (this.els.minimap) this.els.minimap.scrollTop = (ta.scrollTop / Math.max(1, ta.scrollHeight)) * this.els.minimap.scrollHeight;
      });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          var s = ta.selectionStart, en = ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(en);
          ta.selectionStart = ta.selectionEnd = s + 2;
          this._render();
        }
      });
      ta.addEventListener("blur", () => {
        if (this.path && ta.value !== PIKWorkspace.readFile(this.path)) {
          PIKWorkspace.writeFile(this.path, ta.value, { by: "user", note: "typed edit" });
        }
        this.dirty = false;
        this._status();
      });
    },

    open(path) {
      var content = PIKWorkspace.readFile(path) || "";
      this.path = path;
      this.els.ta.value = content;
      this._render();
      this.els.ta.focus();
    },

    _render() {
      var code = this.els.ta.value;
      var lang = PIKWorkspace.langFor(this.path || "file.txt");
      this.els.pre.innerHTML = highlight(code, lang) + "\n";
      var lines = code.split("\n").length;
      var arr = [];
      for (var i = 1; i <= lines; i++) arr.push(i);
      this.els.gutter.textContent = arr.join("\n");
      if (this.els.minimap) {
        this.els.minimap.innerHTML = '<pre class="mm__code">' + highlight(code, lang) + "</pre>";
      }
      this.dirty = this.path ? code !== (PIKWorkspace.readFile(this.path) || "") : !!code;
      this._status();
      if (this.onChangeCb) this.onChangeCb(code, this.path);
    },

    _status() {
      if (!this.els.status) return;
      var meta = this.path ? PIKWorkspace.fileMeta(this.path) : null;
      var lang = PIKWorkspace.langFor(this.path || "file.txt");
      var dig = meta && meta.digest ? ("sha256:" + String(meta.digest).slice(0, 10)) : "unsaved";
      var ver = meta && meta.history ? meta.history.length : 0;
      this.els.status.innerHTML =
        '<span>' + (this.path || "untitled") + '</span><i>·</i>' +
        '<span>' + lang + '</span><i>·</i>' +
        '<span>' + this.els.ta.value.split("\n").length + ' lines</span><i>·</i>' +
        '<span>v' + ver + '</span><i>·</i>' +
        '<span class="ed-digest">' + dig + '</span>' +
        (this.dirty ? '<span class="ed-dirty">● modified</span>' : '');
    },

    insert(text) {
      var ta = this.els.ta;
      var s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      this._render();
    }
  };

  global.PIKEditor = Editor;
  global.PIKHighlight = highlight;
})(window);
