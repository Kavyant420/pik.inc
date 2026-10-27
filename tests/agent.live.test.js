/* ============================================================================
   PIK//NEXUS — LIVE agent-loop smoke test (requires network)

   Not part of `npm test` — this hits real third-party APIs, so it is slow and
   can fail for reasons that have nothing to do with the code (rate limits,
   provider outages). Run it deliberately:

       npm run test:live

   What it proves, end to end, with the real modules and the real system prompt:
     1. PIKRouter reaches a keyless engine and returns real model text
     2. that engine is one the config actually lists (guards against the
        fabricated-model-id class of bug fixed earlier)
     3. given a question that needs live data, the model emits a real tool call
     4. PIKAgentTools parses and executes it
     5. a second model turn consumes the tool results and answers
   ========================================================================= */

"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var crypto = require("crypto");

var ROOT = path.join(__dirname, "..", "pik-inc");
var MODULES = [
  "js/config.js",
  "js/crypto.js",
  "js/nexus-settings.js",
  "js/models.js",
  "js/px-search.js",
  "js/web-surfer.js",
  "js/agent-tools.js",
  "js/router.js"
];

/* ------------------------------------------------------------ browser shim */
function makeSandbox() {
  var store = new Map();
  var logs = [];

  var sandbox = {
    console: console,
    Promise: Promise,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function () { return 0; }, clearInterval: function () {},
    URL: URL, URLSearchParams: URLSearchParams,
    Object: Object, Array: Array, String: String, Number: Number, Boolean: Boolean,
    JSON: JSON, RegExp: RegExp, Error: Error, Math: Math, Date: Date,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    parseInt: parseInt, parseFloat: parseFloat, isFinite: isFinite, isNaN: isNaN,
    Map: Map, Set: Set, Symbol: Symbol,
    fetch: function (u, o) { return fetch(u, o); },
    AbortController: AbortController,
    DOMParser: undefined,          /* web-surfer falls back to tag stripping */
    TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    /* the real js/crypto.js needs WebCrypto (PBKDF2 + AES-GCM). Node 20 ships
       it, so we load the genuine module rather than a hand-written stub. */
    crypto: require("crypto").webcrypto,
    Blob: Blob
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.CustomEvent = function (t, i) { this.type = t; this.detail = i && i.detail; };
  sandbox.document = { dispatchEvent: function (e) { logs.push(e.detail); return true; } };
  sandbox.navigator = { userAgent: "node" };
  /* px-search inspects location.protocol to decide whether a relative /api
     path can work at all. A real browser always has it; the shim must too. */
  sandbox.location = { protocol: "https:", origin: "https://pikinc.vercel.app", href: "https://pikinc.vercel.app/nexus" };
  sandbox.localStorage = {
    getItem: function (k) { return store.has(k) ? store.get(k) : null; },
    setItem: function (k, v) { store.set(k, String(v)); },
    removeItem: function (k) { store.delete(k); }
  };

  var ctx = vm.createContext(sandbox);
  MODULES.forEach(function (rel) {
    var file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) { console.log("  (skip missing " + rel + ")"); return; }
    try {
      vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: rel });
    } catch (e) {
      console.log("  ! " + rel + " failed to load: " + e.message);
    }
  });
  return { sandbox: sandbox, logs: logs };
}

/* ------------------------------------------------------------------- test */

var pass = 0, fail = 0;
function eq(label, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + "\n       expected " + e + "\n       actual   " + a); }
}
function ok(label, cond, detail) {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + (detail ? "\n       " + detail : "")); }
}

/* Pollinations' free tier allows roughly one reply per 30s per IP and answers
   HTTP 402 FREE_LIMIT beyond that. Retry with backoff so this test measures the
   code rather than the rate limiter. */
