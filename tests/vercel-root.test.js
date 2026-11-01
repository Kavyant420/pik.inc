/* Vercel static-root regression checks. */
"use strict";
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..", "pik-inc");
var pass = 0, fail = 0;
function ok(label, condition) {
  if (condition) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label); }
}
var config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
var fallback = fs.readFileSync(path.join(root, "api", "_fallback.js"), "utf8");
var search = fs.readFileSync(path.join(root, "api", "search.js"), "utf8");
var index = fs.readFileSync(path.join(root, "index.html"), "utf8");
ok("deployment root exists without spaces", !root.split(path.sep).some(function (p) { return p.indexOf(" ") !== -1; }));
ok("Vercel root contains the real static CSS directory", fs.existsSync(path.join(root, "css", "00-tokens.css")));
ok("Vercel root contains the real static JavaScript directory", fs.existsSync(path.join(root, "js", "main.js")));
ok("all homepage stylesheet references resolve locally", Array.from(index.matchAll(/href=["']\.\/css\/([^"']+)["']/g)).every(function (m) { return fs.existsSync(path.join(root, "css", m[1])); }));
ok("all homepage script references resolve locally", Array.from(index.matchAll(/src=["']\.\/js\/([^"']+)["']/g)).every(function (m) { return fs.existsSync(path.join(root, "js", m[1])); }));
ok("Google Fonts stylesheet is allowed by CSP", /style-src[^;]*https:\/\/fonts\.googleapis\.com/.test(index));
ok("Google Fonts font files are allowed by CSP", /font-src[^;]*https:\/\/fonts\.gstatic\.com/.test(index));
ok("clean URLs enabled", config.cleanUrls === true);
ok("fallback rewrite forwards the requested path", config.rewrites.some(function (r) { return /\/api\/_fallback\?path=\$1/.test(r.destination || ""); }));
ok("fallback rejects path traversal", /p\.indexOf\("\.\."\)/.test(fallback));
ok("search API exports a handler", /module\.exports\s*=/.test(search));
ok("site root renders the PIK Inc homepage", /PIK — Security-first product studio/.test(index));
ok("site root does not force-redirect visitors to PIKX", !/window\.location\.replace\(["']\/pikx/.test(index) && !/http-equiv=["']refresh["'][^>]*url=\/pikx/i.test(index));
console.log("\n" + (fail ? "FAILURES" : "ALL PASS") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
