document.addEventListener("DOMContentLoaded", async () => {
  const rawRoot = document.body.getAttribute("data-root") || "./";
  const root = rawRoot.endsWith("/") ? rawRoot : rawRoot + "/";

  PIKSettings.apply();
  if (window.PIKPerf) PIKPerf.init();
  PIKChrome.mount();
  PIKDock.mount();
  PIK3D.init();
  PIKMotion.initAll(root);

  if (window.PIKAnonymity) {
    await PIKAnonymity.recordVisit();
    const syncExitIps = () => {
      const route = PIKAnonymity.getRoute();
      if (route && route.exit) {
        document.querySelectorAll("[data-exit-ip]").forEach(el => {
          el.textContent = route.exit.ip;
        });
      }
    };
    syncExitIps();
    document.addEventListener("pik:vpn", syncExitIps);
    document.addEventListener("pik:activity", syncExitIps);

    PIKAnonymity.logActivity("page-view", location.pathname.split("/").pop() || "index.html");
    document.addEventListener("click", ev => {
      const link = ev.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (href.startsWith("#")) PIKAnonymity.logActivity("anchor", href);
    });
    document.querySelectorAll("[data-route-rotate-onview]").forEach(el => {
      el.addEventListener("click", () => {
        PIKAnonymity.rotateRoute();
        syncExitIps();
      });
    });
  }

  const page = document.body.getAttribute("data-page");

  if ((page === "settings" || document.querySelector("[data-settings-page]")) && window.PIKSettings) {
    PIKSettings.initPage();
  }

  if (page === "account" || page === "login" || page === "signup") initAccount(page);
  if (page === "security") initSecurity();

  if (window.PIKVPN) {
    if (page === "vpn" || document.querySelector("[data-vpn-toggle]")) PIKVPN.initPage();
    else if (document.querySelector("[data-vpn-pill]")) PIKVPN.bindPill();
  }

  if (page === "wireless") initWireless();

  /* Bind waitlist forms on both catalogue and individual product preview pages */
  if (page === "products" || page === "product" || document.querySelector(".waitlist-form")) {
    initProducts();
  }

  if (window.PIKWireless) {
    setTimeout(() => PIKWireless.maybeAnnounce(), 1600);
  }

  const year = new Date().getFullYear();
  document.querySelectorAll("[data-year]").forEach(el => {
    el.textContent = String(year);
  });
});

function initAccount(mode) {
  const tabs = document.querySelectorAll(".auth-tab");
  const loginForm = document.querySelector("[data-form-login]");
  const signupForm = document.querySelector("[data-form-signup]");
  const initial = location.hash === "#signup" || mode === "signup" ? "signup" : "login";

  function show(which, pushHash) {
    tabs.forEach(t => {
      const active = t.dataset.tab === which;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
    });
    if (loginForm) loginForm.hidden = which !== "login";
    if (signupForm) signupForm.hidden = which !== "signup";
    if (pushHash && window.history && window.history.replaceState) {
      history.replaceState(null, "", "#" + which);
    }
  }

  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab, true)));
  show(initial, false);

  if (loginForm) PIKAuth.bindForm(loginForm, "login");
  if (signupForm) PIKAuth.bindForm(signupForm, "signup");

  const bars = document.querySelector(".strength__bars");
  const label = document.querySelector(".strength__label");
  if (signupForm) {
    PIKAuth.bindStrength(signupForm.querySelector('[name="password"]'), bars, label);
  }

  const sessionChip = document.querySelector("[data-session-chip]");
  const avatar = document.querySelector(".avatar-hash");
  const syncSessionUi = () => {
    PIKAuth.renderSessionChip(sessionChip);
    PIKAuth.renderAvatar(avatar);
  };
  syncSessionUi();
  document.addEventListener("pik:authchange", syncSessionUi);

  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      PIKAuth.logout();
      syncSessionUi();
      if (window.PIKToasts) {
        PIKToasts.show({
          type: "info",
          title: "Signed out",
          text: "Local session hash cleared from this device."
        });
      }
    });
  }
}

async function initSecurity() {
  const dom = {
    alias: document.querySelector("[data-anon-alias]"),
    hash: document.querySelector("[data-anon-hash]"),
    visits: document.querySelector("[data-anon-visits]"),
    hops: document.querySelector("[data-route-hops]"),
    log: document.querySelector("[data-activity-log]")
  };
  PIKAnonymity.renderInto(dom);
  document.addEventListener("pik:activity", () => PIKAnonymity.renderInto(dom));

  const rotate = document.querySelector("[data-rotate-route]");
  if (rotate) {
    rotate.addEventListener("click", () => {
      PIKAnonymity.rotateRoute();
      PIKAnonymity.logActivity("route", "manual-rotation");
      PIKAnonymity.renderInto(dom);
    });
  }

  const purge = document.querySelector("[data-clear-identity]");
  if (purge) {
    purge.addEventListener("click", () => {
      PIKAnonymity.clearAll();
      PIKAnonymity.renderInto(dom);
      if (window.PIKToasts) {
        PIKToasts.show({
          type: "success",
          title: "Identity reset",
          text: "Fresh anonymous alias and relay circuit generated locally."
        });
      }
    });
  }

  const input = document.querySelector("[data-hash-input]");
  const out = document.querySelector("[data-hash-output]");
  if (input && out) {
    const compute = async () => {
      const h = await PIKCrypto.sha256(input.value || "empty");
      out.textContent = h;
      out.classList.remove("is-new");
      void out.offsetWidth;
      out.classList.add("is-new");
    };
    input.addEventListener("input", compute);
    compute();
  }
}

