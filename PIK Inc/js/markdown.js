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

  /* inline pass on already-escaped text */
  function inline(t) {
    return t
      .replace(/`([^`\n]+)`/g, '<code class="nx-inline">$1</code>')
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1<em>$2</em>")
      .replace(/(^|[_\s(])_([^_\n]+)_(?![_\w])/g, "$1<em>$2</em>")
      .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  var MD = {
    esc: esc,
    inline: inline,

    /* full block renderer -> HTML string */
    render(src) {
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

      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i], m;

        if (/^\s*\u0000F\d+\u0000\s*$/.test(ln)) { flushPara(); closeList(); closeQuote(); out.push(ln.trim()); continue; }

        if ((m = /^(#{1,6})\s+(.*)$/.exec(ln))) {           // ## heading
          flushPara(); closeList(); closeQuote();
          var lvl = m[1].length;
          out.push("<h" + lvl + ' class="md-h">' + inline(esc(m[2])) + "</h" + lvl + ">");
          continue;
        }
        if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(ln)) {       // hr
          flushPara(); closeList(); closeQuote(); out.push("<hr class=\"md-hr\">"); continue;
        }
        if ((m = /^\s*&gt;\s?(.*)$/.exec(esc(ln)))) {       // blockquote (already-escaped >)
          flushPara(); closeList();
          if (!inQuote) { out.push("<blockquote>"); inQuote = true; }
          out.push("<p>" + inline(esc(m[1])).replace(/\n/g, "<br>") + "</p>");
          continue;
        } else if (inQuote && !ln.trim()) { closeQuote(); continue; }
        else if (inQuote) { closeQuote(); }

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
      /* reinstate fences */
      html = html.replace(/\u0000F(\d+)\u0000/g, function (_, i) { return fences[+i]; });
      return html;
    },

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

  global.PIKMD = MD;
})(window);
