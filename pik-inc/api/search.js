/* ============================================================================
   PIKX — /api/search  (Vercel serverless function, Node runtime, zero deps)
   ----------------------------------------------------------------------------
   WHY THIS EXISTS
   The PIKX results tab used to hand the query to duckduckgo.com in a new
   browser tab. Showing results in-page instead is blocked by the same-origin
   policy: html.duckduckgo.com sends no Access-Control-Allow-Origin header, so
   a static page simply cannot read it. This function performs the fetch on the
   server, where CORS does not apply, and returns clean JSON.

   VERIFIED 2026-10-25 against the live endpoints:
     html.duckduckgo.com/html/?q=...   -> 200, 10 organic results   (general web)
     en.wikipedia.org/w/api.php        -> 200, canonical URLs + thumbnails +
                                          plain-text extracts      (encyclopedic)
   Both require a specific User-Agent. DDG answers a generic client agent with
   HTTP 403; Wikimedia answers a *browser* agent from a datacenter IP with 403
   and requires a descriptive agent per its robot policy. Browsers cannot set
   User-Agent at all (forbidden header name), so neither source is reliably
   reachable from client-side JS — hence this function.

   The two sources are queried concurrently and merged. DDG intermittently
   answers HTTP 202 with an "anomaly.js?cc=botnet" challenge page that contains
   zero results, so Wikipedia is what keeps this endpoint useful under
   throttle; the response reports which sources actually contributed.

   A third source, lite.duckduckgo.com/lite/, was implemented and then REMOVED:
   it is served by the same throttling infrastructure as html.duckduckgo.com
   (so it fails exactly when the primary does), and its result markup could not
   be observed to pin a parser against. Do not re-add it without a captured
   fixture in tests/search.test.js.

   Deliberate non-goals: no API keys, no user tracking, no query logging.
   Responses are edge-cacheable for 5 minutes (s-maxage) because search
   results for a given query are not user-specific.
   ========================================================================= */

"use strict";

/* A current desktop Chrome UA. DDG 403s generic client agents. */
var BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

var FETCH_TIMEOUT_MS = 9000;
var MAX_QUERY_LEN = 240;

/* ---------------------------------------------------------------- entities
   DDG titles and snippets are entity-encoded HTML. The first version of this
   handled only &lt; &gt; &quot; &#39; &nbsp; &amp;, which left real results
   rendering as "AbortController &mdash; Web APIs | MDN" in the results tab.
   Named entities common in search results are mapped explicitly and numeric
   references are decoded generically. &amp; is expanded LAST so that a literal
   "&amp;mdash;" in source text does not become an em dash. */
var NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", middot: "\u00b7",
  bull: "\u2022", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  laquo: "\u00ab", raquo: "\u00bb", trade: "\u2122", reg: "\u00ae", copy: "\u00a9",
  deg: "\u00b0", plusmn: "\u00b1", times: "\u00d7", divide: "\u00f7",
  frac12: "\u00bd", frac14: "\u00bc", frac34: "\u00be",
  larr: "\u2190", uarr: "\u2191", rarr: "\u2192", darr: "\u2193",
  euro: "\u20ac", pound: "\u00a3", yen: "\u00a5", cent: "\u00a2",
  eacute: "\u00e9", egrave: "\u00e8", agrave: "\u00e0", uuml: "\u00fc", ouml: "\u00f6", auml: "\u00e4"
};

function decodeEntities(s) {
  var out = String(s == null ? "" : s);

  /* numeric references: &#8212; and &#x2014; */
  out = out.replace(/&#(x[0-9a-fA-F]+|\d+);?/g, function (m, g) {
    var code = /^x/i.test(g) ? parseInt(g.slice(1), 16) : parseInt(g, 10);
    if (!isFinite(code) || code < 0 || code > 0x10ffff) return m;
    try { return String.fromCodePoint(code); } catch (e) { return m; }
  });

  /* named references except &amp; (handled last) */
  out = out.replace(/&([a-zA-Z][a-zA-Z0-9]{1,10});/g, function (m, name) {
    var key = name.toLowerCase();
    if (key === "amp") return m;
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
  });

  return out.replace(/&amp;/g, "&").trim();
}

