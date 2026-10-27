/* ============================================================================
   PIKX — results tab integration test

   Loads the REAL pikx.html into jsdom, executes the real page scripts, stubs
   fetch, and drives the omnibox the way a user would. The headline assertion is
   the one this change exists for: submitting a search query must NOT call
   window.open, and must render results into the results tab instead.

   Run:  node tests/results.integration.test.js
   Needs: npm install jsdom   (dev dependency, not shipped to Vercel)
   ========================================================================= */

"use strict";

var fs = require("fs");
var path = require("path");
var jsdom;
try { jsdom = require("jsdom"); }
catch (e) { jsdom = require(path.join(process.env.JSDOM_DIR || "/tmp/node_modules", "jsdom")); }
var JSDOM = jsdom.JSDOM, VirtualConsole = jsdom.VirtualConsole;

var ROOT = path.join(__dirname, "..", "pik-inc");
var pass = 0, fail = 0;
function eq(label, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + "\n       expected " + e + "\n       actual   " + a); }
}
function ok(label, cond) { eq(label, !!cond, true); }

/* ------------------------------------------------------- canned upstreams */

var PROXY_OK = {
  query: "", count: 3, sources: ["duckduckgo", "wikipedia"], degraded: false, partial: false, error: null,
  results: [
    { title: "Onion routing - Wikipedia", url: "https://en.wikipedia.org/wiki/Onion_routing",
      snippet: "A technique for anonymous communication over a network.", host: "en.wikipedia.org",
      thumb: "https://upload.wikimedia.org/w/thumb/onion.png", source: "wikipedia" },
    { title: "Tor Project", url: "https://www.torproject.org/",
      snippet: "Download <b>Tor Browser</b> to experience real private browsing.", host: "torproject.org",
      thumb: null, source: "duckduckgo" },
    { title: "EFF on onion routing", url: "https://eff.org/onion",
      snippet: "Why onion routing matters.", host: "eff.org", thumb: null, source: "duckduckgo" }
  ]
};

var IA_OK = {
  Heading: "Onion routing",
  AbstractText: "Onion routing is a technique for anonymous communication over a computer network.",
  AbstractURL: "https://en.wikipedia.org/wiki/Onion_routing",
  AbstractSource: "Wikipedia",
  RelatedTopics: [{ FirstURL: "https://duckduckgo.com/Privacy", Text: "Privacy - DuckDuckGo" }]
};

/* A hostile upstream payload: every field tries to inject markup or a
   javascript: URL. This must arrive in the DOM as inert text. */
var PROXY_XSS = {
  query: "", count: 3, sources: ["duckduckgo"], degraded: false, partial: false, error: null,
  results: [
    { title: '<img src=x onerror="window.__pwned=1">', url: "https://ok.example/a",
      snippet: '<script>window.__pwned=2</script>safe <b>bold</b>', host: "ok.example", thumb: null, source: "duckduckgo" },
    { title: "javascript: payload", url: "javascript:window.__pwned=3",
      snippet: "should not become a clickable link", host: "", thumb: null, source: "duckduckgo" },
    { title: "data: payload", url: 'data:text/html,<script>window.__pwned=4</script>',
      snippet: "also not clickable", host: "", thumb: null, source: "duckduckgo" }
  ]
};

var IA_EMPTY = { Heading: "", AbstractText: "", AbstractURL: "", RelatedTopics: [] };

function fetchStub(routes, log) {
  return function (url, opts) {
    var u = String(url);
    log.push(u);
    for (var i = 0; i < routes.length; i++) {
      if (u.indexOf(routes[i][0]) !== -1) {
        var spec = routes[i][1];
        if (spec === "reject") return Promise.reject(new Error("network down"));
        var body = typeof spec === "function" ? spec(u) : spec;
        var status = (body && body.__status) || 200;
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status: status,
          json: function () { return Promise.resolve(body); }
        });
      }
    }
    return Promise.reject(new Error("unrouted " + u));
  };
}

/* ------------------------------------------------------------ dom harness */

/* jsdom 29 removed ResourceLoader, and older versions lack requestInterceptor,
   so rather than depend on either we inject the real script files ourselves.
   The document is still the genuine pikx.html (so every id and class the code
   looks up is the shipped markup) and the code executed is the genuine source
   from disk — only the network is bypassed, which is what we want anyway. */
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 40); }); }

