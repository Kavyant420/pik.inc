/* ============================================================================
   PIK//NEXUS — router._consumeSSE tests (offline, deterministic, zero deps)

   The SSE consumer is where the agent either works or silently doesn't. These
   tests replay captured stream shapes from text.pollinations.ai and assert:
     - streamed tool_calls fragments are reassembled into whole calls
     - finish_reason is surfaced
     - upstream error frames throw (so the fallback chain can fail over)
       instead of being swallowed and returned as a truncated "answer"
     - private reasoning never leaks into the visible text when content or a
       tool call exists

   Run:  node tests/router.test.js
   ========================================================================= */

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
function ok(label, cond, detail) {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + (detail ? "\n       " + detail : "")); }
}

function makeSandbox() {
  var sb = {
    console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout,
    URL: URL, Object: Object, Array: Array, String: String, Number: Number, JSON: JSON,
    RegExp: RegExp, Error: Error, Math: Math, Date: Date,
    encodeURIComponent: encodeURIComponent, parseInt: parseInt, isFinite: isFinite,
    TextDecoder: TextDecoder, TextEncoder: TextEncoder, Blob: Blob,
    /* tests replace this to exercise the non-streaming hops offline */
    fetch: function () { return Promise.reject(new Error("no network in unit tests")); }
  };
  sb.window = sb; sb.global = sb; sb.globalThis = sb;
  sb.document = { dispatchEvent: function () { return true; } };
  sb.CustomEvent = function (t, i) { this.type = t; this.detail = i && i.detail; };
  sb.PIKCrypto = {
    sha256: function (s) { return Promise.resolve("digest-" + String(s).length); },
    peekSecret: function () { return null; },
    SecureStore: { get: function () { return Promise.resolve(null); }, set: function () { return Promise.resolve(true); } }
  };
  /* A system prompt long enough to prove the old 2000-char truncation is gone:
     the marker sits near the end, where the real AGENT TOOLS contract lives. */
  var LONG_SYS = "PREAMBLE. " + "x".repeat(4000) + " TAILMARKER_WEBSEARCH";
  sb.__LONG_SYS = LONG_SYS;
  sb.NexusSettings = { get: function () { return Promise.resolve({ polliModel: "openai-fast", systemPrompt: LONG_SYS }); },
                       hasKey: function () { return Promise.resolve(false); } };
  sb.PIKModels = { get: function () { return null; }, logoFor: function () { return null; } };
  var ctx = vm.createContext(sb);
  ["js/config.js", "js/router.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  });
  return sb;
}

/* Build a fake Response whose body streams the given SSE lines in chunks. */
function sseResponse(lines, chunkSize) {
  var payload = lines.map(function (l) { return "data: " + l + "\n\n"; }).join("");
  var bytes = Buffer.from(payload, "utf8");
  var size = chunkSize || 64;      /* small chunks force mid-frame splits */
  var pos = 0;
  return {
    ok: true, status: 200,
    headers: { get: function () { return "text/event-stream; charset=utf-8"; } },
    body: {
      getReader: function () {
        return {
          read: function () {
            if (pos >= bytes.length) return Promise.resolve({ done: true, value: undefined });
            var slice = bytes.subarray(pos, pos + size);
            pos += size;
            return Promise.resolve({ done: false, value: new Uint8Array(slice) });
          }
        };
      }
    }
  };
}

function chunk(delta, extra) {
  return JSON.stringify(Object.assign({
    id: "c1", object: "chat.completion.chunk", model: "gpt-oss-20b",
    choices: [{ index: 0, delta: delta }]
  }, extra || {}));
}
function finish(reason) {
  return JSON.stringify({ id: "c1", object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { role: "assistant", name: "assistant" }, finish_reason: reason }] });
}
var DONE = "[DONE]";