function stripTags(s) {
  return decodeEntities(String(s == null ? "" : s).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/* DDG routes outbound clicks through //duckduckgo.com/l/?uddg=<encoded>.
   Unwrap that so the results tab shows (and links to) the real destination. */
function unwrapUrl(href) {
  var h = String(href || "").trim();
  if (!h) return "";
  if (h.indexOf("//duckduckgo.com/l/?") === 0 || h.indexOf("/l/?") === 0) {
    var m = h.match(/[?&]uddg=([^&]+)/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch (e) { /* fall through */ }
    }
  }
  if (h.indexOf("//") === 0) return "https:" + h;
  if (/^https?:\/\//i.test(h)) return h;
  /* DDG also emits relative ad/redirect targets — drop anything we cannot
     resolve to an absolute http(s) URL rather than leaking a broken link. */
  return "";
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

/* ------------------------------------------------------------------ fetch
   IMPORTANT: DuckDuckGo intermittently answers HTTP 202 with a ~14 kB
   anti-bot challenge page that contains zero results. 202 is inside the 2xx
   range, so a plain `res.ok` check accepts it and the caller silently reports
   "no results" for a query that actually has ten. We therefore require status
   200 exactly, and additionally reject any body that carries no result markup
   at all, then retry. Observed live 2026-10-25: the same query alternated
   between 200/10-results and 202/0-results across consecutive requests. */
var CHALLENGE_MARKERS = ["result__a", "result-link"];

function looksLikeResults(html) {
  var s = String(html || "");
  for (var i = 0; i < CHALLENGE_MARKERS.length; i++) {
    if (s.indexOf(CHALLENGE_MARKERS[i]) !== -1) return true;
  }
  return false;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function getTextOnce(url, ua) {
  /* global fetch exists on the Vercel Node 18+ runtime */
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
  return fetch(url, {
    headers: {
      "User-Agent": ua || BROWSER_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    redirect: "follow",
    signal: ctrl.signal
  })
    .then(function (res) {
      if (res.status !== 200) {
        /* 202 == DDG throttle/challenge page; 403 == rejected User-Agent;
           429 == rate limited. All are retryable, none are "success". */
        throw new Error("upstream HTTP " + res.status);
      }
      return res.text();
    })
    .then(function (body) {
      if (!looksLikeResults(body)) throw new Error("upstream 200 but no result markup (challenge page)");
      return body;
    })
    .finally(function () { clearTimeout(timer); });
}

async function getText(url, ua, attempts) {
  var tries = attempts || 3;
  var lastErr = null;
  for (var i = 0; i < tries; i++) {
    try {
      return await getTextOnce(url, ua);
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(250 * (i + 1)); /* 250ms, 500ms */
    }
  }
  throw lastErr || new Error("upstream fetch failed");
}

/* ------------------------------------------------- parser: html.duckduckgo
   Organic results live in <div class="result results_links ..."> blocks.
   Ads carry an extra "result--ad" class and are skipped: a privacy browser
   should not render promoted placements as if they were results. */
function parseDuckHtml(html) {
  var out = [];
  var blocks = String(html).split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/).slice(1);

  for (var i = 0; i < blocks.length && out.length < 30; i++) {
    var b = blocks[i];
    if (/\bresult--ad\b/.test(b) || /result__label/.test(b)) continue;

    var a = b.match(/<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) {
      /* some layouts put href before class */
      a = b.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    }
    if (!a) continue;

    var url = unwrapUrl(a[1]);
    if (!url) continue;
    var title = stripTags(a[2]);
    if (!title) continue;

    var sn = b.match(/class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    var snippet = sn ? stripTags(sn[1]) : "";

    out.push({
      title: title.slice(0, 200),
      url: url,
      snippet: snippet.slice(0, 400),
      host: hostOf(url),
      source: "duckduckgo"
    });
  }
  return out;
}

/* --------------------------------------------------------- wikipedia search
   Wikimedia 403s browser-like User-Agents from datacenter IPs and requires a
   descriptive agent per its robot policy. Browsers cannot set User-Agent (it
   is a forbidden header name), so this source MUST be fetched server-side —
   which is exactly what this function is for. Verified 2026-10-25: the
   generator=search form below returns canonical URLs, thumbnails and plain
   text extracts in a single call. */
var WIKI_UA = "PIKX/1.0 (https://pikinc.vercel.app; contact@pik.inc)";

function getJson(url, ua) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
  return fetch(url, {
    headers: { "User-Agent": ua, "Accept": "application/json" },
    signal: ctrl.signal
  })
    .then(function (res) {
      if (res.status !== 200) throw new Error("upstream HTTP " + res.status);
      return res.json();
    })
    .finally(function () { clearTimeout(timer); });
}

function parseWikipediaOrdered(json) {
  var pages = (json && json.query && json.query.pages) || {};
  var arr = Object.keys(pages).map(function (k) {
    var p = pages[k] || {};
    p._i = typeof p.index === "number" ? p.index : 9999;
    return p;
  });
  arr.sort(function (a, b) { return a._i - b._i; });
  return arr.map(function (p) {
    if (!p.title) return null;
    var url = p.fullurl || ("https://en.wikipedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")));
    return {
      title: p.title,
      url: url,
      snippet: String(p.extract || "").replace(/\s+/g, " ").trim().slice(0, 400),
      host: "en.wikipedia.org",
      thumb: (p.thumbnail && p.thumbnail.source) || null,
      source: "wikipedia"
    };
  }).filter(Boolean);
}

async function searchWikipedia(q, limit) {
  var url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: q,
    gsrlimit: String(limit || 5),
    prop: "info|pageimages|extracts",
    inprop: "url",
    pithumbsize: "96",
    exintro: "1",
    explaintext: "1",
    format: "json"
  }).toString();
  var json = await getJson(url, WIKI_UA);
  return parseWikipediaOrdered(json);
}

/* ---------------------------------------------------------------- handler */
function cors(res) {
  /* Public, non-user-specific search data. Any origin may read it so the
     standalone pikx-website bundle and local dev both work. No credentials. */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204); return res.end(); }
  if (req.method !== "GET") { res.status(405); return res.json({ error: "GET only" }); }

  var q = String((req.query && req.query.q) || "").trim().slice(0, MAX_QUERY_LEN);
  if (!q) { res.status(400); return res.json({ error: "missing q" }); }

  var n = parseInt((req.query && req.query.n) || "10", 10);
  if (!isFinite(n) || n < 1) n = 10;
  n = Math.min(n, 30);

  /* Run the independent sources concurrently so latency does not stack, and so
     one throttled source cannot take the whole response down. DDG is the only
     source of general web results; Wikipedia is encyclopedic but very stable
     and keeps the tab useful when DDG is rate-limiting our egress IP. */
  var settled = await Promise.allSettled([
    getText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), BROWSER_UA, 2)
      .then(parseDuckHtml),
    searchWikipedia(q, 5)
  ]);

  function reason(i) {
    var s = settled[i];
    if (s.status === "fulfilled") return null;
    var e = s.reason;
    return (e && e.message) ? e.message : String(e);
  }

  var ddg = settled[0].status === "fulfilled" ? settled[0].value : [];
  var wiki = settled[1].status === "fulfilled" ? settled[1].value : [];

  /* DDG first (general web results), then Wikipedia, deduped by normalised URL
     so an article that appears in both is only shown once. */
  var results = [];
  var seen = Object.create(null);
  ddg.concat(wiki).forEach(function (r) {
    if (!r || !r.url) return;
    var key = r.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    results.push(r);
  });

  var sources = [];
  if (ddg.length) sources.push("duckduckgo");
  if (wiki.length) sources.push("wikipedia");

  var errors = [reason(0), reason(1)].filter(Boolean);
  results = results.slice(0, n);

  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.status(results.length ? 200 : 502);
  return res.json({
    query: q,
    count: results.length,
    sources: sources,
    results: results,
    /* Surfaced so the client can show an honest "degraded" badge instead of
       pretending a failed search returned zero results. */
    degraded: results.length === 0,
    partial: results.length > 0 && errors.length > 0,
    error: results.length ? (errors.length ? errors.join(" | ") : null) : (errors.join(" | ") || "no results")
  });
};

/* Exported for unit tests (see api/README.md). Not used by Vercel. */
module.exports._internals = {
  parseDuckHtml: parseDuckHtml,
  parseWikipediaOrdered: parseWikipediaOrdered,
  unwrapUrl: unwrapUrl,
  stripTags: stripTags,
  looksLikeResults: looksLikeResults
};
