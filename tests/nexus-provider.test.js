/* Nexus provider + context regressions (offline, deterministic, zero deps). */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..", "pik-inc");
var pass = 0, fail = 0;
function eq(label, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + "\n       expected " + e + "\n       actual   " + a); }
}
function ok(label, value, detail) {
  if (value) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + (detail ? "\n       " + detail : "")); }
}
function makeSandbox() {
  var sb = {
    console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout,
    URL: URL, Object: Object, Array: Array, String: String, Number: Number, JSON: JSON,
    RegExp: RegExp, Error: Error, Math: Math, Date: Date,
    encodeURIComponent: encodeURIComponent, parseInt: parseInt, isFinite: isFinite,
    TextDecoder: TextDecoder, TextEncoder: TextEncoder, Blob: Blob, Uint8Array: Uint8Array,
    document: { dispatchEvent: function () { return true; } },
    fetch: function () { return Promise.reject(new Error("unexpected network request")); }
  };
  sb.window = sb; sb.global = sb;
  sb.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  sb.PIKCrypto = {
    peekSecret: function () { return null; },
    sha256: function (value) { return Promise.resolve("digest-" + String(value).length); }
  };
  sb.NexusSettings = {
    systemPrompt: "Fallback system prompt.",
    get: function () { return Promise.resolve({ systemPrompt: "Test system prompt." }); },
    hasKey: function () { return Promise.resolve(false); }
  };
  var ctx = vm.createContext(sb);
  ["js/config.js", "js/models.js", "js/chat.js", "js/router.js"].forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
  });
  return sb;
}
function sseResponse(lines) {
  var payload = lines.map(function (l) { return "data: " + l + "\n\n"; }).join("");
  var bytes = Buffer.from(payload, "utf8"), pos = 0;
  return {
    ok: true, status: 200,
    headers: { get: function () { return "text/event-stream; charset=utf-8"; } },
    body: { getReader: function () { return { read: function () {
      if (pos >= bytes.length) return Promise.resolve({ done: true });
      var slice = bytes.subarray(pos, pos + 32); pos += 32;
      return Promise.resolve({ done: false, value: new Uint8Array(slice) });
    } }; } }
  };
}
(async function run() {
  var sb = makeSandbox(), CFG = sb.PIK_CONFIG, M = sb.PIKModels, R = sb.PIKRouter, id = CFG.NO_KEY_MODEL;
  console.log("\nno-login default model and context");
  var model = M.noKeyDefault();
  eq("default model id", model.id, "blockrun/gpt-oss-20b");
  eq("default model context", model.ctx, 128000);
  eq("conservative max output", model.maxOut, 8192);
  eq("no OpenRouter key required", model.requiresOpenRouterKey, false);
  ok("metadata is explicitly verified", model.metadataVerified === true);
  ok("description discloses anonymous endpoint", /no account, login, or API key/i.test(model.desc));
  ok("offline catalog includes the default model", M._offline().some(function (m) { return m.id === id; }));
  ok("offline catalog excludes models below 128K", M._offline().every(function (m) { return m.ctx >= 128000; }));
  eq("configured minimum context", CFG.MIN_CONTEXT_TOKENS, 128000);
  eq("configured app context ceiling", CFG.APP_CONTEXT_CAP_TOKENS, 128000);

  var mobile = fs.readFileSync(path.join(ROOT, "nexus-mobile.html"), "utf8");
  var desktop = fs.readFileSync(path.join(ROOT, "nexus.html"), "utf8");
  var css = fs.readFileSync(path.join(ROOT, "css", "47-nexus-mobile.css"), "utf8");
  ok("desktop contains no removed provider references", !/puter/i.test(desktop));
  ok("mobile contains no removed provider references", !/puter/i.test(mobile));
  ok("desktop advertises 128K no-login default", /No-login default: GPT-OSS 20B via BlockRun · 128K context/.test(desktop));
  ok("mobile advertises 128K no-login default", /No-login default: GPT-OSS 20B via BlockRun · 128K context/.test(mobile));
  ok("keyboard focus remains visible", /:focus-visible/.test(css));

  eq("chat model ID defaults to the no-login model", sb.PIKChat.modelId.call({
    els: { modelchip: { dataset: { model: "" } } }
  }), id);

  console.log("\nBlockRun request uses the public endpoint without credentials");
  var captured = null, deltas = [];
  sb.fetch = function (url, init) {
    captured = { url: url, init: init, body: JSON.parse(init.body) };
    return Promise.resolve(sseResponse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: "Hello " } }] }),
      JSON.stringify({ choices: [{ index: 0, delta: { content: "from GPT-OSS." } }] }),
      JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
      "[DONE]"
    ]));
  };
  var result = await R._viaBlockRun({
    model: id, messages: [{ role: "user", content: "Hi" }],
    thinking: "high", temperature: 0.4,
    onDelta: function (text, reasoning) { deltas.push((reasoning ? "reason:" : "text:") + text); }
  }, { systemPrompt: "System" });
  eq("uses BlockRun URL", captured.url, "https://blockrun.ai/api/v1/chat/completions");
  eq("uses hosted GPT-OSS model", captured.body.model, "nvidia/gpt-oss-20b");
  eq("streaming enabled", captured.body.stream, true);
  eq("output allowance is distinct from context window", captured.body.max_tokens, 8192);
  ok("does not send an Authorization header", !/authorization/i.test(Object.keys(captured.init.headers).join(" ")));
  eq("assistant response assembled", result.text, "Hello from GPT-OSS.");
  eq("engine identified", result.engine, "blockrun");
  eq("stream deltas reported", deltas, ["text:Hello ", "text:from GPT-OSS."]);

  console.log("\ncontext window is model-aware");
  M.byId[id] = model;
  var history = [
    { role: "user", content: "a".repeat(100000) },
    { role: "assistant", content: "b".repeat(100000) },
    { role: "user", content: "c".repeat(200000) }
  ];
  var selected = sb.PIKChat.contextWindow.call({
    modelId: function () { return id; }, history: history
  });
  eq("keeps newest turn when the 120K input budget is reached", selected.length, 1);
  eq("newest message preserved", selected[0].content.length, 200000);

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (error) {
  console.error("HARNESS ERROR:", error);
  process.exit(2);
});