function initWireless() {
  const btn = document.querySelector("[data-wireless-demo]");
  const statusEl = document.querySelector("[data-wireless-status]");
  if (btn && statusEl) {
    let connected = false;
    btn.addEventListener("click", async () => {
      if (connected) {
        connected = false;
        statusEl.textContent = "Link closed. Devices are no longer paired.";
        btn.textContent = "Simulate pairing";
        if (window.PIKAnonymity) PIKAnonymity.logActivity("wireless", "unpair");
        return;
      }
      btn.disabled = true;
      statusEl.textContent = "Scanning for nearby devices over Bluetooth…";
      await new Promise(r => setTimeout(r, 900));
      statusEl.textContent =
        "Peer found · RSSI -54 dBm · link budget healthy. Messages now travel device-to-device with zero cellular data.";
      btn.disabled = false;
      btn.textContent = "Break link";
      connected = true;
      if (window.PIKAnonymity) PIKAnonymity.logActivity("wireless", "pair");
    });
  }

  const range = document.querySelector("[data-range-slider]");
  const readout = document.querySelector("[data-range-readout]");
  const verdict = document.querySelector("[data-range-verdict]");
  const card = range ? range.closest(".card, .panel, section") : null;
  const meterFill = card ? card.querySelector(".meter-fill") : null;
  const meterSpans = card ? card.querySelectorAll(".meter-head span") : [];
  const meterPctEl = meterSpans.length > 1 ? meterSpans[1] : null;

  if (range && readout) {
    const syncRange = () => {
      const m = Number(range.value);
      const min = Number(range.min || 1);
      const max = Number(range.max || 80);
      readout.textContent = m + " m";
      const sliderPct = ((m - min) / Math.max(1, max - min)) * 100;
      range.style.setProperty("--range-fill", sliderPct.toFixed(1) + "%");

      const throughput = m <= 10
        ? Math.round(100 - (m - 1) * 1.4)
        : m <= 30
        ? Math.round(86 - (m - 10) * 2.5)
        : Math.max(0, Math.round(36 - (m - 30) * 0.9));

      if (meterFill) meterFill.style.width = throughput + "%";
      if (meterPctEl) meterPctEl.textContent = throughput + "%";

      if (verdict) {
        verdict.textContent =
          m <= 10
            ? "Strong signal — full encrypted mesh throughput (~2 Mbps BLE 2M PHY)."
            : m <= 30
            ? "Attenuated link — expect Coded PHY fallback and slower handshakes."
            : "Beyond reliable Bluetooth range — bring devices closer to restore mesh link.";
      }
    };
    range.addEventListener("input", syncRange);
    syncRange();
  }
}

function resolveProductSlug(form) {
  const attr = (form.dataset.product || "").trim();
  if (attr && attr !== "%s") return attr;
  const file = (location.pathname.split("/").pop() || "").replace(/\.html$/i, "");
  return file || "pik";
}

function initProducts() {
  const waitlists = document.querySelectorAll(".waitlist-form");
  waitlists.forEach(form => {
    if (form.dataset.waitlistBound === "1") return;
    form.dataset.waitlistBound = "1";
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const fd = new FormData(form);
      const raw = String(fd.get("join-email") || "").trim();
      const note =
        form.querySelector(".form-note") ||
        (form.parentElement && form.parentElement.querySelector(".form-note"));
      const slug = resolveProductSlug(form);

      if (raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        const h = await PIKCrypto.sha256("waitlist:" + slug + ":" + raw.toLowerCase());
        try {
          const list = JSON.parse(localStorage.getItem("pik.waitlist") || "{}");
          list[h.slice(0, 16)] = { product: slug, joinedAt: new Date().toISOString() };
          localStorage.setItem("pik.waitlist", JSON.stringify(list));
        } catch (e) {}
        if (note) {
          note.textContent =
            "Saved locally as SHA-256 hash " +
            h.slice(0, 18) +
            "… — your email was never transmitted or stored in plain text.";
        }
        if (window.PIKToasts) {
          PIKToasts.push("Waitlist hash recorded locally for " + slug.toUpperCase(), "success");
        }
        form.reset();
        if (window.PIKAnonymity) PIKAnonymity.logActivity("waitlist", slug);
      } else if (note) {
        note.textContent = "Enter a valid email address so we can hash it locally on your device.";
      }
    });
  });
}
