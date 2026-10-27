/* ============================================================================
   PIK//NEXUS — agent-tools.js tests (offline, deterministic, zero deps)

   Covers the tool-call parser, the executors (with stubbed PIKSurfer and
   PIKSearch), the context-budget truncation and the loop's error contract:
   a failed tool must come back as data the model can react to, never as a
   thrown exception that aborts the turn.

   Run:  node tests/agent-tools.test.js
   ========================================================================= */

"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var pass = 0, fail = 0;
function eq(label, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + "\n       expected " + e + "\n       actual   " + a); }
}
function ok(label, cond) { eq(label, !!cond, true); }

function makeSandbox(stubs) {
  var logs = [];
  var sandbox = {
    console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout,
    URL: URL, Object: Object, Array: Array, String: String, Number: Number, JSON: JSON,
    RegExp: RegExp, Error: Error, Math: Math, encodeURIComponent: encodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  sandbox.document = {
    dispatchEvent: function (e) { logs.push(e.detail); return true; }
  };
  Object.keys(stubs || {}).forEach(function (k) { sandbox[k] = stubs[k]; });
  var ctx = vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "pik-inc", "js", "agent-tools.js"), "utf8"),
    ctx, { filename: "agent-tools.js" }
  );
  return { T: sandbox.PIKAgentTools, logs: logs, sandbox: sandbox };
}

/* --------------------------------------------------------------- stubs --- */

function surferStub(pages) {
  return {
    fetchPage: function (url) {
      if (pages[url] === "throw") return Promise.reject(new Error("all web relays failed"));
      return Promise.resolve({ url: url, relay: "reader", text: pages[url] || "PAGE BODY " + url, truncated: false });
    },
    scrubCalls: function (t) { return String(t).replace(/WEBGET\[[^\]]*\]/gi, "[surfing]"); }
  };
}

function searchStub(env) {
  return {
    search: function () { return Promise.resolve(env); },
    hostOf: function (u) { try { return new URL(u).hostname; } catch (e) { return ""; } }
  };
}

var SEARCH_OK = {
  query: "q", sources: ["duckduckgo", "wikipedia"], proxyAvailable: true, partial: false, error: null,
  answer: { heading: "Q", text: "An instant answer.", url: "https://en.wikipedia.org/wiki/Q", source: "Wikipedia" },
  results: [
    { title: "First hit", url: "https://a.example/1", snippet: "Snippet one", source: "duckduckgo" },
    { title: "Second hit", url: "https://b.example/2", snippet: "Snippet two", source: "wikipedia" }
  ]
};

