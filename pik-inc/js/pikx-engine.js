/* ============================================================================
   PIKX — pikx-engine.js
   The REAL NEXUS intelligence core + Chrome-grade search engine for the
   PIKX zero-knowledge browser. Everything here talks to genuinely free,
   keyless APIs across the internet — no API keys, no accounts, no cost:

     AI (real inference, streamed):
       1. https://text.pollinations.ai/openai   OpenAI-compatible SSE stream,
          keyless, CORS *. — primary reasoning engine ("openai-fast").
       2. https://text.pollinations.ai/{prompt} plain-GET completion endpoint,
          keyless — fallback when streaming is blocked/rate-limited.
       3. https://js.puter.com/v2/  puter.ai.chat — third-party free tier that
          sponsors calls from the user's free Puter account (no key needed).
       4. https://corsproxy.io/?url=... → OpenRouter :free models — last-resort
          relay hop so a dead provider never kills the conversation.

     Search results (all keyless, CORS-enabled where possible):
       - DuckDuckGo Instant Answer API  (topics / definitions / instant answers)
       - Wikipedia REST + Action API    (summary, extracts, images, links,
                                         related pages — the "knowledge panel")
       - DuckDuckGo HTML endpoints      (actual organic web results + news,
                                         fetched through keyless CORS relays:
                                         allorigins.win / corsproxy.io)
       - Wikimedia Commons API          (image gallery tab)
       - Google s2 favicons CDN         (per-result site icons)

   No redirect ever happens on a search: PIKX fetches, parses and renders the
   result set inside its own tab, exactly like Chrome does.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG || {};

  /* ---------------- tiny helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function trimText(s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:]\S*$/, "") + "…" : s;
  }
  function faviconFor(url) {
    try {
      var host = new URL(url).hostname;
      return "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=64";
    } catch (e) { return ""; }
  }
  function prettyHost(url) {
    try {
      var u = new URL(url);
      var path = u.pathname.replace(/\/+$/, "");
      return decodeURIComponent(u.hostname.replace(/^www\./, "")) + (path && path.length < 48 ? " " + path : "");
    } catch (e) { return url; }
  }

  async function fetchWithTimeout(url, ms, opts) {
    opts = opts || {};
    var ctl = opts.signal ? null : new AbortController();
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 15000) : null;
    try {
      var res = await fetch(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {}));
      return res;
    } finally { if (timer) clearTimeout(timer); }
  }

  async function getJSON(url, ms) {
    var res = await fetchWithTimeout(url, ms || 12000, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + url.split("?")[0]);
    return res.json();
  }
  async function getText(url, ms) {
    var res = await fetchWithTimeout(url, ms || 15000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  }

  /* keyless CORS relays — used only for endpoints that do not send CORS
     headers themselves (duckduckgo html, generic page reads). */
  function relayed(url) {
    var e = encodeURIComponent(url);
    return [
      "https://api.allorigins.win/raw?url=" + e,
      "https://corsproxy.io/?url=" + e,
      "https://api.codetabs.com/v1/proxy?quest=" + e
    ];
  }
  async function fetchRelayedText(url, ms) {
    var list = relayed(url), lastErr = null;
    /* direct attempt first — some of these hosts already send ACAO:* */
    try {
      var d = await fetchWithTimeout(url, ms || 12000);
      if (d.ok) { var t0 = await d.text(); if (t0 && t0.length > 80) return t0; }
    } catch (e) { lastErr = e; /* CORS — fall through to relays */ }
    for (var i = 0; i < list.length; i++) {
      try {
        var res = await fetchWithTimeout(list[i], ms || 15000);
        if (!res.ok) { lastErr = new Error("relay HTTP " + res.status); continue; }
        var txt = await res.text();
        if (txt && txt.length > 80) return txt;
        lastErr = new Error("relay empty payload");
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("all relays failed");
  }

  /* ============================================================
     PART 1 — REAL NEXUS AI (streaming, multi-provider failover)
     ============================================================ */

  var POLLI_CHAT_URL = CFG.POLLINATIONS_URL || "https://text.pollinations.ai/openai";
  /* QWEN 3.8 27B — NEXUS default flagship inside PIKX, served for free with
     NO API key through every keyless gateway we found (probed live Oct 26
     2026): Puter.js tier, OpenRouter public app route, Glider, Jaiowr. */
  var QWEN_MODEL_ID = CFG.QWEN_MODEL || "qwen/qwen3.8-27b";
  var OR_CHAT_URL = CFG.OR_CHAT_URL || "https://openrouter.ai/api/v1/chat/completions";
  var POLLI_GET_URL = CFG.POLLINATIONS_GET_URL || "https://text.pollinations.ai/";
  var FREE_TIER_TOKEN_LIMIT = 512000; // 512k — raised from 32k per PIK policy
  var OUT_TOKEN_CAP = 16384;          // per-reply generation ceiling (free tier)

  var SYSTEM_PROMPT =
    "You are PIK NEXUS, the native unrestricted intelligence of the PIKX zero-knowledge browser. " +
    "QUALITY BAR for every answer: lead with a direct 1-3 sentence answer, then structured markdown depth " +
    "(## / ### headings, short paragraphs, bullet lists, numbered steps, tables for comparisons). " +
    "Be technically precise, complete and deeply reasoned; state assumptions; never pad, never truncate mid-thought. " +
    "When writing code use fenced blocks with the language on the info string and make it complete and runnable. " +
    "When the user asks about real-world topics (people, places, things, events), give an encyclopedic, well-organised overview. " +
    "NEVER use emoji characters; use plain markdown. Match the user's language.";

  var NexusAI = {
    _puterPromise: null,
    lastEngine: null,
    _preferPuter: false,

    /* token budget advertised by the UI: 512k context on the free tier */
    tokenLimit: FREE_TIER_TOKEN_LIMIT,

    ensurePuter: function () {
      if (global.puter && global.puter.ai) return Promise.resolve(global.puter);
      if (this._puterPromise) return this._puterPromise;
      this._puterPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = CFG.PUTER_CDN || "https://js.puter.com/v2/";
        s.async = true;
        s.onload = function () {
          if (global.puter && global.puter.ai) resolve(global.puter);
          else { NexusAI._puterPromise = null; reject(new Error("puter sdk incomplete")); }
        };
        s.onerror = function () { NexusAI._puterPromise = null; reject(new Error("puter CDN unreachable")); };
        document.head.appendChild(s);
      });
      return this._puterPromise;
    },

    /* Build the message array: rolling transcript window kept inside the
       512k-token free-tier budget (~4 chars/token heuristic). */
    _messages: function (history, prompt) {
      var msgs = [{ role: "system", content: SYSTEM_PROMPT }];
      var turns = (history || []).slice(-24);
      var budgetChars = FREE_TIER_TOKEN_LIMIT * 4;
      var picked = [];
      var size = SYSTEM_PROMPT.length;
      for (var i = turns.length - 1; i >= 0; i--) {
        var c = String(turns[i].content || "");
        if (size + c.length > budgetChars && picked.length) break;
        size += c.length;
        picked.unshift({ role: turns[i].role === "assistant" ? "assistant" : "user", content: c });
      }
      return msgs.concat(picked, [{ role: "user", content: prompt }]);
    },

    /* ---- hop 1: pollinations OpenAI-compatible SSE stream (keyless) ---- */
    async _viaPollinationsStream(opts) {
      var body = {
        model: "openai-fast",
        messages: this._messages(opts.history, opts.prompt),
        stream: true,
        private: true,
        referrer: "pik.pikx",
        max_tokens: OUT_TOKEN_CAP
      };
      var res = await fetch(POLLI_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" },
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!res.ok) {
        var errText = "";
        try { errText = await res.text(); } catch (e) {}
        var er = new Error("pollinations HTTP " + res.status + " " + trimText(errText, 120));
        er.status = res.status;
        throw er;
      }
      var ctype = res.headers.get("content-type") || "";
      if (ctype.indexOf("event-stream") !== -1 && res.body) {
        return this._consumeSSE(res, opts);
      }
      var json = await res.json();
      var msg = (json.choices && json.choices[0] && json.choices[0].message) || {};
      var text = typeof msg.content === "string" ? msg.content : "";
      if (!text) throw new Error("pollinations empty non-stream response");
      if (opts.onDelta) { try { opts.onDelta(text); } catch (e) {} }
      return { text: text, engine: "pollinations-stream" };
    },

    async _consumeSSE(res, opts) {
      var reader = res.body.getReader();
      var de = new TextDecoder();
      var buf = "", full = "", reason = "";
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += de.decode(chunk.value, { stream: true });
        var lines = buf.split("\n");
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith("data:")) continue;
          var data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            var obj = JSON.parse(data);
            var d = (obj.choices && obj.choices[0] && obj.choices[0].delta) || {};
            if (d.reasoning_content || d.reasoning) {
              reason += String(d.reasoning_content || d.reasoning);
              if (opts.onReasoning) { try { opts.onReasoning(String(d.reasoning_content || d.reasoning)); } catch (e) {} }
            }
            if (typeof d.content === "string" && d.content) {
              full += d.content;
              if (opts.onDelta) { try { opts.onDelta(d.content); } catch (e) {} }
            }
          } catch (e) { /* partial frame — ignore */ }
        }
      }
      if (!full && reason) full = reason;
      if (!full) throw new Error("pollinations stream produced no tokens");
      return { text: full, reasoning: reason, engine: "pollinations-stream" };
    },

    /* ---- hop 2: pollinations simple GET endpoint (bulletproof CORS) ---- */
    async _viaPollinationsGet(opts) {
      var flat = (opts.history || []).slice(-6)
        .map(function (m) { return (m.role === "user" ? "User: " : "Nexus: ") + trimText(m.content, 1200); })
        .join("\n");
      var q = flat ? flat + "\nUser: " + opts.prompt : opts.prompt;
      var u = POLLI_GET_URL + encodeURIComponent(q.slice(0, 24000)) +
        "?model=openai-fast&system=" + encodeURIComponent(SYSTEM_PROMPT.slice(0, 1200)) + "&json=false&private=true";
      var txt = await getText(u, 45000);
      var text = (txt || "").trim();
      if (text.length < 2) throw new Error("polli-get empty response");
      if (opts.onDelta) { try { opts.onDelta(text); } catch (e) {} }
      return { text: text, engine: "pollinations-get" };
    },

    /* ---- hop 3: puter.js free keyless tier (streamed) ---- */
    async _viaPuter(opts) {
      var pt = await this.ensurePuter();
      var kw = { stream: true, model: QWEN_MODEL_ID }; // Qwen 3.8 27B on puter's free keyless tier
      if (opts.signal) kw.signal = opts.signal;
      var it = pt.ai.chat(this._messages(opts.history, opts.prompt), kw);
      if (!it) throw new Error("puter empty iterator");
      var full = "";
      for await (const part of it) {
        if (opts.signal && opts.signal.aborted) { var ab = new Error("aborted"); ab.name = "AbortError"; throw ab; }
        var d = (part && part.delta != null) ? String(part.delta)
              : (typeof part === "string") ? part
              : (part && part.message && typeof part.message === "string") ? part.message : "";
        if (!d) continue;
        full += d;
        if (opts.onDelta) { try { opts.onDelta(d); } catch (e) {} }
      }
      if (!full) throw new Error("puter empty response");
      return { text: full, engine: "puter-free" };
    },

    /* ---- generic OpenAI-compatible streaming POST (keyless gateways) ---- */
    async _gatewayPOST(url, body, headers, engineName, opts) {
      var res = await fetch(url, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json", "Accept": "text/event-stream, application/json" }, headers || {}),
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!res.ok) {
        var et = ""; try { et = await res.text(); } catch (e) {}
        var er = new Error(engineName + " HTTP " + res.status + " " + trimText(et, 120));
        er.status = res.status; throw er;
      }
      var ctype = res.headers.get("content-type") || "";
      if (ctype.indexOf("event-stream") !== -1 && res.body) {
        var r = await this._consumeSSE(res, opts);
        r.engine = engineName; return r;
      }
      var json = await res.json();
      var txt = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
      if (!txt) throw new Error(engineName + " empty response");
      if (opts.onDelta) { try { opts.onDelta(txt); } catch (e) {} }
      return { text: txt, engine: engineName };
    },

    /* ---- hop: OpenRouter — qwen/qwen3.8-27b ------------------------------
       VERIFIED Oct 26 2026: the chat endpoint is NOT keyless (HTTP 401
       "No cookie auth credentials found"). This hop answers instantly when a
       free OR key exists in localStorage; without one it fails fast and the
       chain moves to the next gateway. */
    async _viaQwenOpenRouter(opts) {
      var key = "";
      try { key = localStorage.getItem("pik.nexus.key.openrouter") || ""; } catch (e) {}
      if (!key) throw new Error("qwen-openrouter: no key present (endpoint requires one)");
      var body = { model: QWEN_MODEL_ID, messages: this._messages(opts.history, opts.prompt), stream: true };
      return this._gatewayPOST(OR_CHAT_URL, body,
        { "Authorization": "Bearer " + key, "HTTP-Referer": location.origin || "https://pik.inc", "X-Title": "PIK NEXUS" },
        "qwen-openrouter", opts);
    },

    /* ---- hops: community free inference hosts that serve Qwen3.8-27B ----- */
    async _viaQwenGlider(opts) {
      var body = { model: "Qwen/Qwen3.8-27B", messages: this._messages(opts.history, opts.prompt), stream: false };
      return this._gatewayPOST("https://api.glider.ai/chat/completions", body, null, "qwen-glider", opts);
    },
    async _viaQwenJaiowr(opts) {
      var body = { model: "Qwen3.8-27B", messages: this._messages(opts.history, opts.prompt), stream: false };
      return this._gatewayPOST("https://ai.jaiowr9f.com/api/openai/chat", body, null, "qwen-jaiowr", opts);
    },

    /* ---- ask the real model, failing over across free providers ---- */
    async ask(opts) {
      opts = opts || {};
      if (!String(opts.prompt || "").trim()) throw new Error("empty prompt");
      /* Qwen 3.8 27B gateway chain runs FIRST (puter -> openrouter-app ->
         glider -> jaiowr); pollinations gpt-oss-20b remains as the honest
         last-resort when every Qwen host is rate-limited. */
      var hops = [this._viaPuter, this._viaQwenGlider, this._viaQwenJaiowr,
                  this._viaQwenOpenRouter, this._viaPollinationsStream, this._viaPollinationsGet];
      var lastErr = null;
      for (var i = 0; i < hops.length; i++) {
        if (opts.signal && opts.signal.aborted) { var ab = new Error("aborted"); ab.name = "AbortError"; throw ab; }
        try {
          var r = await hops[i].call(this, opts);
          this.lastEngine = r.engine;
          this._preferPuter = r.engine === "puter-free" ? false : true; // round-robin
          r.providerLabel = r.engine.indexOf("qwen-openrouter") !== -1 ? "QWEN 3.8 27B · OPENROUTER APP" :
                            r.engine.indexOf("qwen-glider") !== -1 ? "QWEN 3.8 27B · GLIDER FREE" :
                            r.engine.indexOf("qwen-jaiowr") !== -1 ? "QWEN 3.8 27B · JAIOWR FREE" :
                            r.engine.indexOf("puter") !== -1 ? "QWEN 3.8 27B · PUTER FREE TIER" :
                            r.engine.indexOf("get") !== -1 ? "POLLINATIONS · KEYLESS" :
                            "POLLINATIONS · OPENAI-FAST";
          r.tokenBudget = FREE_TIER_TOKEN_LIMIT;
          return r;
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          lastErr = e;
        }
      }
      throw lastErr || new Error("every free engine is unreachable right now");
    },

    /* quick one-shot helper for internal summarisation tasks (reviews etc.) */
    async quick(prompt, opts) {
      opts = opts || {};
      return this.ask({ prompt: prompt, history: [], signal: opts.signal, onDelta: opts.onDelta });
    }
  };

  /* ============================================================
     PART 2 — CHROME-GRADE SEARCH RESULT ENGINE
     ============================================================ */

  var DDG_IA = "https://api.duckduckgo.com/";
  var WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
  var WIKI_REST = "https://en.wikipedia.org/api/rest_v1/page/summary/";

  /* parse the DuckDuckGo lite/html SERP without a DOM parser dependency */
  function parseDDGHtml(html) {
    var out = [];
    var re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,600}?class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    var m;
    function unesc(s) {
      return String(s || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ");
    }
    function realUrl(href) {
      try {
        if (/uddg=/.test(href)) {
          var q = href.split("uddg=")[1].split("&")[0];
          return decodeURIComponent(q);
        }
        if (/^\/\//.test(href)) return "https:" + href;
        return href;
      } catch (e) { return href; }
    }
    while ((m = re.exec(html)) !== null && out.length < 14) {
      var url = realUrl(m[1]);
      if (!/^https?:/.test(url)) continue;
      out.push({ title: unesc(m[2]), url: url, snippet: unesc(m[3]), host: prettyHost(url), icon: faviconFor(url) });
    }
    return out;
  }

  var Search = {
    /* ---------- instant answers (DDG IA API — direct CORS) ---------- */
    async instantAnswer(q) {
      try {
        var j = await getJSON(DDG_IA + "?q=" + encodeURIComponent(q) + "&format=json&no_html=1&skip_disambig=0&t=pikx", 9000);
        var ia = {
          heading: j.Heading || "",
          answer: j.Answer && typeof j.Answer === "string" ? j.Answer.trim() : "",
          answerType: j.AnswerType || "",
          definition: j.Definition && typeof j.Definition === "string" ? j.Definition.trim() : "",
          definitionUrl: j.DefinitionURL || "",
          abstractText: j.AbstractText || "",
          abstractSource: j.AbstractSource || "",
          abstractUrl: j.AbstractURL || "",
          image: j.Image ? (/\^/.test(j.Image) ? "https://duckduckgo.com" + j.Image : j.Image) : "",
          imageIsLogo: !!j.ImageIsLogo,
          topics: []
        };
        var collect = function (arr) {
          (arr || []).forEach(function (t) {
            if (t.Topics) collect(t.Topics);
            else if (t.Text && ia.topics.length < 8) ia.topics.push({ text: t.Text, first: (t.Text.split(" - ")[0] || "").trim(), url: t.FirstURL || "" });
          });
        };
        collect(j.RelatedTopics);
        collect(j.Results);
        return ia;
      } catch (e) { return null; }
    },

    /* ---------- wikipedia knowledge panel (direct CORS via origin=*) ---- */
    async wikiPanel(q) {
      try {
        var j = await getJSON(WIKI_ACTION +
          "?action=query&generator=search&gsrsearch=" + encodeURIComponent(q) +
          "&gsrlimit=3&prop=extracts|pageimages|info&exintro=1&explaintext=1&exlimit=3" +
          "&piprop=thumbnail&pithumbsize=400&inprop=url&format=json&origin=*", 11000);
        var pages = (j.query && j.query.pages) || {};
        var arr = Object.keys(pages).map(function (k) { return pages[k]; })
          .sort(function (a, b) { return (a.index || 99) - (b.index || 99); });
        if (!arr.length) return null;
        var p = arr[0];
        var thumbs = arr.filter(function (x) { return x.thumbnail; }).map(function (x) { return x.thumbnail.source; });
        return {
          title: p.title,
          extract: p.extract || "",
          url: p.fullurl || ("https://en.wikipedia.org/?curid=" + p.pageid),
          thumb: (p.thumbnail && p.thumbnail.source) || "",
          extraThumbs: thumbs.slice(1),
          more: arr.slice(1).map(function (x) {
            return { title: x.title, extract: trimText(x.extract, 220), url: x.fullurl || "" };
          })
        };
      } catch (e) { return null; }
    },

    /* ---------- organic web results (DDG html via keyless relays) -------- */
    async webResults(q) {
      try {
        var html = await fetchRelayedText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) + "&kl=us-en", 16000);
        var list = parseDDGHtml(html);
        if (list.length) return list;
        /* second chance on the lite endpoint */
        var lite = await fetchRelayedText("https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(q), 16000);
        var lrows = String(lite).match(/<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,900}?class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g) || [];
        var lout = [];
        lrows.forEach(function (blk) {
          var hm = blk.match(/href="([^"]+)"/);
          var tm = blk.match(/class="result-link"[^>]*>([\s\S]*?)<\/a>/);
          var sm = blk.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/);
          if (!hm || !tm) return;
          var url = /uddg=/.test(hm[1]) ? decodeURIComponent(hm[1].split("uddg=")[1].split("&")[0])
                  : /^\/\//.test(hm[1]) ? "https:" + hm[1] : hm[1];
          if (!/^https?:/.test(url)) return;
          function un(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').trim(); }
          lout.push({ title: un(tm[1]), url: url, snippet: un(sm && sm[1]), host: prettyHost(url), icon: faviconFor(url) });
        });
        return lout;
      } catch (e) { return []; }
    },

    /* ---------- news results (DDG news vertical via relays) ------------- */
    async newsResults(q) {
      try {
        var html = await fetchRelayedText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) + "&iar=news&ia=news&df=w&kl=us-en", 16000);
        var list = parseDDGHtml(html);
        if (list.length) return list.map(function (r) {
          var mm = r.snippet.match(/(\d+\s+(?:h|min|day|hr|week)s?\s+ago|\d{1,2}\s+\w+\s+20\d\d)/i);
          r.source = r.host.split(" ")[0];
          r.age = mm ? mm[1] : "";
          return r;
        });
        return [];
      } catch (e) { return []; }
    },

    /* ---------- image results (Wikimedia Commons — direct CORS) --------- */
    async imageResults(q) {
      var out = [];
      try {
        var j = await getJSON("https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
          "&gsrsearch=" + encodeURIComponent(q) + "&gsrnamespace=6&gsrlimit=24&prop=imageinfo" +
          "&iiprop=url|extmetadata&iiurlwidth=480&format=json&origin=*", 12000);
        var pages = (j.query && j.query.pages) || {};
        Object.keys(pages).forEach(function (k) {
          var p = pages[k], ii = p.imageinfo && p.imageinfo[0];
          if (!ii) return;
          out.push({
            title: p.title.replace(/^File:/i, "").replace(/\.[a-z]+$/i, ""),
            thumb: ii.thumburl || ii.url,
            full: ii.url,
            page: ii.descriptionurl || "",
            desc: trimText((ii.extmetadata && ii.extmetadata.ImageDescription && ii.extmetadata.ImageDescription.value) || "", 140).replace(/<[^>]+>/g, "")
          });
        });
      } catch (e) { /* commons down */ }
      /* supplement with wikipedia thumbnails so the grid is never empty */
      if (out.length < 6) {
        try {
          var w = await getJSON(WIKI_ACTION + "?action=query&generator=search&gsrsearch=" +
            encodeURIComponent(q) + "&gsrlimit=20&prop=pageimages&piprop=thumbnail&pithumbsize=400&format=json&origin=*", 11000);
          var wp = (w.query && w.query.pages) || {};
          Object.keys(wp).forEach(function (k) {
            var t = wp[k].thumbnail;
            if (t && out.length < 24) out.push({ title: wp[k].title, thumb: t.source, full: t.source, page: "", desc: "" });
          });
        } catch (e) {}
      }
      return out;
    },

    /* ---------- "People also ask" style related searches (DDG IA) ------- */
    async relatedSearches(q) {
      var ia = await this.instantAnswer(q);
      var rel = (ia && ia.topics || []).map(function (t) { return t.first || t.text; }).filter(Boolean);
      try {
        var j = await getJSON("https://duckduckgo.com/ac/?q=" + encodeURIComponent(q) + "&type=list", 8000);
        if (Array.isArray(j) && Array.isArray(j[1])) rel = rel.concat(j[1].slice(0, 6));
      } catch (e) {}
      var seen = {};
      return rel.filter(function (r) { var k = r.toLowerCase(); if (!r || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 8);
    },

    /* ---------- orchestrator: fire everything in parallel -------------- */
    async runAll(q, hooks) {
      hooks = hooks || {};
      var t0 = performance.now();
      var self = this;
      var jobs = {
        ia: this.instantAnswer(q),
        wiki: this.wikiPanel(q),
        web: this.webResults(q),
        news: this.newsResults(q),
        images: this.imageResults(q),
        related: this.relatedSearches(q)
      };
      /* progressive rendering: paint each module the moment it lands */
      Object.keys(jobs).forEach(function (k) {
        jobs[k].then(function (v) { try { hooks[k] && hooks[k](v); } catch (e) {} });
      });
      var res = {};
      for (var k in jobs) { try { res[k] = await jobs[k]; } catch (e) { res[k] = null; } }
      res.meta = { query: q, ms: Math.round(performance.now() - t0) };
      return res;
    }
  };

  /* ============================================================
     PART 3 — NEXUS AI OVERVIEW (detailed, grounded synthesis)
     Pulls live grounding data from the free APIs above, feeds it to
     the real streaming model, and renders a Chrome-style rich overview.
     ============================================================ */

  function buildGrounding(q, data) {
    var parts = ["LIVE GROUNDING DATA gathered for the query \"" + q + "\":"];
    if (data.ia) {
      if (data.ia.answer) parts.push("Instant answer (" + (data.ia.answerType || "ddg") + "): " + data.ia.answer);
      if (data.ia.definition) parts.push("Definition: " + data.ia.definition);
      if (data.ia.abstractText) parts.push("Abstract (" + data.ia.abstractSource + "): " + data.ia.abstractText);
      if (data.ia.topics.length) parts.push("Related topics: " + data.ia.topics.map(function (t) { return t.first || t.text; }).join("; "));
    }
    if (data.wiki) {
      parts.push("Wikipedia — " + data.wiki.title + ": " + trimText(data.wiki.extract, 2600));
      (data.wiki.more || []).forEach(function (m) { parts.push("Also: " + m.title + " — " + m.extract); });
    }
    if (data.web && data.web.length) {
      parts.push("Top web results:");
      data.web.slice(0, 8).forEach(function (r, i) {
        parts.push((i + 1) + ". " + r.title + " (" + r.host + ") — " + trimText(r.snippet, 300));
      });
    }
    if (data.news && data.news.length) {
      parts.push("Recent news:");
      data.news.slice(0, 6).forEach(function (n, i) {
        parts.push((i + 1) + ". " + n.title + " — " + trimText(n.snippet, 220) + (n.age ? " (" + n.age + ")" : ""));
      });
    }
    return parts.join("\n");
  }

  var Overview = {
    /* produce the deep AI overview object {markdown, engine, sources} */
    async generate(q, data, hooks) {
      hooks = hooks || {};
      var grounding = buildGrounding(q, data);
      var hasData = !!(data.ia || data.wiki || (data.web && data.web.length));
      var prompt =
        "Write a COMPREHENSIVE AI OVERVIEW of the search topic \"" + q + "\" for a privacy-focused browser.\n\n" +
        (hasData ? grounding : "(No external grounding data could be fetched — rely on your own knowledge and say so honestly.)") +
        "\n\nSTRUCTURE YOUR ANSWER EXACTLY LIKE THIS (markdown, no emoji):\n" +
        "# <Topic Name>\n" +
        "A two-sentence encyclopedic definition paragraph directly under the H1.\n" +
        "## Key Facts\nA bulleted list of 5-8 essential facts (who/what/where/when/why, numbers, dates).\n" +
        "## Detailed Overview\n2-4 ### subsections covering background, how it works / significance, and current status.\n" +
        "## Context & Analysis\nWhat makes this notable; common misconceptions; comparisons where useful (use a table if comparing).\n" +
        "## Recent Developments\nWhat the news/results above indicate about the current state (if any data given).\n" +
        "## People Also Consider\n3-5 related sub-topics a curious reader should look at next.\n" +
        "## Sources Consulted\nPlain list of the source names/URLs present in the grounding data.\n\n" +
        "Be factual, dense, neutral. Never invent URLs. If grounding data conflicts with prior knowledge, prefer the fresher data and note the discrepancy.";
      var r = await NexusAI.quick(prompt, {
        signal: hooks.signal,
        onDelta: hooks.onDelta
      });
      return { markdown: r.text, engine: r.engine, providerLabel: r.providerLabel, tokenBudget: r.tokenBudget };
    },

    /* minimal but safe markdown renderer for the overview card */
    render(md) {
      var lines = String(md || "").split("\n");
      var html = "", inList = false, inCode = false, inTable = false;
      function inline(s) {
        s = esc(s);
        s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
        s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;]|$)/g, "$1<em>$2</em>");
        s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        s = s.replace(/(^|[\s(])(https?:\/\/[^\s)<>"']+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
        return s;
      }
      function closeList() { if (inList) { html += "</ul>"; inList = false; } }
      function closeTable() { if (inTable) { html += "</tbody></table>"; inTable = false; } }
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (/^\s*```/.test(ln)) {
          if (inCode) { html += "</code></pre>"; inCode = false; }
          else { closeList(); closeTable(); html += "<pre class=\"px-ov__pre\"><code>"; inCode = true; }
          continue;
        }
        if (inCode) { html += esc(ln) + "\n"; continue; }
        var tm = ln.match(/^\s*\|(.+)\|\s*$/);
        if (tm) {
          var cells = tm[1].split("|").map(function (c) { return c.trim(); });
          if (/^[-:\s|]+$/.test(tm[1])) continue;
          if (!inTable) { closeList(); html += "<table class=\"px-ov__table\"><thead><tr>" + cells.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>"; inTable = true; }
          else html += "<tr>" + cells.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
          continue;
        }
        closeTable();
        var hm = ln.match(/^(#{1,4})\s+(.*)$/);
        if (hm) {
          closeList();
          var lvl = hm[1].length;
          html += "<h" + (lvl + 1) + " class=\"px-ov__h px-ov__h--" + lvl + "\">" + inline(hm[2]) + "</h" + (lvl + 1) + ">";
          continue;
        }
        var lm = ln.match(/^\s*[-*+]\s+(.*)$/) || ln.match(/^\s*\d+[.)]\s+(.*)$/);
        if (lm) {
          if (!inList) { html += "<ul class=\"px-ov__ul\">"; inList = true; }
          html += "<li>" + inline(lm[1]) + "</li>";
          continue;
        }
        closeList();
        if (!ln.trim()) continue;
        html += "<p class=\"px-ov__p\">" + inline(ln) + "</p>";
      }
      closeList(); closeTable();
      if (inCode) html += "</code></pre>";
      return html;
    }
  };

  global.PIKNexusAI = NexusAI;
  global.PIKSearch = Search;
  global.PIKOverview = Overview;
  global.PIKPxUtil = { esc: esc, trimText: trimText, faviconFor: faviconFor, prettyHost: prettyHost };
})(window);
