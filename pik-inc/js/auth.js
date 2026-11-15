const PIKAuth = (() => {
  const KEY_ACCOUNTS = "pik.accounts";
  const KEY_SESSION = "pik.session";

  function readAccounts() {
    try {
      return JSON.parse(localStorage.getItem(KEY_ACCOUNTS) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function writeAccounts(a) {
    try {
      localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(a));
    } catch (e) {
      throw new Error("Local storage is disabled or full in this browser.");
    }
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(KEY_SESSION) || "null");
    } catch (e) {
      return null;
    }
  }

  function normalizeHandle(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function validateEmail(raw) {
    const e = String(raw || "").trim();
    if (!e) return "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      throw new Error("Enter a valid email address or leave the optional email blank.");
    }
    return e.toLowerCase();
  }

  async function signup(handle, email, password) {
    const accounts = readAccounts();
    const h = normalizeHandle(handle);
    if (!h) throw new Error("Pick a handle.");
    if (h.length < 2 || h.length > 32) throw new Error("Handle must be between 2 and 32 characters.");
    if (!/^[a-z0-9._-]+$/.test(h)) {
      throw new Error("Handle may only use letters, numbers, dots, hyphens, or underscores.");
    }
    if (accounts[h]) throw new Error("That handle already exists on this device.");
    const pw = String(password ?? "");
    if (pw.length < 8) throw new Error("Password needs at least 8 characters.");
    const cleanEmail = validateEmail(email);

    const salt = await PIKCrypto.makeSalt(16);
    const pwHash = await PIKCrypto.hashPassword(pw, salt);
    const emailHash = cleanEmail ? await PIKCrypto.sha256("pik-email:" + cleanEmail) : "";
    accounts[h] = {
      handle: h,
      salt,
      pwHash,
      emailHash,
      createdAt: new Date().toISOString()
    };
    writeAccounts(accounts);
    try {
      localStorage.removeItem("pik.lastEmail." + h);
    } catch (e) {}
    return startSession(h, cleanEmail);
  }

  async function login(handle, email, password) {
    const accounts = readAccounts();
    const h = normalizeHandle(handle);
    if (!h) throw new Error("Enter your handle.");
    const acct = accounts[h];
    if (!acct) throw new Error("No local account found for @" + h + " on this device.");
    const pw = String(password ?? "");
    if (!pw) throw new Error("Enter your password.");
    const test = await PIKCrypto.hashPassword(pw, acct.salt);
    if (test !== acct.pwHash) throw new Error("Incorrect password.");

    const cleanEmail = validateEmail(email);
    let emailOk = true;
    if (cleanEmail && acct.emailHash) {
      const eh = await PIKCrypto.sha256("pik-email:" + cleanEmail);
      emailOk = eh === acct.emailHash;
    } else if (cleanEmail && !acct.emailHash) {
      acct.emailHash = await PIKCrypto.sha256("pik-email:" + cleanEmail);
      writeAccounts(accounts);
    }
    if (!emailOk) throw new Error("Email hash does not match this account.");
    return startSession(h, cleanEmail);
  }

  async function startSession(handle, email) {
    const alias = await PIKCrypto.sha256("session:" + handle + ":" + Date.now() + ":" + Math.random());
    const session = {
      handle,
      sessionHash: alias,
      maskedIdentity: PIKCrypto.maskEmail(email || handle),
      startedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(KEY_SESSION, JSON.stringify(session));
    } catch (e) {
      throw new Error("Could not store local session in this browser.");
    }
    if (window.PIKAnonymity) PIKAnonymity.logActivity("auth", "session-opened");
    document.dispatchEvent(new CustomEvent("pik:authchange", { detail: { session } }));
    return session;
  }

  function logout() {
    try {
      localStorage.removeItem(KEY_SESSION);
    } catch (e) {}
    if (window.PIKAnonymity) PIKAnonymity.logActivity("auth", "session-closed");
    document.dispatchEvent(new CustomEvent("pik:authchange", { detail: { session: null } }));
  }

  function bindForm(form, mode) {
    if (!form) return;
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const errEl = form.querySelector(".field__error");
      if (errEl) errEl.textContent = "";
      const btn = form.querySelector('button[type="submit"]');
      const fd = new FormData(form);
      const handle = fd.get("handle") || "";
      const email = fd.get("email") || "";
      const pw = fd.get("password") || "";
      if (btn) {
        btn.disabled = true;
        btn.classList.add("is-busy");
      }
      try {
        let session;
        if (mode === "signup") {
          const confirm = fd.get("confirm") || "";
          if (pw !== confirm) throw new Error("Passwords do not match.");
          session = await signup(handle, email, pw);
        } else {
          session = await login(handle, email, pw);
        }
        if (window.PIKToasts) {
          PIKToasts.show({
            type: "success",
            title: "Signed in as @" + session.handle,
            text: "Credentials hashed locally and stored only in this browser. No plain-text email or password ever leaves your device."
          });
        }
        const sessionChip = document.querySelector("[data-session-chip]");
        const avatar = document.querySelector(".avatar-hash");
        renderSessionChip(sessionChip);
        renderAvatar(avatar);
        form.reset();
      } catch (err) {
        const msg = (err && err.message) || "Authentication failed.";
        if (errEl) errEl.textContent = msg;
        if (window.PIKToasts) {
          PIKToasts.show({ type: "warn", title: "Could not sign in", text: msg });
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove("is-busy");
        }
      }
    });
  }

  function strengthOf(pw) {
    const val = String(pw || "");
    let s = 0;
    if (val.length >= 8) s++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) s++;
    if (/\d/.test(val)) s++;
    if (/[^A-Za-z0-9]/.test(val)) s++;
    return s;
  }

  function bindStrength(input, barsEl, labelEl) {
    if (!input || !barsEl) return;
    input.addEventListener("input", () => {
      const s = strengthOf(input.value);
      [...barsEl.children].forEach((b, i) => b.classList.toggle("is-on", i < s));
      const labels = ["Empty", "Weak", "Fair", "Strong", "Excellent"];
      if (labelEl) labelEl.textContent = labels[s];
    });
  }

  function renderSessionChip(el) {
    if (!el) return;
    const s = getSession();
    el.innerHTML = "";
    if (s && s.handle) {
      const dot = document.createElement("span");
      dot.className = "dot-live";
      const label = document.createElement("span");
      label.textContent = "@" + s.handle;
      el.appendChild(dot);
      el.appendChild(label);
      el.classList.add("is-active");
    } else {
      el.classList.remove("is-active");
      el.textContent = "Anonymous";
      if (window.PIKAnonymity) {
        PIKAnonymity.ensureIdentity().then(id => {
          if (!getSession() && el.isConnected) {
            el.textContent = "Anonymous · " + id.displayAlias;
          }
        });
      }
    }
  }

  function renderAvatar(el) {
    if (!el) return;
    const s = getSession();
    if (!s || !s.handle) {
      el.textContent = "∅";
      el.removeAttribute("data-hash");
      return;
    }
    el.textContent = s.handle.slice(0, 2).toUpperCase();
    PIKCrypto.sha256(s.handle).then(h => {
      if (el.isConnected) el.setAttribute("data-hash", h.slice(0, 16));
    });
  }

  return {
    signup,
    login,
    logout,
    getSession,
    bindForm,
    bindStrength,
    renderSessionChip,
    renderAvatar,
    strengthOf
  };
})();

if (typeof window !== "undefined") {
  window.PIKAuth = PIKAuth;
}
