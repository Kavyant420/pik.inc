/* ============================================================================
   PIK//NEXUS — agent-tools.js
   ----------------------------------------------------------------------------
   The tool layer for the agentic loop. Previously chat.js had exactly one
   research hop hardcoded inline, guarded by `_surfGuard` with the comment
   "one research hop per user turn — no loops". That is not an agent: a real one
   searches, reads what came back, decides what it still needs, and searches
   again until it can answer.

   This module turns the inline block into a small, testable tool registry and
   lets chat.js drive it in a bounded loop.

   TOOLS
     WEBGET[https://example.com]   fetch a page and return its readable text
                                   (delegates to PIKSurfer, which already
                                   handles relay failover and HTML->text)
     WEBSEARCH[query terms]        run a real web search and return the top
                                   results as text. NEW: reuses PIKSearch, the
                                   same aggregator that powers the PIKX results
                                   tab, so the agent gets titles + URLs +
                                   snippets and can then WEBGET one of them.

   Both are text-in/text-out so they work on every provider in the router chain,
   including the keyless ones that do not expose OpenAI-style function calling.

   BUDGETS are enforced here rather than left to the model: a cap on calls per
   step, on steps per turn, and on characters injected back into history. Free
   tiers rate-limit aggressively and an unbounded loop will burn the quota and
   then fail mid-answer.
   ========================================================================= */
