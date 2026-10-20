/* ============================================================================
   PIK//NEXUS — sw-nexus.js  (service worker: app-shell + hosted pages)
   Caches the workbench shell so it opens offline (24/7 availability), keeps
   Nexus Pages deployments alive under /nexus.html/<project>/ even when the
   network blips, and never lets a stale response break a fresh deploy.
   Strategy:
     - shell assets  : cache-first, background refresh
     - API GET calls : network-first with cache fallback (models catalog)
     - everything el : network-only (POSTs must never be cached)
   ========================================================================= */
"use strict";

const VERSION = "nexus-v5";
const SHELL = [
  "./",
  "./nexus.html",
  "./js/config.js", "./js/crypto.js", "./js/toasts.js", "./js/models.js",
  "./js/nexus-settings.js", "./js/markdown.js", "./js/md-codeenhance.js",
  "./js/stream-renderer.js", "./js/usage-cap.js", "./js/workspace.js", "./js/github.js",
  "./js/micro-tokenizer.js", "./js/micro-weights.js", "./js/micro-math.js",
  "./js/micro-sampler.js", "./js/micro-engine.js", "./js/micro-bootstrap.js",
  "./js/router.js", "./js/editor.js", "./js/livepreview.js",
  "./js/terminal-kernel.js", "./js/terminal-commands.js", "./js/terminal-ansi.js",
  "./js/terminal.js", "./js/hosting-backend.js", "./js/hosting-security.js",
  "./js/hosting-router.js", "./js/hosting-ui.js", "./js/think-panel.js",
  "./js/fx.js", "./js/fx-particles-lite.js", "./js/chat.js",
  "./js/nexus-picker.js", "./js/nexus-github-ui.js", "./js/error-net.js",
  "./js/perf-guard.js", "./js/idle-tasks.js", "./js/nexus.js",
  "./css/30-nexus-tokens.css", "./css/31-nexus-shell.css", "./css/32-nexus-orb.css",
  "./css/33-nexus-ide.css", "./css/34-nexus-models.css", "./css/35-nexus-animations.css",
  "./css/36-nexus-terminal.css", "./css/37-nexus-preview.css", "./css/38-nexus-hosting.css",
  "./css/39-nexus-thinkpanel.css", "./css/40-nexus-output.css", "./css/41-nexus-microcore.css",
  "./css/42-nexus-motion-plus.css", "./css/43-nexus-fitviewport.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll is atomic; do it per-item so one missing file can't sink the shell
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: "reload" }))));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
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
      // last resort: serve the shell page so the app still boots offline
      const shell = await cache.match("./nexus.html");
      return shell || Response.error();
    })());
  }
});
