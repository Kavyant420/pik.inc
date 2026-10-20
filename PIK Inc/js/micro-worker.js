/* ============================================================================
   PIK//NEXUS — micro-worker.js
   Optional off-main-thread runner for the MicroEngine. The engine itself is
   built from plain modules; this wrapper boots it inside a Web Worker created
   from a Blob URL (CSP-safe: worker-src blob:) when the browser supports it,
   falling back to cooperative main-thread mode transparently. Callers talk to
   PIKMicroWorker.run(msg) and receive streamed token messages.
   ========================================================================= */
(function (global) {
  "use strict";

  var WORKER_SRC = [
    "'use strict';",
    "importScripts(",
    JSON.stringify("./js/micro-tokenizer.js"), ",",
    JSON.stringify("./js/micro-weights.js"), ",",
    JSON.stringify("./js/micro-math.js"), ",",
    JSON.stringify("./js/micro-sampler.js"), ",",
    JSON.stringify("./js/micro-engine.js"),
    ");",
    "self.onmessage = async function (ev) {",
    "  var msg = ev.data || {};",
    "  if (msg.type === 'boot') {",
    "    try {",
    "      await self.MicroEngine ? null : null;",
    "      await MicroEngine.boot(msg.tier, function (pct, label) {",
    "        self.postMessage({ type: 'progress', pct: pct, label: label });",
    "      });",
    "      self.postMessage({ type: 'booted', tier: MicroEngine.tier });",
    "    } catch (e) {",
    "      self.postMessage({ type: 'bootfail', error: String(e && e.message || e) });",
    "    }",
    "    return;",
    "  }",
    "  if (msg.type === 'generate') {",
    "    try {",
    "      var res = await MicroEngine.generate({",
    "        messages: msg.messages, thinking: msg.thinking,",
    "        onDelta: function (t, isReason) {",
    "          self.postMessage({ type: isReason ? 'reasoning' : 'token', text: t });",
    "        }",
    "      });",
    "      self.postMessage({ type: 'done', result: { text: res.text, reasoning: res.reasoning, tps: res.tps } });",
    "    } catch (e) {",
    "      self.postMessage({ type: 'error', error: String(e && e.message || e) });",
    "    }",
    "    return;",
    "  }",
    "};"
  ].join("\n");

  var W = {
    worker: null,
    supported: false,
    mode: "main",   // "worker" | "main"

    canUseWorker: function () {
      if (typeof Worker !== "function" || typeof URL === "undefined" || !URL.createObjectURL) return false;
      /* importScripts needs same-origin module resolution; under file:// it
         fails, so probe protocol. */
      if (location.protocol === "file:") return false;
      return true;
    },

    spawn: function () {
      if (this.worker) return this.worker;
      if (!this.canUseWorker()) { this.mode = "main"; return null; }
      try {
        var blob = new Blob([WORKER_SRC], { type: "text/javascript" });
        var url = URL.createObjectURL(blob);
        this.worker = new Worker(url);
        this.supported = true;
        this.mode = "worker";
        return this.worker;
      } catch (e) {
        this.mode = "main";
        return null;
      }
    },

    terminate: function () {
      if (this.worker) { try { this.worker.terminate(); } catch (e) {} this.worker = null; }
      this.mode = "main";
    }
  };

  global.PIKMicroWorker = W;
})(window);