var PAGE_SCRIPTS = ["js/px-search.js", "js/px-results.js", "js/pikx.js"];

async function boot(routes) {
  var log = [];
  var opened = [];
  var vc = new VirtualConsole();          /* swallow jsdom's CSS/rAF noise */
  vc.on("jsdomError", function (e) { vc.errors.push(String(e && e.message)); });
  vc.errors = [];

  var dom = new JSDOM(fs.readFileSync(path.join(ROOT, "pikx.html"), "utf8"), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://pikinc.vercel.app/pikx",
    virtualConsole: vc
  });
  var w = dom.window;

  await new Promise(function (resolve) {
    if (w.document.readyState === "complete") return setTimeout(resolve, 10);
    w.addEventListener("load", function () { setTimeout(resolve, 10); });
  });

  /* Installed before the page scripts run, so boot() and every user action
     below see the stubs. */
  w.fetch = fetchStub(routes, log);
  w.scrollTo = function () {};
  w.open = function (u) { opened.push(String(u)); return null; };
  w.__pwned = 0;

  /* Order matters: pikx.js boot() calls PIKResults.init(). */
  PAGE_SCRIPTS.forEach(function (rel) {
    var code = fs.readFileSync(path.join(ROOT, rel), "utf8");
    w.eval(code);
  });
  await tick(30);

  return { dom: dom, w: w, d: w.document, log: log, opened: opened, errors: vc.errors };
}

function submit(d, value) {
  var form = d.getElementById("pxOmniForm");
  var input = d.getElementById("pxOmniInput");
  input.value = value;
  form.dispatchEvent(new d.defaultView.Event("submit", { bubbles: true, cancelable: true }));
}



/* ------------------------------------------------------------------ tests */

