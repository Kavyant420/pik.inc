/* ============================================================================
   PIKX — /api/search parser tests (offline, deterministic, zero deps)

   These tests pin the HTML/JSON shapes that the live endpoints were observed
   to return on 2026-10-25, so a future markup change fails loudly here rather
   than silently shipping an empty results tab. No network access required.

   Run:  node tests/search.test.js
   ========================================================================= */

"use strict";

var path = require("path");
var apiPath = path.join(__dirname, "..", "pik-inc", "api", "search.js");
var I = require(apiPath)._internals;

var pass = 0, fail = 0;
function eq(label, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + "\n       expected " + e + "\n       actual   " + a); }
}
function ok(label, cond) { eq(label, !!cond, true); }

/* ---------------------------------------------------- fixture: DDG html SERP
   Shape captured live from html.duckduckgo.com/html/. Note the attribute
   order (rel before class, href after class) and the /l/?uddg= redirect
   wrapper — both tripped up the first version of the parser. */
var DDG_HTML = [
  '<div id="links" class="results">',
  '  <div class="result results_links results_links_deep web-result ">',
  '    <div class="links_main links_deep result__body">',
  '      <h2 class="result__title">',
  '        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdeveloper.mozilla.org%2Fen%2DUS%2Fdocs%2FWeb%2FAPI%2FAbortController&amp;rut=881c07">AbortController &mdash; Web APIs | MDN</a>',
  '      </h2>',
  '      <a class="result__snippet" href="#">The <b>AbortController</b> interface represents a controller object.</a>',
  '    </div>',
  '  </div>',
  '  <div class="result result--ad results_links">',
  '    <h2 class="result__title"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example.com">Sponsored Thing</a></h2>',
  '    <span class="result__label">Ad</span>',
  '  </div>',
  '  <div class="result results_links results_links_deep web-result ">',
  '    <h2 class="result__title"><a rel="nofollow" class="result__a" href="https://example.org/plain">Plain absolute URL</a></h2>',
  '    <a class="result__snippet">No redirect wrapper here.</a>',
  '  </div>',
  '</div>'
].join("\n");

/* --------------------------------------------- fixture: DDG 202 challenge page
   This is what html.duckduckgo.com returns when it throttles an IP. It is a
   2xx response with no result markup; accepting it produced a silent
   "0 results" bug. */
var DDG_CHALLENGE = '<html><head><title>duckduckgo</title></head><body><div class="cwv">challenge</div></body></html>';

/* ------------------------------------------- fixture: wikipedia generator=search */
var WIKI_JSON = {
  batchcomplete: "",
  query: {
    pages: {
      "1234": { pageid: 1234, ns: 0, title: "Glassmorphism", index: 2,
        fullurl: "https://en.wikipedia.org/wiki/Glassmorphism",
        extract: "Glassmorphism   is a design style.\n\nIt uses backdrop blur.",
        thumbnail: { source: "https://upload.wikimedia.org/w/thumb/g.png" } },
      "999":  { pageid: 999, ns: 0, title: "Neumorphism", index: 1,
        fullurl: "https://en.wikipedia.org/wiki/Neumorphism",
        extract: "Neumorphism is a design style." }
    }
  }
};

console.log("\nparseDuckHtml");
var ddg = I.parseDuckHtml(DDG_HTML);
eq("extracts both organic results", ddg.length, 2);
eq("unwraps the /l/?uddg= redirect", ddg[0] && ddg[0].url, "https://developer.mozilla.org/en-US/docs/Web/API/AbortController");
eq("decodes HTML entities in the title", ddg[0] && ddg[0].title, "AbortController — Web APIs | MDN");
eq("strips tags from the snippet", ddg[0] && ddg[0].snippet, "The AbortController interface represents a controller object.");
eq("derives host without www", ddg[0] && ddg[0].host, "developer.mozilla.org");
eq("tags the source", ddg[0] && ddg[0].source, "duckduckgo");
ok("excludes the ad placement", !ddg.some(function (r) { return /ads\.example\.com/.test(r.url); }));
eq("keeps a plain absolute URL untouched", ddg[1] && ddg[1].url, "https://example.org/plain");

console.log("\nentity decoding (regression: &mdash; leaked into titles)");
eq("named em dash", I.stripTags("A &mdash; B"), "A \u2014 B");
eq("named ellipsis", I.stripTags("wait&hellip;"), "wait\u2026");
eq("decimal numeric ref", I.stripTags("caf&#233;"), "caf\u00e9");
eq("hex numeric ref", I.stripTags("caf&#xE9;"), "caf\u00e9");
eq("amp is not double-decoded", I.stripTags("&amp;mdash;"), "&mdash;");
eq("unknown entity left alone", I.stripTags("&notarealentity;"), "&notarealentity;");
eq("tags stripped before decoding", I.stripTags("&lt;b&gt;bold&lt;/b&gt;"), "<b>bold</b>");

console.log("\nchallenge-page detection");
eq("real SERP has result markup", I.looksLikeResults(DDG_HTML), true);
eq("202 challenge page is rejected", I.looksLikeResults(DDG_CHALLENGE), false);
eq("parser yields nothing on a challenge page", I.parseDuckHtml(DDG_CHALLENGE).length, 0);

console.log("\nparseWikipediaOrdered");
var wiki = I.parseWikipediaOrdered(WIKI_JSON);
eq("returns both pages", wiki.length, 2);
eq("sorts by relevance index, not pageid", wiki.map(function (r) { return r.title; }), ["Neumorphism", "Glassmorphism"]);
eq("collapses whitespace in the extract", wiki[1].snippet.indexOf("   "), -1);
ok("keeps the thumbnail when present", wiki[1].thumb && wiki[1].thumb.indexOf("upload.wikimedia.org") !== -1);
eq("thumb is null when absent", wiki[0].thumb, null);
eq("handles an empty response", I.parseWikipediaOrdered({ query: {} }).length, 0);
eq("handles a null response", I.parseWikipediaOrdered(null).length, 0);

console.log("\nunwrapUrl edge cases");
eq("protocol-relative becomes https", I.unwrapUrl("//example.com/a"), "https://example.com/a");
eq("empty string stays empty", I.unwrapUrl(""), "");
eq("null stays empty", I.unwrapUrl(null), "");
eq("relative junk is dropped", I.unwrapUrl("/some/relative/path"), "");
eq("malformed uddg falls back to prefixing", I.unwrapUrl("//duckduckgo.com/l/?uddg=%E4%").slice(0, 5), "https");

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed\n");
process.exit(fail === 0 ? 0 : 1);