(async function run() {

  console.log("\nparseCalls");
  var s1 = makeSandbox({});
  var T = s1.T;
  eq("no calls in plain prose", T.parseCalls("Just a normal answer.").length, 0);
  eq("null input is safe", T.parseCalls(null).length, 0);
  eq("single WEBGET", T.parseCalls("see WEBGET[https://a.example/x]").map(function (c) { return c.tool + ":" + c.arg; }),
     ["webget:https://a.example/x"]);
  eq("single WEBSEARCH", T.parseCalls("WEBGET is different; WEBSEARCH[tor browser]").map(function (c) { return c.tool + ":" + c.arg; }),
     ["websearch:tor browser"]);
  eq("emission order is preserved (search before get)",
     T.parseCalls("WEBSEARCH[topic] then WEBGET[https://a.example]").map(function (c) { return c.tool; }),
     ["websearch", "webget"]);
  eq("emission order is preserved (get before search)",
     T.parseCalls("WEBGET[https://a.example] then WEBSEARCH[topic]").map(function (c) { return c.tool; }),
     ["webget", "websearch"]);
  eq("whitespace inside brackets tolerated",
     T.parseCalls("WEBGET[  https://a.example/x  ]").map(function (c) { return c.arg; }), ["https://a.example/x"]);
  eq("case-insensitive tool names", T.parseCalls("webget[https://a.example]").length, 1);
  eq("duplicate calls collapse to one",
     T.parseCalls("WEBGET[https://a.example] WEBGET[https://a.example] WEBGET[https://a.example]").length, 1);
  eq("dedupe is case-insensitive", T.parseCalls("WEBGET[https://A.example] WEBGET[https://a.example]").length, 1);
  eq("distinct URLs both kept", T.parseCalls("WEBGET[https://a.example] WEBGET[https://b.example]").length, 2);
  eq("capped at MAX_CALLS_PER_STEP",
     T.parseCalls([0,1,2,3,4,5].map(function (i) { return "WEBGET[https://e" + i + ".example]"; }).join(" ")).length,
     T.MAX_CALLS_PER_STEP);
  eq("non-http URL is not matched", T.parseCalls("WEBGET[javascript:alert(1)]").length, 0);
  eq("WEBSEARCH too short to be real is not matched", T.parseCalls("WEBSEARCH[a]").length, 0);

  console.log("\nscrubCalls");
  var s2 = makeSandbox({ PIKSurfer: surferStub({}) });
  var T2 = s2.T;
  eq("WEBGET token removed from prose", T2.scrubCalls("see WEBGET[https://a.example] now").indexOf("WEBGET"), -1);
  eq("WEBSEARCH token removed from prose", T2.scrubCalls("WEBSEARCH[tor browser] done").indexOf("WEBSEARCH"), -1);
  ok("WEBSEARCH leaves a readable marker", /searching/.test(T2.scrubCalls("WEBSEARCH[tor browser]")));
  eq("surrounding prose is untouched", T2.scrubCalls("hello world"), "hello world");
  var s2b = makeSandbox({});   /* PIKSurfer absent entirely */
  eq("scrub still works without PIKSurfer loaded", s2b.T.scrubCalls("WEBSEARCH[x query]").indexOf("WEBSEARCH"), -1);

  console.log("\nexecute: webget");
  var s3 = makeSandbox({ PIKSurfer: surferStub({ "https://a.example": "REAL PAGE TEXT" }) });
  var r3 = await s3.T.execute({ tool: "webget", arg: "https://a.example" });
  eq("ok", r3.ok, true);
  eq("returns page text", r3.text, "REAL PAGE TEXT");
  eq("records the relay used", /reader/.test(r3.meta), true);

  console.log("\nexecute: webget failure is data, not an exception");
  var s4 = makeSandbox({ PIKSurfer: surferStub({ "https://dead.example": "throw" }) });
  var r4 = await s4.T.execute({ tool: "webget", arg: "https://dead.example" });
  eq("ok is false", r4.ok, false);
  ok("carries the error message", /relays failed/.test(r4.error || ""));

  console.log("\nexecute: missing module is reported, not thrown");
  var s5 = makeSandbox({});
  var r5 = await s5.T.execute({ tool: "websearch", arg: "anything" });
  eq("ok is false", r5.ok, false);
  ok("explains px-search.js is not loaded", /px-search\.js/.test(r5.error || ""));

  console.log("\nexecute: websearch");
  var s6 = makeSandbox({ PIKSearch: searchStub(SEARCH_OK) });
  var r6 = await s6.T.execute({ tool: "websearch", arg: "tor browser" });
  eq("ok", r6.ok, true);
  ok("includes the instant answer", /An instant answer\./.test(r6.text));
  ok("includes result titles", /First hit/.test(r6.text) && /Second hit/.test(r6.text));
  ok("includes result URLs so the model can WEBGET one", /https:\/\/a\.example\/1/.test(r6.text));
  ok("meta names the sources", /duckduckgo/.test(r6.meta));

  console.log("\nexecute: websearch with no results");
  var s7 = makeSandbox({ PIKSearch: searchStub({
    query: "x", sources: [], proxyAvailable: false, partial: false,
    error: "proxy HTTP 502", answer: null, results: []
  }) });
  var r7 = await s7.T.execute({ tool: "websearch", arg: "x" });
  eq("ok is false", r7.ok, false);
  ok("surfaces the upstream error", /502/.test(r7.text));
  ok("explains the proxy was unreachable", /proxy was unreachable/.test(r7.text));

  console.log("\nexecute: abort propagates (must not be swallowed)");
  var abortErr = new Error("aborted"); abortErr.name = "AbortError";
  var s8 = makeSandbox({ PIKSurfer: { fetchPage: function () { return Promise.reject(abortErr); } } });
  var threw = false;
  try { await s8.T.execute({ tool: "webget", arg: "https://a.example" }); }
  catch (e) { threw = e.name === "AbortError"; }
  eq("AbortError is rethrown so the stop button works", threw, true);

  console.log("\nexecuteAll");
  var s9 = makeSandbox({ PIKSurfer: surferStub({}) });
  var statuses = [];
  var r9 = await s9.T.executeAll(
    [{ tool: "webget", arg: "https://a.example" }, { tool: "webget", arg: "https://b.example" }],
    undefined, function (st) { statuses.push(st.index + "/" + st.total); }
  );
  eq("both executed", r9.length, 2);
  eq("status fired per call plus a final done", statuses, ["0/2", "1/2", "2/2"]);
  eq("action log written for each", s9.logs.length, 2);
  ok("log records success", /tool ok/.test(s9.logs[0]));

  console.log("\ntoContext budget");
  var s10 = makeSandbox({});
  var T10 = s10.T;
  var ctx = T10.toContext([{ ok: true, tool: "webget", arg: "https://a.example", text: "SHORT" }]);
  ok("instructs the model to treat results as ground truth", /ground truth/i.test(ctx));
  ok("tells the model it may stop", /do not emit further tool calls/i.test(ctx));
  ok("includes the content", /SHORT/.test(ctx));

  var big = "x".repeat(T10.MAX_CONTEXT_CHARS + 5000);
  var s11 = makeSandbox({});
  var ctx2 = s11.T.toContext([{ ok: true, tool: "webget", arg: "https://a.example", text: big }]);
  ok("oversized content is truncated to the budget", ctx2.length < big.length);
  ok("truncation is disclosed", /truncated to fit context budget/.test(ctx2));

  var s12 = makeSandbox({});
  var half = "y".repeat(Math.floor(s12.T.MAX_CONTEXT_CHARS * 0.8));
  var ctx3 = s12.T.toContext([
    { ok: true, tool: "webget", arg: "https://a.example", text: half },
    { ok: true, tool: "webget", arg: "https://b.example", text: half },
    { ok: true, tool: "webget", arg: "https://c.example", text: half }
  ]);
  ok("later results are dropped once the budget is spent", ctx3.indexOf("c.example") === -1 || ctx3.length < half.length * 3);

  console.log("\nstatusLabel");
  var s13 = makeSandbox({});
  ok("webget shows the host", /reading a\.example/.test(s13.T.statusLabel({ index: 0, total: 2, call: { tool: "webget", arg: "https://a.example/x" } })));
  ok("websearch shows the query", /searching tor browser/.test(s13.T.statusLabel({ index: 0, total: 1, call: { tool: "websearch", arg: "tor browser" } })));
  ok("progress counter included", /\(1\/2\)/.test(s13.T.statusLabel({ index: 0, total: 2, call: { tool: "webget", arg: "https://a.example" } })));
  eq("null call reports completion", s13.T.statusLabel(null), "finished research");

  console.log("\nbudgets are sane for a free tier");
  ok("MAX_STEPS is bounded", T.MAX_STEPS >= 1 && T.MAX_STEPS <= 8);
  ok("MAX_CALLS_PER_STEP is bounded", T.MAX_CALLS_PER_STEP >= 1 && T.MAX_CALLS_PER_STEP <= 10);
  ok("context budget cannot crowd out the conversation", T.MAX_CONTEXT_CHARS <= 32000);


  console.log("\nfromNative: OpenAI tool_calls normalisation");
  var s14 = makeSandbox({});
  var T14 = s14.T;
  var nat = T14.fromNative([
    { id: "c1", name: "WEBSEARCH", args: JSON.stringify({ query: "onion routing" }) }
  ]);
  eq("one call normalised", nat.length, 1);
  eq("tool mapped", nat[0].tool, "websearch");
  eq("query extracted from JSON args", nat[0].arg, "onion routing");
  eq("call id kept for role:tool replies", nat[0].id, "c1");

  eq("url key preferred for webget",
     T14.fromNative([{ name: "WEBGET", args: JSON.stringify({ url: "https://a.example" }) }])[0].arg,
     "https://a.example");
  eq("q alias accepted", T14.fromNative([{ name: "websearch", args: JSON.stringify({ q: "tor" }) }])[0].arg, "tor");
  eq("search alias accepted", T14.fromNative([{ name: "web_search", args: JSON.stringify({ query: "tor" }) }])[0].tool, "websearch");
  eq("fetch alias accepted", T14.fromNative([{ name: "fetch", args: JSON.stringify({ url: "https://a.example" }) }])[0].tool, "webget");
  eq("bare string args accepted", T14.fromNative([{ name: "WEBSEARCH", args: '"onion routing"' }])[0].arg, "onion routing");
  eq("unknown tool dropped", T14.fromNative([{ name: "delete_database", args: "{}" }]).length, 0);
  eq("empty args dropped", T14.fromNative([{ name: "WEBSEARCH", args: "" }]).length, 0);
  eq("null list is safe", T14.fromNative(null).length, 0);
  eq("javascript: url refused for webget",
     T14.fromNative([{ name: "WEBGET", args: JSON.stringify({ url: "javascript:alert(1)" }) }]).length, 0);
  eq("truncated JSON arg recovers the quoted value",
     T14.fromNative([{ name: "WEBSEARCH", args: '{"query":"onion routi' }])[0].arg, "onion routi");

  console.log("\nfromNative: the nested-token case seen live from gpt-oss-20b");
  /* The model emitted a NATIVE call whose argument was the TEXT token, so a
     naive implementation searched for the literal string "WEBSEARCH[...]" */
  eq("nested WEBSEARCH token unwrapped",
     T14.fromNative([{ name: "WEBSEARCH", args: "WEBSEARCH[onion routing]\n" }])[0].arg, "onion routing");
  eq("nested WEBGET token unwrapped",
     T14.fromNative([{ name: "WEBGET", args: "WEBGET[https://a.example/x]" }])[0].arg, "https://a.example/x");
  eq("token embedded in surrounding prose unwrapped",
     T14.fromNative([{ name: "WEBSEARCH", args: "I will call WEBSEARCH[tor browser] now" }])[0].arg, "tor browser");
  eq("plain argument left alone",
     T14.fromNative([{ name: "WEBSEARCH", args: "tor browser" }])[0].arg, "tor browser");

  console.log("\ncallsFrom: native calls win, text tokens are the fallback");
  var s15 = makeSandbox({});
  var T15 = s15.T;
  var both = T15.callsFrom({
    toolCalls: [{ name: "WEBSEARCH", args: JSON.stringify({ query: "onion routing" }) }],
    text: "WEBSEARCH[onion routing] and WEBGET[https://b.example]"
  });
  eq("the duplicate search collapses to one call", both.filter(function (c) { return c.tool === "websearch"; }).length, 1);
  ok("the extra text-only WEBGET is still picked up", both.some(function (c) { return c.tool === "webget"; }));
  eq("native call is ordered first", both[0].tool, "websearch");
  eq("capped at MAX_CALLS_PER_STEP",
     T15.callsFrom({ text: [0,1,2,3,4,5,6].map(function (i) { return "WEBGET[https://e" + i + ".example]"; }).join(" ") }).length,
     T15.MAX_CALLS_PER_STEP);
  eq("null response is safe", T15.callsFrom(null).length, 0);
  eq("response with neither channel yields nothing", T15.callsFrom({ text: "plain answer", toolCalls: [] }).length, 0);

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed\n");
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error("HARNESS ERROR:", e); process.exit(2); });
