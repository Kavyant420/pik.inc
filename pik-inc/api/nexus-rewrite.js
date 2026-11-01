// PIK Inc — /nexus clean-URL fallback (Vercel serverless function)
//
// Why this exists: on pikinc.vercel.app the workbench lives at /nexus.html.
// Visitors (and links) naturally type /nexus, which previously hit Vercel's
// static 404 because no route matched it. This function makes GET /nexus
// serve nexus.html directly (HTTP 200), so both URLs work.
const fs = require("fs");
const path = require("path");

module.exports = (req, res) => {
  let html;
  try {
    // Function runs from api/, the site files sit one level up.
    html = fs.readFileSync(path.join(__dirname, "..", "nexus.html"));
  } catch (e) {
    res.statusCode = 500;
    res.end("nexus.html not found");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.statusCode = 200;
  res.end(html);
};
