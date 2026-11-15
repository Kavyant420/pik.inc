/* Fallback so a root-directory deploy (whose outputDirectory is empty) still
   serves the real site from pik-inc/. Requests that match a static file in the
   deployment are served directly by Vercel's CDN; unmatched paths reach this
   function, which serves from local disk first and falls back to GitHub raw
   content if static files were not bundled into the function image. */
"use strict";

var fs = require("fs");
var path = require("path");

var ALLOWED_ROOTS = [
  "index.html", "blackhole.html", "pikx.html", "nexus.html", "nexus-mobile.html",
  "settings.html", "account.html", "security.html", "products.html",
  "products/", "css/", "js/", "docs/",
  "privacy-policy.html", "terms-of-service.html",
  "wireless-communication.html", "sw-nexus.js", "sw-nexus-mobile.js",
  "sw-nexus-mobile.html", "favicon.ico", "robots.txt", "manifest.webmanifest"
];

var TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".webmanifest": "application/manifest+json"
};

function sendNotFound(res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(404).end("Not found");
}

module.exports = async function handler(req, res) {
  var rawParam = req.query && req.query.path;
  var p = Array.isArray(rawParam) ? rawParam.join("/") : String(rawParam || "");
  try {
    p = decodeURIComponent(p);
  } catch (e) {
    return res.status(400).json({ error: "malformed path" });
  }

  p = p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");

  if (p.indexOf("..") !== -1 || p.indexOf("\0") !== -1) {
    return res.status(404).json({ error: "not found" });
  }

  if (p === "") p = "index.html";
  else if (p === "docs") p = "docs/index.html";
  else if (!/\.[a-z0-9]+$/i.test(p)) p += ".html";

  var ok = ALLOWED_ROOTS.some(function (r) {
    return r.slice(-1) === "/" ? p.indexOf(r) === 0 : p === r;
  });
  if (!ok || p.indexOf("..") !== -1) {
    return res.status(404).json({ error: "not found" });
  }

  var ext = (p.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
  var contentType = TYPES[ext] || "application/octet-stream";

  /* 1. Prefer reading from the deployed pik-inc directory on disk when bundled */
  var siteRoot = path.resolve(__dirname, "..");
  var localCandidate = path.resolve(siteRoot, p);
  if (localCandidate.indexOf(siteRoot + path.sep) === 0 && fs.existsSync(localCandidate)) {
    try {
      var stat = fs.statSync(localCandidate);
      if (stat.isFile()) {
        var localBuf = fs.readFileSync(localCandidate);
        res.setHeader("Content-Type", contentType);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
        return res.status(200).send(localBuf);
      }
    } catch (e) { /* fall through to upstream raw fetch */ }
  }

  /* 2. Remote fallback (honors fork env vars on Vercel when available) */
  var owner = process.env.VERCEL_GIT_REPO_OWNER || "Kavyant420";
  var slug = process.env.VERCEL_GIT_REPO_SLUG || "pik.inc";
  var ref = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_REF || "main";
  var encodedPath = p.split("/").map(encodeURIComponent).join("/");
  var url = "https://raw.githubusercontent.com/" +
    encodeURIComponent(owner) + "/" + encodeURIComponent(slug) + "/" + encodeURIComponent(ref) +
    "/pik-inc/" + encodedPath;

  try {
    var upstream = await fetch(url, { headers: { "User-Agent": "pikinc-vercel-fallback/1.0" } });
    if (!upstream.ok) return sendNotFound(res);
    var buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: "upstream fetch failed" });
  }
};
