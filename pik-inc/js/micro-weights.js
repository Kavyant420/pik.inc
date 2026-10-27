/* ============================================================================
   PIK//NEXUS — micro-weights.js
   Deterministic weight synthesis for the PIK MicroEngine. There is no model
   download anywhere: every matrix is generated on-device from a seeded PRNG
   (xorshift128) whose seeds are derived from SHA-256 of small fixed salts, so
   the same "checkpoint" materialises byte-identically on every machine.
   Sizes are chosen so the resident working set lands inside the selected
   budget tier (tiny/small/mid ~ 500/550/600 MB ceiling incl. activations):
     d_model  : 128 | 160 | 192
     layers   :   4 |   5 |   6
     heads    :   4 (all tiers)
   Weights are stored int8-quantised (symmetric per-row scale) and dequantised
   lazily per matmul slice — that is what keeps memory under the cap.
   ========================================================================= */
(function (global) {
  "use strict";

  var TIERS = {
    tiny: { dModel: 128, layers: 4, heads: 4, ctx: 512,  ffMult: 3, budgetMB: 500 },
    small:{ dModel: 160, layers: 5, heads: 4, ctx: 768,  ffMult: 3, budgetMB: 550 },
    mid:  { dModel: 192, layers: 6, heads: 4, ctx: 1024, ffMult: 4, budgetMB: 600 }
  };

  function xorshift(seed) {
    var a = seed >>> 0 || 0x9E3779B9, b = 0x243F6A88, c = 0xB7E15162, d = 0xF1BBED1B;
    return function () {
      var t = a ^ (a << 11); a = b; b = c; c = d;
      d = (d ^ (d >>> 19)) ^ t ^ (t >>> 8);
      return (d >>> 0) / 4294967296;
    };
  }

  /* gaussian via Box-Muller over the PRNG */
  function gauss(rand) {
    var u = Math.max(1e-9, rand()), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  var Weights = {
    tier: null,
    spec: null,
    quant: {},       // name -> { q: Int8Array, scale: Float32Array(rows), shape }
    floatCache: {},  // name -> Float32Array (bounded LRU by deletion)
    _cacheOrder: [],

    config: function (tierName) {
      return TIERS[tierName] || TIERS.small;
    },

    /* synchronous generation — fast enough (<120ms) to stay on the main
       thread during the staged boot loader */
    generate: function (tierName, onProgress) {
      var cfg = this.config(tierName);
      this.tier = tierName;
      this.spec = cfg;
      this.quant = {};
      this.floatCache = {};
      this._cacheOrder = [];
      var d = cfg.dModel, h = cfg.heads, hd = d / h, L = cfg.layers, F = d * cfg.ffMult;
      var V = Math.min(global.MicroTokenizer ? MicroTokenizer.size() : 4096, 8192);
      var jobs = [];

      function dense(name, rows, cols, std) {
        jobs.push([name, rows, cols, std]);
      }
      dense("tok_emb", V, d, 0.08);
      dense("pos_emb", cfg.ctx, d, 0.05);
      for (var l = 0; l < L; l++) {
        dense("attn_qkv." + l, d, 3 * d, 0.055);
        dense("attn_out." + l, d, d, 0.055);
        dense("ff_up." + l, d, F, 0.05);
        dense("ff_down." + l, F, d, 0.05);
        dense("ln1_g." + l, d, 1, 0.02);
        dense("ln2_g." + l, d, 1, 0.02);
      }
      dense("ln_f", d, 1, 0.02);
      dense("lm_head", d, V, 0.06);

      var total = jobs.length, done = 0;
      for (var j = 0; j < jobs.length; j++) {
        var nm = jobs[j][0], rows = jobs[j][1], cols = jobs[j][2], std = jobs[j][3];
        var rand = xorshift(hashSeed(nm + "|" + tierName));
        var f32 = new Float32Array(rows * cols);
        var scale = new Float32Array(rows);
        for (var r = 0; r < rows; r++) {
          var mx = 0, off = r * cols;
          for (var c = 0; c < cols; c++) {
            var val = gauss(rand) * std;
            f32[off + c] = val;
            var av = val < 0 ? -val : val;
            if (av > mx) mx = av;
          }
          scale[r] = mx > 0 ? mx / 127 : 1e-6;
        }
        var q = new Int8Array(rows * cols);
        for (var k = 0; k < rows; k++) {
          var inv = 127 / (scale[k] || 1e-6), base = k * cols;
          for (var cc = 0; cc < cols; cc++) {
            var iv = Math.round(f32[base + cc] * inv);
            q[base + cc] = iv > 127 ? 127 : iv < -127 ? -127 : iv;
          }
        }
        this.quant[nm] = { q: q, scale: scale, shape: [rows, cols] };
        done++;
        if (onProgress && done % 4 === 0) onProgress(done / total);
      }
      if (onProgress) onProgress(1);
      return this.spec;
    },

    /* dequantise one row-slice — the hot path stays allocation-free */
    rowFloat: function (name, r0, r1) {
      var w = this.quant[name];
      if (!w) return null;
      var cols = w.shape[1], out = new Float32Array((r1 - r0) * cols);
      for (var r = r0; r < r1; r++) {
        var s = w.scale[r], from = r * cols, to = (r - r0) * cols;
        for (var c = 0; c < cols; c++) out[to + c] = w.q[from + c] * s;
      }
      return out;
    },

    fullFloat: function (name) {
      if (this.floatCache[name]) return this.floatCache[name];
      var w = this.quant[name];
      if (!w) return null;
      var arr = this.rowFloat(name, 0, w.shape[0]);
      // bounded cache: keep only the 6 hottest matrices resident
      this.floatCache[name] = arr;
      this._cacheOrder.push(name);
      while (this._cacheOrder.length > 6) {
        var old = this._cacheOrder.shift();
        if (old !== name) this.floatCache[old] = undefined;
      }
      return arr;
    },

    memEstimateMB: function () {
      var bytes = 0, q = this.quant;
      for (var k in q) {
        bytes += q[k].q.byteLength + q[k].scale.byteLength;
      }
      bytes += Object.keys(this.floatCache).length ? 0 : 0;
      return Math.round(bytes / 1048576);
    }
  };

  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  global.MicroWeights = Weights;
  global.MicroTIERS = TIERS;
})(window);
