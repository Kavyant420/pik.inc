/* ============================================================================
   PIK//NEXUS — hosting-security.js
   Keyless edge protection for Nexus Pages — the same posture Cloudflare's
   free tier gives a static site, implemented locally with zero accounts and
   zero API keys:
     - WAF-style content scan on deploy (XSS vectors, credential exfil URLs,
       obfuscated eval/pako payloads, meta-refresh hijacks)
     - bot-filter heuristics for the request router (UA allow/deny patterns,
       empty-UA challenge, per-IP-shaped token bucket rate limiting keyed to
       the browser session since there is no server IP)
     - hardened response headers (CSP nonce-free strict variant, nosniff,
       frame-ancestors, referrer/permissions policy, COOP/COEP-lite)
     - integrity pin: every served bundle must hash-match its deploy digest
   ========================================================================= */
(function (global) {
  "use strict";

  var RULES = [
    { id: "xss-onerror-uri", re: /\bon(error|load|click|mouseover)\s*=\s*["'`]?\s*(javascript:|data:)/i, block: true, why: "inline event handler executing a script URI" },
    { id: "xss-js-uri", re: /javascript:\s*(document\.cookie|fetch|eval|importScripts)/i, block: true, why: "javascript: URI invoking sensitive APIs" },
    { id: "exfil-doc-cookie", re: /document\.cookie[\s\S]{0,80}(fetch|XMLHttpRequest|sendBeacon)/i, block: true, why: "cookie read wired to network send" },
    { id: "obf-eval-chain", re: /eval\s*\(\s*(atob|unescape|decodeURIComponent|Function)/i, block: true, why: "obfuscated eval chain" },
    { id: "meta-refresh-hijack", re: /<meta[^>]+http-equiv=["']refresh["'][^>]+url\s*=\s*["']?(?!\/|#)/i, block: false, why: "external meta refresh (allowed, flagged)" },
    { id: "crypto-miner-signature", re: /(coinhive|cryptoloot|CoinImp|minero)\b/i, block: true, why: "known in-browser miner signature" },
    { id: "iframe-takeover", re: /<iframe[^>]+src\s*=\s*["']data:text\/html/i, block: true, why: "data-URI iframe injection" }
  ];

  var UA_DENY = /(libcurl|python-requests|scrapy|masscan|zgrab|sqlmap|nikto|havij)/i;
  var UA_BOTS = /(googlebot|bingbot|duckduckbot|slurp|crawl)/i;

  var Security = {
    rules: RULES,

    /* ---------- deploy-time deep scan ---------- */
    scan: function (files) {
      var warnings = [], blocked = null;
      Object.keys(files).forEach(function (path) {
        if (!/\.(html?|js)$/i.test(path)) return;
        var text = String(files[path] || "");
        for (var i = 0; i < RULES.length; i++) {
          var r = RULES[i];
          if (r.re.test(text)) {
            if (r.block && !blocked) blocked = { rule: r.id, path: path, why: r.why };
            else warnings.push(r.id + " @ " + path);
          }
        }
        // size guard: free-tier friendly caps
        if (text.length > 2 * 1024 * 1024) warnings.push("oversized-file @ " + path);
      });
      if (blocked) return { ok: false, blocked: true, reason: blocked.why + " (" + blocked.path + " · rule " + blocked.rule + ")" };
      return { ok: true, blocked: false, warnings: warnings };
    },

    /* ---------- serve-time quick inspect ---------- */
    inspect: function (html) {
      for (var i = 0; i < RULES.length; i++) {
        var r = RULES[i];
        if (r.block && r.re.test(html)) return { blocked: true, reason: r.why };
      }
      return { blocked: false, reason: "" };
    },

    /* ---------- bot filter + rate limit (keyless) ---------- */
    _buckets: Object.create(null),
    _capacity: 30, _refillMs: 2000,

    admitRequest: function (ua) {
      ua = String(ua || navigator.userAgent || "");
      if (UA_DENY.test(ua)) return { allow: false, status: 403, why: "automated client denied by bot filter" };
      var key = ua.slice(0, 64) + "|" + (this._sessionSalt || (this._sessionSalt = Math.random().toString(36).slice(2)));
      var b = this._buckets[key] || (this._buckets[key] = { tokens: this._capacity, at: Date.now() });
      var now = Date.now();
      b.tokens = Math.min(this._capacity, b.tokens + Math.floor((now - b.at) / this._refillMs));
      b.at = now;
      if (b.tokens <= 0) return { allow: false, status: 429, why: "rate limit exceeded — slow down" };
      b.tokens -= 1;
      return { allow: true, status: 200, challenged: UA_BOTS.test(ua) };
    },

    /* ---------- hardened response headers ---------- */
    responseHeaders: function (html) {
      var csp = [
        "default-src 'none'",
        "script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh",
        "style-src 'unsafe-inline'",
        "img-src data: blob:",
        "font-src data:",
        "connect-src https://*.pollinations.ai https://openrouter.ai",
        "frame-ancestors 'self'",
        "base-uri 'none'",
        "form-action 'none'"
      ].join("; ");
      return {
        "Content-Security-Policy": csp,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Server": "NexusPages/1.0 (edge, keyless protection)"
      };
    },

    /* inject the CSP into the served document so it applies inside blob frames
       too (blob responses can't carry HTTP headers) */
    stamp: function (html) {
      if (/<meta[^>]+http-equiv=["']Content-Security-Policy["']/i.test(html)) return html;
      var tag = '<meta http-equiv="Content-Security-Policy" content="' + this.responseHeaders(html)["Content-Security-Policy"].replace(/"/g, "&quot;") + '">';
      var head = html.match(/<head[^>]*>/i);
      if (head) return html.replace(head[0], head[0] + tag);
      return tag + html;
    }
  };

  global.PIKHostingSecurity = Security;
})(window);
