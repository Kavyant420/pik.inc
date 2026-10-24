/* ============================================================================
   PIKX — px-search.js
   ----------------------------------------------------------------------------
   Real web search for the results tab. Replaces the old behaviour of handing
   the query to duckduckgo.com in a new browser tab.

   Two sources, queried concurrently:
     1. /api/search          — our own serverless proxy (see api/README.md).
                               The only source of a real general-web result
                               list, because the engines block cross-origin
                               reads from the browser.
     2. api.duckduckgo.com   — the Instant Answer API. Verified to send
                               Access-Control-Allow-Origin: *, so it works with
                               no proxy at all. It only answers ENTITY queries
                               ("glassmorphism", "onion routing") and returns
                               nothing for ordinary queries ("tor browser"), so
                               it supplies the knowledge-panel card and a few
                               related links, never the whole result list.

   Degradation is explicit. If the proxy is unreachable — the page opened from
   file://, or the function not deployed — the caller gets whatever the Instant
   Answer API produced plus `proxyAvailable: false`, so the UI can say so
   instead of showing a blank tab.

   SECURITY: every string in a result is untrusted third-party content. Nothing
   here builds HTML. Consumers must render with textContent / createElement.
   The `escapeHtml` helper exists for the one place a snippet needs inline
   <b> highlight markup, and it escapes first, then re-allows only <b>.

   PRIVACY: results are cached in memory only, never in localStorage or
   IndexedDB. Closing the tab discards them, which is what the UI promises.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = (global.PIK_CONFIG && global.PIK_CONFIG.SEARCH) || {
    SELF_PROXY: "/api/search",
    DDG_IA: "https://api.duckduckgo.com/",
    FAVICON: "https://www.google.com/s2/favicons?domain=",
    PER_SOURCE_TIMEOUT_MS: 6000,
    MAX_RESULTS: 12
  };

  var memoryCache = Object.create(null);   /* query -> result envelope */

  /* ------------------------------------------------------------- utilities */

  function isSecureContext() {
    /* file:// and other non-http origins cannot reach a relative /api path */
    return /^https?:$/.test(global.location && global.location.protocol || "");
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error(label + " timed out after " + ms + "ms"));
      }, ms);
      promise.then(
        function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
        function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
      );
    });
  }

  function getJson(url, ms, label, signal) {
    return withTimeout(
      fetch(url, { signal: signal, headers: { "Accept": "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error(label + " HTTP " + res.status);
          return res.json();
        }),
      ms, label
    );
  }

  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  function faviconFor(url) {
    var h = hostOf(url);
    return h ? CFG.FAVICON + encodeURIComponent(h) + "&sz=32" : "";
  }

  /* Escape untrusted text, then re-allow exactly one tag pair. Used for DDG's
     snippet markup only; everything else is rendered as plain text. */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function allowBoldOnly(escaped) {
    return escapeHtml(escaped)
      .replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
  }

  function dedupe(list) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || !r.url) continue;
      var key = r.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(r);
    }
    return out;
  }

  /* ------------------------------------------------------- source: proxy */

  function viaProxy(query, n, signal) {
    if (!isSecureContext()) {
      return Promise.reject(new Error("proxy unavailable on " + (global.location.protocol || "unknown") + " origin"));
    }
    var url = CFG.SELF_PROXY + "?q=" + encodeURIComponent(query) + "&n=" + encodeURIComponent(n);
    return fetch(url, { signal: signal, headers: { "Accept": "application/json" } })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          /* 502 is a legitimate "no results / upstream throttled" signal, not a
             transport failure — carry its diagnostics through. */
          if (!res.ok && !j.results) throw new Error("proxy HTTP " + res.status + (j.error ? ": " + j.error : ""));
          j.__status = res.status;
          return j;
        });
      });
  }

  /* ------------------------------------------- source: DDG Instant Answer */

  function flattenTopics(topics, depth) {
    var out = [];
    var d = depth || 0;
    if (!Array.isArray(topics) || d > 3) return out;
    topics.forEach(function (t) {
      if (!t) return;
      if (Array.isArray(t.Topics)) { out = out.concat(flattenTopics(t.Topics, d + 1)); return; }
      if (t.FirstURL && t.Text) {
        out.push({
          title: String(t.Text).split(" - ")[0].slice(0, 140),
          url: t.FirstURL,
          snippet: String(t.Text).slice(0, 400),
          host: hostOf(t.FirstURL),
          source: "duckduckgo-ia"
        });
      }
    });
    return out;
  }

  function viaInstantAnswer(query, signal) {
    var url = CFG.DDG_IA + "?q=" + encodeURIComponent(query) +
      "&format=json&no_redirect=1&no_html=1&skip_disambig=1&t=pikx";
    return withTimeout(
      fetch(url, { signal: signal, headers: { "Accept": "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("ddg-ia HTTP " + res.status);
          return res.json();
        }),
      CFG.PER_SOURCE_TIMEOUT_MS, "ddg-ia"
    ).then(function (j) {
      var answer = null;
      if (j && (j.AbstractText || j.Answer || j.Definition)) {
        answer = {
          heading: j.Heading || query,
          text: j.AbstractText || j.Definition || j.Answer || "",
          url: j.AbstractURL || j.DefinitionURL || "",
          source: j.AbstractSource || j.DefinitionSource || "DuckDuckGo",
          image: (j.Image && /^https?:/.test(j.Image)) ? j.Image : ""
        };
      }
      return { answer: answer, results: flattenTopics(j && j.RelatedTopics) };
    });
  }

  /* ------------------------------------------------------------ public API */

  var PIKSearch = {
    escapeHtml: escapeHtml,
    allowBoldOnly: allowBoldOnly,
    faviconFor: faviconFor,
    hostOf: hostOf,

    /**
     * @param {string} query
     * @param {object} [opts] { n, signal, fresh }
     * @returns {Promise<{query,results,answer,sources,proxyAvailable,degraded,partial,error,ms,fromCache}>}
     */
    async search(query, opts) {
      var o = opts || {};
      var q = String(query || "").trim();
      var started = Date.now();
      if (!q) {
        return { query: "", results: [], answer: null, sources: [], proxyAvailable: isSecureContext(),
                 degraded: true, partial: false, error: "empty query", ms: 0, fromCache: false };
      }

      var cacheKey = q.toLowerCase();
      if (!o.fresh && memoryCache[cacheKey]) {
        var hit = memoryCache[cacheKey];
        return Object.assign({}, hit, { fromCache: true, ms: Date.now() - started });
      }

      var n = Math.min(parseInt(o.n, 10) || CFG.MAX_RESULTS, 30);
      var settled = await Promise.allSettled([
        viaProxy(q, n, o.signal),
        viaInstantAnswer(q, o.signal)
      ]);

      var proxy = settled[0].status === "fulfilled" ? settled[0].value : null;
      var ia = settled[1].status === "fulfilled" ? settled[1].value : null;
      var errors = settled
        .map(function (s) { return s.status === "rejected" ? (s.reason && s.reason.message) || String(s.reason) : null; })
        .filter(Boolean);

      var proxyAvailable = !!(proxy && Array.isArray(proxy.results) && proxy.results.length);
      var results = dedupe(
        (proxy && proxy.results ? proxy.results : []).concat(ia && ia.results ? ia.results : [])
      ).slice(0, n);

      var sources = [];
      if (proxyAvailable) sources.push(proxy.engine === "duckduckgo-lite" ? "duckduckgo-lite" : "duckduckgo");
      if (proxy && Array.isArray(proxy.sources)) {
        proxy.sources.forEach(function (s) { if (sources.indexOf(s) === -1) sources.push(s); });
      }
      if (ia && ia.results && ia.results.length && sources.indexOf("duckduckgo-ia") === -1) sources.push("duckduckgo-ia");
      if (ia && ia.answer) sources.push("instant-answer");

      var envelope = {
        query: q,
        results: results,
        answer: (ia && ia.answer) || null,
        sources: sources,
        proxyAvailable: proxyAvailable,
        /* degraded = nothing at all; partial = something, but an upstream failed */
        degraded: results.length === 0 && !(ia && ia.answer),
        partial: (results.length > 0 || !!(ia && ia.answer)) && errors.length > 0,
        error: errors.length ? errors.join(" | ") : null,
        ms: Date.now() - started,
        fromCache: false
      };

      /* Cache only successful lookups; a throttled response must be retried. */
      if (!envelope.degraded) memoryCache[cacheKey] = envelope;

      return envelope;
    },

    clearCache: function () { memoryCache = Object.create(null); },

    /** True when the input is a navigable address rather than a search query. */
    isUrl: function (v) {
      var s = String(v || "").trim();
      if (!s || /\s/.test(s)) return false;
      return /^https?:\/\//i.test(s) ||
             /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s) ||
             /\.onion\b/i.test(s);
    },

    /** Normalises a typed address into an absolute URL. */
    toUrl: function (v) {
      var s = String(v || "").trim();
      if (/^https?:\/\//i.test(s)) return s;
      if (/\.onion\b/i.test(s)) return "http://" + s.replace(/^\/+/, "");
      return "https://" + s.replace(/^\/+/, "");
    }
  };

  global.PIKSearch = PIKSearch;
})(window);