(async function run() {

  console.log("\n[1] the redirect is gone: a search query renders in-page");
  var t1 = await boot([["/api/search", function (u) { return Object.assign({}, PROXY_OK); }],
                       ["api.duckduckgo.com", IA_OK]]);
  ok("PIKSearch loaded", !!t1.w.PIKSearch);
  ok("PIKResults loaded and initialised", !!t1.w.PIKResults && !!t1.w.PIKResults._state().tabs.length);
  eq("starts on the new-tab view", t1.d.getElementById("pxStage").getAttribute("data-view"), "newtab");

  submit(t1.d, "onion routing");
  await tick(180);

  eq("window.open was NOT called for a search", t1.opened.length, 0);
  eq("stage switched to the results view", t1.d.getElementById("pxStage").getAttribute("data-view"), "results");
  eq("results view is visible", t1.d.getElementById("pxViewResults").hidden, false);
  eq("hero view is hidden", t1.d.getElementById("pxViewNewTab").hidden, true);
  eq("query echoed in the header", t1.d.getElementById("pxResQuery").textContent, "onion routing");
  /* 3 from the proxy + 1 related topic from the Instant Answer API, deduped */
  eq("all merged results rendered", t1.d.querySelectorAll("#pxResList .px-result").length, 4);
  eq("result count label", t1.d.getElementById("pxResCount").textContent, "4 results");
  ok("IA related topic was merged in", /Privacy/.test(t1.d.getElementById("pxResList").textContent));

  var firstTitle = t1.d.querySelector("#pxResList .px-result__title a");
  eq("first result title", firstTitle.textContent, "Onion routing - Wikipedia");
  eq("first result href", firstTitle.getAttribute("href"), "https://en.wikipedia.org/wiki/Onion_routing");
  eq("result links are safe to open", firstTitle.getAttribute("rel"), "noopener noreferrer nofollow");
  eq("external tab target", firstTitle.getAttribute("target"), "_blank");
  ok("snippet rendered", /anonymous communication/.test(t1.d.querySelector(".px-result__snippet").textContent));
  ok("DDG <b> highlight preserved", !!t1.d.querySelector(".px-result__snippet b"));
  ok("instant-answer card shown", t1.d.getElementById("pxResAnswer").hidden === false);
  eq("instant-answer heading", t1.d.getElementById("pxAnsTitle").textContent, "Onion routing");
  ok("source badges rendered", t1.d.querySelectorAll("#pxResSources .px-srcbadge").length >= 2);
  eq("skeleton cleared", t1.d.querySelectorAll("#pxResList .px-skel").length, 0);
  eq("empty state hidden", t1.d.getElementById("pxResEmpty").hidden, true);
  eq("tab label reflects the query", t1.d.querySelector("#pxTabs .px-tabitem__label").textContent, "onion routing");
  t1.dom.window.close();

  console.log("\n[2] a typed ADDRESS still navigates (behaviour intentionally kept)");
  var t2 = await boot([["/api/search", PROXY_OK], ["api.duckduckgo.com", IA_OK]]);
  submit(t2.d, "torproject.org");
  await tick(900);
  eq("window.open called once", t2.opened.length, 1);
  eq("normalised to https", t2.opened[0], "https://torproject.org");
  eq("no search request was made", t2.log.filter(function (u) { return u.indexOf("/api/search") !== -1; }).length, 0);
  t2.dom.window.close();

  console.log("\n[3] an .onion address still navigates over http");
  var t3 = await boot([["/api/search", PROXY_OK], ["api.duckduckgo.com", IA_OK]]);
  submit(t3.d, "torchbrd7pqmbd3rfy.onion");
  await tick(900);
  eq("onion opened", t3.opened.length, 1);
  eq("onion scheme is http", t3.opened[0], "http://torchbrd7pqmbd3rfy.onion");
  t3.dom.window.close();

  console.log("\n[4] XSS: hostile result payloads arrive inert");
  var t4 = await boot([["/api/search", PROXY_XSS], ["api.duckduckgo.com", IA_EMPTY]]);
  await t4.w.PIKResults.run("xss probe");
  await tick(60);
  eq("no injected script executed", t4.w.__pwned, 0);
  eq("no script elements in the list", t4.d.querySelectorAll("#pxResList script").length, 0);
  eq("no img elements from titles", t4.d.querySelectorAll("#pxResList .px-result__title img").length, 0);
  var titles = [].map.call(t4.d.querySelectorAll(".px-result__title a"), function (a) { return a.textContent; });
  eq("markup is visible as literal text", titles[0], '<img src=x onerror="window.__pwned=1">');
  var hrefs = [].map.call(t4.d.querySelectorAll(".px-result__title a"), function (a) { return a.getAttribute("href"); });
  eq("javascript: URL is not linkified", hrefs[1], null);
  eq("data: URL is not linkified", hrefs[2], null);
  ok("legit https result IS linkified", hrefs[0] === "https://ok.example/a");
  var snip = t4.d.querySelector(".px-result__snippet");
  ok("snippet script tag escaped to text", /&lt;script&gt;|<script>/i.test(snip.innerHTML) && snip.querySelectorAll("script").length === 0);
  t4.dom.window.close();

  console.log("\n[5] total upstream failure shows an honest empty state");
  var t5 = await boot([["/api/search", "reject"], ["api.duckduckgo.com", "reject"]]);
  await t5.w.PIKResults.run("anything at all");
  await tick(60);
  eq("zero results", t5.d.querySelectorAll("#pxResList .px-result").length, 0);
  eq("empty state visible", t5.d.getElementById("pxResEmpty").hidden, false);
  eq("window.open not used as a silent fallback", t5.opened.length, 0);
  ok("explains the proxy is unreachable", /proxy|api\/search/i.test(t5.d.getElementById("pxEmptyText").textContent));
  ok("offers an explicit external escape hatch",
     /duckduckgo\.com\/\?q=anything/.test(t5.d.getElementById("pxEmptyExternal").getAttribute("href") || ""));
  eq("count label says no results", t5.d.getElementById("pxResCount").textContent, "no results");
  t5.dom.window.close();

  console.log("\n[6] partial degradation is disclosed, not hidden");
  var t6 = await boot([["/api/search", function () { return { __status: 502, error: "upstream HTTP 202" }; }],
                       ["api.duckduckgo.com", IA_OK]]);
  await t6.w.PIKResults.run("onion routing");
  await tick(60);
  eq("banner visible", t6.d.getElementById("pxResBanner").hidden, false);
  ok("banner explains the missing proxy", /proxy is unreachable/i.test(t6.d.getElementById("pxResBanner").textContent));
  ok("banner surfaces the upstream error", /HTTP 202/.test(t6.d.getElementById("pxResBanner").textContent));
  ok("'proxy offline' badge present", /proxy offline/i.test(t6.d.getElementById("pxResSources").textContent));
  ok("IA results still shown", t6.d.querySelectorAll("#pxResList .px-result").length > 0);
  t6.dom.window.close();

  console.log("\n[7] tab management");
  var t7 = await boot([["/api/search", PROXY_OK], ["api.duckduckgo.com", IA_OK]]);
  var R = t7.w.PIKResults;
  eq("one tab initially", R._state().tabs.length, 1);
  await R.run("first query");
  await tick(50);
  eq("search reuses the tab", R._state().tabs.length, 1);
  R.newTab();
  eq("new tab added", R._state().tabs.length, 2);
  eq("new tab shows the hero", t7.d.getElementById("pxStage").getAttribute("data-view"), "newtab");
  await R.run("second query");
  await tick(50);
  eq("second tab holds its own query", R._state().tabs[1].query, "second query");
  var tabEls = t7.d.querySelectorAll("#pxTabs .px-tabitem");
  eq("both tabs rendered", tabEls.length, 2);
  tabEls[0].dispatchEvent(new t7.w.MouseEvent("click", { bubbles: true }));
  await tick(30);
  eq("clicking tab 1 restores its query", t7.d.getElementById("pxResQuery").textContent, "first query");
  eq("tab 1 marked active", t7.d.querySelectorAll("#pxTabs .px-tabitem")[0].className.indexOf("is-active") !== -1, true);
  eq("tab 2 no longer active", t7.d.querySelectorAll("#pxTabs .px-tabitem")[1].className.indexOf("is-active") === -1, true);
  eq("aria-selected follows the active tab",
     [t7.d.querySelectorAll("#pxTabs .px-tabitem")[0].getAttribute("aria-selected"),
      t7.d.querySelectorAll("#pxTabs .px-tabitem")[1].getAttribute("aria-selected")], ["true", "false"]);

  /* regression: renderTabs used to wipe and rebuild the strip, throwing keyboard
     focus back to <body> whenever a tab was switched or created */
  var focusTarget = t7.d.querySelectorAll("#pxTabs .px-tabitem")[1];
  focusTarget.focus();
  eq("tab button can hold focus", t7.d.activeElement === focusTarget, true);
  R.newTab();
  await tick(20);
  ok("focus stays inside the tab strip after a re-render",
     t7.d.activeElement && t7.d.activeElement.classList.contains("px-tabitem"));

  /* the focus test above added a third tab, so the strip is now
     [first query, second query, new] with the new one active */
  eq("three tabs in the strip", R._state().tabs.length, 3);
  var ids = R._state().tabs.map(function (t) { return t.id; });
  eq("the new tab is active", R._state().activeId, ids[2]);

  /* closing the ACTIVE tab must hand focus/activation to a neighbour rather
     than leaving the strip with no selection */
  t7.d.querySelectorAll("#pxTabs .px-tabitem__close")[2]
     .dispatchEvent(new t7.w.MouseEvent("click", { bubbles: true }));
  await tick(30);
  eq("closing a tab removes it", R._state().tabs.length, 2);
  eq("active tab moved to a neighbour", R._state().activeId !== ids[2], true);
  eq("a results tab was selected", R._state().tabs.filter(function (t) { return t.id === R._state().activeId; })[0].kind, "results");

  /* closing a NON-active tab must not disturb the current view */
  var beforeActive = R._state().activeId;
  var beforeQuery = t7.d.getElementById("pxResQuery").textContent;
  var nonActive = [].filter.call(t7.d.querySelectorAll("#pxTabs .px-tabitem"), function (el) {
    return el.dataset.tabId !== beforeActive;
  })[0];
  nonActive.querySelector(".px-tabitem__close")
           .dispatchEvent(new t7.w.MouseEvent("click", { bubbles: true }));
  await tick(30);
  eq("one tab left", R._state().tabs.length, 1);
  eq("active tab unchanged", R._state().activeId, beforeActive);
  eq("visible query unchanged", t7.d.getElementById("pxResQuery").textContent, beforeQuery);

  /* closing the LAST tab must not leave an empty strip */
  t7.d.querySelector("#pxTabs .px-tabitem__close")
      .dispatchEvent(new t7.w.MouseEvent("click", { bubbles: true }));
  await tick(30);
  eq("a fresh tab replaces the last closed one", R._state().tabs.length, 1);
  eq("the fresh tab is a blank ghost tab", R._state().tabs[0].kind, "new");
  eq("and the hero is shown", t7.d.getElementById("pxStage").getAttribute("data-view"), "newtab");
  t7.dom.window.close();

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed\n");
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error("HARNESS ERROR:", e); process.exit(2); });
