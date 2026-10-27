/* ============================================================================
   PIK//NEXUS — math.js  (keyless, offline LaTeX renderer)
   Renders \(inline\) and $$display$$ / \[display\] TeX into styled HTML using
   a built-in subset grammar — no API key, no CDN required. If the KaTeX CDN
   happens to be loaded on the page, it is preferred automatically.

   Supported: fractions \frac{}{}, roots \sqrt[n]{}, sup/sub ^_ with braces,
   Greek letters, big operators (\sum \int \prod \lim with limits),
   \vec \hat \bar \dot \tilde, \mathbb, \mathrm/\text/\bf, ~thin spaces,
   \left\right sizing, binary relations & operators, \pm \mp \to \infty etc.,
   \begin{matrix/pmatrix/bmatrix/vmatrix/cases}{...} matrices, \\ line breaks.
   Anything unknown degrades gracefully to readable text — never raw garbage.
   ========================================================================= */
(function (global) {
  "use strict";

  /* ---------- symbol tables ---------- */
  var SYM = {
    alpha:"α", beta:"β", gamma:"γ", delta:"δ", epsilon:"ε", varepsilon:"ε", zeta:"ζ",
    eta:"η", theta:"θ", vartheta:"ϑ", iota:"ι", kappa:"κ", lambda:"λ", mu:"μ", nu:"ν",
    xi:"ξ", pi:"π", varpi:"ϖ", rho:"ρ", sigma:"σ", varsigma:"ς", tau:"τ", upsilon:"υ",
    phi:"φ", varphi:"ϕ", chi:"χ", psi:"ψ", omega:"ω",
    Gamma:"Γ", Delta:"Δ", Theta:"Θ", Lambda:"Λ", Xi:"Ξ", Pi:"Π", Rho:"Ρ", Sigma:"Σ",
    Upsilon:"Υ", Phi:"Φ", Psi:"Ψ", Omega:"Ω",
    infty:"∞", partial:"∂", nabla:"∇", forall:"∀", exists:"∃", neg:"¬", lnot:"¬",
    emptyset:"∅", varnothing:"∅", angle:"∠", triangle:"△", square:"□", star:"⋆",
    prime:"′", degree:"°", hbar:"ℏ", ell:"ℓ", wp:"℘", Re:"ℜ", Im:"ℑ",
    ldots:"…", cdots:"⋯", vdots:"⋮", ddots:"⋱", dots:"…",
    sum:"∑", prod:"∏", int:"∫", iint:"∬", iiint:"∭", oint:"∮", bigcup:"⋃", bigcap:"⋂",
    lim:"lim", max:"max", min:"min", sup:"sup", inf:"inf",
    le:"≤", leq:"≤", ge:"≥", geq:"≥", ne:"≠", neq:"≠", approx:"≈", equiv:"≡",
    sim:"∼", simeq:"≃", cong:"≅", propto:"∝", ll:"≪", gg:"≫",
    subset:"⊂", subseteq:"⊆", supset:"⊃", supseteq:"⊇", in:"∈", notin:"∉", ni:"∋",
    cup:"∪", cap:"∩", setminus:"∖",
    pm:"±", mp:"∓", times:"×", div:"÷", ast:"∗", star2:"⋆", circ:"∘", bullet:"∙",
    cdot:"·", ldotp:"·",
    to:"→", rightarrow:"→", leftarrow:"←", leftrightarrow:"↔", Rightarrow:"⇒",
    Leftarrow:"⇐", Leftrightarrow:"⇔", implies:"⟹", iff:"⟺", mapsto:"↦",
    longrightarrow:"⟶", longleftarrow:"⟵",
    perp:"⊥", parallel:"∥", mid:"∣",
    langle:"⟨", rangle:"⟩", lfloor:"⌊", rfloor:"⌋", lceil:"⌈", rceil:"⌉",
    quad:"\u2004", qquad:"\u2005", ",":"\u2009", ";":"\u2009", ":":"\u2009", "!":"",
    space:" ", " ":" ",
    therefore:"∴", because:"∵", checkmark:"✓", dagger:"†",
    arrowright:"→", arrowleft:"←"
  };

  var FUNCS = ["sin","cos","tan","cot","sec","csc","sinh","cosh","tanh","coth",
    "arcsin","arccos","arctan","log","ln","lg","exp","det","dim","gcd","arg",
    "ker","deg","bmod"];
  var FUNCSET = {}; FUNCS.forEach(function (f) { FUNCSET[f] = 1; });

  var BB = { A:"𝔸",C:"ℂ",H:"ℍ",N:"ℕ",P:"ℙ",Q:"ℚ",R:"ℝ",Z:"ℤ",
    a:"𝕒",b:"𝕓",c:"𝕔",d:"𝕕",e:"𝕖",f:"𝕗",g:"𝕘",h:"𝕙",i:"𝕚",j:"𝕛",k:"𝕜",l:"𝕝",
    m:"𝕞",n:"𝕟",o:"𝕠",p:"𝕡",q:"𝕢",r:"𝕣",s:"𝕤",t:"𝕥",u:"𝕦",v:"𝕧",w:"𝕨",x:"𝕩",
    y:"𝕪",z:"𝕫" };
  var CAL = {A:"𝒜",B:"ℬ",C:"𝒞",D:"𝒟",E:"ℰ",F:"ℱ",G:"𝒢",H:"ℋ",I:"ℐ",J:"𝒥",K:"𝒦",
    L:"ℒ",M:"ℳ",N:"𝒩",O:"𝒪",P:"𝒫",Q:"𝒬",R:"ℛ",S:"𝒮",T:"𝒯",U:"𝒰",V:"𝒱",W:"𝒲",
    X:"𝒳",Y:"𝒴",Z:"𝒵"};

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  /* ---------- recursive-descent TeX -> HTML ---------- */
  function Tex(src, display) {
    this.s = src; this.i = 0; this.display = !!display;
  }
  Tex.prototype.peekCh = function () { return this.s[this.i]; };
  Tex.prototype.readArg = function () {
    this.skipWs();
    var c = this.s[this.i];
    if (c === "{") { var g = this.readBraced(); return g; }
    if (c === undefined) return "";
    if (c === "\\") { this.i++; return this.cmd(); }
    this.i++; return "<span class=\"mi\">" + esc(c) + "</span>";
  };
  Tex.prototype.readBraced = function () {
    // assumes s[i] === '{'
    this.i++; var depth = 1, start = this.i;
    while (this.i < this.s.length && depth > 0) {
      var c = this.s[this.i];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (!depth) break; }
      else if (c === "\\") this.i++;
      this.i++;
    }
    var body = this.s.slice(start, this.i);
    this.i++; // consume }
    return new Tex(body, false).parse();
  };
  Tex.prototype.skipWs = function () { while (/[ \t]/.test(this.s[this.i] || "")) this.i++; };
  Tex.prototype.readCmdName = function () {
    var m = /^[a-zA-Z]+/.exec(this.s.slice(this.i));
    if (m) { this.i += m[0].length; return m[0]; }
    var c = this.s[this.i] || ""; this.i++; return c;
  };

  Tex.prototype.parse = function () {
    var out = [];
    while (this.i < this.s.length) {
      var c = this.s[this.i];
      if (c === "\\") { this.i++; out.push(this.cmd()); continue; }
      if (c === "{" ) { out.push(this.readBraced()); continue; }
      if (c === "}" ) { this.i++; continue; }
      if (c === "^" || c === "_") { out.push(this.scripted(out.pop() || "")); continue; }
      if (c === "&") { out.push("</td><td>"); this.i++; continue; }
      if (c === "~") { out.push("&nbsp;"); this.i++; continue; }
      if (c === "\n") { out.push(" "); this.i++; continue; }
      if (/[0-9.]/.test(c)) {
        var m = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.s.slice(this.i));
        out.push("<span class=\"mn\">" + m[0] + "</span>"); this.i += m[0].length; continue;
      }
      if (/[a-zA-Z]/.test(c)) {
        // multi-letter plain word like "abc" or function name
        var mm = /^[a-zA-Z]+/.exec(this.s.slice(this.i));
        var w = mm[0];
        if (FUNCSET[w]) { out.push("<span class=\"mop\">" + w + "</span>"); }
        else {
          var letters = "";
          for (var k = 0; k < w.length; k++) letters += "<span class=\"mi\">" + w[k] + "</span>";
          out.push(letters);
        }
        this.i += w.length; continue;
      }
      if (/[+\-=<>*,;:.\/|!()\[\]']/.test(c) || /\s/.test(c)) {
        var cls = /[+\-=<>*/]/.test(c) ? "mo" : "mpunct";
        out.push("<span class=\"" + cls + "\">" + esc(c === "-" ? "−" : c) + "</span>");
        this.i++; continue;
      }
      out.push(esc(c)); this.i++;
    }
    return out.join("");
  };

  Tex.prototype.scripted = function (base) {
    base = base || "<span class=\"mo\"></span>";
    var ch = this.s[this.i]; this.i++;
    var arg;
    if (ch === "^") {
      arg = this.readOptArgOrToken();
      return base + "<span class=\"msup\">" + arg + "</span>";
    }
    arg = this.readOptArgOrToken();
    return base + "<span class=\"msub\">" + arg + "</span>";
  };
  Tex.prototype.readOptArgOrToken = function () {
    this.skipWs();
    var c = this.s[this.i];
    if (c === "{") return this.readBraced();
    if (c === "\\") { this.i++; return this.cmd(); }
    if (c === undefined) return "";
    this.i++;
    if (/[a-zA-Z]/.test(c)) return "<span class=\"mi\">" + c + "</span>";
    if (/[0-9.]/.test(c)) {
      var m = /^[0-9.]+/.exec(this.s.slice(this.i - 1));
      this.i += m[0].length - 1;
      return "<span class=\"mn\">" + m[0] + "</span>";
    }
    return "<span class=\"mo\">" + esc(c) + "</span>";
  };

  Tex.prototype.cmd = function () {
    var name = this.readCmdName();
    switch (name) {
      case "frac": case "dfrac": case "tfrac": {
        var a = this.readArg(), b = this.readArg();
        return "<span class=\"frac\"><span class=\"fnum\">" + a + "</span><span class=\"fden\">" + b + "</span></span>";
      }
      case "binom": case "choose": {
        var x = this.readArg(), y = this.readArg();
        return "<span class=\"delim dl\">(</span><span class=\"frac nomathline\"><span class=\"fnum\" style=\"border:none\">" + x + "</span><span class=\"fden\">" + y + "</span></span><span class=\"delim dr\">)</span>";
      }
      case "sqrt": {
        var idx = "";
        var save = this.i; this.skipWs();
        if (this.s[this.i] === "[") { this.i++; var st = this.i;
          while (this.i < this.s.length && this.s[this.i] !== "]") this.i++;
          idx = new Tex(this.s.slice(st, this.i), false).parse(); this.i++; }
        else this.i = save;
        var body = this.readArg();
        return "<span class=\"sqrt\">" + (idx ? "<span class=\"sidx\">" + idx + "</span>" : "") +
          "<span class=\"srad\">√</span><span class=\"sbody\">" + body + "</span></span>";
      }
      case "vec": return "<span class=\"accent acc-vec\">" + this.readArg() + "</span>";
      case "hat": case "widehat": return "<span class=\"accent acc-hat\">" + this.readArg() + "</span>";
      case "bar": case "overline": case "widebar": return "<span class=\"accent acc-bar\">" + this.readArg() + "</span>";
      case "dot": return "<span class=\"accent acc-dot\">" + this.readArg() + "</span>";
      case "ddot": return "<span class=\"accent acc-ddot\">" + this.readArg() + "</span>";
      case "tilde": case "widetilde": return "<span class=\"accent acc-tilde\">" + this.readArg() + "</span>";
      case "underline": return "<span class=\"accent acc-under\">" + this.readArg() + "</span>";
      case "text": case "textrm": case "textnormal": case "mbox": {
        var t = this.readRawText(); return "<span class=\"mtex\">" + esc(t) + "</span>";
      }
      case "mathrm": case "operatorname": {
        var r = this.readRawText(); return "<span class=\"mmode\">" + esc(r) + "</span>";
      }
      case "mathbf": case "bf": case "bm": {
        var b = this.readRawText(); return "<b class=\"mi\">" + esc(b) + "</b>";
      }
      case "mathit": { var it = this.readRawText(); return "<i class=\"mi\">" + esc(it) + "</i>"; }
      case "mathbb": {
        var raw = this.readRawText(), o = "";
        for (var i = 0; i < raw.length; i++) o += BB[raw[i]] || raw[i];
        return "<span class=\"mbb\">" + esc(o) + "</span>";
      }
      case "mathcal": case "mathscr": {
        var raw2 = this.readRawText(), o2 = "";
        for (var j = 0; j < raw2.length; j++) o2 += CAL[raw2[j]] || raw2[j];
        return "<span class=\"mbb\">" + esc(o2) + "</span>";
      }
      case "boldsymbol": case "pmb": return "<b>" + this.readArg() + "</b>";
      case "left": case "right": {
        this.skipWs();
        var d = this.s[this.i]; this.i++;
        if (d === "\\") { var dn = this.readCmdName(); d = SYM[dn] || dn; }
        if (d === "." || d === "") d = "";
        return "<span class=\"delim " + (name === "left" ? "dl" : "dr") + "\">" + esc(d) + "</span>";
      }
      case "big": case "Big": case "bigg": case "Bigg": case "leftmiddle": case "middle": {
        this.skipWs(); var bd = this.s[this.i]; this.i++;
        if (bd === "\\") { var bdn = this.readCmdName(); bd = SYM[bdn] || bdn; }
        return "<span class=\"delim\">" + esc(bd || "") + "</span>";
      }
      case "begin": return this.env();
      case "end": { this.readRawText(); return ""; }
      case "\\": return "<br class=\"mlinebreak\"/>";
      case "nonumber": case "notag": return "";
      case "ce": case "si": return "<span class=\"mtex\">" + esc(this.readRawText()) + "</span>";
      default:
        if (SYM[name] !== undefined) return "<span class=\"mo sym\">" + SYM[name] + "</span>";
        if (FUNCSET[name]) return "<span class=\"mop\">" + name + "</span>";
        if (name.length === 1) {
          if (name === "%") return "<span class=\"mn\">%</span>";
          if (name === "#") return "<span class=\"mn\">#</span>";
          if (name === "$") return "<span class=\"mn\">$</span>";
          if (name === "&") return "<span class=\"mn\">&amp;</span>";
          if (name === "_") return "<span class=\"mn\">_</span>";
          if (name === "{") return "<span class=\"mo\">{</span>";
          if (name === "}") return "<span class=\"mo\">}</span>";
          if (name === "|") return "<span class=\"mo\">|</span>";
          if (name === "`") return "<span class=\"mo\">‘</span>";
          return "<span class=\"mo\">" + esc(name) + "</span>";
        }
        return "<span class=\"mop\">" + esc(name) + "</span>"; // graceful fallback
    }
  };

  Tex.prototype.readRawText = function () {
    this.skipWs();
    if (this.s[this.i] === "{") return this.readBracedRaw();
    if (this.s[this.i] === "\\") { this.i++; return this.readCmdName(); }
    var c = this.s[this.i]; this.i++; return c == null ? "" : c;
  };
  Tex.prototype.readBracedRaw = function () {
    this.i++; var depth = 1, start = this.i;
    while (this.i < this.s.length && depth > 0) {
      var c = this.s[this.i];
      if (c === "{") depth++; else if (c === "}") { depth--; if (!depth) break; }
      this.i++;
    }
    var raw = this.s.slice(start, this.i); this.i++;
    return raw;
  };

  Tex.prototype.env = function () {
    var nm = this.readBracedRaw().trim();
    // collect until matching \end{nm}
    var endRe = new RegExp("\\\\end\\s*\\{\\s*" + nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\}");
    var rest = this.s.slice(this.i);
    var m = endRe.exec(rest);
    var body = m ? rest.slice(0, m.index) : rest;
    this.i += body.length + (m ? m[0].length : 0);
    var rows = body.split(/\\\\/).map(function (r) { return r.trim(); }).filter(function (r, idx, arr) {
      return !(r === "" && idx === arr.length - 1);
    });
    var self = this;
    function cellTex(code) { return new Tex(code, false).parse(); }
    if (nm === "cases") {
      var rowsHtml = rows.map(function (r) { return "<tr><td class=\"casecell\">" + cellTex(r) + "</td></tr>"; }).join("");
      return "<span class=\"delim dl\">{</span><table class=\"mat cases\">" + rowsHtml + "</table><span class=\"delim dr\" style=\"visibility:hidden\">{</span>";
    }
    var tbl = "<table class=\"mat\"><tbody>" + rows.map(function (r) {
      var cells = r.split("&");
      return "<tr>" + cells.map(function (c) { return "<td>" + cellTex(c) + "</td>"; }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
    var DELIMS = { matrix: ["", ""], pmatrix: ["(", ")"], bmatrix: ["[", "]"],
      vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], Bmatrix: ["{", "}"], smallmatrix: ["", ""] };
    var pair = DELIMS[nm] || ["", ""];
    if (pair[0] === "") return "<span class=\"matwrap\">" + tbl + "</span>";
    return "<span class=\"delim dl\">" + esc(pair[0]) + "</span>" + tbl + "<span class=\"delim dr\">" + esc(pair[1]) + "</span>";
  };

  /* ---------- public render ---------- */
  function renderTex(code, display) {
    try {
      if (global.katex) {
        return global.katex.renderToString(code, { displayMode: display, throwOnError: false, output: "html" });
      }
    } catch (e) { /* fall through to builtin */ }
    var inner = new Tex(code, display).parse();
    return '<span class="pik-tex' + (display ? " pik-tex--block" : "") + '">' + inner + "</span>";
  }

  /* protect code blocks first, then substitute math */
  function render(src) {
    src = String(src == null ? "" : src);
    var stash = [];
    function keep(html) { stash.push(html); return "\u0001M" + (stash.length - 1) + "\u0001"; }

    // fenced code stays untouched
    src = src.replace(/```[\s\S]*?```/g, function (f) { return keep(f); });
    // inline code spans too
    src = src.replace(/`[^`\n]+`/g, function (f) { return keep(f); });

    // display: $$..$$ , \[..\]
    src = src.replace(/\$\$([\s\S]+?)\$\$/g, function (_, t) { return keep(renderTex(t, true)); });
    src = src.replace(/\\\[([\s\S]+?)\\\]/g, function (_, t) { return keep(renderTex(t, true)); });
    // inline: \(..\) and $..$ (single-line, non-greedy, no adjacent digit rule loosely)
    src = src.replace(/\\\(([\s\S]+?)\\\)/g, function (_, t) { return keep(renderTex(t, false)); });
    src = src.replace(/\$([^$\n]+?)\$/g, function (_, t) {
      if (/^\s|\s$/.test(t)) return "$" + t + "$";
      return keep(renderTex(t, false));
    });

    src = src.replace(/\u0001M(\d+)\u0001/g, function (_, i) { return stash[+i]; });
    return src;
  }

  global.PIKMath = {
    render: render,
    renderTex: renderTex,
    /* strip math delimiters back to plain text (for copy/download of source) */
    symbols: SYM
  };
})(window);
