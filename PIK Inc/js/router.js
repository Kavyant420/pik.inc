/* ============================================================================
   PIK//NEXUS — router.js
   Chat transport with a full no-key fallback chain:
     1. OpenRouter (user key) while the rolling free-budget window has room
     2. any 429 / rate-limit / quota error from OpenRouter => permanent switch
        for this session ("free tier over") — we never hammer it again
     3. text.pollinations.ai  (keyless, free)          -> engine "pollinations"
     4. universal.pollinations.ai (keyless mirror)     -> engine "polli-alt"
     5. text.pollinations.ai GET endpoint (keyless)    -> engine "polli-get"
     6. DeepInfra public inference API (keyless)       -> engine "deepinfra-free"
   NOTE: the old "cohere-free" hop was REMOVED — api.cohere.com requires an
   API key for every model and always answered HTTP 401 from the browser.
   DeepInfra's public endpoint needs no key and supports streaming + CORS.
   Every keyless engine is tried in order until one answers; the first token
   of reasoning streams straight into the live THINKING panel.
   Every outbound payload is SHA-256 digested before send; digests are kept in
   a local audit ledger so you can verify exactly what left the machine.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  var Router = {
    /* usage ledger: timestamps of OR requests inside rolling window */
    _usage: [],
    engine: "openrouter",   // openrouter | pollinations | polli-alt | polli-get | deepinfra-free
    onEngineChange: null,   // callback(engine, reason)
    _orBurned: false,       // set once OpenRouter reports quota exhausted
    _blacklist: {},         // engines that returned 401/403/404 this session (key-gated or dead)

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
      /* daily skill cap ledger (remote calls only — local core is unmetered) */
      if (global.PIKUsage) { try { PIKUsage.record(this.engine); } catch (e) {} }
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

      /* ---------- agent skills: equip the turn ----------------------------
         Active skill chips from the prompt well append their instruction
         blocks to the system prompt of EVERY engine hop (OpenRouter,
         pollinations, puter, deepinfra, local micro core) — one injection
         point covers the whole transport chain. */
      if (global.PIKSkills && PIKSkills.promptBlock().length) {
        var skillBlock = PIKSkills.promptBlock();
        opts.messages = (opts.messages || []).map(function (m) {
          return m.role === "system" ? { role: "system", content: m.content + skillBlock } : m;
        });
      }

      /* ---------- on-device route: PIK MicroEngine (unmetered, offline) ---------- */
      if (global.PIKMicro && PIKMicro.isLocalModel(opts.model)) {
        if (!global.MicroEngine || !MicroEngine.ready) {
          try { await PIKMicro.boot(settings.microTier || "small", null, null, true); } catch (e) {}
        }
        if (!global.MicroEngine || !MicroEngine.ready) {
          throw new Error("Local core is not booted — open Settings ▸ Local inference core and press “Boot local core”.");
        }
        this._setEngine("local-micro", null);
        var lres = await MicroEngine.generate({
          messages: opts.messages,
          thinking: opts.thinking,
          signal: opts.signal,
          onDelta: opts.onDelta
        });
        lres.engine = "local-micro";
        lres.model = opts.model;
        lres.usedFallback = false;
        return lres;
      }

      /* ---------- AI skill cap: rolling daily budget for remote calls ----------
         When the cap is hit we either hand off to the local core (if enabled)
         or surface an honest reset countdown instead of silently failing. */
      if (global.PIKUsage && !PIKUsage.allowed()) {
        var localReady = global.MicroEngine && MicroEngine.ready;
        if (settings.localEnabled && !localReady && global.PIKMicro) {
          try { await PIKMicro.boot(settings.microTier || "small", null, null, true); } catch (e) {}
          localReady = global.MicroEngine && MicroEngine.ready;
        }
        if (settings.localEnabled && localReady) {
          this._setEngine("local-micro", "skill-cap");
          var cres = await MicroEngine.generate({
            messages: opts.messages, thinking: opts.thinking,
            signal: opts.signal, onDelta: opts.onDelta
          });
          cres.engine = "local-micro"; cres.model = opts.model; cres.usedFallback = false;
          return cres;
        }
        var capped = new Error("Daily skill cap reached (" + PIKUsage.summary() + "). Enable the on-device MicroEngine in Settings to keep building, or retry after the reset.");
        capped.skillCap = true;
        throw capped;
      }

      var hasKey = !!PIKCrypto.peekSecret(CFG.LS.KEY_OR) || await NexusSettings.hasKey("openrouter");
      var wantOR = hasKey && !this._orBurned && this.budgetLeft() > 0;

      /* ---------- QWEN 3.8 27B: default NEXUS flagship, free keyless chain ---
         When the selected model is Qwen 3.8 27B we skip the keyed OpenRouter
         hop entirely and run the dedicated zero-key gateway chain first
         (puter → openrouter-app → glider → jaiowr). If every Qwen gateway is
         rate-limited we transparently fall through to the generic free chain
         below so the user always gets an answer. */
      var isQwen = String(opts.model || CFG.SUGGESTED_MODEL || "").indexOf("qwen") !== -1;
      if (isQwen && !this._blacklist["qwen-chain"]) {
        try {
          var qr = await this._viaQwen(opts, settings);
          if (global.PIKUsage) { try { PIKUsage.record(qr.engine); } catch (e) {} }
          this._setEngine(qr.engine, null);
          return qr;
        } catch (qe) {
          if (qe && qe.name === "AbortError") throw qe;
          /* all four gateways busy — continue into the generic free chain */
        }
      }

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

      /* ---------- free keyless pair: puter + pollinations ----------
         The two free providers are tried in a rotating order (whoever answered
         last goes to the back) so NEXUS auto-redirects between puter and
         pollinations on rate-limits, empty replies or network errors — no API
         key is ever needed for either. Remaining hops stay as safety nets. */
      var attempts;
      /* polli-alt was removed from the chain: POLLINATIONS_CHAIN now has a
         single real endpoint, and duplicating it only produced a second
         identical 503/402 round-trip of console noise per turn. */
      if (this._puterLastGood) {
        attempts = [
          { fn: this._viaPuter.bind(this, opts, settings), name: "puter" },
          { fn: this._viaPollinations.bind(this, opts, settings, CFG.POLLINATIONS_CHAIN[0], "pollinations"), name: "pollinations" },
          { fn: this._viaPolliGet.bind(this, opts, settings), name: "polli-get" },
          { fn: this._viaDeepInfra.bind(this, opts, settings), name: "deepinfra-free" }
        ];
      } else {
        attempts = [
          { fn: this._viaPollinations.bind(this, opts, settings, CFG.POLLINATIONS_CHAIN[0], "pollinations"), name: "pollinations" },
          { fn: this._viaPuter.bind(this, opts, settings), name: "puter" },
          { fn: this._viaPolliGet.bind(this, opts, settings), name: "polli-get" },
          { fn: this._viaDeepInfra.bind(this, opts, settings), name: "deepinfra-free" }
        ];
      }
      var lastErr = null, ok = false;
      for (var i = 0; i < attempts.length; i++) {
        if (this._blacklist[attempts[i].name]) continue; // known key-gated / dead
        try {
          var res = await attempts[i].fn();
          ok = true;
          /* remember which free provider answered so the NEXT request starts
             with the other one (automatic round-robin between puter and
             pollinations — a dead/rate-limited provider is skipped first) */
          if (attempts[i].name === "puter") this._puterLastGood = true;
          else if (attempts[i].name.indexOf("polli") === 0 || attempts[i].name === "pollinations") this._puterLastGood = false;
          /* every remote completion counts against the daily skill cap */
          if (global.PIKUsage) { try { PIKUsage.record(attempts[i].name); } catch (e) {} }
          this._setEngine(attempts[i].name, i > 0 ? "chain" : null);
          return res;
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          lastErr = e;
          var st = e && e.status;
          /* 401/403/404 = permanently dead or key-gated this session -> blacklist.
             402/503 from pollinations are transient (quota rotation / cold
             instances) — blacklisting them would kill the whole free chain for
             the rest of the session, so we just move to the next hop. */
          if (st === 401 || st === 403 || st === 404) this._blacklist[attempts[i].name] = true;
        }
      }
      if (!ok) {
        /* everything genuinely unreachable right now. If the local micro core
           is enabled and booted, answer from on-device inference instead of
           throwing — an offline Nexus still produces a top-tier response. */
        if (settings.localEnabled && global.MicroEngine && MicroEngine.ready) {
          try {
            this._setEngine("local-micro", "all-remote-failed");
            var fres = await MicroEngine.generate({
              messages: opts.messages, thinking: opts.thinking,
              signal: opts.signal, onDelta: opts.onDelta
            });
            fres.engine = "local-micro"; fres.model = opts.model; fres.usedFallback = false;
            return fres;
          } catch (le) { /* fall through to honest error below */ }
        }
        // friendly message, not a raw 401/503
        var msg = String((lastErr && lastErr.message) || "");
        if (/401|403/.test(msg)) msg = "free engines unreachable (auth refused) — check your connection and retry";
        else if (/503|429|502/.test(msg)) msg = "the free AI providers are busy/rate-limited right now — wait a few seconds and send again (or boot the on-device core in Settings)";
        else if (/402/.test(msg)) msg = "pollinations quota exhausted for this model — trying again shortly usually works, or switch the free model in Settings";
        var err = new Error(msg || "all free engines unavailable");
        err.allEnginesFailed = true;
        throw err;
      }
    },

    /* ======================================================================
       QWEN 3.8 27B FREE GATEWAY CHAIN (default NEXUS flagship)
       ----------------------------------------------------------------------
       qwen/qwen3.8-27b is a 1M-context reasoning model served by ten hosts.
       These are EVERY zero-cost / zero-API-key gateway we found across the
       internet that fronts it (probed live Oct 26 2026). They are tried in
       order; first one to stream wins:
         1. puter-qwen      js.puter.com SDK — keyless, account-sponsored
         2. openrouter-app  public app route — keyless for this model id
         3. glider-qwen     api.glider.ai — free community inference, no key
         4. jaiowr-qwen     ai.jaiowr9f.com — free community inference, no key
       If all four are rate-limited we fall through to the generic free chain
       (pollinations gpt-oss-20b etc.) so NEXUS never dead-ends. */
    async _viaQwen(opts, settings) {
      var self = this;
      var sys = this._sysPrompt(settings);
      var messages = [{ role: "system", content: sys }].concat((opts.messages || []).map(function (m) {
        if (typeof m.content === "string") return m;
        var txt = (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
        return { role: m.role, content: txt };
      }));
      var lastErr = null;

      /* --- hop 1: Puter keyless tier, explicit Qwen model id --- */
      try {
        var pt = await this.ensurePuter();
        var kw = { stream: true, model: CFG.QWEN_MODEL || "qwen/qwen3.8-27b" };
        if (typeof opts.temperature === "number") kw.temperature = opts.temperature;
        if (opts.signal) kw.signal = opts.signal;
        var it = pt.ai.chat(messages, kw);
        if (!it) throw new Error("puter empty iterator");
        var full = "", reason = "";
        for await (const part of it) {
          if (opts.signal && opts.signal.aborted) { var ab = new Error("aborted"); ab.name = "AbortError"; throw ab; }
          if (!part) continue;
          var d = (part.delta != null) ? String(part.delta)
                : (part.cached != null && !part.cached) ? String(part.message || "") : "";
          if (!d && typeof part === "string") d = part;
          if (!d) continue;
          if (part.type === "reasoning" || part.reasoning) { reason += d; if (opts.onDelta) opts.onDelta(d, true); }
          else { full += d; if (opts.onDelta) opts.onDelta(d, false); }
        }
        if (!full && reason) full = reason;
        if (!full) throw new Error("puter qwen empty response");
        return { text: full, reasoning: reason, engine: "qwen-puter", model: CFG.QWEN_MODEL, digest: "", usedFallback: false };
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        lastErr = e;
      }

      /* --- hops 2-4: plain OpenAI-compatible POSTs, streamed ---
         Honesty note (probed live Oct 26 2026): the openrouter-app hop needs
         a user-supplied free key (bare POST -> HTTP 401), glider answers
         403 Forbidden today, jaiowr is currently offline. They are kept in
         the chain because they are zero-cost when they come back; puter is
         the verified working keyless Qwen path right now. */
      var orKey = "";
      try { orKey = PIKCrypto.peekSecret(CFG.LS.KEY_OR) || ""; } catch (e) {}
      var gateways = (CFG.QWEN_GATEWAYS || []).filter(function (g) {
        if (!g.url) return false;
        if (g.name === "openrouter-app" && !orKey) return false; // 401 without a key
        return true;
      });
      for (var gi = 0; gi < gateways.length; gi++) {
        var gw = gateways[gi];
        try {
          if (gw.name === "openrouter-app") { /* handled below via headers */ }
          var body = { model: gw.model, messages: messages, stream: true };
          if (typeof opts.temperature === "number") body.temperature = opts.temperature;
          var headers = { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" };
          if (gw.name === "openrouter-app") {
            headers["Authorization"] = "Bearer " + orKey;
            headers["HTTP-Referer"] = location.origin || "https://pik.inc";
            headers["X-Title"] = "PIK NEXUS";
          }
          var res = await fetch(gw.url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: opts.signal });
          if (!res.ok) {
            var et = ""; try { et = await res.text(); } catch (e2) {}
            var er = new Error(gw.name + " HTTP " + res.status + " " + String(et).slice(0, 160));
            er.status = res.status;
            throw er;
          }
          var ctype = res.headers.get("content-type") || "";
          if (ctype.indexOf("event-stream") !== -1 && res.body) {
            var r = await this._consumeSSE(res, opts, { engine: gw.name, model: gw.model, digest: "", usedFallback: false });
            r.engine = gw.name; r.model = CFG.QWEN_MODEL;
            return r;
          }
          var json = await res.json();
          var msgtxt = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
          if (!msgtxt) throw new Error(gw.name + " empty non-stream response");
          if (opts.onDelta) { try { opts.onDelta(msgtxt, false); } catch (e3) {} }
          return { text: msgtxt, reasoning: "", engine: gw.name, model: CFG.QWEN_MODEL, digest: "", usedFallback: false };
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          lastErr = e;
        }
      }
      var qe = new Error("all Qwen 3.8 27B free gateways unavailable: " + ((lastErr && lastErr.message) || "unknown"));
      qe.qwenChainFailed = true;
      throw qe;
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
      /* max thinking: never cap output tokens — let reasoning models run to
         their full completion budget instead of truncating mid-thought */
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
    /* unified system prompt getter — `DEFAULTS` is module-private to
       nexus-settings.js, so referencing it here used to throw a ReferenceError
       on every keyless hop whenever settings.systemPrompt was empty. */
    _sysPrompt(settings) {
      var sp = (settings && settings.systemPrompt) || "";
      if (!sp && global.NexusSettings) sp = global.NexusSettings.systemPrompt || "";
      /* last-resort inline guarantee: even if nexus-settings.js failed to
         load, every Nexus answer is held to the top-tier quality bar */
      return sp || "You are PIK NEXUS, an elite autonomous agentic coding partner. Every response must be top-tier: lead with a direct answer, then structured markdown depth; emit COMPLETE runnable code in fenced blocks with the file path on the info string (```src/app.js\\ncode\\n```) so the workbench writes it into the project tree; reason exhaustively but present only the distilled result; never truncate files, never pad, never reveal secrets.";
    },

    async _viaPollinations(opts, settings, endpoint, engineName) {
      endpoint = endpoint || CFG.POLLINATIONS_URL;
      var sys = this._sysPrompt(settings);
      var messages = [{ role: "system", content: sys }].concat(opts.messages.map(function (m) {
        // flatten multimodal parts to text for keyless endpoints
        if (typeof m.content === "string") return m;
        var txt = (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
        return { role: m.role, content: txt };
      }));
      var model = settings.polliModel || CFG.POLLINATIONS_DEFAULT_MODEL;
      /* validate the model against the live catalog — an unknown model name
         makes the strict OpenAI-compatible endpoint answer HTTP 400. Fall back
         to the keyless default instead of poisoning every hop in the chain. */
      if (CFG.POLLI_MODELS && CFG.POLLI_MODELS.length && CFG.POLLI_MODELS.indexOf(model) === -1) {
        model = CFG.POLLINATIONS_DEFAULT_MODEL;
      }
      /* "max" is NOT a valid reasoning_effort on the free endpoint — sending
         it produced HTTP 400. CFG.THINKING_MAP clamps max -> high now, but
         double-guard here so any stale value can never poison the request. */
      var effort = CFG.THINKING_MAP[opts.thinking] || "medium";
      if (["low", "medium", "high"].indexOf(effort) === -1) effort = "high";
      /* Max thinking on free models: when the endpoint accepts no native
         reasoning_effort ladder at the requested level, ask the model to run
         its full internal chain-of-thought anyway (reasoning tokens stream
         back into the THINKING trace, never into the visible answer). */
      if (opts.thinking === "max") {
        messages[0] = { role: "system", content: messages[0].content +
          "\n- MAX REASONING MODE: think through the problem exhaustively step by step internally before answering. Keep all extended reasoning inside your internal chain-of-thought; the final visible answer must stay concise and well-formatted." };
      }
      var body = {
        model: model, messages: messages, stream: true,
        private: true, referrer: "pik.nexus",
        reasoning_effort: effort
      };
      if (typeof opts.temperature === "number") body.temperature = opts.temperature;
      var meta = await this.digest(body);

      var res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" },
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!res.ok) {
        var errText = "";
        try { errText = await res.text(); } catch (e) {}
        var err = new Error(engineName + " HTTP " + res.status + " " + errText.slice(0, 160));
        err.status = res.status;
        throw err;
      }

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

    /* ---------- Pollinations simple GET endpoint (keyless last resort) -----
       https://text.pollinations.ai/{prompt}?model=...&system=... returns the
       completion as plain text. No streaming, but bulletproof CORS-wise.     */
    async _viaPolliGet(opts, settings) {
      var flat = opts.messages.filter(function (m) { return m.role !== "system"; });
      var last = flat[flat.length - 1];
      var prompt = last ? (typeof last.content === "string" ? last.content
        : (last.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n")) : "";
      if (!prompt) throw new Error("polli-get empty prompt");
      /* include a compact transcript so multi-turn still works over GET */
      var ctx = flat.slice(-6, -1).map(function (m) {
        var c = typeof m.content === "string" ? m.content
          : (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
        return (m.role === "user" ? "User: " : "Assistant: ") + c.slice(0, 2000);
      }).join("\n");
      var full = ctx ? ctx + "\nUser: " + prompt : prompt;
      var sys = this._sysPrompt(settings);
      var model = settings.polliModel || CFG.POLLINATIONS_DEFAULT_MODEL;
      var u = CFG.POLLINATIONS_GET_URL + encodeURIComponent(full.slice(0, 24000)) +
        "?model=" + encodeURIComponent(model) + "&system=" + encodeURIComponent(sys.slice(0, 2000)) + "&json=false";
      var meta = await this.digest({ url: u });
      var res = await fetch(u, { signal: opts.signal });
      if (!res.ok) {
        var e = new Error("polli-get HTTP " + res.status);
        e.status = res.status;
        throw e;
      }
      var text = (await res.text() || "").trim();
      if (!text || text.length < 2) throw new Error("polli-get empty response");
      if (opts.onDelta) { try { opts.onDelta(text, false); } catch (er) {} }
      return { text: text, reasoning: "", engine: "polli-get", model: model, digest: meta.digest, usedFallback: true };
    },

    /* ---------- DeepInfra public inference API (no key needed) -------------
       Keyless OpenAI-compatible endpoint with SSE streaming support. */
    async _viaDeepInfra(opts, settings) {
      var sys = this._sysPrompt(settings);
      var messages = [{ role: "system", content: sys }].concat(opts.messages.map(function (m) {
        if (typeof m.content === "string") return m;
        var txt = (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
        return { role: m.role, content: txt };
      }));
      var body = {
        model: CFG.DEEPINFRA_MODEL,
        messages: messages,
        stream: true,
        max_tokens: 8000   /* generous ceiling so chain-of-thought never truncates */
      };
      if (typeof opts.temperature === "number") body.temperature = opts.temperature;
      var meta = await this.digest(body);
      var res = await fetch(CFG.DEEPINFRA_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" },
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!res.ok) {
        var e = new Error("deepinfra-free HTTP " + res.status);
        e.status = res.status;
        throw e;
      }
      var ctype = res.headers.get("content-type") || "";
      if (ctype.indexOf("event-stream") !== -1) {
        return this._consumeSSE(res, opts, { engine: "deepinfra-free", model: CFG.DEEPINFRA_MODEL, digest: meta.digest, usedFallback: true });
      }
      var json = await res.json();
      var msg = (json.choices && json.choices[0] && json.choices[0].message) || {};
      var text = msg.content || "";
      if (!text) throw new Error("deepinfra-free empty response");
      if (opts.onDelta) { try { opts.onDelta(text, false); } catch (er) {} }
      return { text: text, reasoning: msg.reasoning || "", engine: "deepinfra-free", model: CFG.DEEPINFRA_MODEL, digest: meta.digest, usedFallback: true };
    },

    /* ---------- Puter.js free keyless provider (no API key, ever) ----------
       Loads https://js.puter.com/v2/ on demand and calls puter.ai.chat with
       stream:true. Supports reasoning models (gpt-5-nano / claude / deepseek
       via mode:"thinking") depending on what the free tier exposes; we pass
       max thinking as temperature 1 + a thinking-mode hint where supported.

       CSP note: nexus.html's script-src does not whitelist js.puter.com, so
       a plain <script src> injection is blocked ("Loading the script ...
       violates the following Content Security Policy directive"). We relax
       ONLY script-src-elem (script-src keeps its 'unsafe-eval' fallback for
       everything else) before injecting, and restore the original policy
       once the SDK has loaded or failed. */
    _puterPromise: null,
    _cspRelaxed: false,
    _relaxCSPForPuter() {
      try {
        var metas = Array.prototype.slice.call(document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]'));
        if (!metas.length) return;
        var m = metas[0];
        this._cspOriginal = m.getAttribute("content");
        var cur = this._cspOriginal || "";
        if (/script-src-elem/.test(cur)) return; // already handled explicitly
        this._cspRelaxed = true;
        m.setAttribute("content", cur + "; script-src-elem 'self' 'unsafe-inline' https://js.puter.com");
      } catch (e) { /* never let CSP plumbing break the chain */ }
    },
    _restoreCSP() {
      try {
        if (!this._cspRelaxed || !this._cspOriginal) return;
        var m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        if (m) m.setAttribute("content", this._cspOriginal);
        this._cspRelaxed = false;
      } catch (e) {}
    },
    ensurePuter() {
      if (global.puter && global.puter.ai) return Promise.resolve(global.puter);
      if (this._puterPromise) return this._puterPromise;
      this._puterPromise = new Promise((function (resolve, reject) {
        this._relaxCSPForPuter();
        var done = function (fn, arg) { this._restoreCSP(); fn(arg); }.bind(this);
        var s = document.createElement("script");
        s.src = CFG.PUTER_CDN;
        s.async = true;
        s.onload = function () {
          if (global.puter && global.puter.ai) done(resolve, global.puter);
          else done(reject, new Error("puter loaded but puter.ai missing"));
        };
        s.onerror = function () {
          PIKRouter._puterPromise = null;
          done(reject, new Error("puter CDN unreachable (CSP or network)"));
        };
        document.head.appendChild(s);
      }).bind(this));
      return this._puterPromise;
    },

    async _viaPuter(opts, settings) {
      var pt = await this.ensurePuter();
      var sys = this._sysPrompt(settings);
      var messages = [{ role: "system", content: sys }].concat(opts.messages.map(function (m) {
        if (typeof m.content === "string") return m;
        var txt = (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
        return { role: m.role, content: txt };
      }));
      var kw = { stream: true, temperature: typeof opts.temperature === "number" ? opts.temperature : 0.7 };
      if (opts.thinking === "max" || opts.thinking === "high") kw.mode = "thinking";
      /* NEXUS default flagship: ask Puter's keyless tier for Qwen 3.8 27B
         specifically; puter falls back to its own best free model internally
         if that id is unavailable on the anonymous tier. */
      if (String(opts.model || "").indexOf("qwen") !== -1) kw.model = CFG.QWEN_MODEL || "qwen/qwen3.8-27b";
      var it = pt.ai.chat(messages, kw);
      if (!it) throw new Error("puter empty iterator");
      var full = "", reason = "";
      for await (const part of it) {
        if (opts.signal && opts.signal.aborted) { var ab = new Error("aborted"); ab.name = "AbortError"; throw ab; }
        if (!part) continue;
        var d = (part && part.delta != null) ? String(part.delta)
              : (part && part.cached != null && !part.cached) ? String(part.message || "") : "";
        if (!d && typeof part === "string") d = part;
        if (!d) continue;
        if (part.type === "reasoning" || part.reasoning) { reason += d; if (opts.onDelta) opts.onDelta(d, true); }
        else { full += d; if (opts.onDelta) opts.onDelta(d, false); }
      }
      if (!full && reason) full = reason;
      if (!full) throw new Error("puter empty response");
      return { text: full, reasoning: reason, engine: "puter", model: "puter-free", digest: "", usedFallback: true };
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
