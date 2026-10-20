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

  /* Multi-line-safe tokenizer: comments / block strings / template literals
     may span newlines, so we split their raw match into per-line segments and
     re-wrap each in its own token span (never crosses row boundaries). */
  function tokSpan(cls, text) {
    if (text.indexOf("\n") === -1) {
      return '<span class="tk tk-' + cls + '">' + esc(text) + "</span>";
    }
    var parts = text.split("\n"), out = "";
    for (var k = 0; k < parts.length; k++) {
      if (parts[k]) out += '<span class="tk tk-' + cls + '">' + esc(parts[k]) + "</span>";
      if (k < parts.length - 1) out += "\n";
    }
    return out;
  }

  /* Stateful line-by-line tokenizer. A tiny carry-state lets multi-line
     constructs (/* … *\/ block comments, """ docstrings ''', `templates`) keep
     their token class across rows — every physical source line still gets its
     own highlighted output, so numbers can never misalign with code. */
  function tokenizeLines(src, lang) {
    var rules = RULES[lang] || RULES.js;
    var lines = src.split("\n");
    var state = null; // {cls, closer} while inside a multi-line construct
    MULTI_OPEN._active = MULTI_OPEN[lang] || null;
    var out = [];
    for (var L = 0; L < lines.length; L++) {
      var res = tokenizeLine(lines[L], rules, state);
      state = res.state;
      out.push(res.html);
    }
    MULTI_OPEN._active = null;
    return out;
  }

  var MULTI_OPEN = {
    js:   [[/^\/\*/, "cmt", /\*\//], [/^`/, "str", /`/], [/^"/, "str", /"/], [/^'/, "str", /'/]],
    python: [[/^"""(?!.*""")/, "str", /"""/], [/^'''(?!.*''')/, "str", /'''/],
             [/^"(?=(?:[^"\\]|\\.)*(?:$))/, "str", /"/], [/^'(?=(?:[^'\\]|\\.)*(?:$))/, "str", /'/]]
  };
  MULTI_OPEN.ts = MULTI_OPEN.javascript = MULTI_OPEN.jsx = MULTI_OPEN.typescript = MULTI_OPEN.js;
  MULTI_OPEN.py = MULTI_OPEN.python;
  MULTI_OPEN.css = [[/^\/\*/, "cmt", /\*\//]];
  MULTI_OPEN.scss = MULTI_OPEN.css;

  /* does `text`, starting an opener at position p, contain its closer later? */
  function hasCloser(text, p, closer) {
    var re = new RegExp(closer.source, "g");
    re.lastIndex = p + (closer.source === "\\/\\*" ? 0 : 0);
    return re.test(text.slice(p));
  }

  function tokenizeLine(line, rules, state) {
    var out = "", i = 0, n = line.length, plain = "";
    var opens = MULTI_OPEN._active || null;
    function flush() { if (plain) { out += esc(plain); plain = ""; } }
    while (i < n) {
      var rest = line.slice(i);
      /* inside a carried multi-line token until its closer appears */
      if (state) {
        var cm = state.closer.exec(rest);
        if (cm) {
          var seg = rest.slice(0, cm.index + cm[0].length);
          flush();
          out += '<span class="tk tk-' + state.cls + '">' + esc(seg) + "</span>";
          i += seg.length; state = null; continue;
        }
        flush();
        out += '<span class="tk tk-' + state.cls + '">' + esc(rest) + "</span>";
        return { html: out, state: state };
      }
      if (/^[ \t]+/.test(rest)) { var ws = /^[ \t]+/.exec(rest)[0]; plain += ws; i += ws.length; continue; }
      flush();
      /* check openers BEFORE the rule table so unterminated strings/comments
         carry their state to the next physical line */
      var carried = false;
      if (opens) {
        for (var o = 0; o < opens.length; o++) {
          var om = opens[o][0].exec(rest);
          if (om && !hasCloser(rest, om[0].length, opens[o][2])) {
            out += '<span class="tk tk-' + opens[o][1] + '">' + esc(rest) + "</span>";
            state = { cls: opens[o][1], closer: opens[o][2] };
            return { html: out, state: state };
          }
        }
      }
      var matched = false;
      for (var r = 0; r < rules.length; r++) {
        var m = rules[r][1].exec(rest);
        if (m && m[0].length) {
          out += tokSpan(rules[r][0], m[0]);
          i += m[0].length; matched = true; break;
        }
      }
      if (!matched) { plain += line[i]; i++; }
    }
    flush();
    return { html: out, state: state };
  }

  /* Render one physical source line -> highlighted HTML (stateless per line,
     so multi-line block matches simply degrade to repeated rule hits). */
  function tokenize(src, lang) {
    var rules = RULES[lang] || RULES.js;
    return tokenizeLines(src, lang).join("\n");
  }

  /* Per-line grid layout: every row is [number | code] on the SAME grid row,
     so line numbers can never stack above the code (the old bug). */
  function renderRows(src, lang) {
    var lines = src.split("\n");
    var htmlLines = tokenizeLines(src, lang);
    var rows = "";
    for (var i = 0; i < lines.length; i++) {
      rows += '<span class="md-code__no" aria-hidden="true">' + (i + 1) + "</span>" +
              '<span class="md-code__ln">' + (lang ? htmlLines[i] : esc(lines[i])) + "</span>";
    }
    return '<div class="md-code__body">' + rows + "</div>";
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
        /* Rebuild the block as a per-line grid: [number | code] share one row.
           This kills the old bug where the whole gutter printed first and the
           code appeared below it (two stacked blocks instead of aligned rows). */
        pre.classList.add("md-code");
        pre.classList.remove("md-pre");
        pre.classList.add("md-code--" + (RULES[lang] ? lang : "txt"));
        pre.innerHTML =
          (bar ? '<div class="md-code__bar">' + bar.innerHTML + "</div>" : "") +
          renderRows(srcText, RULES[lang] ? lang : null);

        /* keep original source on the node so copy grabs raw text */
        pre._src = srcText;

        var barEl = pre.querySelector(".md-code__bar");
        if (barEl) {
          /* wrap toggle */
          var wrapBtn = document.createElement("button");
          wrapBtn.type = "button";
          wrapBtn.className = "md-copy md-wrapbtn";
          wrapBtn.textContent = "wrap";
          wrapBtn.addEventListener("click", function () {
            pre.classList.toggle("is-wrap");
          });
          barEl.appendChild(wrapBtn);
          /* copy uses raw source (never highlighted HTML) */
          var cp = barEl.querySelector(".md-copy:not(.md-wrapbtn)");
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
