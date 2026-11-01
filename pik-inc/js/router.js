/* ============================================================================
   PIK//NEXUS — router.js
   Chat transport:
     1. OpenRouter :free models when an OpenRouter key is configured
     2. BlockRun GPT-OSS 20B as the public no-login, no-key fallback (128K context)
     3. DeepInfra only when the visitor has configured a DeepInfra key
     4. PIK MicroEngine when enabled as an on-device fallback
   Community gateways are best-effort and may change access rules.
   Every outbound payload is SHA-256 digested before send; digests are kept in
   a local audit ledger so you can verify exactly what left the machine.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  var Router = {
    /* usage ledger: timestamps of OR requests inside rolling window */
    _usage: [],
    engine: "blockrun",   // blockrun | openrouter | deepinfra-free | local-micro
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
      // No OpenRouter key or an exhausted budget -> use anonymous BlockRun.
      if (!PIKCrypto.peekSecret(CFG.LS.KEY_OR) || this.budgetLeft() <= 0 || this._orBurned) {
        this.engine = "blockrun";
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
         BlockRun, community gateways, deepinfra, local micro core) — one injection
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
      var isQwen = String(opts.model || CFG.SUGGESTED_MODEL || "").indexOf("qwen") !== -1;
      var useBlockRunDefault = !!CFG.NO_KEY_MODEL &&
        (opts.model === CFG.NO_KEY_MODEL || (!hasKey && !isQwen));
      var wantOR = hasKey && !useBlockRunDefault && !this._orBurned && this.budgetLeft() > 0;

      /* ---------- optional Qwen 3.8 27B gateway route ----------------------
         When selected, Qwen skips OpenRouter and tries the configured public
         community gateways. Gateway availability is not promised. */
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
            this._setEngine("blockrun", "free-quota");
          } else {
            this._setEngine("blockrun", "error:" + (e && e.message));
          }
        }
      } else if (!hasKey) {
        this._setEngine("blockrun", "no-key");
      } else if (this._orBurned || this.budgetLeft() <= 0) {
        this._setEngine("blockrun", "budget-exhausted");
      }

      /* ---------- provider fallback chain ----------
         BlockRun is public and requires no account or API key. DeepInfra is
         skipped unless the visitor has configured its own key. */
      var attempts = [
        { fn: this._viaBlockRun.bind(this, opts, settings), name: "blockrun" },
        { fn: this._viaDeepInfra.bind(this, opts, settings), name: "deepinfra-free" }
      ];
      var lastErr = null, ok = false;
      for (var i = 0; i < attempts.length; i++) {
        if (this._blacklist[attempts[i].name]) continue; // known key-gated / dead
        if (attempts[i].name === "deepinfra-free" && !PIKCrypto.peekSecret(CFG.LS.KEY_DI)) continue;
        try {
          var res = await attempts[i].fn();
          ok = true;
          /* every remote completion counts against the daily skill cap */
          if (global.PIKUsage) { try { PIKUsage.record(attempts[i].name); } catch (e) {} }
          this._setEngine(attempts[i].name, i > 0 ? "chain" : null);
          return res;
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          lastErr = e;
          var st = e && e.status;
          /* 401/403/404 = permanently unavailable or key-gated this session.
             Other provider errors remain retryable on the next user turn. */
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
        if (/401|403/.test(msg)) msg = "AI provider refused the request — check the selected model and retry";
        else if (/503|429|502/.test(msg)) msg = "AI provider is busy or rate-limited — wait a moment and retry";
        else if (/402/.test(msg)) msg = "provider usage allowance is exhausted or the request needs credits — check the provider's usage page or choose another route";
        var err = new Error(msg || "all free engines unavailable");
        err.allEnginesFailed = true;
        throw err;
      }
    },

    /* ======================================================================
       OPTIONAL QWEN 3.8 27B GATEWAY ROUTE
       ----------------------------------------------------------------------
       Community gateways are best-effort and may be offline or change
       access rules. No availability or zero-cost guarantee. */
    async _viaQwen(opts, settings) {
      var self = this;
      var sys = this._sysPrompt(settings);
      var messages = [{ role: "system", content: sys }].concat((opts.messages || []).map(function (m) {
        if (typeof m.content === "string") return m;
        var txt = (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
        return { role: m.role, content: txt };
      }));
      var lastErr = null;

      /* --- public OpenAI-compatible community gateways, streamed ---
         These gateways can be unavailable or change access rules. OpenRouter
         app routing is used only when its key exists. */
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

    /* ---------- Legacy legacy text provider helper (authorized key may be required) - */
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

    /* ---------- BlockRun anonymous GPT-OSS 20B endpoint ------------------
       Its published quick-start requires no account, login, or API key.
       The hosted GPT-OSS 20B model advertises a 128K context window. */
    async _viaBlockRun(opts, settings) {
      var messages = [{ role: "system", content: this._sysPrompt(settings) }].concat((opts.messages || []).map(function (m) {
        if (typeof m.content === "string") return m;
        var txt = (m.content || []).filter(function (p) { return p.type === "text"; }).map(function (p) { return p.text; }).join("\n");
        return { role: m.role, content: txt };
      }));
      var body = {
        model: CFG.BLOCKRUN_MODEL || "nvidia/gpt-oss-20b",
        messages: messages,
        stream: true,
        max_tokens: CFG.BLOCKRUN_MAX_OUTPUT_TOKENS || 8192
      };
      if (typeof opts.temperature === "number") body.temperature = opts.temperature;
      var meta = await this.digest(body);
      var res = await fetch(CFG.BLOCKRUN_CHAT_URL || "https://blockrun.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" },
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!res.ok) {
        var errText = "";
        try { errText = await res.text(); } catch (e) {}
        var err = new Error("BlockRun HTTP " + res.status + " " + errText.slice(0, 200));
        err.status = res.status;
        throw err;
      }
      var ctype = res.headers.get("content-type") || "";
      if (ctype.indexOf("event-stream") !== -1 && res.body) {
        return this._consumeSSE(res, opts, {
          engine: "blockrun", model: body.model, digest: meta.digest, usedFallback: true
        });
      }
      var json = await res.json();
      var choice = (json.choices && json.choices[0]) || {};
      var msg = choice.message || {};
      var text = typeof msg.content === "string" ? msg.content : "";
      var toolCalls = (msg.tool_calls || []).map(function (tc) {
        var fn = tc.function || {};
        var args = fn.arguments == null ? "" : fn.arguments;
        return { id: tc.id || "", name: fn.name || "", args: typeof args === "string" ? args : JSON.stringify(args) };
      });
      if (!text && !toolCalls.length) throw new Error("BlockRun returned an empty response.");
      if (text && opts.onDelta) { try { opts.onDelta(text, false); } catch (e) {} }
      return {
        text: text, reasoning: msg.reasoning || msg.reasoning_content || "",
        toolCalls: toolCalls, finishReason: choice.finish_reason || (toolCalls.length ? "tool_calls" : "stop"),
        engine: "blockrun", model: json.model || body.model, digest: meta.digest, usedFallback: true
      };
    },

    /* ---------- DeepInfra inference API (REQUIRES a key) -------------------
       OpenAI-compatible endpoint with SSE streaming support.

       CORRECTED: this is not a keyless hop. An unauthenticated POST answers
       HTTP 401 "missing API key", so the old code guaranteed a failed request
       at the tail of every fallback chain. The caller now skips this engine
       entirely unless the visitor stored a key in Settings (LS.KEY_DI); when
       one is present it is sent as a Bearer token. */
    async _viaDeepInfra(opts, settings) {
      var diKey = "";
      try { diKey = PIKCrypto.peekSecret(CFG.LS.KEY_DI) || ""; } catch (e) {}
      if (!diKey) {
        var eSkip = new Error("deepinfra skipped — no API key configured");
        eSkip.status = 401;
        throw eSkip;
      }
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
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream, application/json",
          "Authorization": "Bearer " + diKey
        },
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

    /* ---------- shared SSE reader ---------- */
    async _consumeSSE(res, opts, base) {
      var reader = res.body.getReader();
      var de = new TextDecoder();
      var buf = "", full = "", reason = "";
      /* Native OpenAI function calling arrives as streamed fragments:
           delta.tool_calls[0].function.name      = "WEBSEARCH"     (first frame)
           delta.tool_calls[0].function.arguments = "on"  "ion"  " routing"   (later frames)
         and the turn ends with finish_reason:"tool_calls".
         This used to be dropped on the floor entirely — the accumulator only
         read d.reasoning and d.content — so a model that answered by calling a
         tool produced an empty string, and the `if (!full && reason)` fallback
         below then displayed the model's PRIVATE reasoning as if it were the
         answer. That is why NEXUS replied with things like "Need to search."
         instead of actually searching. Verified against
         the OpenAI-compatible streaming endpoint. */
      var toolCalls = {};   /* index -> {id, name, args} */
      var finishReason = "";

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
          var obj = null;
          try { obj = JSON.parse(data); } catch (e) { continue; }   /* partial frame */
          if (!obj) continue;

          /* Upstream error frames must throw so the fallback chain can retry another provider. */
          if (obj.error) {
            var em = obj.error;
            var eUp = new Error((base.engine || "stream") + " upstream error: " +
              (em.message || JSON.stringify(em)) + (em.code ? " [" + em.code + "]" : ""));
            eUp.status = em.code === "FREE_LIMIT" ? 429 : 502;
            throw eUp;
          }

          try {
            var choice = (obj.choices && obj.choices[0]) || {};
            var d = choice.delta || {};
            if (choice.finish_reason) finishReason = choice.finish_reason;

            if (d.reasoning || d.reasoning_content) {
              var rc = d.reasoning || d.reasoning_content;
              reason += rc;
              if (opts.onDelta) opts.onDelta(rc, true);
            }
            if (d.content) {
              full += d.content;
              if (opts.onDelta) opts.onDelta(d.content, false);
            }
            if (Array.isArray(d.tool_calls)) {
              for (var t = 0; t < d.tool_calls.length; t++) {
                var tc = d.tool_calls[t];
                var idx = (typeof tc.index === "number") ? tc.index : t;
                if (!toolCalls[idx]) toolCalls[idx] = { id: "", name: "", args: "" };
                if (tc.id) toolCalls[idx].id = tc.id;
                var fn = tc.function || {};
                if (fn.name) toolCalls[idx].name += fn.name;
                /* arguments stream as raw JSON fragments, not whole objects */
                if (fn.arguments) toolCalls[idx].args += fn.arguments;
              }
            }
          } catch (eFrame) { /* malformed delta — skip this frame only */ }
        }
      }

      var calls = Object.keys(toolCalls)
        .sort(function (a, b) { return a - b; })
        .map(function (k) { return toolCalls[k]; })
        .filter(function (c) { return c.name || c.args; });

      /* Only substitute reasoning when there is genuinely nothing else — never
         when the model answered with a tool call, and never in preference to
         real content. Showing chain-of-thought as the answer is a leak: the UI
         has a dedicated THINKING panel for it. */
      if (!full && !calls.length && reason) full = reason;

      base.text = full;
      base.reasoning = reason;
      base.toolCalls = calls;
      base.finishReason = finishReason;
      base.usedFallback = base.engine !== "openrouter";
      return base;
    }
  };

  global.PIKRouter = Router;
})(window);
