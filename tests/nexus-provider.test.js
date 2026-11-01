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
    document: { dispatchEvent: function () { return true; } }
  };
  sb.window = sb; sb.global = sb;
  sb.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  sb.PIKCrypto = {
    peekSecret: function () { return null; },
    sha256: function (value) { return Promise.resolve("digest-" + String(value).length); }
  };
  sb.NexusSettings = {
    systemPrompt: "Fallback system prompt.",
    get: function () { return Promise.resolve({ systemPrompt: "Test system prompt.", allowPuterUsage: true }); },
    hasKey: function () { return Promise.resolve(false); }
  };
  var ctx = vm.createContext(sb);
  ["js/config.js", "js/models.js", "js/chat.js", "js/router.js"].forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
  });
  return sb;
}

(async function run() {
  var sb = makeSandbox();
  var CFG = sb.PIK_CONFIG;
  var M = sb.PIKModels;
  var R = sb.PIKRouter;
  var id = CFG.NO_KEY_MODEL;

  console.log("\nno-OpenRouter default model");
  var fallback = M.noKeyDefault();
  eq("default id", fallback.id, "puter/openai-gpt-5.6-luna");
  eq("model context cap", fallback.ctx, 256000);
  eq("output reserve ceiling", fallback.maxOut, 128000);
  eq("does not require OpenRouter", fallback.requiresOpenRouterKey, false);
  ok("model description discloses Puter allowance", /monthly free allowance/.test(fallback.desc));
  ok("description clearly distinguishes this from ChatGPT Free", /not the ChatGPT Free subscription/.test(fallback.desc));

  console.log("\ncontext window is model-aware");
  M.byId[id] = fallback;
  var history = [
    { role: "user", content: "a".repeat(100000) },
    { role: "assistant", content: "b".repeat(100000) },
    { role: "user", content: "c".repeat(200000) }
  ];
  var selected = sb.PIKChat.contextWindow.call({
    modelId: function () { return id; },
    history: history
  });
  eq("keeps the newest turn when the 128K input budget is reached", selected.length, 1);
  eq("newest message preserved", selected[0].content.length, 200000);

  console.log("\nPuter current streaming chunk format");
  var captured = null;
  var deltas = [];
  sb.puter = {
    ai: {
      chat: function (messages, testMode, options) {
        captured = { messages: messages, testMode: testMode, options: options };
        return (async function* () {
          yield { type: "reasoning", reasoning: "thinking" };
          yield { type: "text", text: "Hello " };
          yield { type: "text", text: "from Luna." };
          yield { type: "tool_use", id: "tool-1", name: "WEBSEARCH", input: { query: "Nexus" } };
          yield { type: "usage", usage: { input_tokens: 10, output_tokens: 5 } };
        })();
      }
    }
  };
  var result = await R._viaPuter({
    model: id,
    messages: [{ role: "user", content: "Hi" }],
    thinking: "high",
    onDelta: function (text, reasoning) { deltas.push((reasoning ? "reason:" : "text:") + text); }
  }, { systemPrompt: "System", allowPuterUsage: true });

  eq("routes to GPT-5.6 Luna", captured.options.model, "openai/gpt-5.6-luna");
  eq("live mode remains enabled", captured.testMode, false);
  eq("options are passed in the documented third argument", captured.options.stream, true);
  eq("reasoning effort passed", captured.options.reasoning_effort, "high");
  eq("sampling temperature omitted for reasoning model", captured.options.temperature, undefined);
  eq("text chunks combined", result.text, "Hello from Luna.");
  eq("reasoning kept separate", result.reasoning, "thinking");
  eq("tool-use chunk mapped to agent tool call", result.toolCalls, [
    { id: "tool-1", name: "WEBSEARCH", args: "{\"query\":\"Nexus\"}" }
  ]);
  eq("stream deltas reported", deltas, ["reason:thinking", "text:Hello ", "text:from Luna."]);

  console.log("\nPuter consent gate");
  var denied = null;
  try {
    await R._viaPuter({ model: id, messages: [{ role: "user", content: "Hi" }] },
      { systemPrompt: "System", allowPuterUsage: false });
  } catch (e) { denied = e; }
  ok("Puter request rejected when consent is off", !!denied && /disabled/.test(denied.message));

  console.log("\nPuter stream errors are not swallowed");
  sb.puter.ai.chat = function () {
    return (async function* () {
      yield { type: "error", message: "upstream unavailable" };
    })();
  };
  var streamError = null;
  try {
    await R._viaPuter({ model: id, messages: [{ role: "user", content: "Hi" }] },
      { systemPrompt: "System", allowPuterUsage: true });
  } catch (e) { streamError = e; }
  ok("typed stream error is surfaced", !!streamError && /upstream unavailable/.test(streamError.message));

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (error) {
  console.error("HARNESS ERROR:", error);
  process.exit(2);
});
