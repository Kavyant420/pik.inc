/* ============================================================================
   PIK//NEXUS — hosting-router.js
   The request router that sits in front of the Nexus Pages origin. It gives
   every hosted project a live, clickable URL inside the workbench:

       <origin>/nexus.html/<project>/  →  blob-served bundle in an iframe tab

   Pipeline per request: bot filter → rate limit → digest integrity check →
   CSP stamp → serve (or synthetic 403/404/429 page). Also exposes
   PIKNexusPages.open(project) used by the Host tab's "Open" buttons and the
   `deploy` terminal command to jump straight to the live preview of a deploy.
   ========================================================================= */
(function (global) {
  "use strict";

  var Router = {
    /* handle a canonical /nexus.html/<project>/... path */
    async handle(pathname) {
      var admit = PIKHostingSecurity.admitRequest(navigator.userAgent);
      if (!admit.allow) {
        return { status: admit.status, html: errorPage(admit.status, admit.why, pathname) };
      }
      var res = await PIKHosting.resolve(pathname);
      if (!res.ok) return { status: res.status || 404, html: res.body || errorPage(404, "not found", pathname) };
      // integrity pin: re-hash served bytes against the recorded digest
      var meta = await firstMetaFor(pathname);
      if (meta && meta.digest) {
        var actual = await PIKCrypto.sha256Hex(res.html);
        if (actual !== meta.digest) {
          return { status: 500, html: errorPage(500, "integrity mismatch — refusing to serve tampered bytes", pathname) };
        }
      }
      return { status: 200, html: PIKHostingSecurity.stamp(res.html), headers: res.headers };
    },

    /* open a deployed project in the Preview pane through the router */
    async open(project) {
      var path = "/pikinc.vercel.app/nexus.html/" + encodeURIComponent(project) + "/";
      var out = await this.handle(path);
      var frame = document.querySelector('[data-nx="preview-frame"]');
      var urlEl = document.querySelector('[data-nx="preview-url"]');
      if (!frame) return { ok: false, error: "no preview frame" };
      if (out.status !== 200) {
        frame.srcdoc = out.html;
        if (urlEl) urlEl.textContent = "nexus-pages · HTTP " + out.status;
        return { ok: false, status: out.status };
      }
      var blobUrl = URL.createObjectURL(new Blob([out.html], { type: "text/html" }));
      frame.src = blobUrl;
      if (urlEl) urlEl.textContent = "pikinc.vercel.app/nexus.html/" + project + "/";
      if (global.PIKNexusPane) PIKNexusPane.showTab("preview");
      return { ok: true, url: "pikinc.vercel.app/nexus.html/" + project + "/" };
    }
  };

  async function firstMetaFor(pathname) {
    try {
      var m = String(pathname).match(/nexus\.html\/([^/?#]+)/);
      if (!m) return null;
      var list = await PIKHosting.list();
      var name = decodeURIComponent(m[1]).replace(/@.*$/, "");
      return list.find(function (r) { return r.project === name; }) || null;
    } catch (e) { return null; }
  }

  function errorPage(status, why, path) {
    return "<!doctype html><meta charset='utf-8'><title>" + status + "</title>" +
      "<body style=\"background:#060607;color:#dfe2e6;font-family:ui-monospace,monospace;display:grid;place-items:center;height:100vh;margin:0\">" +
      "<div style='text-align:center;max-width:40em'>" +
      "<h1 style='font-weight:600;letter-spacing:.04em'>" + status + "</h1>" +
      "<p style='opacity:.65'>" + esc(String(why || "")) + "</p>" +
      "<p style='opacity:.4;font-size:.8rem'>" + esc(String(path || "")) + " · nexus-pages edge (keyless protection)</p></div>";
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  global.PIKHostingRouter = Router;
})(window);
