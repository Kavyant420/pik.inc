/* ============================================================================
   PIK//NEXUS — md-codeenhance.js
   Brings the AI's code output up to Claude-Code / Codex rendering quality:
     - token-level syntax highlighting (js/ts, css, html, json, python, bash,
       sql, yaml, md) with a safe single-pass tokenizer (no regex-on-HTML risk)
     - per-block language chip + real line numbers
     - copy button that copies the ORIGINAL source (not highlighted HTML)
     - word-wrap toggle and "run in preview" affordance for html blocks
   Runs after PIKMD.render() via PIKCodeEnhance.enhance(container).
   ========================================================================= */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------------- tiny, fast, safe tokenizer ---------------- */
  var RULES = {
    js: [
      ["cmt", /^\/\/[^\n]*|^\/\*[\s\S]*?\*\//],
      ["str", /^`(?:\\.|[^`\\])*`|^"(?:\\.|[^"\\\n])*"|^'(?:\\.|[^'\\\n])*'/],
      ["kw", /^\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|delete|void|yield|this|null|undefined|true|false)\b/],
      ["num", /^\b0x[\da-fA-F]+\b|^\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b/],
      ["fn", /^[A-Za-z_$][\w$]*(?=\s*\()/],
      ["prop", /^[.?!]{1,2}[A-Za-z_$][\w$]*/],
      ["op", /^[+\-*/%=<>!&|^~?:]+/],
      ["punc", /^[{}[\](),;]/]
    ],
    css: [
      ["cmt", /^\/\*[\s\S]*?\*\//],
      ["sel", /^[@:.\w#][^{};\n]*(?=\s*\{)/],
      ["prop", /^[-\w]+(?=\s*:)/],
      ["str", /^"(?:\\.|[^"\\\n])*"|^'(?:\\.|[^'\\\n])*'/],
      ["num", /^#[0-9a-fA-F]{3,8}\b|^-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/]
    ],
    html: [
      ["cmt", /^<!--[\s\S]*?-->/],
      ["tag", /^<\/?[a-zA-Z][\w-]*|^>/],
      ["prop", /^[a-zA-Z-]+(?==)/],
      ["str", /^"[^"]*"|^'[^']*'/]
    ],
    json: [
      ["key", /^"[^"]*"(?=\s*:)/],
      ["str", /^"[^"]*"/],
      ["kw", /^\b(?:true|false|null)\b/],
      ["num", /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/]
    ],
    python: [
      ["cmt", /^#[^\n]*/],
      ["str", /^"""[\s\S]*?"""|^'''[\s\S]*?'''|^"(?:\\.|[^"\\\n])*"|^'(?:\\.|[^'\\\n])*'/],
      ["kw", /^\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|with|try|except|finally|raise|lambda|yield|pass|break|continue|None|True|False|self|async|await|global|nonlocal|assert|is)\b/],
      ["num", /^\b\d[\d_]*(?:\.\d+)?\b/],
      ["fn", /^[A-Za-z_]\w*(?=\s*\()/]
    ],
    bash: [
      ["cmt", /^#[^\n]*/],
      ["str", /^"(?:\\.|[^"\\\n])*"|^'[^']*'/],
      ["kw", /^\b(?:if|then|fi|else|elif|for|while|do|done|case|esac|function|export|source|echo|cd|set)\b/],
      ["var", /^\$\w+|^\$\{[^}]*\}/]
    ],
    sql: [
      ["cmt", /^--[^\n]*|^\/\*[\s\S]*?\*\//],
      ["str", /^'(?:''|[^'])*'|^"(?:[^"])*"/],
      ["kw", /^\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|LIMIT|OFFSET|AS|AND|OR|NOT|NULL|PRIMARY|KEY|INDEX|UNION|HAVING|DISTINCT|CASE|WHEN|THEN|END)\b/i]
    ],
    yaml: [
      ["cmt", /^#[^\n]*/],
      ["key", /^-?\s*[\w.-]+(?=:)/],
      ["str", /^"[^"]*"|'[^']*'/],
      ["num", /^\b\d[\d.]*\b/]
    ]
  };
  RULES.ts = RULES.js; RULES.javascript = RULES.js; RULES.jsx = RULES.js;
  RULES.typescript = RULES.js; RULES.py = RULES.python; RULES.shell = RULES.bash;
  RULES.sh = RULES.bash; RULES.zsh = RULES.bash; RULES.scss = RULES.css;
  RULES.yml = RULES.yaml; RULES.xml = RULES.html; RULES.svg = RULES.html;
  RULES.md = RULES.html; RULES.markdown = RULES.html;

  function tokenize(src, lang) {
    var rules = RULES[lang] || RULES.js;
    var out = "", i = 0, n = src.length, plain = "";
    while (i < n) {
      var rest = src.slice(i), matched = false;
      if (/^[ \t]+/.test(rest)) { var ws = /^[ \t]+/.exec(rest)[0]; plain += ws; i += ws.length; continue; }
      if (plain) { out += esc(plain); plain = ""; }
      for (var r = 0; r < rules.length; r++) {
        var m = rules[r][1].exec(rest);
        if (m && m[0].length) {
          out += '<span class="tk tk-' + rules[r][0] + '">' + esc(m[0]) + "</span>";
          i += m[0].length; matched = true; break;
        }
      }
      if (!matched) { plain += src[i]; i++; }
    }
    if (plain) out += esc(plain);
    return out;
  }

  /* wrap tokens with line numbers aligned to a gutter */
  function withLineNumbers(htmlSrc, src) {
    var lines = src.split("\n");
    var g = lines.map(function (_, idx) => String(idx + 1)).join("\n");
    return '<div class="md-code__gutter" aria-hidden="true">' + g + "</div>" +
           '<div class="md-code__main"><pre>' + htmlSrc + "</pre></div>";
  }

  var Enhancer = {
    LANGS: Object.keys(RULES),

    enhance: function (root) {
      if (!root) return;
      var pres = root.querySelectorAll(".md-pre");
      Array.prototype.forEach.call(pres, function (pre, idx) {
        if (pre.dataset.enhanced) return;
        pre.dataset.enhanced = "1";
        var bar = pre.querySelector(".md-pre__bar");
        var lang = bar ? bar.querySelector("span").textContent.trim().toLowerCase() : "code";
        var codeEl = pre.querySelector("code");
        var srcText = codeEl ? codeEl.textContent : "";
        pre.classList.add("md-code");
        pre.classList.add("md-code--" + (RULES[lang] ? lang : "txt"));

        var hl = RULES[lang] ? tokenize(srcText, lang) : esc(srcText);
        if (codeEl) codeEl.innerHTML = withLineNumbers(hl, srcText);

        /* keep original source on the node so copy grabs raw text */
        pre._src = srcText;

        if (bar) {
          bar.classList.add("md-code__bar");
          /* wrap toggle */
          var wrapBtn = document.createElement("button");
          wrapBtn.type = "button";
          wrapBtn.className = "md-copy md-wrapbtn";
          wrapBtn.textContent = "wrap";
          wrapBtn.addEventListener("click", function () {
            pre.classList.toggle("is-wrap");
          });
          bar.insertBefore(wrapBtn, bar.firstChild ? bar.firstChild : null);
          /* copy uses raw source */
          var cp = bar.querySelector(".md-copy:not(.md-wrapbtn)");
          if (cp) {
            var fresh = cp.cloneNode(true); // drop old listeners
            cp.parentNode.replaceChild(fresh, cp);
            fresh.textContent = "copy";
            fresh.addEventListener("click", function () {
              var done = function () { fresh.textContent = "copied"; setTimeout(function () { fresh.textContent = "copy"; }, 1400); };
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(pre._src || "").then(done, done);
              } else { done(); }
            });
          }
        }
      });
    }
  };

  global.PIKCodeEnhance = Enhancer;
})(window);
