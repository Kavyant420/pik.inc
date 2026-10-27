/* ============================================================================
   PIK//NEXUS — micro-tokenizer.js
   Byte-pair-ish tokenizer for the PIK MicroEngine. Deterministic, zero
   downloads: builds a compact vocabulary from a baked-in coding corpus at
   boot (~40 ms), then greedily merges frequent pairs up to VOCAB_CAP.
     - encode(text)  -> Uint16Array token ids  (UNK = 1)
     - decode(ids)   -> string
     - specials: <pad>=0  <unk>=1  <bos>=2  <eos>=3  <file>=4  <nl>=5
   ========================================================================= */
(function (global) {
  "use strict";

  var VOCAB_CAP = 8192;
  var SPECIALS = ["<pad>", "<unk>", "<bos>", "<eos>", "<file>", "<nl>"];

  /* compact seed corpus — code + prose fragments the micro-core leans on */
  var CORPUS = [
    "function build site static html css js app index page component state render update create make file folder tree workspace project terminal command deploy preview host agent think plan step write edit refactor fix bug test error log hash secure local model prompt answer code snippet block path name value type string number boolean array object map set list queue stack loop while for each item result output input data store cache session token key secret encrypt decrypt stream buffer chunk frame paint animation motion reveal hover click focus blur scroll resize observer worker thread promise async await return yield throw catch finally try if else switch case default break continue new delete typeof instanceof class extends super this self void null undefined true false const let var import export from as static public private protected readonly interface enum struct impl trait fn def lambda with try except raise pass global nonlocal assert del in is not and or package func type map chan defer nil range select",
    "#!/usr/bin/env bash\nif [ -f package.json ]; then npm run build; fi\ngit add . && git commit -m 'nexus: initial scaffold' && git push\nmkdir -p dist && cp index.html dist/\ncurl -s https://example.com/api | jq .data\necho done\nls -la src/ | grep css\nfor f in *.js; do echo $f; done\nwhile read line; do echo $line; done < list.txt\nexport PATH=$PATH:./bin\nchmod +x run.sh && ./run.sh --port 3000",
    "body { margin: 0; background: #060607; color: #e7e9ec; font-family: Inter, system-ui, sans-serif; }\n.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }\n.card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,.5); transition: all .3s ease; }\n@media (max-width: 720px) { .shell { padding: 12px; } }\n:root { --radius: 14px; --accent: #9ea4ad; }\n@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }",
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Pomodoro</title>\n<link rel=\"stylesheet\" href=\"styles.css\">\n</head>\n<body>\n<main class=\"app\">\n<h1>Pomodoro Timer</h1>\n<div id=\"clock\">25:00</div>\n<button id=\"start\">Start</button>\n<button id=\"reset\">Reset</button>\n</main>\n<script src=\"app.js\"></script>\n</body>\n</html>",
    "const TIMER = (() => {\n  let remaining = 25 * 60, running = false, id = null;\n  const clock = document.getElementById('clock');\n  function fmt(s) { return String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0'); }\n  function tick() { if (remaining > 0) { remaining--; clock.textContent = fmt(remaining); } else { stop(); } }\n  function start() { if (!running) { running = true; id = setInterval(tick, 1000); } }\n  function stop() { running = false; clearInterval(id); }\n  function reset() { stop(); remaining = 25 * 60; clock.textContent = fmt(remaining); }\n  return { start, stop, reset };\n})();",
    "Plan: 1. scaffold index.html with semantic markup. 2. write styles.css using the grey monochrome theme. 3. implement app.js as an IIFE module. 4. wire buttons to the timer state machine. 5. persist sessions in localStorage. 6. add keyboard shortcuts. The files below are complete and runnable.",
    "import { useState } from 'react';\nasync function load(url) { const res = await fetch(url); if (!res.ok) throw new Error(res.status); return res.json(); }\nclass Store { constructor(){ this.items = new Map(); } add(k,v){ this.items.set(k,v); } get(k){ return this.items.get(k); } }\ndef quicksort(xs):\n    if len(xs) <= 1: return xs\n    pivot = xs[0]\n    left = [x for x in xs[1:] if x < pivot]\n    right = [x for x in xs[1:] if x >= pivot]\n    return quicksort(left) + [pivot] + quicksort(right)",
    "The quick brown fox jumps over the lazy dog. Analysis: first understand the request, then decompose it into steps, verify assumptions, choose the simplest sufficient implementation, and emit every changed file as a fenced block with its path. Reasoning summary: entropy reduction over candidate solutions."
  ].join("\n");

  var Tok = {
    vocab: [],        // id -> string
    ids: {},          // string -> id
    ready: false,

    build: function () {
      if (this.ready) return;
      var t0 = performance.now();
      var counts = Object.create(null);
      var words = CORPUS.split(/(?=[^A-Za-z0-9])|(?<=[^A-Za-z0-9])/).filter(Boolean);
      // start from characters, merge the most frequent bigram pairs greedily
      words.forEach(function (w) { counts[w] = (counts[w] || 0) + 1; });
      var base = Object.create(null);
      for (var i = 0; i < 256; i++) base[String.fromCharCode(i)] = 1;
      var merged = Object.assign({}, counts);
      var pairs = Object.create(null);
      function pairKey(a, b) { return a + "\u241F" + b; }
      for (var round = 0; round < 96; round++) {
        var best = null, bestN = 1;
        Object.keys(merged).forEach(function (w) {
          if (w.length < 2) return;
          for (var k = 1; k < w.length; k++) {
            var pk = pairKey(w.slice(0, k), w.slice(k));
            pairs[pk] = (pairs[pk] || 0) + merged[w];
          }
        });
        Object.keys(pairs).forEach(function (pk) {
          if (pairs[pk] > bestN) { bestN = pairs[pk]; best = pk; }
        });
        if (!best) break;
        var parts = best.split("\u241F");
        var combined = parts[0] + parts[1];
        merged[combined] = (merged[combined] || 0) + bestN;
      }
      var ranked = Object.keys(merged).sort(function (a, b) { return merged[b] - merged[a]; })
        .slice(0, Math.max(0, VOCAB_CAP - SPECIALS.length));
      this.vocab = SPECIALS.concat(ranked);
      this.ids = Object.create(null);
      for (var v = 0; v < this.vocab.length; v++) this.ids[this.vocab[v]] = v;
      this.ready = true;
      this.buildMs = Math.round(performance.now() - t0);
    },

    UNK: 1, BOS: 2, EOS: 3, NL: 5,

    encode: function (text) {
      this.build();
      text = String(text == null ? "" : text);
      var out = [];
      var re = /[A-Za-z_]+|[0-9]+(?:\.[0-9]+)?|\s+|[^\sA-Za-z0-9]/g;
      var m;
      while ((m = re.exec(text)) !== null) {
        var piece = m[0];
        if (piece === "\n") { out.push(this.NL); continue; }
        var id = this.ids[piece];
        if (id != null) { out.push(id); continue; }
        // greedy longest-subtoken match against the vocab
        var i = 0;
        while (i < piece.length) {
          var took = false;
          for (var len = Math.min(14, piece.length - i); len >= 1; len--) {
            var sub = piece.substr(i, len);
            var sid = this.ids[sub];
            if (sid != null) { out.push(sid); i += len; took = true; break; }
          }
          if (!took) { out.push(this.UNK); i++; }
        }
      }
      return Uint16Array.from(out);
    },

    decode: function (ids) {
      this.build();
      var s = "";
      for (var i = 0; i < ids.length; i++) {
        var w = this.vocab[ids[i]];
        if (w == null || w === "<unk>") continue;
        if (w === "<nl>") { s += "\n"; continue; }
        if (w.charAt(0) === "<") continue;
        s += w;
      }
      return s;
    },

    size: function () { this.build(); return this.vocab.length; }
  };

  global.MicroTokenizer = Tok;
})(window);
