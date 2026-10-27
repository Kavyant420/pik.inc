/* ============================================================================
   PIK//NEXUS — error-net.js
   The 24/7 safety net: nothing on this page may ever die silently.
     - window.onerror + unhandledrejection are captured, normalised, shown as
       a calm toast (never an ugly red wall), and appended to a rolling local
       crash ledger (.nexus/crash.log inside the workspace, capped at 200).
     - transient network failures (offline blips) are classified separately
       from real bugs so the user sees "connection hiccup — retrying" instead
       of a stack trace.
     - exponential-backoff auto-retry helper for idempotent fetches.
   ========================================================================= */
(function (global) {
  "use strict";

  var MAX_LEDGER = 200;
  var ledger = [];

  function classify(err) {
    var msg = String((err && err.message) || err || "");
    if (/Failed to fetch|NetworkError|net::|ERR_|Load failed|timeout|aborted/i.test(msg)) {
      return { kind: "network", noisy: false };
    }
    if (/ResizeObserver loop/i.test(msg)) return { kind: "benign", noisy: false };
    if (/script error/i.test(msg)) return { kind: "crossorigin", noisy: false };
    return { kind: "bug", noisy: true };
  }

  function record(entry) {
    ledger.push(entry);
    if (ledger.length > MAX_LEDGER) ledger.splice(0, ledger.length - MAX_LEDGER);
    try { localStorage.setItem("pik.nexus.crashlog", JSON.stringify(ledger.slice(-MAX_LEDGER))); } catch (e) {}
    document.dispatchEvent(new CustomEvent("pik:error", { detail: entry }));
    /* mirror into the workspace so `cat .nexus/crash.log` works in terminal */
    if (global.PIKWorkspace && global.PIKWorkspace.project) {
      try {
        var prev = PIKWorkspace.readFile(".nexus/crash.log") || "";
        var line = "[" + new Date().toISOString() + "] " + entry.kind + " :: " + entry.message.slice(0, 300) + "\n";
        var next = (prev + line).split("\n").slice(-MAX_LEDGER).join("\n");
        PIKWorkspace.writeFile(".nexus/crash.log", next, { by: "system", note: "error-net" });
      } catch (e) {}
    }
  }

  function present(entry) {
    if (!global.PIKToasts) return;
    if (entry.kind === "network") {
      PIKToasts.show({ type: "warn", title: "Connection hiccup", text: "A request dropped — NEXUS will keep working locally and retry automatically." });
    } else if (entry.kind === "bug") {
      PIKToasts.show({ type: "error", title: "Recovered from an internal error", text: entry.message.slice(0, 140) + " · logged to .nexus/crash.log" });
    }
  }

  var seen = {};
  function handle(rawMsg, src, line) {
    var message = rawMsg instanceof Error ? rawMsg.message : String(rawMsg || "unknown");
    var c = classify(rawMsg instanceof Error ? rawMsg : { message: message });
    var key = c.kind + "|" + message.slice(0, 80);
    var now = Date.now();
    if (seen[key] && now - seen[key] < 8000) return; // de-dupe storms
    seen[key] = now;
    var entry = { ts: now, kind: c.kind, message: message, where: (src || "") + ":" + (line || "") };
    record(entry);
    if (c.noisy) present(entry);
  }

  global.addEventListener("error", function (e) {
    if (e && e.error) handle(e.error, e.filename, e.lineno);
    else if (e && e.message) handle(e.message, e.filename, e.lineno);
  });

  global.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    if (r && r.name === "AbortError") return; // deliberate cancels are not errors
    handle(r instanceof Error ? r : String(r), "", "");
  });

  /* backoff retry for idempotent GETs */
  global.PIKRetry = {
    async fetch(url, opts) {
      opts = opts || {};
      var tries = opts.tries || 3, delay = opts.delay || 600;
      var lastErr;
      for (var i = 0; i < tries; i++) {
        try {
          var res = await fetch(url, { signal: opts.signal });
          if (res.ok || res.status < 500) return res;
          lastErr = new Error("HTTP " + res.status);
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          lastErr = e;
        }
        await new Promise(function (r) { setTimeout(r, delay * Math.pow(2, i) + Math.random() * 200); });
      }
      throw lastErr;
    }
  };

  global.PIKErrorNet = { list: function () { return ledger.slice(); }, clear: function () { ledger = []; } };
})(window);
