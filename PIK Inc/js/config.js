/* ============================================================================
   PIK//NEXUS — config.js
   ----------------------------------------------------------------------------
   SECURITY: this file contains NO secrets. Never paste an API key here.
   Keys live in the browser's localStorage (set them from the Settings panel)
   or, for production, in a server-side .env consumed by a proxy (see
   /server/README.md). Everything below is public configuration only.
   ========================================================================= */
(function (global) {
  "use strict";

  var CONFIG = {
    /* ---- OpenRouter (public model catalog endpoint — no key required) ---- */
    OR_MODELS_URL: "https://openrouter.ai/api/v1/models",
    OR_CHAT_URL: "https://openrouter.ai/api/v1/chat/completions",

    /* ---- Pollinations primary (keyless, free — no API key ever needed) --- */
    POLLINATIONS_URL: "https://text.pollinations.ai/openai",
    POLLINATIONS_MODELS_URL: "https://text.pollinations.ai/models",
    POLLINATIONS_DEFAULT_MODEL: "openai",
    /* simple GET endpoint — returns plain text, no streaming, very reliable */
    POLLINATIONS_GET_URL: "https://text.pollinations.ai/",
    /* openai-compatible chat backends tried in order when the primary one is
       down or rate-limited — all keyless / free */
    /* NOTE: universal.pollinations.ai was removed — it does not resolve
       (net::ERR_NAME_NOT_RESOLVED) and only produced console noise. The chain
       now contains real, keyless hosts only. */
    POLLINATIONS_CHAIN: [
      "https://text.pollinations.ai/openai"
    ],

    /* ---- DeepInfra public inference API (keyless, free tier, CORS ok) -----
       Tried after every pollinations hop fails. NOTE: the previous
       "cohere-free" hop was removed because api.cohere.com ALWAYS returns
       HTTP 401 without an API key — there is no truly keyless Cohere model. */
    DEEPINFRA_CHAT_URL: "https://api.deepinfra.com/v1/openai/chat/completions",
    DEEPINFRA_MODEL: "deepseek-ai/DeepSeek-V3",

    /* ---- GitHub OAuth (client id is PUBLIC by design — it is not a secret;
            the client SECRET must never appear in front-end code) ---------- */
    GH_CLIENT_ID: "Ov23li9vuOtnUlHfW820",
    GH_AUTH_URL: "https://github.com/login/oauth/authorize",
    GH_API: "https://api.github.com",

    /* ---- Puter.js (free, keyless provider — loaded on demand via CDN) ----
       window.puter.ai.chat(...) requires NO API key and no signup; the user's
       free Puter account sponsors the call. NEXUS treats it as a first-class
       engine and auto-redirects between it and Pollinations on any failure. */
    PUTER_CDN: "https://js.puter.com/v2/",

    /* ---- Logo CDNs -------------------------------------------------------- */
    LOGO_SI: "https://cdn.jsdelivr.net/npm/simple-icons@14/icons/",   // svg monochrome set
    LOGO_FAVICON: "https://www.google.com/s2/favicons?domain=",       // + domain + "&sz=64"
    LOGO_SHIELDS: "https://img.shields.io/badge/",                    // gradient badge generator

    /* ---- Model catalog ----------------------------------------------------- */
    SUGGESTED_MODEL: "minimax/minimax-m3.1-flash:free",
    FALLBACK_ORDER: [
      "minimax/minimax-m3.1-flash:free",
      "nvidia/nemotron-3.5-lightning:free",
      "google/gemma-4-26b-a4b-it:free",
      "poolside/laguna-s-2.1:free"
    ],

    /* ---- Editor theme presets (IDE customization) -------------------------- */
    EDITOR_THEMES: ["graphite", "midnight", "amber", "forest"],

    /* Provider -> simple-icons slug (verified against the CDN) */
    PROVIDER_ICONS: {
      minimax: "minimax", google: "google", nvidia: "nvidia",
      openai: "openai", anthropic: "anthropic", meta: "meta",
      deepseek: "deepseek", qwen: "qwen", mistral: "mistralai",
      xai: "xai", moonshotai: "moonshotai", perplexity: "perplexity",
      cohere: "cohere", poolside: "poolside", liquid: "liquid",
      thinkingmachines: "thinkingmachines", "dots-studio": "dotsstudio",
      "xingchen-agi": "xingchen", pollinations: "pollinations", puter: "puter"
    },

    /* Provider -> brand site (used for favicon fallbacks) */
    PROVIDER_DOMAIN: {
      minimax: "minimax.io", google: "google.com", nvidia: "nvidia.com",
      openai: "openai.com", anthropic: "anthropic.com", meta: "meta.com",
      deepseek: "deepseek.com", qwen: "chat.qwen.ai", mistral: "mistral.ai",
      xai: "x.ai", moonshotai: "moonshot.ai", perplexity: "perplexity.ai",
      cohere: "cohere.com", poolside: "poolside.ai", liquid: "www.liquid.ai",
      thinkingmachines: "thinkingmachines.co", "dots-studio": "dots.studio",
      "xingchen-agi": "teleai.com.cn", pollinations: "pollinations.ai", puter: "puter.com"
    },

    /* ---- Thinking ladder (UI scale Low -> Medium -> High -> Max) --------- */
    THINKING_LEVELS: ["low", "medium", "high", "max"],
    /* Max thinking on free models: pollinations' openai-compatible endpoint
       validates reasoning_effort strictly and answers HTTP 400 for unknown
       values like "max" — so "max" maps to its strongest accepted level. */
    THINKING_MAP: {
      low: "low", medium: "medium", high: "high", max: "high"
    },

    /* ---- Storage keys ------------------------------------------------------ */
    LS: {
      KEY_OR: "pik.nexus.key.openrouter",
      KEY_GH: "pik.nexus.key.github",
      SETTINGS: "pik.nexus.settings",
      PROJECTS: "pik.nexus.projects",
      CHATS: "pik.nexus.chats",
      OAUTH_STATE: "pik.nexus.oauth.state",
      OAUTH_VERIFIER: "pik.nexus.oauth.verifier",
      USAGE: "pik.nexus.usage"
    },

    /* Free-tier budget heuristics (requests before auto-failover) */
    FREE_BUDGET: {
      windowMs: 60 * 60 * 1000,   // rolling hour
      maxRequests: 45             // conservative; real limit enforced upstream
    }
  };

  global.PIK_CONFIG = CONFIG;
})(window);
