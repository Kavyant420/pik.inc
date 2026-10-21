/* ============================================================================
   PIK//NEXUS — sw-nexus-mobile.js  (NEW file: mobile service worker)
   Companion to the untouched desktop sw-nexus.js. Registered ONLY by
   nexus-mobile.html, at its own scope, so it can never intercept or rewrite
   anything for the desktop shell.

   Scope note: browsers only allow a SW to control requests under the
   directory it was served from. If /sw-nexus-mobile.html is blocked by
   hosting rules, nexus-mobile-sw.js transparently falls back to registering
   this worker from the ./js/ copy (scope ./js/), which still keeps the
   mobile shell warm and offline-capable for repeat visits.

   Strategy mirrors the desktop worker:
     - shell assets  : cache-first, background refresh
     - API GET calls : live (never cached)
     - everything el : network-only
   ========================================================================= */
"use strict";

const VERSION = "nexus-mobile-v1";
const SHELL = [
  "./nexus-mobile.html",
  "./js/config.js", "./js/perf-guard.js", "./js/crypto.js", "./js/toasts.js",
  "./js/models.js", "./js/nexus-settings.js", "./js/markdown.js",
  "./js/md-codeenhance.js", "./js/stream-renderer.js", "./js/usage-cap.js",
  "./js/workspace.js", "./js/github.js",
  "./js/micro-tokenizer.js", "./js/micro-weights.js", "./js/micro-math.js",
  "./js/micro-sampler.js", "./js/micro-engine.js", "./js/micro-worker.js",
  "./js/micro-bootstrap.js", "./js/web-surfer.js", "./js/skills.js",
  "./js/router.js", "./js/editor.js", "./js/livepreview.js",
  "./js/terminal-kernel.js", "./js/terminal-commands.js", "./js/terminal-ansi.js",
  "./js/terminal.js", "./js/hosting-backend.js", "./js/hosting-security.js",
  "./js/hosting-router.js", "./js/hosting-ui.js", "./js/think-panel.js",
  "./js/fx.js", "./js/fx-particles-lite.js", "./js/chat.js",
  "./js/nexus-picker.js", "./js/nexus-github-ui.js", "./js/error-net.js",
  "./js/idle-tasks.js", "./js/nexus.js",
  "./js/nexus-mobile-adapt.js", "./js/nexus-mobile-nav.js", "./js/nexus-mobile-sw.js",
  "./css/30-nexus-tokens.css", "./css/31-nexus-shell.css", "./css/32-nexus-orb.css",
  "./css/33-nexus-ide.css", "./css/34-nexus-models.css", "./css/35-nexus-animations.css",
  "./css/36-nexus-terminal.css", "./css/37-nexus-preview.css", "./css/38-nexus-hosting.css",
  "./css/39-nexus-thinkpanel.css", "./css/40-nexus-output.css", "./css/41-nexus-microcore.css",
  "./css/42-nexus-motion-plus.css", "./css/43-nexus-fitviewport.css", "./css/44-nexus-codegrid.css",
  "./css/45-nexus-thinkline.css", "./css/46-nexus-skills.css",
  "./css/47-nexus-mobile.css", "./css/48-nexus-mobile-chrome.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // per-item add: one missing file can never sink the whole mobile shell
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: "reload" }))));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION && !k.startsWith("nexus-v")).map((k) => caches.delete(k)));
    await clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;              // never touch POSTs
  const url = new URL(req.url);

  // Inference APIs: always live.
  if (/openrouter\.ai|pollinations\.ai|deepinfra\.ai|github\.com/.test(url.hostname)) {
    return; // network-only
  }

  // Model catalog: network-first, fall back to last good copy.
  if (url.pathname.endsWith("/api/v1/models")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const hit = await caches.match(req);
        return hit || Response.error();
      }
    })());
    return;
  }

  // Same-origin: cache-first with background refresh.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { net.catch(() => {}); return hit; }
      const fetched = await net;
      if (fetched) return fetched;
      // last resort: serve the MOBILE shell page so the app still boots offline
      const shell = await cache.match("./nexus-mobile.html");
      return shell || Response.error();
    })());
  }
});
