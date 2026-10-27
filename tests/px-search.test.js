/* ============================================================================
   PIKX — px-search.js tests (offline, deterministic, zero deps)

   Runs the browser module inside a minimal `window` shim with a stubbed fetch,
   so the merge/dedupe/degradation logic is verified without a network.

   Run:  node tests/px-search.test.js
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

/* ------------------------------------------------------------- window shim */
function makeSandbox(fetchImpl, protocol) {
  var sandbox = {
    console: console,
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    URL: URL,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    Object: Object, Array: Array, String: String, Number: Number, JSON: JSON,
    RegExp: RegExp, Error: Error, isFinite: isFinite, parseInt: parseInt, Math: Math
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.fetch = fetchImpl;
  sandbox.location = { protocol: protocol || "https:", origin: "https://pikinc.vercel.app" };
  sandbox.PIK_CONFIG = {
    SEARCH: {
      SELF_PROXY: "/api/search",
      DDG_IA: "https://api.duckduckgo.com/",
      FAVICON: "https://www.google.com/s2/favicons?domain=",
      PER_SOURCE_TIMEOUT_MS: 400,
      MAX_RESULTS: 12
    }
  };
  var ctx = vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(__dirname, "..", "pik-inc", "js", "px-search.js"), "utf8");
  vm.runInContext(src, ctx, { filename: "px-search.js" });
  return sandbox.PIKSearch;
}

function jsonResponse(obj, status) {
  return Promise.resolve({
    ok: (status || 200) >= 200 && (status || 200) < 300,
    status: status || 200,
    json: function () { return Promise.resolve(obj); }
  });
}

/* A fetch stub that routes by URL and records what was requested. */
function router(routes) {
  var calls = [];
  var impl = function (url) {
    calls.push(String(url));
    for (var i = 0; i < routes.length; i++) {
      if (String(url).indexOf(routes[i][0]) !== -1) {
        var h = routes[i][1];
        return typeof h === "function" ? h(url) : h;
      }
    }
    return Promise.reject(new Error("no route for " + url));
  };
  impl.calls = calls;
  return impl;
}

var PROXY_BODY = {
  query: "onion routing", count: 2, sources: ["duckduckgo", "wikipedia"],
  results: [
    { title: "DDG One", url: "https://a.example/one", snippet: "s1", host: "a.example", source: "duckduckgo" },
    { title: "Onion routing", url: "https://en.wikipedia.org/wiki/Onion_routing", snippet: "wiki", host: "en.wikipedia.org", source: "wikipedia" }
  ],
  degraded: false, partial: true, error: "upstream HTTP 202"
};

var IA_BODY = {
  Heading: "Onion routing",
  AbstractText: "Onion routing is a technique for anonymous communication.",
  AbstractURL: "https://en.wikipedia.org/wiki/Onion_routing",
  AbstractSource: "Wikipedia",
  RelatedTopics: [
    { FirstURL: "https://en.wikipedia.org/wiki/Onion_routing", Text: "Onion routing - duplicate of a proxy result" },
    { FirstURL: "https://duckduckgo.com/Privacy", Text: "Privacy - related link" },
    { name: "group", Topics: [{ FirstURL: "https://duckduckgo.com/Nested", Text: "Nested - in a subgroup" }] }
  ]
};

