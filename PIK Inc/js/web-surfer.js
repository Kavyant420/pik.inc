/* ============================================================================
   PIK//NEXUS — web-surfer.js
   Live web research for agent answers, surfaced exactly like "Thinking…":
     - the model (or the user) emits  WEBGET[https://example.com]  calls
     - NEXUS fetches each URL through keyless CORS text relays (jina reader
       first, then corsproxy.io / allorigins), strips it down to readable
       text, and injects it back into the chat as a '[web research]' turn so
       the model can cite it in its next answer
     - while surfing, a shining "Surfing the web…" strip mirrors the
       reasoning strip; every hop is logged into the action log
   ========================================================================= */
(function (global) {
  "use strict";

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  var WEBGET_RE = /WEBGET\[\s*(https?:\/\/[^\s\]"'<>]+)\s*\]/gi;

  var Surfer = {
    /* how many pages we auto-fetch per answer (keeps free relays happy) */
    MAX_PER_TURN: 3,
    MAX_CHARS: 9000,

    extractUrls: function (text) {
      var out = [], m;
      WEBGET_RE.lastIndex = 0;
      while ((m = WEBGET_RE.exec(String(text || ""))) !== null) {
        if (out.indexOf(m[1]) === -1) out.push(m[1]);
      }
      return out.slice(0, this.MAX_PER_TURN);
    },

    /* drop the WEBGET[...] tokens from visible output — they are tool calls,
       not prose; replace with a tidy inline citation chip instead */
    scrubCalls: function (text) {
      return String(text || "").replace(WEBGET_RE, function (_, u) {
        try { return "[surfing " + new URL(u).host + "]"; } catch (e) { return "[surfing web]"; }
      });
    },

    _relays: function (url) {
      var e = encodeURIComponent(url);
      return [
        { name: "reader", direct: true, u: "https://r.jina.ai/" + url },
        { name: "corsproxy", direct: false, u: "https://corsproxy.io/?url=" + e },
        { name: "allorigins", direct: false, u: "https://api.allorigins.win/raw?url=" + e }
      ];
    },

    async fetchPage(url, signal) {
      var relays = this._relays(url), lastErr = null;
      for (var i = 0; i < relays.length; i++) {
        try {
          var res = await fetch(relays[i].u, {
            signal: signal,
            headers: relays[i].direct ? { "Accept": "text/plain" } : undefined
          });
          if (!res.ok) { lastErr = new Error(relays[i].name + " HTTP " + res.status); continue; }
          var raw = await res.text();
          if (!raw || raw.length < 40) { lastErr = new Error(relays[i].name + " empty payload"); continue; }
          var txt = this._toText(raw);
          if (txt.length < 40) { lastErr = new Error(relays[i].name + " no readable text"); continue; }
          return { url: url, relay: relays[i].name, text: txt.slice(0, this.MAX_CHARS), truncated: txt.length > this.MAX_CHARS };
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          lastErr = e;
        }
      }
      throw lastErr || new Error("all web relays failed");
    },

    /* HTML -> readable text (titles, headings kept as markdown-ish lines) */
    _toText: function (html) {
      var s = String(html);
      if (/^\s*[{[]/.test(s) === false && s.indexOf("<") === -1) {
        // plain-text relay payload (jina returns markdown already)
        return s.replace(/\r/g, "").trim();
      }
      var doc;
      try { doc = new DOMParser().parseFromString(s, "text/html"); }
      catch (e) { return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
      ["script", "style", "noscript", "svg", "iframe", "template"].forEach(function (tag) {
        Array.prototype.slice.call(doc.querySelectorAll(tag)).forEach(function (n) { n.remove(); });
      });
      var lines = [];
      var main = doc.querySelector("main, article") || doc.body || doc;
      Array.prototype.slice.call(main.querySelectorAll("h1,h2,h3,h4,p,li,pre,blockquote")).slice(0, 220).forEach(function (el) {
        var t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!t || t.length < 3) return;
        if (/^H[1-4]$/.test(el.tagName)) t = "#".repeat(Math.min(4, +el.tagName[1])) + " " + t;
        if (el.tagName === "LI") t = "- " + t;
        lines.push(t);
      });
      var out = lines.join("\n");
      if (out.length < 80) {
        out = (main.textContent || "").replace(/\s+/g, " ").trim();
      }
      var title = (doc.title || "").trim();
      return (title ? "# " + title + "\n\n" : "") + out;
    },

    /* ---------- full turn: fetch every URL called in the last answer ------ */
    /**
     * urls: array of links. onStatus(fn(statusObj)) lets chat.js paint the
     * shining strip. Returns [{url, ok, text?, error?}]
     */
    async surf(urls, signal, onStatus) {
      var results = [], self = this;
      for (var i = 0; i < urls.length; i++) {
        if (onStatus) onStatus({ state: "fetching", url: urls[i], index: i, total: urls.length });
        try {
          var page = await this.fetchPage(urls[i], signal);
          results.push({ url: page.url, ok: true, text: page.text, relay: page.relay, truncated: page.truncated });
          document.dispatchEvent(new CustomEvent("pik:log", { detail: "surf ok  " + page.url + " via " + page.relay + " (" + page.text.length + " chars)" }));
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          results.push({ url: urls[i], ok: false, error: String(e.message || e) });
          document.dispatchEvent(new CustomEvent("pik:log", { detail: "surf FAIL " + urls[i] + " — " + (e.message || e) }));
        }
      }
      if (onStatus) onStatus({ state: "done", url: urls[urls.length - 1], index: urls.length, total: urls.length });
      return results;
    },

    /* render fetched pages as the '[web research]' context block that gets
       injected into the model history */
    toContext: function (results) {
      var blocks = results.map(function (r) {
        if (!r.ok) return "URL: " + r.url + "\nSTATUS: unreachable (" + r.error + ")";
        return "URL: " + r.url + "\nCONTENT:\n" + r.text + (r.truncated ? "\n[…truncated]" : "");
      });
      return "[web research] Fresh live pages fetched by NEXUS just now. Use them as ground truth, cite the URLs, prefer this data over memory:\n\n" +
        blocks.join("\n\n---\n\n");
    }
  };

  global.PIKSurfer = Surfer;
})(window);
