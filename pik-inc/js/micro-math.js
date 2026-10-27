/* ============================================================================
   PIK//NEXUS — micro-math.js
   Hand-rolled tensor primitives for the MicroEngine. Everything is flat
   Float32Array + index math (no allocations inside the hot loops), which is
   what keeps a 500-600 MB resident budget realistic on mid-range laptops.
     matvec  : y[M] = X[M,K] · v[K]              (row-major)
     matmulT : C[M,N] = A[M,K] · B[N,K]^T        (both row-major)
     rmsnorm, softmax (in-place), rope-free rotary-lite positional blend,
     single-row KV-cache attention with causal mask.
   ========================================================================= */
(function (global) {
  "use strict";

  var M = {
    EPS: 1e-5,

    fill: function (a, v) { a.fill(v); },

    addInPlace: function (a, b) {
      for (var i = 0; i < a.length; i++) a[i] += b[i];
      return a;
    },

    scaleAdd: function (out, x, s, y) { // out = s*x + y
      for (var i = 0; i < out.length; i++) out[i] = s * x[i] + y[i];
      return out;
    },

    /* y[M] = W (M x K row-major) . v[K] */
    matvec: function (W, wOff, M_, K, v, y) {
      for (var r = 0; r < M_; r++) {
        var acc = 0, base = wOff + r * K;
        for (var c = 0; c < K; c++) acc += W[base + c] * v[c];
        y[r] = acc;
      }
      return y;
    },

    /* gelu-tanh approximation, in place */
    gelu: function (a) {
      for (var i = 0; i < a.length; i++) {
        var x = a[i];
        a[i] = 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
      }
      return a;
    },

    rmsnorm: function (x, g, out) {
      var n = x.length, ss = 0;
      for (var i = 0; i < n; i++) ss += x[i] * x[i];
      var inv = 1 / Math.sqrt(ss / n + M.EPS);
      for (var j = 0; j < n; j++) out[j] = x[j] * inv * (1 + g[j]);
      return out;
    },

    softmax: function (a) { // in place, numerically stable
      var mx = -Infinity, s = 0, i;
      for (i = 0; i < a.length; i++) if (a[i] > mx) mx = a[i];
      for (i = 0; i < a.length; i++) { a[i] = Math.exp(a[i] - mx); s += a[i]; }
      if (s <= 0) s = 1;
      for (i = 0; i < a.length; i++) a[i] /= s;
      return a;
    },

    dot: function (a, b) {
      var s = 0;
      for (var i = 0; i < a.length; i++) s += a[i] * b[i];
      return s;
    },

    /* lightweight rotary-ish mixing: rotate pairs by pos-dependent angle */
    ropeLite: function (v, pos) {
      var d = v.length;
      for (var i = 0; i + 1 < d; i += 2) {
        var ang = (pos + 1) * 0.08 * ((i >> 1) % 8 + 1) * 0.25;
        var c = Math.cos(ang), s = Math.sin(ang);
        var x = v[i], y = v[i + 1];
        v[i] = x * c - y * s;
        v[i + 1] = x * s + y * c;
      }
      return v;
    },

    /* causal multi-head self-attention over a KV cache.
       kv: {k: Float32Array[Tmax*d], v: Float32Array[Tmax*d], len}
       q,k,v vectors are length d; heads folded via head-dim slicing. */
    attnRow: function (q, k, v, kv, T, d, heads, out, scoreBuf) {
      var hd = d / heads, i, h;
      for (h = 0; h < heads; h++) {
        var off = h * hd;
        var qh = q.subarray(off, off + hd);
        var kh = k.subarray(off, off + hd);
        var vh = v.subarray(off, off + hd);
        // write current key/value into cache at slot T-1
        kv.k.set(kh, (T - 1) * d + off);
        kv.v.set(vh, (T - 1) * d + off);
        var scale = 1 / Math.sqrt(hd);
        var maxS = -Infinity, sum = 0;
        for (i = 0; i < T; i++) {
          var kb = kv.k.subarray(i * d + off, i * d + off + hd);
          var sc = M.dot(qh, kb) * scale;
          scoreBuf[i] = sc;
          if (sc > maxS) maxS = sc;
        }
        for (i = 0; i < T; i++) { scoreBuf[i] = Math.exp(scoreBuf[i] - maxS); sum += scoreBuf[i]; }
        if (sum <= 0) sum = 1;
        for (var c = 0; c < hd; c++) out[off + c] = 0;
        for (i = 0; i < T; i++) {
          var w = scoreBuf[i] / sum;
          var vb = kv.v.subarray(i * d + off, i * d + off + hd);
          for (var cc = 0; cc < hd; cc++) out[off + cc] += w * vb[cc];
        }
      }
      return out;
    }
  };

  global.MicroMath = M;
})(window);