(function (global) {
  "use strict";

  var WEBGET_RE = /WEBGET\[\s*(https?:\/\/[^\s\]"'<>]+)\s*\]/gi;
  var WEBSEARCH_RE = /WEBSEARCH\[\s*([^\]\n]{2,200}?)\s*\]/gi;

  var AgentTools = {
    /* Hard ceilings. Deliberately conservative: each step is a full model round
       trip on a free tier. */
    MAX_STEPS: 4,             /* model turns per user message */
    MAX_CALLS_PER_STEP: 4,    /* tool calls honoured per step */
    MAX_SEARCH_RESULTS: 6,    /* results fed back per WEBSEARCH */
    MAX_CONTEXT_CHARS: 16000, /* total injected research text per step */

    /* ------------------------------------------------------- call parsing */

    /**
     * Extract tool calls from raw model output, preserving the order the model
     * emitted them so a WEBSEARCH followed by a WEBGET of one of its hits
     * replays in the intended sequence.
     * @returns {Array<{tool:string, arg:string, raw:string}>}
     */
    parseCalls: function (text) {
      var src = String(text || "");
      var found = [];
      var m;

      WEBGET_RE.lastIndex = 0;
      while ((m = WEBGET_RE.exec(src)) !== null) {
        found.push({ tool: "webget", arg: m[1], raw: m[0], at: m.index });
      }
      WEBSEARCH_RE.lastIndex = 0;
      while ((m = WEBSEARCH_RE.exec(src)) !== null) {
        found.push({ tool: "websearch", arg: m[1].trim(), raw: m[0], at: m.index });
      }

      found.sort(function (a, b) { return a.at - b.at; });

      /* de-dupe identical calls — models repeat themselves under free-tier
         sampling, and a repeat costs another quota hit for no new information */
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < found.length; i++) {
        var key = found[i].tool + "\u0000" + found[i].arg.toLowerCase();
        if (seen[key]) continue;
        seen[key] = true;
        out.push({ tool: found[i].tool, arg: found[i].arg, raw: found[i].raw });
        if (out.length >= this.MAX_CALLS_PER_STEP) break;
      }
      return out;
    },

    /** Remove tool-call tokens from user-visible prose. */
    scrubCalls: function (text) {
      var s = String(text || "");
      if (global.PIKSurfer && PIKSurfer.scrubCalls) s = PIKSurfer.scrubCalls(s);
      return s.replace(WEBSEARCH_RE, function (_, q) { return "[searching " + q.trim().slice(0, 40) + "]"; });
    },

    /* ------------------------------------------------- native tool calling
       text.pollinations.ai's gpt-oss-20b speaks OpenAI function calling: it
       streams delta.tool_calls fragments and ends the turn with
       finish_reason:"tool_calls". It does this even though we never send a
       `tools` array — it infers the contract from the system prompt. Capturing
       it is far more reliable than hoping a small model emits a literal
       WEBSEARCH[...] token in prose, so native calls take priority and text
       tokens remain the provider-agnostic fallback. */

    /* Argument fragments arrive as raw JSON (sometimes truncated mid-stream).
       Accept an object, an array, a bare string or broken JSON. */
    _parseArgs: function (raw, tool) {
      var s = String(raw == null ? "" : raw).trim();
      if (!s) return "";

      var parsed = null;
      try { parsed = JSON.parse(s); }
      catch (e) {
        /* Truncated mid-stream. Prefer the value side of a "key":"value" pair —
           matching the first quoted string instead returns the KEY, e.g.
           {"query":"onion routi  would yield "query". */
        var kv = s.match(/"\s*:\s*"([^"]*)"?/);
        if (kv && kv[1].trim()) return kv[1].trim();
        var quoted = s.match(/"([^"]+)"/g);
        if (quoted && quoted.length) {
          return quoted[quoted.length - 1].replace(/^"|"$/g, "").trim();
        }
        /* only strip a wrapper when BOTH ends are present, otherwise a lone
           trailing ] belonging to a WEBSEARCH[...] token gets eaten */
        var t = s.trim();
        if ((t.charAt(0) === "{" && t.charAt(t.length - 1) === "}") ||
            (t.charAt(0) === "[" && t.charAt(t.length - 1) === "]")) {
          t = t.slice(1, -1);
        }
        return t.replace(/^"|"$/g, "").trim();
      }

      if (typeof parsed === "string") return parsed.trim();
      if (Array.isArray(parsed)) {
        for (var i = 0; i < parsed.length; i++) {
          if (typeof parsed[i] === "string" && parsed[i].trim()) return parsed[i].trim();
        }
        return "";
      }
      if (parsed && typeof parsed === "object") {
        var preferred = tool === "webget"
          ? ["url", "href", "link", "uri", "target"]
          : ["query", "q", "search", "terms", "text", "question"];
        for (var p = 0; p < preferred.length; p++) {
          if (typeof parsed[preferred[p]] === "string" && parsed[preferred[p]].trim()) return parsed[preferred[p]].trim();
        }
        var keys = Object.keys(parsed);
        for (var k = 0; k < keys.length; k++) {
          if (typeof parsed[keys[k]] === "string" && parsed[keys[k]].trim()) return parsed[keys[k]].trim();
        }
      }
      return "";
    },

    /* Tool names a model might invent for the same two capabilities. */
    _TOOL_ALIASES: {
      websearch: "websearch", search: "websearch", web_search: "websearch",
      websearch_tool: "websearch", google: "websearch", ddg: "websearch",
      webget: "webget", fetch: "webget", web_fetch: "webget", get: "webget",
      read: "webget", browse: "webget", url: "webget"
    },

    /* Models frequently double up: they emit a NATIVE tool call whose argument
       is the TEXT token, e.g. function.name="WEBSEARCH" with
       arguments="WEBSEARCH[onion routing]". Observed live from gpt-oss-20b on
       2026-10-25. Left alone, that searches for the literal string
       "WEBSEARCH[onion routing]" and returns nothing. Unwrap one layer. */
    _unwrapNestedToken: function (arg) {
      var s = String(arg == null ? "" : arg).trim();
      var m = s.match(/^WEB(?:SEARCH|GET)\s*\[\s*([\s\S]*?)\s*\]$/i);
      if (m && m[1]) return m[1].trim();
      /* also handle the token appearing anywhere inside a longer argument */
      var m2 = s.match(/WEB(?:SEARCH|GET)\s*\[\s*([^\]]+?)\s*\]/i);
      if (m2 && m2[1]) return m2[1].trim();
      return s;
    },

    /**
     * Normalise native tool_calls into the same shape parseCalls returns.
     * Unknown tools and calls with no usable argument are dropped.
     */
    fromNative: function (toolCalls) {
      var out = [];
      var list = Array.isArray(toolCalls) ? toolCalls : [];
      for (var i = 0; i < list.length; i++) {
        var tc = list[i] || {};
        var rawName = String(tc.name || "").trim().toLowerCase();
        var tool = this._TOOL_ALIASES[rawName];
        if (!tool) continue;
        var rawArg = String(tc.args != null ? tc.args
          : (tc.arguments != null ? tc.arguments : ""));
        /* Unwrap a nested text token FIRST: _parseArgs trims wrapper brackets,
           which would otherwise eat the closing ] of WEBSEARCH[...] and leave
           the token unrecognisable. */
        var pre = this._unwrapNestedToken(rawArg);
        var arg = (pre !== rawArg.trim()) ? pre : this._parseArgs(rawArg, tool);
        arg = this._unwrapNestedToken(arg);
        if (!arg) continue;
        if (tool === "webget" && !/^https?:\/\//i.test(arg)) continue;  /* no javascript:/data: */
        out.push({ tool: tool, arg: arg, raw: "tool_calls:" + (tc.name || rawName), id: tc.id || "" });
      }
      return out;
    },

    /**
     * Every tool call in a router response, native first.
     * @param {{toolCalls?:Array, text?:string, rawText?:string}} res
     */
    callsFrom: function (res) {
      if (!res) return [];
      var nativeCalls = this.fromNative(res.toolCalls);
      var textCalls = this.parseCalls(res.rawText || res.text || "");
      var seen = Object.create(null);
      var out = [];
      nativeCalls.concat(textCalls).forEach(function (c) {
        var key = c.tool + "\u0000" + c.arg.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        out.push(c);
      });
      return out.slice(0, this.MAX_CALLS_PER_STEP);
    },

    /* ------------------------------------------------------------ executors */

    async _execWebget(url, signal) {
      if (!global.PIKSurfer) throw new Error("web surfer module unavailable");
      var page = await PIKSurfer.fetchPage(url, signal);
      return {
        ok: true,
        tool: "webget",
        arg: url,
        text: page.text,
        truncated: !!page.truncated,
        meta: "via " + page.relay + ", " + page.text.length + " chars"
      };
    },

    async _execWebsearch(query, signal) {
      if (!global.PIKSearch) throw new Error("search module unavailable (js/px-search.js not loaded)");
      var env = await PIKSearch.search(query, {
        signal: signal,
        n: this.MAX_SEARCH_RESULTS,
        fresh: true   /* an agent re-running a query wants current data */
      });

      var lines = [];
      if (env.answer && env.answer.text) {
        lines.push("INSTANT ANSWER (" + (env.answer.source || "DuckDuckGo") + "): " + env.answer.text);
        if (env.answer.url) lines.push("SOURCE: " + env.answer.url);
        lines.push("");
      }
      env.results.slice(0, this.MAX_SEARCH_RESULTS).forEach(function (r, i) {
        lines.push((i + 1) + ". " + r.title);
        lines.push("   URL: " + r.url);
        if (r.snippet) lines.push("   " + String(r.snippet).replace(/\s+/g, " ").slice(0, 300));
      });

      if (!lines.length) {
        return {
          ok: false,
          tool: "websearch",
          arg: query,
          error: env.error || "no results returned",
          text: "No results for \"" + query + "\"." + (env.error ? " Upstream: " + env.error : "") +
                (env.proxyAvailable ? "" : " Note: the search proxy was unreachable, so only knowledge-panel sources were consulted.")
        };
      }

      return {
        ok: true,
        tool: "websearch",
        arg: query,
        text: lines.join("\n"),
        truncated: false,
        meta: env.results.length + " results from " + (env.sources || []).join("+") +
              (env.partial ? " (partial — some sources failed)" : "")
      };
    },

    /**
     * Execute one call. Never throws for tool-level failures — a dead URL or an
     * empty search is information the model needs, not a reason to abort the
     * turn. Only AbortError propagates.
     */
    async execute(call, signal) {
      try {
        if (call.tool === "webget") return await this._execWebget(call.arg, signal);
        if (call.tool === "websearch") return await this._execWebsearch(call.arg, signal);
        return { ok: false, tool: call.tool, arg: call.arg, error: "unknown tool" };
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        return {
          ok: false, tool: call.tool, arg: call.arg,
          error: String((e && e.message) || e)
        };
      }
    },

    async executeAll(calls, signal, onStatus) {
      var out = [];
      for (var i = 0; i < calls.length; i++) {
        if (onStatus) onStatus({ index: i, total: calls.length, call: calls[i] });
        var r = await this.execute(calls[i], signal);
        out.push(r);
        try {
          document.dispatchEvent(new CustomEvent("pik:log", {
            detail: (r.ok ? "tool ok   " : "tool FAIL ") + r.tool + " " + String(r.arg).slice(0, 80) +
                    (r.ok ? " (" + (r.meta || (r.text || "").length + " chars)") : " — " + r.error)
          }));
        } catch (e) { /* logging must never break the loop */ }
      }
      if (onStatus) onStatus({ index: calls.length, total: calls.length, call: null });
      return out;
    },

    /* --------------------------------------------------------- context block */

    /**
     * Render tool results as the message injected back into history.
     * Truncates to MAX_CONTEXT_CHARS so a long page cannot crowd the user's own
     * conversation out of the model's context window.
     */
    toContext: function (results) {
      var budget = this.MAX_CONTEXT_CHARS;
      var blocks = [];

      for (var i = 0; i < (results || []).length; i++) {
        var r = results[i];
        var head = (r.tool === "websearch" ? "SEARCH" : "PAGE") + " " + r.arg;
        var body;
        if (!r.ok) {
          body = "STATUS: failed (" + r.error + ")";
        } else {
          var text = String(r.text || "");
          if (text.length > budget) { text = text.slice(0, budget); r.truncated = true; }
          body = (r.tool === "websearch" ? "RESULTS:\n" : "CONTENT:\n") + text +
                 (r.truncated ? "\n[…truncated to fit context budget]" : "");
          budget -= text.length;
        }
        blocks.push(head + "\n" + body);
        if (budget <= 0) break;
      }

      return "[tool results] Fetched live by NEXUS just now. Treat as ground truth, " +
             "prefer it over memory, and cite the URLs you relied on. If this is not " +
             "enough to answer, call another tool; if it is enough, answer now and do " +
             "not emit further tool calls.\n\n" + blocks.join("\n\n---\n\n");
    },

    /** Human-readable label for the "Surfing…" status strip. */
    statusLabel: function (st) {
      if (!st || !st.call) return "finished research";
      var c = st.call;
      var host = "";
      try { host = new URL(c.arg).host; } catch (e) { host = c.arg; }
      var verb = c.tool === "websearch" ? "searching" : "reading";
      return verb + " " + String(host).slice(0, 60) + " (" + (st.index + 1) + "/" + st.total + ")";
    }
  };

  global.PIKAgentTools = AgentTools;
})(window);
