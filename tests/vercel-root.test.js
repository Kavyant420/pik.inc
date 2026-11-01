/* Vercel deployment root regression checks. */
"use strict";
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..", "pikinc-site");
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
ok("clean URLs enabled", config.cleanUrls === true);
ok("catch-all rewrite targets local API function", config.rewrites.some(function (r) {
  return r.destination && r.destination.indexOf("/api/_fallback") === 0;
}));
ok("fallback imports search handler from same root", /require\(["']\.\/search\.js["']\)/.test(fallback));
ok("fallback streams the matching Git ref", /VERCEL_GIT_COMMIT_REF/.test(fallback));
ok("fallback allows Nexus mobile page", /"nexus-mobile\.html"/.test(fallback));
ok("fallback rejects path traversal", /p\.indexOf\("\.\."\)/.test(fallback));
ok("search API exports a handler", /module\.exports\s*=/.test(search));
ok("site entry redirects to PIKX", /url=\/pikx/.test(index));
console.log("\n" + (fail ? "FAILURES" : "ALL PASS") + ": " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