(async function run() {
  var sb = makeSandbox();
  var R = sb.PIKRouter;

  console.log("\nplain streamed content");
  var r1 = await R._consumeSSE(
    sseResponse([
      chunk({ role: "assistant", content: "" }),
      chunk({ content: "Hello " }),
      chunk({ content: "world." }),
      finish("stop"), DONE
    ]),
    {}, { engine: "pollinations", model: "openai-fast", digest: "d" }
  );
  eq("content is concatenated", r1.text, "Hello world.");
  eq("finish_reason surfaced", r1.finishReason, "stop");
  eq("no tool calls", r1.toolCalls.length, 0);
  eq("reasoning empty", r1.reasoning, "");

  console.log("\nstreamed content split mid-frame across chunks");
  var r2 = await R._consumeSSE(
    sseResponse([chunk({ content: "ABCDEFGHIJ" }), chunk({ content: "KLMNOP" }), finish("stop"), DONE], 7),
    {}, { engine: "pollinations" }
  );
  eq("reassembled despite 7-byte chunks", r2.text, "ABCDEFGHIJKLMNOP");

  console.log("\nreasoning channel kept separate from content");
  var r3 = await R._consumeSSE(
    sseResponse([
      chunk({ reasoning: "Let me " }), chunk({ reasoning: "think." }),
      chunk({ content: "The answer is 4." }),
      finish("stop"), DONE
    ]),
    {}, { engine: "pollinations" }
  );
  eq("reasoning accumulated separately", r3.reasoning, "Let me think.");
  eq("content is NOT polluted by reasoning", r3.text, "The answer is 4.");

  console.log("\nREGRESSION: reasoning must not leak into text");
  /* This is the exact failure that made NEXUS answer "Need to search." —
     the model streamed only reasoning, so the old `if (!full && reason)`
     fallback displayed private chain-of-thought as the answer. */
  var r4 = await R._consumeSSE(
    sseResponse([chunk({ reasoning: "Need" }), chunk({ reasoning: " to" }), chunk({ reasoning: " search." }), DONE]),
    {}, { engine: "pollinations" }
  );
  eq("reasoning-only stream still yields the text fallback (no tool call present)", r4.text, "Need to search.");
  eq("but reasoning is preserved separately for the THINKING panel", r4.reasoning, "Need to search.");

  console.log("\nnative tool_calls streamed as fragments (the agent path)");
  /* Captured shape: name in the first frame, arguments split across frames. */
  var r5 = await R._consumeSSE(
    sseResponse([
      chunk({ role: "assistant", content: "" }),
      chunk({ reasoning: "Need to emit WEBSEARCH." }),
      JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { role: "assistant", name: "assistant",
        tool_calls: [{ index: 0, id: "chatcmpl-tool-8c16", type: "function", function: { name: "WEBSEARCH", arguments: "" } }] } }] }),
      JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { role: "assistant", name: "assistant",
        tool_calls: [{ index: 0, function: { arguments: "{\"qu" } }] } }] }),
      JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { role: "assistant", name: "assistant",
        tool_calls: [{ index: 0, function: { arguments: "ery\":\"onion" } }] } }] }),
      JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { role: "assistant", name: "assistant",
        tool_calls: [{ index: 0, function: { arguments: " routing\"}" } }] } }] }),
      finish("tool_calls"), DONE
    ], 40),
    {}, { engine: "pollinations" }
  );
  eq("one tool call reassembled", r5.toolCalls.length, 1);
  eq("tool name captured", r5.toolCalls[0].name, "WEBSEARCH");
  eq("argument fragments joined into valid JSON", r5.toolCalls[0].args, '{"query":"onion routing"}');
  eq("call id preserved for role:tool replies", r5.toolCalls[0].id, "chatcmpl-tool-8c16");
  eq("finish_reason is tool_calls", r5.finishReason, "tool_calls");
  eq("text is empty, NOT the reasoning", r5.text, "");
  ok("reasoning still available for the panel", /WEBSEARCH/.test(r5.reasoning));

  console.log("\ntwo parallel tool calls are kept distinct by index");
  var r6 = await R._consumeSSE(
    sseResponse([
      JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [
        { index: 0, id: "a", function: { name: "WEBSEARCH", arguments: "" } },
        { index: 1, id: "b", function: { name: "WEBGET", arguments: "" } } ] } }] }),
      JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [
        { index: 0, function: { arguments: "{\"query\":\"a\"}" } },
        { index: 1, function: { arguments: "{\"url\":\"https://x.example\"}" } } ] } }] }),
      finish("tool_calls"), DONE
    ]),
    {}, { engine: "pollinations" }
  );
  eq("both calls captured", r6.toolCalls.length, 2);
  eq("names in index order", r6.toolCalls.map(function (c) { return c.name; }), ["WEBSEARCH", "WEBGET"]);
  eq("args kept with the right call", [r6.toolCalls[0].args, r6.toolCalls[1].args],
     ['{"query":"a"}', '{"url":"https://x.example"}']);

  console.log("\nREGRESSION: upstream error frame must throw, not be swallowed");
  var threw = null;
  try {
    await R._consumeSSE(
      sseResponse([
        chunk({ reasoning: "Need" }), chunk({ reasoning: " to search." }),
        JSON.stringify({ error: { message: "Chat Completions provider returned invalid or omitted terminal usage", type: "upstream_error", code: "usage_missing" } }),
        DONE
      ]),
      {}, { engine: "pollinations" }
    );
  } catch (e) { threw = e; }
  ok("error frame throws so the chain fails over", !!threw, "it returned normally instead");
  ok("error message is preserved", threw && /usage_missing/.test(threw.message), threw && threw.message);
  eq("mapped to a 502 for the retry logic", threw && threw.status, 502);

  console.log("\nrate-limit error frame maps to 429");
  var threw2 = null;
  try {
    await R._consumeSSE(
      sseResponse([JSON.stringify({ error: { message: "Free limit reached", code: "FREE_LIMIT" } }), DONE]),
      {}, { engine: "pollinations" }
    );
  } catch (e) { threw2 = e; }
  eq("FREE_LIMIT becomes 429", threw2 && threw2.status, 429);

  console.log("\nmalformed frames are skipped without killing the stream");
  var r7 = await R._consumeSSE(
    sseResponse([chunk({ content: "good " }), "{not json at all", chunk({ content: "still good" }), finish("stop"), DONE]),
    {}, { engine: "pollinations" }
  );
  eq("survives a malformed frame", r7.text, "good still good");

  console.log("\nonDelta callbacks");
  var deltas = [];
  await R._consumeSSE(
    sseResponse([chunk({ reasoning: "R" }), chunk({ content: "C" }), finish("stop"), DONE]),
    { onDelta: function (d, isReasoning) { deltas.push((isReasoning ? "reason:" : "text:") + d); } },
    { engine: "pollinations" }
  );
  eq("reasoning and content deltas are flagged distinctly", deltas, ["reason:R", "text:C"]);


  console.log("\npolli-get: JSON envelope unwrapping (REGRESSION)");
  /* The GET hop asks for json=false but receives a JSON envelope whenever the
     model emits reasoning or tool calls. It used to be shown to the user raw. */
  function stubFetchText(body) {
    var captured = {};
    sb.fetch = function (url, o) {
      captured.url = String(url);
      return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(body); } });
    };
    return captured;
  }

  var cap1 = stubFetchText(JSON.stringify({
    role: "assistant",
    reasoning: "The user wants a search first.",
    content: "Onion routing is a technique for anonymous communication.",
    tool_calls: [{ id: "call_1", type: "function",
                   function: { name: "WEBSEARCH", arguments: JSON.stringify({ query: "onion routing" }) } }]
  }));
  var g1 = await R._viaPolliGet({ messages: [{ role: "user", content: "hi" }], signal: undefined },
                                { polliModel: "openai-fast", systemPrompt: sb.__LONG_SYS });
  eq("content extracted, not raw JSON", g1.text, "Onion routing is a technique for anonymous communication.");
  ok("no JSON braces leak into the answer", g1.text.indexOf("{") === -1);
  eq("reasoning separated out", g1.reasoning, "The user wants a search first.");
  eq("tool call surfaced", g1.toolCalls.length, 1);
  eq("tool name", g1.toolCalls[0].name, "WEBSEARCH");
  eq("tool args preserved", g1.toolCalls[0].args, '{"query":"onion routing"}');
  eq("tool call id preserved", g1.toolCalls[0].id, "call_1");
  eq("finishReason marks a tool turn", g1.finishReason, "tool_calls");
  eq("engine reported", g1.engine, "polli-get");

  console.log("\npolli-get: tool call with no prose is still a valid answer");
  stubFetchText(JSON.stringify({ role: "assistant", reasoning: "searching", content: "",
    tool_calls: [{ function: { name: "WEBGET", arguments: '{"url":"https://a.example"}' } }] }));
  var g2 = await R._viaPolliGet({ messages: [{ role: "user", content: "hi" }] }, { polliModel: "openai-fast" });
  eq("no exception thrown for empty content", g2.toolCalls.length, 1);
  eq("text empty rather than the reasoning", g2.text, "");

  console.log("\npolli-get: plain text still passes through untouched");
  stubFetchText("Just a normal sentence answer.");
  var g3 = await R._viaPolliGet({ messages: [{ role: "user", content: "hi" }] }, { polliModel: "openai-fast" });
  eq("plain text preserved", g3.text, "Just a normal sentence answer.");
  eq("no tool calls invented", g3.toolCalls.length, 0);

  console.log("\npolli-get: a brace-shaped but invalid body is not mangled");
  stubFetchText("{not really json, just prose starting with a brace");
  var g4 = await R._viaPolliGet({ messages: [{ role: "user", content: "hi" }] }, { polliModel: "openai-fast" });
  ok("falls back to raw text", g4.text.indexOf("{not really json") === 0, g4.text);

  console.log("\npolli-get: the system prompt is no longer truncated at 2000 chars");
  var cap5 = stubFetchText("ok");
  await R._viaPolliGet({ messages: [{ role: "user", content: "hi" }] },
                       { polliModel: "openai-fast", systemPrompt: sb.__LONG_SYS });
  ok("the tail of the system prompt reaches the request",
     decodeURIComponent(cap5.url).indexOf("TAILMARKER_WEBSEARCH") !== -1,
     "the AGENT TOOLS contract was being cut off, so this hop could never call a tool");

  console.log("\npolli-get: empty and HTTP failures still throw");
  stubFetchText("");
  var threwEmpty = false;
  try { await R._viaPolliGet({ messages: [{ role: "user", content: "hi" }] }, { polliModel: "openai-fast" }); }
  catch (e) { threwEmpty = /empty response/.test(e.message); }
  ok("empty response throws", threwEmpty);
  sb.fetch = function () { return Promise.resolve({ ok: false, status: 402, text: function () { return Promise.resolve("FREE_LIMIT"); } }); };
  var threw402 = null;
  try { await R._viaPolliGet({ messages: [{ role: "user", content: "hi" }] }, { polliModel: "openai-fast" }); }
  catch (e) { threw402 = e; }
  ok("HTTP failure throws with the status", threw402 && threw402.status === 402, threw402 && threw402.message);

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed\n");
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error("HARNESS ERROR:", e); process.exit(2); });
