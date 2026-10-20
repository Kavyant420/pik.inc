/* ============================================================================
   PIK//NEXUS — markdown.js
   Shared, XSS-safe markdown-lite renderer used by the chat thread and the
   editor's preview tab. Supports: ATX headings (# … ######), **bold**,
   __bold__, *italic*, _italic_, ~~strike~~, `inline code`, fenced ```blocks```,
   - / * / 1. lists, > blockquotes, [links](url), horizontal rules, line
   breaks. Everything is escaped BEFORE any HTML is generated.
   ========================================================================= */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* inline pass on already-escaped text.
     `md` (true) = markdown mode: also honor raw <br>/line-breaks from the
     block pass and treat \\\\[^\n] as a hard break. */
  function inline(t) {
    return t
      .replace(/`([^`\n]+)`/g, '<code class="nx-inline">$1</code>')
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1<em>$2</em>")
      .replace(/(^|[_\s(])_([^_\n]+)_(?![_\w])/g, "$1<em>$2</em>")
      .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
      .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  /* ---------- block table renderer (GFM pipes) ---------- */
  function splitRow(row) {
    var s = row.trim().replace(/^\|/, "").replace(/\|\s*$/, "");
    var cells = [], cur = "", esc = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (esc) { cur += c; esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === "|") { cells.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    cells.push(cur.trim());
    return cells;
  }

  function MD_render(src) {
    src = String(src == null ? "" : src);
    var fences = [];
    /* pull fenced code blocks out first so their contents are never mangled */
    src = src.replace(/```([\w\-./=]*)\r?\n([\s\S]*?)```/g, function (_, info, body) {
      var lang = String(info || "").trim().split(/[\s:]/)[0].toLowerCase();
      var i = fences.length;
      fences.push('<pre class="md-pre"><div class="md-pre__bar"><span>' + esc(lang || "code") +
        '</span><button class="md-copy" type="button" data-md-copy="' + i + '">copy</button></div><code>' +
        esc(body.replace(/\n$/, "")) + "</code></pre>");
      return "\u0000F" + i + "\u0000";
    });
    /* protect inline code too, so | or _ inside `code` is never touched */
    var icodes = [];
    src = src.replace(/`([^`\n]+)`/g, function (_, c) {
      var i = icodes.length;
      icodes.push('<code class="nx-inline">' + esc(c) + "</code>");
      return "\u0000I" + i + "\u0000";
    });
    /* stash math regions (raw TeX, never escaped/mangled by the block pass) */
    var maths = [];
    function keepMath(html) { maths.push(html); return "\u0000Q" + (maths.length - 1) + "\u0000"; }
    if (global.PIKMath) {
      src = src.replace(/\$\$([\s\S]+?)\$\$/g, function (_, t) { return keepMath(PIKMath.renderTex(t, true)); });
      src = src.replace(/\\\[([\s\S]+?)\\\]/g, function (_, t) { return keepMath(PIKMath.renderTex(t, true)); });
      src = src.replace(/\\\(([\s\S]+?)\\\)/g, function (_, t) { return keepMath(PIKMath.renderTex(t, false)); });
      src = src.replace(/\$([^$\n]+?)\$/g, function (all, t) {
        if (/^\s|\s$/.test(t)) return all;
        return keepMath(PIKMath.renderTex(t, false));
      });
    }

    var lines = src.split("\n");
    var out = [], para = [], listType = null, inQuote = false;

    function flushPara() {
      if (para.length) {
        out.push("<p>" + inline(para.join("\n")).replace(/\n/g, "<br>") + "</p>");
        para = [];
      }
    }
    function closeList() { if (listType) { out.push("</" + listType + ">"); listType = null; } }
    function closeQuote() { if (inQuote) { out.push("</blockquote>"); inQuote = false; } }
    function finish(h) { flushPara(); closeList(); closeQuote(); out.push(h); }

    function isTableSep(ln) {
      return /^\s*\|?[\s:|-]+\|?\s*$/.test(ln) && ln.indexOf("-") !== -1 && ln.indexOf("|") !== -1;
    }
    function alignOf(cell) {
      var l = /^:/.test(cell), r = /:$/.test(cell);
      return l && r ? "center" : r ? "right" : l ? "left" : "";
    }
    function renderTable(hdrLine, sepLine, rowLines) {
      var heads = splitRow(hdrLine);
      var seps = splitRow(sepLine);
      var aligns = seps.map(alignOf);
      var html = '<div class="md-tablewrap"><table class="md-table"><thead><tr>';
      heads.forEach(function (h, i) {
        var a = aligns[i];
        html += "<th" + (a ? ' style="text-align:' + a + '"' : "") + ">" + inline(esc(h)) + "</th>";
      });
      html += "</tr></thead><tbody>";
      rowLines.forEach(function (row) {
        var cells = splitRow(row);
        html += "<tr>";
        for (var i = 0; i < heads.length; i++) {
          var a2 = aligns[i];
          html += "<td" + (a2 ? ' style="text-align:' + a2 + '"' : "") + ">" + inline(esc(cells[i] == null ? "" : cells[i])) + "</td>";
        }
        html += "</tr>";
      });
      html += "</tbody></table></div>";
      return html;
    }

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i], m;

      if (/^\s*\u0000F\d+\u0000\s*$/.test(ln)) { finish(ln.trim()); continue; }

      if ((m = /^(#{1,6})\s+(.*)$/.exec(ln))) {           // ## heading
        finish(inline(esc(m[2])).replace(/^/, "<h" + m[1].length + ' class="md-h">') + "</h" + m[1].length + ">");
        continue;
      }
      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(ln)) {       // hr
        finish("<hr class=\"md-hr\">"); continue;
      }

      /* GFM table: header row with | + separator row */
      if (ln.indexOf("|") !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1]) &&
          /\S/.test(ln)) {
        flushPara(); closeList(); closeQuote();
        var rows = [];
        var j = i + 2;
        while (j < lines.length && lines[j].indexOf("|") !== -1 && lines[j].trim()) { rows.push(lines[j]); j++; }
        finish(renderTable(ln, lines[i + 1], rows));
        i = j - 1;
        continue;
      }

      if ((m = /^\s*&gt;\s?(.*)$/.exec(esc(ln)))) {       // blockquote (already-escaped >)
        flushPara(); closeList();
        if (!inQuote) { out.push("<blockquote>"); inQuote = true; }
        out.push("<p>" + inline(esc(m[1])).replace(/\n/g, "<br>") + "</p>");
        continue;
      } else if (inQuote && !ln.trim()) { closeQuote(); continue; }
      else if (inQuote) { closeQuote(); }

      if ((m = /^\s*[-+]\s+\[[ xX]\]\s+(.*)$/.exec(ln))) { // task item (- [ ] / - [x])
        flushPara();
        if (listType !== "ul") { closeList(); out.push('<ul class="md-tasks">'); listType = "ul"; }
        var done = /\[[xX]\]/.test(ln);
        out.push('<li class="md-task"><span class="md-check' + (done ? " is-on" : "") + '"></span>' + inline(esc(m[1])) + "</li>");
        continue;
      }
      if ((m = /^\s*\[[ xX]\]\s+(.*)$/.exec(ln))) {       // bare task item
        flushPara();
        if (listType !== "ul") { closeList(); out.push('<ul class="md-tasks">'); listType = "ul"; }
        var done2 = ln.trim()[1].toLowerCase() === "x";
        out.push('<li class="md-task"><span class="md-check' + (done2 ? " is-on" : "") + '"></span>' + inline(esc(m[1])) + "</li>");
        continue;
      }
      if ((m = /^\s*[-*+]\s+(.*)$/.exec(ln))) {           // ul item
        flushPara();
        if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
        out.push("<li>" + inline(esc(m[1])) + "</li>");
        continue;
      }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) {         // ol item
        flushPara();
        if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
        out.push("<li>" + inline(esc(m[1])) + "</li>");
        continue;
      }
      closeList();

      if (!ln.trim()) { flushPara(); continue; }
      para.push(esc(ln));
    }
    flushPara(); closeList(); closeQuote();

    var html = out.join("\n");
    /* reinstate fences + inline code + math */
    html = html.replace(/\u0000F(\d+)\u0000/g, function (_, k) { return fences[+k]; });
    html = html.replace(/\u0000I(\d+)\u0000/g, function (_, k) { return icodes[+k]; });
    html = html.replace(/\u0000Q(\d+)\u0000/g, function (_, k) { return maths[+k]; });
    return html;
  };

  /* render math inside already-produced HTML (for callers that post-process) */
  function MD_renderHtml(html) {
    if (!global.PIKMath) return html;
    var str = String(html == null ? "" : html);
    var codes = [];
    str = str.replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/g, function (f) {
      codes.push(f); return "\u0000C" + (codes.length - 1) + "\u0000";
    });
    str = PIKMath.render(str);
    str = str.replace(/\u0000C(\d+)\u0000/g, function (_, k) { return codes[+k]; });
    return str;
  }

  /* ---------- public object ---------- */
  var MD = {
    esc: esc,
    inline: inline,
    render: MD_render,
    renderHtml: MD_renderHtml,

    /* attach copy-button behaviour to a rendered container (event delegation) */
    wire(el) {
      if (!el || el.__mdWired) return;
      el.__mdWired = true;
      el.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-md-copy]");
        if (!btn) return;
        var pre = btn.closest(".md-pre");
        var code = pre && pre.querySelector("code");
        if (!code) return;
        var txt = code.textContent;
        var done = function () { btn.textContent = "copied"; setTimeout(function () { btn.textContent = "copy"; }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done);
        else done();
      });
    }
  };
  MD.render = MD_render;

  global.PIKMD = MD;
})(window);
