/* ============================================================================
   PIK//NEXUS — router.js
   Chat transport with automatic failover:
     1. OpenRouter (user key) while the rolling free-budget window has room
     2. any 429 / rate-limit / quota error from OpenRouter => immediate switch
     3. text.pollinations.ai (keyless) picks its best free reasoning model and
        applies the user's customizable system prompt from Settings
   Every outbound payload is SHA-256 digested before send; digests are kept in
   a local audit ledger so you can verify exactly what left the machine.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  var Router = {
    /* usage ledger: timestamps of OR requests inside rolling window */
    _usage: [],
    engine: "openrouter",   // openrouter | pollinations
    onEngineChange: null,   // callback(engine, reason)

    async init() {
      try {
        var saved = await PIKCrypto.SecureStore.get(CFG.LS.USAGE);
        if (saved && Array.isArray(saved.t)) this._usage = saved.t;
      } catch (e) {}
      this._prune();
    },

    _prune() {
      var cutoff = Date.now() - CFG.FREE_BUDGET.windowMs;
      this._usage = this._usage.filter(function (t) { return t > cutoff; });
    },

    async _record() {
      this._prune();
      this._usage.push(Date.now());
      try { await PIKCrypto.SecureStore.set(CFG.LS.USAGE, { t: this._usage }); } catch (e) {}
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
      var wantOR = !!PIKCrypto.peekSecret(CFG.LS.KEY_OR) && this.budgetLeft() > 0;

      if (wantOR) {
        try {
          var r = await this._viaOpenRouter(opts, settings);
          await this._record();
          this._setEngine("openrouter", null);
          return r;
        } catch (e) {
          var quotaish = /429|rate.?limit|quota|insufficient|credits|free.*(limit|tier)|topped up/i.test(String(e && e.message));
          if (quotaish) {
            this._setEngine("pollinations", "free-quota");
            // burn remaining budget locally so we stop hammering OR this hour
            while (this.budgetLeft() > 0) this._usage.push(Date.now());
          } else {
            // transient error: one retry through pollinations instead of failing hard
            this._setEngine("pollinations", "error:" + (e && e.message));
          }
        }
      } else if (!PIKCrypto.peekSecret(CFG.LS.KEY_OR)) {
        this._setEngine("pollinations", "no-key");
      } else {
        this._setEngine("pollinations", "budget-exhausted");
      }

      return this._viaPollinations(opts, settings);
    },

    _setEngine(engine, reason) {
      if (this.engine !== engine || reason) {
        this.engine = engine;
        if (this.onEngineChange) { try { this.onEngineChange(engine, reason); } catch (e) {} }
      }
    },

    /* ---------- OpenRouter ---------- */
    async _viaOpenRouter(opts, settings) {
      var model = opts.model || CFG.SUGGESTED_MODEL;
      var body = {
        model: model,
        messages: opts.messages,
        stream: true
      };
      // thinking ladder -> OpenRouter reasoning effort
      var info = PIKModels.get(model);
      var effort = CFG.THINKING_MAP[opts.thinking] || "medium";
      if (info && info.reasoning) {
        body.reasoning = { effort: effort };
        body.include_reasoning = true;
        if (info.efforts && info.efforts.length && info.efforts.indexOf(effort) === -1) {
          // clamp to nearest supported effort
          var order = ["minimal", "low", "medium", "high", "xhigh", "max"];
          var idx = order.indexOf(effort);
          for (var i = idx; i >= 0; i--) {
            if (info.efforts.indexOf(order[i]) !== -1) { body.reasoning.effort = order[i]; break; }
          }
        }
      }
      if (typeof opts.temperature === "number") body.temperature = opts.temperature;
      if (settings.orAppUrl) body.session_id = settings.orAppUrl; // optional attribution

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

    /* ---------- Pollinations fallback ---------- */
    async _viaPollinations(opts, settings) {
      var sys = settings.systemPrompt ||
        "You are PIK NEXUS, an autonomous coding agent. Be precise, show reasoning when asked, and emit file edits as fenced code blocks with language tags.";
      var messages = [{ role: "system", content: sys }].concat(opts.messages);
      var body = {
        model: settings.polliModel || CFG.POLLINATIONS_DEFAULT_MODEL,
        messages: messages,
        stream: false,
        private: true,
        referrer: "pik.nexus"
      };
      var meta = await this.digest(body);
      var res = await fetch(CFG.POLLINATIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!res.ok) throw new Error("pollinations HTTP " + res.status);
      var json = await res.json();
      var choice = (json.choices && json.choices[0]) || {};
      var msg = choice.message || {};
      var text = msg.content || "";
      var reasoning = msg.reasoning || msg.reasoning_content || "";
      if (opts.onDelta) { try { opts.onDelta(text, false); } catch (e) {} }
      return {
        text: text, reasoning: reasoning,
        engine: "pollinations", model: json.model || body.model,
        digest: meta.digest, usedFallback: true
      };
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
      base.text = full; base.reasoning = reason;
      return base;
    }
  };

  global.PIKRouter = Router;
})(window);
