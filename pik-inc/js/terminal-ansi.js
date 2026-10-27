/* ============================================================================
   PIK//NEXUS — terminal-ansi.js
   Minimal ANSI/SGR renderer for the terminal view. Converts escape codes into
   styled spans (never innerHTML from raw text — everything is createElement +
   textContent, so command output can't inject markup). Supports:
     - 16-colour SGR + bright variants, reset, bold, dim, italic, underline
     - a small theme map so commands can use semantic tokens like %ACC%
   Also exposes helpers used by other modules: ansi(text)->DocumentFragment,
   plain(text) strips escapes.
   ========================================================================= */
(function (global) {
  "use strict";

  var BASE = {
    "0": null, "1": ["bold"], "2": ["dim"], "3": ["italic"], "4": ["underline"],
    "30": "--nx-term-fg", "31": "#e07a75", "32": "#8fbf88", "33": "#d9b36c",
    "34": "#86a8cc", "35": "#b892c9", "36": "#8fc0bf", "37": "#dfe2e6",
    "90": "#6f737a", "91": "#ff9c96", "92": "#b1e0a8", "93": "#f2cf8a",
    "94": "#a9c8ee", "95": "#dcB4ec", "96": "#b3e5e3", "97": "#ffffff"
  };

  var ANSI_RE = /\u001B\[([0-9;]*)m/g;

  function applyStyle(el, stack) {
    var color = null, bold = false, dim = false, ital = false, und = false;
    for (var i = 0; i < stack.length; i++) {
      var c = stack[i];
      if (c === "bold") bold = true;
      else if (c === "dim") dim = true;
      else if (c === "italic") ital = true;
      else if (c === "underline") und = true;
      else color = c;
    }
    if (color && color.slice(0, 2) === "--") el.style.color = "var(" + color + ")";
    else if (color) el.style.color = color;
    if (bold) el.style.fontWeight = "700";
    if (dim) el.style.opacity = ".55";
    if (ital) el.style.fontStyle = "italic";
    if (und) el.style.textDecoration = "underline";
  }

  var Ansi = {
    /* returns a DocumentFragment with styled spans */
    render: function (text) {
      var frag = document.createDocumentFragment();
      var stack = [], lastIdx = 0, m;
      ANSI_RE.lastIndex = 0;
      text = String(text == null ? "" : text);
      while ((m = ANSI_RE.exec(text)) !== null) {
        if (m.index > lastIdx) frag.appendChild(makeSpan(text.slice(lastIdx, m.index), stack));
        var codes = (m[1] || "0").split(";").filter(function (s) { return s !== ""; });
        if (!codes.length) codes = ["0"];
        for (var i = 0; i < codes.length; i++) {
          var code = codes[i];
          if (code === "0") stack = [];
          else {
            var v = BASE[code];
            if (v === null) stack = [];
            else if (Array.isArray(v)) stack = stack.concat(v);
            else stack.push(v);
          }
        }
        lastIdx = ANSI_RE.lastIndex;
      }
      if (lastIdx < text.length) frag.appendChild(makeSpan(text.slice(lastIdx), stack));
      return frag;

      function makeSpan(str, st) {
        var sp = document.createElement("span");
        sp.textContent = str;
        applyStyle(sp, st);
        return sp;
      }
    },

    strip: function (text) { return String(text || "").replace(/\u001B\[[0-9;]*m/g, ""); },

    /* semantic helpers used by commands & banners */
    acc: function (s) { return "\u001B[1m\u001B[36m" + s + "\u001B[0m"; },
    dim: function (s) { return "\u001B[2m" + s + "\u001B[0m"; },
    err: function (s) { return "\u001B[31m" + s + "\u001B[0m"; },
    good: function (s) { return "\u001B[32m" + s + "\u001B[0m"; },
    warn: function (s) { return "\u001B[33m" + s + "\u001B[0m"; },
    head: function (s) { return "\u001B[1m\u001B[37m" + s + "\u001B[0m"; }
  };

  global.PIKTerminalAnsi = Ansi;
})(window);
