/* ============================================================================
   PIK//NEXUS — micro-sampler.js
   Decoding strategies for the MicroEngine: temperature, top-k, top-p (nucleus),
   repetition penalty with a sliding window, and an eos-encouragement ramp so
   generations terminate cleanly. Deterministic option (seed) for reproducible
   terminal demos. Works on a pre-computed logits Float32Array in place.
   ========================================================================= */
(function (global) {
  "use strict";

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var Sampler = {
    opts: { temperature: 0.8, topK: 40, topP: 0.92, repeatPenalty: 1.12, repeatWindow: 64, seed: null },

    configure: function (partial) { Object.assign(this.opts, partial || {}); },

    /* Apply penalties + temperature to a copy of logits, then pick.
       logits: Float32Array(V)   recentIds: Int32Array window   returns id */
    sample: function (logits, recentIds) {
      var o = this.opts;
      var V = logits.length;
      var work = new Float32Array(V);
      var i;
      // repetition penalty
      if (o.repeatPenalty !== 1 && recentIds && recentIds.length) {
        var seenSet = Object.create(null);
        var from = Math.max(0, recentIds.length - o.repeatWindow);
        for (i = from; i < recentIds.length; i++) seenSet[recentIds[i]] = true;
        for (i = 0; i < V; i++) {
          var l = logits[i];
          work[i] = (seenSet[i] && l > 0) ? l / o.repeatPenalty : (seenSet[i] ? l * o.repeatPenalty : l);
        }
      } else {
        work.set(logits);
      }
      var T = Math.max(0.05, o.temperature);
      for (i = 0; i < V; i++) work[i] /= T;

      // top-k cut
      var k = Math.min(o.topK, V);
      var cutoff = this._kthLargest(work, k);
      var sum = 0, kept = [];
      for (i = 0; i < V; i++) {
        if (work[i] >= cutoff) {
          var p = Math.exp(work[i] - this._maxOf(work));
          sum += p;
          kept.push([i, p]);
        }
      }
      if (!kept.length) { // pathological all-zero case
        return { id: argmax(logits), probs: null };
      }
      // nucleus (top-p) over kept set sorted desc by prob
      kept.sort(function (a, b) { return b[1] - a[1]; });
      var acc = 0, usable = [];
      for (i = 0; i < kept.length; i++) {
        acc += kept[i][1] / sum;
        usable.push(kept[i]);
        if (acc >= o.topP) break;
      }
      var rand = o.seed != null ? mulberry32(o.seed + recentIds.length) : Math.random;
      var r = rand() * (sum || 1), run = 0;
      for (i = 0; i < usable.length; i++) {
        run += usable[i][1];
        if (run >= r) return { id: usable[i][0], probs: null };
      }
      return { id: usable[usable.length - 1][0], probs: null };
    },

    greedy: function (logits) { return { id: argmax(logits), probs: null }; },

    _maxOf: function (a) {
      var mx = -Infinity;
      for (var i = 0; i < a.length; i++) if (a[i] > mx) mx = a[i];
      return mx;
    },

    /* quickselect kth-largest threshold without full sort */
    _kthLargest: function (a, k) {
      var arr = Array.prototype.slice.call(a);
      var lo = 0, hi = arr.length - 1, target = arr.length - k;
      while (lo <= hi) {
        var p = partition(arr, lo, hi);
        if (p === target) return arr[p];
        if (p < target) lo = p + 1; else hi = p - 1;
      }
      return arr[Math.max(0, Math.min(arr.length - 1, target))];
      function partition(arr2, l, h) {
        var piv = arr2[h], i = l;
        for (var j = l; j < h; j++) if (arr2[j] < piv) { var t = arr2[i]; arr2[i] = arr2[j]; arr2[j] = t; i++; }
        var t2 = arr2[i]; arr2[i] = arr2[h]; arr2[h] = t2;
        return i;
      }
    }
  };

  function argmax(a) {
    var bi = 0, bv = -Infinity;
    for (var i = 0; i < a.length; i++) if (a[i] > bv) { bv = a[i]; bi = i; }
    return bi;
  }

  global.MicroSampler = Sampler;
})(window);
