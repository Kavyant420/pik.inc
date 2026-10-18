document.addEventListener("DOMContentLoaded", async () => {
  PIKSettings.apply();
  PIKChrome.mount();
  PIKDock.mount();
  PIK3D.init();
  PIKMotion.initAll(document.body.getAttribute("data-root") || "./");

  if (window.PIKAnonymity) {
    await PIKAnonymity.ensureIdentity();
    const route = PIKAnonymity.getRoute();
    PIKAnonymity.logActivity("page-view", location.pathname.split("/").pop() || "index.html");
    document.addEventListener("click", ev => {
      const link = ev.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href");
      if (href.startsWith("#")) PIKAnonymity.logActivity("anchor", href);
    });
    document.querySelectorAll("[data-route-rotate-onview]").forEach(el => {
      el.addEventListener("click", () => PIKAnonymity.rotateRoute());
    });
    if (route.exit) {
      document.querySelectorAll("[data-exit-ip]").forEach(el => {
        el.textContent = route.exit.ip;
      });
    }
  }

  const page = document.body.getAttribute("data-page");

  if (page === "settings" && window.PIKSettings) PIKSettings.initPage();

  if (page === "account" || page === "login" || page === "signup") initAccount(page);
  if (page === "security") initSecurity();
  if (page === "wireless") initWireless();
  if (page === "products") initProducts();

  setTimeout(() => PIKWireless.maybeAnnounce(), 1600);

  const year = new Date().getFullYear();
  document.querySelectorAll("[data-year]").forEach(el => (el.textContent = year));
});

function initAccount(mode) {
  const tabs = document.querySelectorAll(".auth-tab");
  const loginForm = document.querySelector("[data-form-login]");
  const signupForm = document.querySelector("[data-form-signup]");
  let current = mode === "signup" ? "signup" : "login";

  function show(which) {
    current = which;
    tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab === which));
    if (loginForm) loginForm.hidden = which !== "login";
    if (signupForm) signupForm.hidden = which !== "signup";
    if (window.history && window.history.replaceState) {
      history.replaceState(null, "", "#" + which);
    }
  }

  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab)));
  if (location.hash === "#signup") show("signup");

  if (loginForm) PIKAuth.bindForm(loginForm, "login");
  if (signupForm) PIKAuth.bindForm(signupForm, "signup");

  const pwInput = document.querySelector('[data-form-login] [name="password"], [data-form-signup] [name="password"]');
  const bars = document.querySelector(".strength__bars");
  const label = document.querySelector(".strength__label");
  if (signupForm) {
    PIKAuth.bindStrength(signupForm.querySelector('[name="password"]'), bars, label);
  }

  const sessionChip = document.querySelector("[data-session-chip]");
  const avatar = document.querySelector(".avatar-hash");
  PIKAuth.renderSessionChip(sessionChip);
  PIKAuth.renderAvatar(avatar);

  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      PIKAuth.logout();
      PIKToasts.show({ type: "info", title: "Signed out", text: "Local session hash cleared from this device." });
      setTimeout(() => location.reload(), 700);
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
  if (rotate) rotate.addEventListener("click", () => {
    PIKAnonymity.rotateRoute();
    PIKAnonymity.logActivity("route", "manual-rotation");
    PIKAnonymity.renderInto(dom);
  });

  const purge = document.querySelector("[data-clear-identity]");
  if (purge) purge.addEventListener("click", () => {
    PIKAnonymity.clearAll();
    PIKAnonymity.renderInto(dom);
  });

  const input = document.querySelector("[data-hash-input]");
  const out = document.querySelector("[data-hash-output]");
  if (input && out) {
    input.addEventListener("input", async () => {
      const h = await PIKCrypto.sha256(input.value || "empty");
      out.textContent = h;
      out.classList.remove("is-new");
      void out.offsetWidth;
      out.classList.add("is-new");
    });
  }
}

function initWireless() {
  const btn = document.querySelector("[data-wireless-demo]");
  const statusEl = document.querySelector("[data-wireless-status]");
  if (!btn || !statusEl) return;
  let connected = false;
  btn.addEventListener("click", async () => {
    if (connected) {
      connected = false;
      statusEl.textContent = "Link closed. Devices are no longer paired.";
      btn.textContent = "Simulate pairing";
      PIKAnonymity.logActivity("wireless", "unpair");
      return;
    }
    btn.disabled = true;
    statusEl.textContent = "Scanning for nearby devices over Bluetooth…";
    await new Promise(r => setTimeout(r, 1400));
    statusEl.textContent = "Peer found · RSSI -54 dBm · link budget healthy. Messages now travel device-to-device with zero cellular data.";
    btn.disabled = false;
    btn.textContent = "Break link";
    connected = true;
    PIKAnonymity.logActivity("wireless", "pair");
  });

  const range = document.querySelector("[data-range-slider]");
  const readout = document.querySelector("[data-range-readout]");
  const verdict = document.querySelector("[data-range-verdict]");
  if (range && readout) {
    range.addEventListener("input", () => {
      const m = Number(range.value);
      readout.textContent = m + " m";
      range.style.setProperty("--range-fill", ((m - range.min) / (range.max - range.min)) * 100 + "%");
      if (verdict) {
        verdict.textContent = m <= 10
          ? "Strong signal — full mesh throughput."
          : m <= 30
          ? "Degraded — expect slower handshakes."
          : "Out of typical Bluetooth range — the only real limitation of Wireless Communication.";
      }
    });
  }
}

function initProducts() {
  const waitlists = document.querySelectorAll(".waitlist-form");
  waitlists.forEach(form => {
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const fd = new FormData(form);
      const raw = String(fd.get("join-email") || "");
      const note = form.querySelector(".form-note");
      if (raw) {
        const h = await PIKCrypto.sha256("waitlist:" + raw.toLowerCase());
        const list = JSON.parse(localStorage.getItem("pik.waitlist") || "{}");
        list[h.slice(0, 16)] = { product: form.dataset.product || "pik", joinedAt: new Date().toISOString() };
        localStorage.setItem("pik.waitlist", JSON.stringify(list));
        if (note) note.textContent = "Saved as hash " + h.slice(0, 18) + "… on this device only — your address was never transmitted or stored in plain text.";
        form.reset();
      } else if (note) {
        note.textContent = "Enter an address so we can hash it locally.";
      }
      PIKAnonymity.logActivity("waitlist", form.dataset.product || "pik");
    });
  });
}
