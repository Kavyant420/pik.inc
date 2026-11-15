const PIKChrome = (() => {
  const NAV = [
    { href: "index.html", label: "Home" },
    { href: "pikx.html", label: "PIKX" },
    { href: "blackhole.html", label: "Singularity" },
    { href: "products.html", label: "Products" },
    { href: "security.html", label: "Security" },
    { href: "settings.html", label: "Settings" },
    { href: "account.html", label: "Account" }
  ];

  function resolveRoot() {
    const raw = (document.body && document.body.getAttribute("data-root")) || "./";
    return raw.endsWith("/") ? raw : raw + "/";
  }

  function header(root) {
    const links = NAV.map(
      n => '<a class="nav__link" href="' + root + n.href + '">' + n.label + "</a>"
    ).join("");
    return (
      '<header class="site-header">' +
      '<div class="nav">' +
      '<a class="brand" href="' +
      root +
      'index.html" aria-label="PIK home">' +
      '<span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M7 27V7h11a6 6 0 0 1 0 12H12"/><circle cx="24" cy="24" r="2.4" fill="currentColor" stroke="none"/></svg></span>' +
      '<span>PIK<span class="brand__sub">Inc.</span></span></a>' +
      '<nav class="nav__links" id="primary-nav" aria-label="Primary">' +
      links +
      "</nav>" +
      '<div class="nav__actions">' +
      '<button class="icon-btn touch-target" type="button" data-toggle-music aria-pressed="false" aria-label="Toggle ambient music">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg></button>' +
      '<a class="btn btn--outline btn--sm" data-nav-account href="' +
      root +
      'account.html">Sign in</a>' +
      '<button class="nav__burger icon-btn touch-target" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Toggle navigation menu">' +
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
      "</div></div></header>"
    );
  }

  function footer(root) {
    return (
      '<footer class="site-footer">' +
      '<div class="shell">' +
      '<div class="footer__grid">' +
      '<div class="footer__brand">' +
      '<a class="brand" href="' +
      root +
      'index.html"><span class="brand__mark"><svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M7 27V7h11a6 6 0 0 1 0 12H12"/><circle cx="24" cy="24" r="2.4" fill="currentColor" stroke="none"/></svg></span><span>PIK<span class="brand__sub">Inc.</span></span></a>' +
      '<p class="footer__tagline">Security-first product studio. Every identity and session record is hashed locally on your device.</p>' +
      '<div class="footer__anon"><span class="dot-live"></span><span data-footer-alias>Establishing anonymous identity…</span></div>' +
      "</div>" +
      '<div class="footer__col"><h4 class="footer__title">Products</h4>' +
      [
        '<a class="footer__link" href="' + root + 'products/pikuflix.html">Pikuflix</a>',
        '<a class="footer__link" href="' + root + 'products/pik-vpn.html">PIK VPN</a>',
        '<a class="footer__link" href="' + root + 'products/pik-ai.html">PIK AI</a>',
        '<a class="footer__link" href="' + root + 'products/pikmaps.html">PIKMAPS</a>',
        '<a class="footer__link" href="' + root + 'products/pikos.html">PIKOS</a>',
        '<a class="footer__link" href="' + root + 'products/pikture.html">PIKTURE</a>',
        '<a class="footer__link" href="' + root + 'products/pik-ide.html">PIK IDE</a>'
      ].join("") +
      "</div>" +
      '<div class="footer__col"><h4 class="footer__title">Platform</h4>' +
      [
        '<a class="footer__link" href="' + root + 'pikx.html">PIKX Super-App</a>',
        '<a class="footer__link" href="' + root + 'blackhole.html">3D Singularity</a>',
        '<a class="footer__link" href="' + root + 'products.html">All products</a>',
        '<a class="footer__link" href="' + root + 'security.html">Security model</a>',
        '<a class="footer__link" href="' + root + 'wireless-communication.html">Wireless Communication</a>',
        '<a class="footer__link" href="' + root + 'settings.html">Customize PIK</a>',
        '<a class="footer__link" href="' + root + 'account.html">Account</a>'
      ].join("") +
      "</div>" +
      '<div class="footer__col"><h4 class="footer__title">Legal</h4>' +
      [
        '<a class="footer__link" href="' + root + 'privacy-policy.html">Privacy Policy</a>',
        '<a class="footer__link" href="' + root + 'terms-of-service.html">Terms of Service</a>',
        '<a class="footer__link" href="' + root + 'privacy-policy.html#data-deletion">Data deletion</a>',
        '<a class="footer__link" href="' + root + 'terms-of-service.html#acceptable-use">Acceptable use</a>'
      ].join("") +
      "</div></div>" +
      '<div class="footer__legal">' +
      "<span>© 2026 PIK Inc. — built privacy-first.</span>" +
      '<span class="footer__status"><span class="dot-live"></span>All systems operational · traced via <span data-footer-exit>relay</span></span>' +
      '<nav class="footer__legal-links" aria-label="Legal">' +
      '<a href="' +
      root +
      'privacy-policy.html">Privacy Policy</a>' +
      '<a href="' +
      root +
      'terms-of-service.html">Terms of Service</a>' +
      "</nav></div></div>" +
      '<div class="footer__wordmark" aria-hidden="true">PIK</div>' +
      "</footer>"
    );
  }

  function fx() {
    return (
      '<div class="fx-root" aria-hidden="true">' +
      '<div class="fx-gradient"></div>' +
      '<canvas class="fx-canvas"></canvas>' +
      '<div class="fx-vignette"></div>' +
      '<div class="fx-grain"></div>' +
      "</div>"
    );
  }

  function syncAccountButton() {
    const btn = document.querySelector("[data-nav-account]");
    if (!btn || !window.PIKAuth) return;
    const s = PIKAuth.getSession();
    btn.textContent = s && s.handle ? "@" + s.handle : "Sign in";
  }

  function syncFooterTelemetry() {
    if (!window.PIKAnonymity) return;
    const aliasEl = document.querySelector("[data-footer-alias]");
    if (aliasEl) {
      PIKAnonymity.ensureIdentity().then(id => {
        aliasEl.textContent =
          "Browsing as " + id.displayAlias + " · SHA-256 local alias";
      });
    }
    const exitEl = document.querySelector("[data-footer-exit]");
    if (exitEl) {
      const route = PIKAnonymity.getRoute();
      exitEl.textContent = (route && route.exit && route.exit.ip) || "relay";
    }
  }

  function mount() {
    const root = resolveRoot();
    if (!document.querySelector(".fx-root")) {
      document.body.insertAdjacentHTML("afterbegin", fx());
    }
    if (!document.querySelector(".site-header")) {
      const main = document.querySelector(".page");
      if (main) main.insertAdjacentHTML("beforebegin", header(root));
      else document.body.insertAdjacentHTML("afterbegin", header(root));
    }
    const footHost = document.querySelector("[data-footer]");
    if (footHost) footHost.outerHTML = footer(root);
    else if (!document.querySelector(".site-footer")) {
      document.body.insertAdjacentHTML("beforeend", footer(root));
    }

    syncFooterTelemetry();
    syncAccountButton();

    document.addEventListener("pik:authchange", syncAccountButton);
    document.addEventListener("pik:activity", syncFooterTelemetry);
    document.addEventListener("pik:vpn", syncFooterTelemetry);

    const musicBtns = document.querySelectorAll("[data-toggle-music]");
    musicBtns.forEach(btn => {
      btn.addEventListener("click", () => PIKAudio.toggle());
    });
    if (window.PIKAudio) {
      PIKAudio.onChange(st => {
        musicBtns.forEach(btn => btn.setAttribute("aria-pressed", String(!!st.playing)));
      });
    }
  }

  return { mount, resolveRoot };
})();

if (typeof window !== "undefined") {
  window.PIKChrome = PIKChrome;
}
