/* Catch-all handler for the "PIK Inc" root-directory Vercel deployment.
   Rewrites send every unmatched request here with ?path=<requested path>.
   - /api/search is dispatched in-process to ./search.js (the real PIKX backend)
   - everything else streams the corresponding file from pik-inc/ via GitHub raw
*/
"use strict";

var ALLOWED_ROOTS = [
  "index.html", "pikx.html", "nexus.html", "nexus-mobile.html",
  "settings.html", "account.html", "security.html", "products.html",
  "products/", "css/", "js/", "docs/",
  "privacy-policy.html", "terms-of-service.html",
  "wireless-communication.html", "sw-nexus.js", "sw-nexus-mobile.js",
  "sw-nexus-mobile.html", "favicon.ico", "robots.txt", "manifest.webmanifest"
];

var TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

var searchHandler = null;
try { searchHandler = require("./search.js"); } catch (e) { /* optional */ }

module.exports = async function handler(req, res) {
  var p = String(req.query.path || "");
  if (p === "" || p === "/") p = "index.html";
  p = p.replace(/^\/+/, "");

  /* PIKX search API — dispatch to the real search function in-process */
  if (p === "api/search" || p === "api/search.js") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (typeof searchHandler !== "function") {
      return res.status(500).json({ error: "search handler unavailable" });
    }
    try { await searchHandler(req, res); return undefined; }
    catch (e) { return res.status(500).json({ error: String(e && e.message || e) }); }
  }

  /* cleanUrls: /pikx -> pikx.html */
  if (!/\.[a-z0-9]+$/i.test(p)) p += ".html";

  var ok = ALLOWED_ROOTS.some(function (r) { return p.indexOf(r) === 0; });
  if (!ok || p.indexOf("..") !== -1) {
    return res.status(404).set("Content-Type", "text/plain").end("Not found");
  }

  var url = "https://raw.githubusercontent.com/Kavyant420/pik.inc/main/pik-inc/" + encodeURI(p);
  try {
    var upstream = await fetch(url, { headers: { "User-Agent": "pikinc-vercel-fallback/1.0" } });
    if (!upstream.ok) return res.status(404).set("Content-Type", "text/plain").end("Not found");
    var buf = Buffer.from(await upstream.arrayBuffer());
    var ext = (p.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
    res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: "upstream fetch failed" });
  }
};
