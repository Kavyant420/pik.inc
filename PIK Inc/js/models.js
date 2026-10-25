/* ============================================================================
   PIK//NEXUS — models.js
   Live catalog from OpenRouter, filtered to :free variants and ordered by
   context length (high -> low), exactly matching the requested view:
   https://openrouter.ai/models?variant=free&order=context-high-to-low
   The catalog endpoint is public; no API key is needed to list models.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  var Models = {
    all: [],          // every free model, sorted ctx desc
    byId: {},         // id -> record
    status: "idle",   // idle | loading | ready | error
    listeners: [],

    /* ---------- fetch + normalize ---------- */
    async load() {
      if (this.status === "loading") return this.all;
      this.status = "loading";
      this._emit();
      try {
        var res = await fetch(CFG.OR_MODELS_URL, { headers: { "Accept": "application/json" } });
        if (!res.ok) throw new Error("catalog HTTP " + res.status);
        var json = await res.json();
        var free = (json.data || [])
          .filter(function (m) { return m.id && m.id.indexOf(":free") !== -1; })
          .map(function (m) { return Models._normalize(m); })
          .sort(function (a, b) { return b.ctx - a.ctx; });
        this.all = free;
        /* PIN THE DEFAULT: Qwen 3.8 27B (qwen/qwen3.8-27b) is NEXUS's default
           flagship and must always be selectable, even when the live :free
           catalog filter drops it. Synthesize its record from the verified
           endpoint probe (1M ctx, reasoning xhigh/medium/low/none) and keep
           it first in the list so suggest() never misses. */
        var qid = CFG.QWEN_MODEL || "qwen/qwen3.8-27b";
        var hasQ = free.some(function (m) { return m.id === qid; });
        if (!hasQ) {
          free.unshift({
            id: qid, name: "Qwen: Qwen3.8 27B", provider: "qwen",
            ctx: CFG.QWEN_CTX || 1000000, maxOut: 262144,
            modality: "text->text", vision: false, video: false, audio: false,
            reasoning: true, efforts: ["xhigh", "medium", "low", "none"],
            defaultEffort: "xhigh", mandatoryReasoning: false, tools: true,
            desc: "NEXUS default flagship. Runs FREE with no API key through the keyless gateway chain: Puter.js -> OpenRouter app route -> Glider -> Jaiowr.",
            logo: Models.logoUrl("qwen"),
            suggested: true
          });
        }
        this.byId = {};
        var _s = this;
        free.forEach(function (m) { _s.byId[m.id] = m; });
        this.status = "ready";
      } catch (e) {
        console.warn("[PIK models] live catalog failed, using offline snapshot:", e.message);
        this.all = this._offline().slice();
        this.byId = {};
        var self = this;
        this.all.forEach(function (m) { self.byId[m.id] = m; });
        this.status = "error";
      }
      this._emit();
      return this.all;
    },

    _normalize(m) {
      var provider = (m.id.split("/")[1] ? m.id.split("/")[0] : "unknown");
      var r = m.reasoning || {};
      var arch = m.architecture || {};
      var tp = m.top_provider || {};
      var supported = m.supported_parameters || [];
      return {
        id: m.id,
        name: m.name || m.id,
        provider: provider,
        ctx: m.context_length || 0,
        maxOut: tp.max_completion_tokens || 0,
        modality: arch.modality || "text->text",
        vision: (arch.input_modalities || []).indexOf("image") !== -1,
        video: (arch.input_modalities || []).indexOf("video") !== -1,
        audio: (arch.input_modalities || []).indexOf("audio") !== -1,
        reasoning: !!r.supported_efforts || supported.indexOf("reasoning") !== -1,
        efforts: r.supported_efforts || [],
        defaultEffort: r.default_effort || null,
        mandatoryReasoning: !!r.mandatory,
        tools: supported.indexOf("tools") !== -1,
        desc: (m.description || "").replace(/<[^>]+>/g, ""),
        logo: Models.logoUrl(provider),
        suggested: m.id === CFG.SUGGESTED_MODEL
      };
    },

    /* ---------- logos via CDN (no emojis, no bundled binaries) ---------- */
    logoUrl(provider) {
      var slug = CFG.PROVIDER_ICONS[provider];
      if (slug) return CFG.LOGO_SI + slug + ".svg";
      return null;
    },
    faviconUrl(provider) {
      var dom = CFG.PROVIDER_DOMAIN[provider];
      return dom ? CFG.LOGO_FAVICON + encodeURIComponent(dom) + "&sz=64" : null;
    },
    /* shields.io gradient badge for a provider — used on hero chips */
    badgeUrl(label, colorA, colorB) {
      return CFG.LOGO_SHIELDS +
        encodeURIComponent(label) + "-" + encodeURIComponent("FREE") +
        "-" + colorA + "%7C" + colorB + "?style=for-the-badge&labelColor=222222&cacheSeconds=3600";
    },

    /* ---------- helpers ---------- */
    get(id) { return this.byId[id] || null; },

    /* CDN logo for ANY engine name (puter, pollinations, deepinfra-free…) —
       used by chat.js so every avatar is an icon from the CDN, never emoji. */
    logoFor(engineOrProvider) {
      var p = String(engineOrProvider || "").toLowerCase();
      if (p === "polli-alt" || p === "polli-get") p = "pollinations";
      if (p === "deepinfra-free") p = "deepseek";
      if (p === "openrouter") return CFG.LOGO_SI + "openrouter.svg";
      var slug = CFG.PROVIDER_ICONS[p];
      if (slug) return CFG.LOGO_SI + slug + ".svg";
      return null;
    },

    suggest() {
      /* Qwen 3.8 27B is the hard default; only fall back if it vanished */
      return this.byId[CFG.QWEN_MODEL] || this.byId[CFG.SUGGESTED_MODEL] || this.all[0] || null;
    },

    search(q) {
      q = (q || "").toLowerCase();
      if (!q) return this.all;
      return this.all.filter(function (m) {
        return m.id.toLowerCase().indexOf(q) !== -1 ||
               m.name.toLowerCase().indexOf(q) !== -1 ||
               m.provider.toLowerCase().indexOf(q) !== -1;
      });
    },

    onChange(fn) { this.listeners.push(fn); },
    _emit() {
      var s = this;
      this.listeners.forEach(function (fn) { try { fn(s.all, s.status); } catch (e) {} });
    },

    /* ---------- offline snapshot (live data captured Oct 2026, ctx desc) ---------- */
    _offline() {
      var raw = [
        ["qwen/qwen3.8-27b", "Qwen: Qwen3.8 27B", 1000000, "text->text", ["xhigh", "medium", "low", "none"]],
        ["thinkingmachines/inkling:free","Thinking Machines: Inkling (free)",1048576,"text+image+audio->text",["max","xhigh","high","medium","low","minimal"]],
        ["thinkingmachines/inkling-small:free","Thinking Machines: Inkling Small (free)",1048576,"text+image+audio->text",["max","high","medium","low"]],
        ["minimax/minimax-m3.1-flash:free","MiniMax: MiniMax M3.1 Flash (free)",1000000,"text+image+video->text",["max","xhigh","high","medium","low"]],
        ["nvidia/nemotron-3.5-super-vl:free","NVIDIA: Nemotron 3.5 Super VL (free)",1000000,"text+image+video->text",[]],
        ["nvidia/nemotron-3.5-lightning:free","NVIDIA: Nemotron 3.5 Lightning (free)",1000000,"text->text",[]],
        ["nvidia/nemotron-3-ultra-550b-a55b:free","NVIDIA: Nemotron 3 Ultra (free)",1000000,"text->text",["high","medium"]],
        ["dots-studio/dots-3-note-preview:free","Dots Studio: Dots3-Note Preview (free)",512000,"text+image->text",[]],
        ["xingchen-agi/xing4.0-29b-a4b:free","XingChen: Xing4.0 29B A4B (free)",262144,"text->text",[]],
        ["poolside/laguna-s-2.1:free","Poolside: Laguna S 2.1 (free)",262144,"text->text",[]],
        ["poolside/laguna-xs-2.1:free","Poolside: Laguna XS 2.1 (free)",262144,"text->text",[]],
        ["google/gemma-4-26b-a4b-it:free","Google: Gemma 4 26B A4B (free)",262144,"text+image+video->text",[]],
        ["google/gemma-4-31b-it:free","Google: Gemma 4 31B (free)",262144,"text+image->text",[]],
        ["nvidia/nemotron-3-super-120b-a12b:free","NVIDIA: Nemotron 3 Super (free)",262144,"text->text",["high","medium"]],
        ["cohere/north-mini-code:free","Cohere: North Mini Code (free)",256000,"text->text",[]],
        ["nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free","NVIDIA: Nemotron 3 Nano Omni (free)",256000,"text+image+audio->text",[]],
        ["liquid/lfm-2.5-2.6b:free","Liquid: LFM2.5-2.6B (free)",65536,"text->text",[]]
      ];
      return raw.map(function (r) {
        var provider = r[0].split("/")[0];
        return {
          id: r[0], name: r[1], provider: provider, ctx: r[2], maxOut: 0,
          modality: r[3], vision: r[3].indexOf("image") !== -1,
          video: r[3].indexOf("video") !== -1, audio: r[3].indexOf("audio") !== -1,
          reasoning: r[4].length > 0, efforts: r[4], defaultEffort: null,
          mandatoryReasoning: false, tools: true,
          desc: "Offline snapshot of the free catalog (context-ordered).",
          logo: Models.logoUrl(provider),
          suggested: r[0] === (CFG.QWEN_MODEL || CFG.SUGGESTED_MODEL)
        };
      });
    }
  };

  global.PIKModels = Models;
})(window);
