/* ============================================================================
   PIK//NEXUS — router.js
   Chat transport with a full no-key fallback chain:
     1. OpenRouter (user key) while the rolling free-budget window has room
     2. any 429 / rate-limit / quota error from OpenRouter => permanent switch
        for this session ("free tier over") — we never hammer it again
     3. text.pollinations.ai  (keyless, free)          -> engine "pollinations"
     4. universal.pollinations.ai (keyless mirror)     -> engine "polli-alt"
     5. Cohere public preview model (no key required)  -> engine "cohere-free"
   Pollinations is streamed when possible; every engine that returns
   reasoning/thought tokens feeds the live THINKING panel.
   Every outbound payload is SHA-256 digested before send; digests are kept in
   a local audit ledger so you can verify exactly what left the machine.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  var Router = {
    /* usage ledger: timestamps of OR requests inside rolling window */
    _usage: [],
    engine: "openrouter",   // openrouter | pollinations | polli-alt | cohere-free
    onEngineChange: null,   // callback(engine, reason)
    _orBurned: false,       // set once OpenRouter reports quota exhausted

    async init() {
      try {
        var saved = await PIKCrypto.SecureStore.get(CFG.LS.USAGE);
        if (saved && Array.isArray(saved.t)) this._usage = saved.t;
        if (saved && saved.burned) this._orBurned = true;
      } catch (e) {}
      this._prune();
      // budget already spent in this window -> start on the keyless engine
      if (!PIKCrypto.peekSecret(CFG.LS.KEY_OR) || this.budgetLeft() <= 0 || this._orBurned) {
        this.engine = "pollinations";
      }
    },

    _prune() {
      var cutoff = Date.now() - CFG.FREE_BUDGET.windowMs;
      this._usage = this._usage.filter(function (t) { return t > cutoff; });
      // hourly window rolled over and no hard burn -> allow OpenRouter again
      if (this._orBurned && this._usage.length === 0 && !this._burnPermanent) this._orBurned = false;
    },

    async _record() {
      this._prune();
      this._usage.push(Date.now());
      try {
        await PIKCrypto.SecureStore.set(CFG.LS.USAGE, { t: this._usage, burned: this._orBurned });
      } catch (e) {}
    },

    budgetLeft() {
      this._prune();
      return Math.max(0, CFG.FREE_BUDGET.maxRequests - this._usage.length);
    },

    /* ---------- digest-before-send ---------- */
    async digest(payloadObj) {
      var canonical = JSON.stringify(payloadObj);
      var d = await PIKCrypto.sha256(canonical);
      return { digest: d, bytes: new Blob([canonical]).size };
    },

    /* ---------- public entry ---------- */
    /**
     * opts: { model, messages, thinking(low|medium|high|max), temperature,
     *         signal, onDelta(text,isReasoning), systemPrompt }
     * returns { text, reasoning, engine, model, digest, usedFallback }
     */
    async chat(opts) {
      var settings = await NexusSettings.get();
      var hasKey = !!PIKCrypto.peekSecret(CFG.LS.KEY_OR) || await NexusSettings.hasKey("openrouter");
      var wantOR = hasKey && !this._orBurned && this.budgetLeft() > 0;

      if (wantOR) {
        try {
          var r = await this._viaOpenRouter(opts, settings);
          await this._record();
          this._setEngine("openrouter", null);
          return r;
        } catch (e) {
          if (e && e.name === "AbortError") throw e; // user pressed stop — don't failover
          var quotaish = /429|rate.?limit|quota|insufficient|credits|free.*(limit|tier)|topped up/i.test(String(e && e.message));
          if (quotaish) {
            this._orBurned = true;
            // burn remaining budget locally so we stop hammering OR this hour
            while (this.budgetLeft() > 0) this._usage.push(Date.now());
            await this._record();
            this._setEngine("pollinations", "free-quota");
          } else {
            this._setEngine("pollinations", "error:" + (e && e.message));
          }
        }
      } else if (!hasKey) {
        this._setEngine("pollinations", "no-key");
      } else if (this._orBurned || this.budgetLeft() <= 0) {
        this._setEngine("pollinations", "budget-exhausted");
      }

      /* keyless chain: pollinations -> alt mirror -> cohere public preview */
      var attempts = [
        { fn: this._viaPollinations.bind(this, opts, settings, CFG.POLLINATIONS_CHAIN[0], "pollinations"), name: "pollinations" },
        { fn: this._viaPollinations.bind(this, opts, settings, CFG.POLLINATIONS_CHAIN[1] || CFG.POLLINATIONS_URL, "polli-alt"), name: "polli-alt" },
        { fn: this._viaCohereFree.bind(this, opts, settings), name: "cohere-free" }
      ];
      var lastErr = null;
      for (var i = 0; i < attempts.length; i++) {
        try {
          var res = await attempts[i].fn();
          this._setEngine(attempts[i].name, i > 0 ? "chain" : null);
          return res;
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          lastErr = e;
        }
      }
      throw lastErr || new Error("all free engines unavailable");
    },

    _setEngine(engine, reason) {
      if (this.engine !== engine || reason) {
        this.engine = engine;
        if (this.onEngineChange) { try { this.onEngineChange(engine, reason); } catch (e) {} }
      }
    },

    /* ---------- thinking ladder -> effort string ---------- */
    _effortFor(model, wanted) {
      var info = PIKModels.get(model);
      var order = ["minimal", "low", "medium", "high", "xhigh", "max"];
      var effort = CFG.THINKING_MAP[wanted] || "medium";
      if (info && info.efforts && info.efforts.length && info.efforts.indexOf(effort) === -1) {
        var idx = order.indexOf(effort);
        for (var i = idx; i >= 0; i--) {
          if (info.efforts.indexOf(order[i]) !== -1) { effort = order[i]; break; }
        }
        if (order.indexOf(effort) === -1) effort = info.efforts[0];
      }
      return effort;
    },

    /* ---------- OpenRouter ---------- */
    async _viaOpenRouter(opts, settings) {
      var model = opts.model || CFG.SUGGESTED_MODEL;
      var body = { model: model, messages: opts.messages, stream: true };
      var info = PIKModels.get(model);
      if (info && info.reasoning) {
        body.reasoning = { effort: this._effortFor(model, opts.thinking) };
        body.include_reasoning = true;
      }
      if (typeof opts.temperature === "number") body.temperature = opts.temperature;

      var meta = await this.digest(body);
      var res = await fetch(CFG.OR_CHAT_URL, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + PIKCrypto.peekSecret(CFG.LS.KEY_OR),
          "Content-Type": "application/json",
          "HTTP-Referer": location.origin || "https://pik.inc",
          "X-Title": "PIK NEXUS"
        },
        body: JSON.stringify(body),
        signal: opts.signal
      });

      if (!res.ok) {
        var errText = "";
        try { errText = await res.text(); } catch (e) {}
        var err = new Error("HTTP " + res.status + " " + errText.slice(0, 240));
        err.status = res.status;
        throw err;
      }
      return this._consumeSSE(res, opts, { engine: "openrouter", model: model, digest: meta.digest });
    },

    /* ---------- Pollinations (keyless) — streamed w/ non-stream fallback --- */
    async _viaPollinations(opts, settings, endpoint, engineName) {
      endpoint = endpoint || CFG.POLLINATIONS_URL;
      var sys = settings.systemPrompt ||
        "You are PIK NEXUS, an autonomous coding agent. Be precise, show reasoning when asked, and emit file edits as fenced code blocks with the path on the info string.";
      var messages = [{ role: "system", content: sys }].concat(opts.messages.map(function (m) {
        // flatten multimodal parts to text for keyless endpoints
        if (typeof m.content === "string") return m;
        var txt = (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
        return { role: m.role, content: txt };
      }));
      var model = settings.polliModel || CFG.POLLINATIONS_DEFAULT_MODEL;
      var body = {
        model: model, messages: messages, stream: true,
        private: true, referrer: "pik.nexus",
        reasoning_effort: CFG.THINKING_MAP[opts.thinking] || "medium"
      };
      if (typeof opts.temperature === "number") body.temperature = opts.temperature;
      var meta = await this.digest(body);

      var res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" },
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!res.ok) throw new Error(engineName + " HTTP " + res.status);

      var ctype = res.headers.get("content-type") || "";
      if (ctype.indexOf("event-stream") !== -1) {
        return this._consumeSSE(res, opts, { engine: engineName, model: model, digest: meta.digest, usedFallback: true });
      }
      var json = await res.json();
      var choice = (json.choices && json.choices[0]) || {};
      var msg = choice.message || {};
      var text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
      var reasoning = msg.reasoning || msg.reasoning_content || json.reasoning || "";
      if (text === "" && reasoning) text = reasoning; // some mirrors only fill reasoning
      if (text === "") throw new Error(engineName + " empty response");
      if (opts.onDelta) { try { opts.onDelta(text, false); } catch (e) {} }
      return {
        text: text, reasoning: reasoning,
        engine: engineName, model: json.model || model,
        digest: meta.digest, usedFallback: true
      };
    },

    /* ---------- Cohere public preview (no key needed from browser) -------- */
    async _viaCohereFree(opts, settings) {
      var sys = settings.systemPrompt || "You are PIK NEXUS, an autonomous coding agent.";
      var msgs = [{ role: "system", content: sys }]
        .concat(opts.messages.map(function (m) {
          var c = typeof m.content === "string" ? m.content
            : (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
          return { role: m.role === "assistant" ? "CHATBOT" : m.role === "user" ? "USER" : "SYSTEM", content: c };
        }));
      var body = { model: CFG.COHERE_PREVIEW_MODEL, messages: msgs, max_tokens: 4000 };
      var meta = await this.digest(body);
      var res = await fetch(CFG.COHERE_PREVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!res.ok) throw new Error("cohere-free HTTP " + res.status);
      var json = await res.json();
      var text = (json.message && json.message.content && json.message.content[0] && json.message.content[0].text) || "";
      if (!text) throw new Error("cohere-free empty response");
      if (opts.onDelta) { try { opts.onDelta(text, false); } catch (e) {} }
      return { text: text, reasoning: "", engine: "cohere-free", model: CFG.COHERE_PREVIEW_MODEL, digest: meta.digest, usedFallback: true };
    },

    /* ---------- shared SSE reader ---------- */
    async _consumeSSE(res, opts, base) {
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
            if (d.reasoning || d.reasoning_content) {
              var rc = d.reasoning || d.reasoning_content;
              reason += rc;
              if (opts.onDelta) opts.onDelta(rc, true);
            }
            if (d.content) {
              full += d.content;
              if (opts.onDelta) opts.onDelta(d.content, false);
            }
          } catch (e) { /* partial frame */ }
        }
      }
      if (!full && reason) full = reason; // mirrored engines sometimes only stream reasoning
      base.text = full; base.reasoning = reason;
      base.usedFallback = base.engine !== "openrouter";
      return base;
    }
  };

  global.PIKRouter = Router;
})(window);