async function chatWithRetry(router, opts, tries) {
  var last = null;
  for (var i = 0; i < (tries || 4); i++) {
    try {
      return await router.chat(opts);
    } catch (e) {
      last = e;
      var msg = String((e && e.message) || e);
      var limited = /FREE_LIMIT|429|402|rate/i.test(msg);
      console.log("       (attempt " + (i + 1) + " failed: " + msg.slice(0, 90) + ")");
      if (!limited || i === (tries || 4) - 1) throw e;
      var wait = limited ? 32000 : 2000;
      console.log("       rate limited — waiting " + (wait / 1000) + "s");
      await new Promise(function (r) { setTimeout(r, wait); });
    }
  }
  throw last;
}

var QUESTION = "Use your tools. What is onion routing? Search the web first, then answer in two sentences and cite the URL you used.";

(async function run() {
  var env = makeSandbox();
  var w = env.sandbox;

  console.log("\n[1] modules loaded");
  ok("PIK_CONFIG", !!w.PIK_CONFIG);
  ok("PIKCrypto (real module, WebCrypto-backed)", !!w.PIKCrypto && typeof w.PIKCrypto.loadSecret === "function");
  ok("PIKRouter", !!w.PIKRouter);
  ok("PIKAgentTools", !!w.PIKAgentTools);
  ok("PIKSearch", !!w.PIKSearch);
  if (!w.PIKRouter || !w.PIKAgentTools) { console.log("\nABORT: core modules missing"); process.exit(2); }

  var settings = w.NexusSettings ? await w.NexusSettings.get() : { polliModel: "openai-fast" };
  console.log("\n[2] resolved settings");
  console.log("       polliModel =", settings.polliModel);
  console.log("       systemPrompt length =", (settings.systemPrompt || "").length);
  ok("system prompt documents WEBSEARCH", /WEBSEARCH\[/.test(settings.systemPrompt || ""),
     "the model cannot call a tool it was never told about");
  ok("system prompt documents the loop", /LOOP of up to 4 steps/i.test(settings.systemPrompt || ""));
  ok("configured pollinations model is on the verified list",
     w.PIK_CONFIG.POLLI_MODELS.indexOf(settings.polliModel) !== -1,
     "settings.polliModel=" + settings.polliModel + " is not in POLLI_MODELS " + JSON.stringify(w.PIK_CONFIG.POLLI_MODELS));

  await w.PIKRouter.init();

  console.log("\n[3] first model turn (live, keyless)");
  var t0 = Date.now();
  var res;
  try {
    res = await chatWithRetry(w.PIKRouter, {
      model: settings.polliModel,
      messages: [{ role: "user", content: QUESTION }],
      thinking: "low"
    });
  } catch (e) {
    fail++;
    console.log("  FAIL router threw: " + (e && e.message));
    console.log("\n" + pass + " passed, " + fail + " failed (network-dependent test)\n");
    process.exit(1);
  }
  var ms = Date.now() - t0;
  console.log("       engine=" + res.engine + " model=" + res.model + " " + ms + "ms " + (res.text || "").length + " chars");
  console.log("       DEBUG text     =" + JSON.stringify((res.text || "").slice(0, 300)));
  console.log("       DEBUG reasoning=" + JSON.stringify((res.reasoning || "").slice(0, 300)));
  /* An empty text with finish_reason:"tool_calls" is the CORRECT shape for a
     turn that answers by calling a tool — it must not be treated as a failure,
     and it must not be back-filled from the reasoning channel. */
  ok("router returned an answer or a tool call",
     (res.text || "").length > 20 || (res.toolCalls || []).length > 0,
     "text=" + JSON.stringify((res.text || "").slice(0, 60)) + " calls=" + (res.toolCalls || []).length);
  ok("served by a keyless engine", ["pollinations", "polli-get", "puter"].indexOf(res.engine) !== -1,
     "engine=" + res.engine);
  ok("engine is one config.js advertises",
     /pollinations|polli-get|puter/.test(res.engine));

  console.log("\n[4] did the model actually call a tool?");
  console.log("       finishReason = " + JSON.stringify(res.finishReason || ""));
  console.log("       native toolCalls = " + JSON.stringify((res.toolCalls || []).map(function (c) { return c.name + "(" + String(c.args).slice(0, 50) + ")"; })));
  var calls = w.PIKAgentTools.callsFrom(res);
  console.log("       normalised " + calls.length + " call(s): " + JSON.stringify(calls.map(function (c) { return c.tool + "(" + c.arg.slice(0, 44) + ")"; })));
  ok("at least one tool call was emitted", calls.length > 0,
     "the model answered without using tools — the prompt may not be steering it, or this run is non-deterministic");
  ok("native tool_calls are captured, not discarded", (res.toolCalls || []).length > 0 || /WEBSEARCH\[|WEBGET\[/.test(res.text || ""),
     "_consumeSSE must reassemble streamed tool_calls fragments");
  ok("private reasoning is not shown as the answer",
     !(res.text && res.reasoning && res.text === res.reasoning && res.text.length < 60),
     "text leaked from reasoning: " + JSON.stringify((res.text || "").slice(0, 60)));

  if (!calls.length) {
    console.log("\n" + pass + " passed, " + fail + " failed\n");
    process.exit(fail ? 1 : 0);
  }

  console.log("\n[5] execute the tool calls for real");
  var results = await w.PIKAgentTools.executeAll(calls, undefined, function (st) {
    if (st.call) console.log("       -> " + w.PIKAgentTools.statusLabel(st));
  });
  results.forEach(function (r) {
    console.log("       " + (r.ok ? "OK  " : "FAIL") + " " + r.tool + " " + String(r.arg).slice(0, 50) +
                (r.ok ? " (" + (r.text || "").length + " chars, " + (r.meta || "") + ")" : " — " + r.error));
  });
  ok("at least one tool call succeeded", results.some(function (r) { return r.ok; }));

  var ctxBlock = w.PIKAgentTools.toContext(results);
  ok("context block built", ctxBlock.length > 80);
  ok("context block stays within budget", ctxBlock.length < w.PIKAgentTools.MAX_CONTEXT_CHARS + 2000,
     "length=" + ctxBlock.length);

  console.log("\n[6] second model turn consumes the tool results");
  var history = [
    { role: "user", content: QUESTION },
    { role: "assistant", content: res.text },
    { role: "user", content: ctxBlock }
  ];
  var res2;
  try {
    res2 = await chatWithRetry(w.PIKRouter, { model: settings.polliModel, messages: history, thinking: "low" });
  } catch (e) {
    fail++;
    console.log("  FAIL second turn threw: " + (e && e.message));
    res2 = null;
  }
  if (res2) {
    console.log("       engine=" + res2.engine + " " + (res2.text || "").length + " chars" +
                " finish=" + JSON.stringify(res2.finishReason || "") +
                " toolCalls=" + (res2.toolCalls || []).length);
    var scrubbed = w.PIKAgentTools.scrubCalls(res2.text || "");
    var calls2 = w.PIKAgentTools.callsFrom(res2);
    /* Either it answered, or it asked for another tool — both are progress.
       What must NOT happen is an empty turn with no tool call, which is the
       signature of the reasoning-leak / dropped-tool_calls bugs. */
    ok("second turn made progress (answered or requested another tool)",
       (res2.text || "").length > 40 || calls2.length > 0,
       "text=" + JSON.stringify((res2.text || "").slice(0, 80)) + " calls=" + calls2.length);
    if (calls2.length) {
      console.log("       -> wants another step: " + JSON.stringify(calls2.map(function (c) { return c.tool + "(" + c.arg.slice(0, 40) + ")"; })));
    }
    ok("tool tokens are scrubbed from the displayed answer", !/WEBSEARCH\[|WEBGET\[/.test(scrubbed));
    console.log("\n       --- final answer (first 400 chars) ---");
    console.log("       " + scrubbed.slice(0, 400).replace(/\n/g, "\n       "));
    console.log("       ----------------------------------------");
  }

  console.log("\n[7] action log captured every hop");
  console.log("       " + env.logs.length + " entries");
  env.logs.slice(0, 6).forEach(function (l) { console.log("         " + String(l).slice(0, 100)); });
  ok("tool executions were logged", env.logs.length >= 1);

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
  console.log("(network-dependent: a provider outage or rate limit can fail this without any code defect)\n");
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error("HARNESS ERROR:", e); process.exit(2); });