(async function run() {

  console.log("\nmerging + dedupe (both sources healthy)");
  var f = router([["/api/search", jsonResponse(PROXY_BODY)], ["api.duckduckgo.com", jsonResponse(IA_BODY)]]);
  var S = makeSandbox(f);
  var r = await S.search("onion routing");
  eq("proxy results come first", r.results.slice(0, 2).map(function (x) { return x.title; }), ["DDG One", "Onion routing"]);
  eq("the URL present in both sources is not duplicated",
     r.results.filter(function (x) { return /Onion_routing$/.test(x.url); }).length, 1);
  eq("IA related topic appended", r.results.some(function (x) { return x.title === "Privacy"; }), true);
  eq("nested IA subgroups are flattened", r.results.some(function (x) { return x.title === "Nested"; }), true);
  eq("answer card extracted", r.answer && r.answer.heading, "Onion routing");
  eq("answer text extracted", !!r.answer.text, true);
  eq("sources reported", r.sources.indexOf("duckduckgo") !== -1 && r.sources.indexOf("instant-answer") !== -1, true);
  eq("not degraded", r.degraded, false);
  eq("both upstreams were requested", f.calls.length, 2);

  console.log("\ndegradation: proxy down, IA alive");
  var f2 = router([
    ["/api/search", function () { return Promise.reject(new Error("proxy HTTP 502: upstream HTTP 202")); }],
    ["api.duckduckgo.com", jsonResponse(IA_BODY)]
  ]);
  var S2 = makeSandbox(f2);
  var r2 = await S2.search("onion routing");
  eq("still returns IA results", r2.results.length > 0, true);
  eq("proxyAvailable is false", r2.proxyAvailable, false);
  eq("marked partial, not degraded", [r2.partial, r2.degraded], [true, false]);
  eq("error preserved for the UI", /proxy HTTP 502/.test(r2.error || ""), true);

  console.log("\ndegradation: proxy alive, IA empty (ordinary query)");
  var f3 = router([["/api/search", jsonResponse(PROXY_BODY)], ["api.duckduckgo.com", jsonResponse({ Heading: "", AbstractText: "", RelatedTopics: [] })]]);
  var S3 = makeSandbox(f3);
  var r3 = await S3.search("tor browser");
  eq("proxy results survive", r3.results.length, 2);
  eq("no answer card", r3.answer, null);
  eq("not degraded", r3.degraded, false);

  console.log("\ntotal failure: both sources down");
  var f4 = router([
    ["/api/search", function () { return Promise.reject(new Error("proxy HTTP 502")); }],
    ["api.duckduckgo.com", function () { return Promise.reject(new Error("ddg-ia HTTP 403")); }]
  ]);
  var S4 = makeSandbox(f4);
  var r4 = await S4.search("anything");
  eq("zero results", r4.results.length, 0);
  eq("degraded flag set", r4.degraded, true);
  eq("both errors reported", (r4.error || "").split("|").length, 2);
  eq("failed lookup is NOT cached", r4.fromCache, false);

  console.log("\nmemory cache");
  var f5 = router([["/api/search", jsonResponse(PROXY_BODY)], ["api.duckduckgo.com", jsonResponse(IA_BODY)]]);
  var S5 = makeSandbox(f5);
  await S5.search("onion routing");
  var before = f5.calls.length;
  var r5b = await S5.search("Onion Routing");   /* case-insensitive hit */
  eq("second identical query hits cache", r5b.fromCache, true);
  eq("no new network calls", f5.calls.length, before);
  await S5.search("onion routing", { fresh: true });
  eq("fresh:true bypasses cache", f5.calls.length > before, true);
  S5.clearCache();
  await S5.search("onion routing");
  eq("clearCache works", f5.calls.length > before + 2, true);

  console.log("\nnon-http origin (file://) skips the proxy without throwing");
  var f6 = router([["api.duckduckgo.com", jsonResponse(IA_BODY)]]);
  var S6 = makeSandbox(f6, "file:");
  var r6 = await S6.search("onion routing");
  eq("only IA was requested", f6.calls.length, 1);
  eq("proxyAvailable false", r6.proxyAvailable, false);
  eq("still produced results", r6.results.length > 0, true);

  console.log("\nURL vs query classification");
  var S7 = makeSandbox(router([["/api/search", jsonResponse(PROXY_BODY)], ["api.duckduckgo.com", jsonResponse(IA_BODY)]]));
  eq("bare domain is a URL", S7.isUrl("example.com"), true);
  eq("domain with path is a URL", S7.isUrl("example.com/a/b?c=1"), true);
  eq("explicit https is a URL", S7.isUrl("https://example.com"), true);
  eq("onion address is a URL", S7.isUrl("torchbrd7pqmbd3rfy.onion"), true);
  eq("phrase is not a URL", S7.isUrl("how does onion routing work"), false);
  eq("single word is not a URL", S7.isUrl("glassmorphism"), false);
  eq("empty is not a URL", S7.isUrl(""), false);
  eq("onion normalises to http", S7.toUrl("x.onion"), "http://x.onion");
  eq("bare domain normalises to https", S7.toUrl("example.com"), "https://example.com");
  eq("leading slash is stripped", S7.toUrl("/example.com"), "https://example.com");
  eq("absolute URL untouched", S7.toUrl("http://a.onion/x"), "http://a.onion/x");

  console.log("\nXSS helpers");
  eq("escapes script markup", S7.escapeHtml('<img src=x onerror="alert(1)">'),
     "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  eq("allowBoldOnly keeps <b>", S7.allowBoldOnly("a <b>b</b> c"), "a <b>b</b> c");
  eq("allowBoldOnly still escapes other tags", S7.allowBoldOnly("<b>x</b><script>y</script>"),
     "<b>x</b>&lt;script&gt;y&lt;/script&gt;");

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed\n");
  process.exit(fail === 0 ? 0 : 1);
})();
