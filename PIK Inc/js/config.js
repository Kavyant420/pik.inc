/* ============================================================================
   PIK//NEXUS — config.js
   ----------------------------------------------------------------------------
   SECURITY: this file contains NO secrets. Never paste an API key here.
   Keys live in the browser's localStorage (set them from the Settings panel)
   or, for production, in a server-side env var consumed by the serverless
   proxy (see /api/README.md). Everything below is public configuration only.

   MODEL CATALOG POLICY: every model id and endpoint listed below has been
   verified against the live provider API. Do not add an id without checking
   it resolves — a fabricated id silently breaks the default engine for every
   visitor. Verification commands live in /api/README.md.
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
    POLLINATIONS_DEFAULT_MODEL: "openai-fast",
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
    /* Models accepted by text.pollinations.ai's OpenAI endpoint.
       VERIFIED against GET /models and by live POST on 2026-10-25.
       The endpoint currently serves exactly one model, "openai-fast"
       (GPT-OSS 20B Reasoning, tools: true). "openai" is a published ALIAS of
       it and is kept so existing saved settings keep resolving.

       The previous list (openai-large, openai-reasoning, mistral, llama,
       deepseek, qwen-coder, trinity, unity, kernel, searchgpt) was never
       real: each one answers HTTP 404 or hangs until timeout, so selecting
       any of them in the model picker silently killed the whole turn. The
       router validates settings.polliModel against THIS list and falls back
       to POLLINATIONS_DEFAULT_MODEL instead of triggering those HTTP 400/404s. */
    POLLI_MODELS: [
      "openai-fast", "openai"
    ],

    /* ---- DeepInfra inference API ------------------------------------------
       CORRECTED: this endpoint is NOT keyless. A live POST with no
       Authorization header answers HTTP 401 {"error":{"message":"missing API
       key"}}. The old comment claiming "keyless, free tier, CORS ok" was
       wrong, which meant this hop could never succeed and only ever added a
       failing request + console noise to the end of the fallback chain.

       It is now an OPT-IN hop: the router only tries it when the visitor has
       stored a DeepInfra key in Settings. Without a key the chain skips
       straight past it.
       NOTE: the previous "cohere-free" hop was removed for the same reason —
       api.cohere.com ALWAYS returns HTTP 401 without an API key. */
    DEEPINFRA_CHAT_URL: "https://api.deepinfra.com/v1/openai/chat/completions",
    DEEPINFRA_MODEL: "deepseek-ai/DeepSeek-V3",
    DEEPINFRA_REQUIRES_KEY: true,

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

    /* ---- Model catalog -----------------------------------------------------
       VERIFIED against https://openrouter.ai/api/v1/models on 2026-10-25.

       The previous SUGGESTED_MODEL, "minimax/minimax-m3.1-flash:free", does
       not exist in the OpenRouter catalog (466 models checked). Because it is
       the default in nexus-settings.js, the model chip and the picker both
       resolved to a phantom id on first load — and OpenRouter answers 404 for
       unknown models, so the very first turn of a fresh session failed before
       any fallback could engage.

       Every id below is confirmed present and confirmed to carry the ":free"
       suffix, so they are reachable on a free-tier key. OpenRouter still
       requires a key for these (keyless calls answer 401) — the keyless path
       is Pollinations, see POLLINATIONS_* above. */
    SUGGESTED_MODEL: "nvidia/nemotron-3.5-lightning:free",
    FALLBACK_ORDER: [
      "nvidia/nemotron-3.5-lightning:free",
      "google/gemma-4-26b-a4b-it:free",
      "poolside/laguna-s-2.1:free",
      "thinkingmachines/inkling-small:free"
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

    /* ---- Live web search ---------------------------------------------------
       PIKX renders results in-page (the Results tab) instead of handing the
       query to another site. Browser CORS makes most search engines
       unreachable from a static page, so the sources below are ordered by
       trust and only contains endpoints verified to answer a cross-origin
       request from the browser:

         1. SELF_PROXY  — our own Vercel function (/api/search). Server-side,
                          so it can reach engines that block browsers and it
                          returns a normal 10-result web listing. Skipped
                          automatically when the site is opened from file:// or
                          any host where the function is not deployed.
         2. DDG_IA      — api.duckduckgo.com Instant Answer. Sends
                          Access-Control-Allow-Origin: * (verified). Returns an
                          abstract + RelatedTopics rather than a full result
                          page, so it is a knowledge panel, not 10 blue links.
         3. WIKIPEDIA   — REST summary + search endpoints, CORS-enabled with
                          origin=*. Reliable fallback for entity queries.

       All three are keyless. The aggregator in js/px-search.js normalises them
       into one shape and degrades gracefully: if the proxy is absent the tab
       still shows real results from sources 2 and 3. */
    SEARCH: {
      SELF_PROXY: "/api/search",
      DDG_IA: "https://api.duckduckgo.com/",
      WIKI_API: "https://en.wikipedia.org/w/api.php",
      WIKI_REST: "https://en.wikipedia.org/api/rest_v1/page/summary/",
      FAVICON: "https://www.google.com/s2/favicons?domain=",
      PER_SOURCE_TIMEOUT_MS: 6000,
      MAX_RESULTS: 12
    },

    /* ---- Storage keys ------------------------------------------------------ */
    LS: {
      KEY_OR: "pik.nexus.key.openrouter",
      KEY_DI: "pik.nexus.key.deepinfra",
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
