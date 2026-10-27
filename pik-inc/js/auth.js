const PIKAuth = (() => {
  const KEY_ACCOUNTS = "pik.accounts";
  const KEY_SESSION = "pik.session";

  function readAccounts() {
    try { return JSON.parse(localStorage.getItem(KEY_ACCOUNTS)) || {}; }
    catch (e) { return {}; }
  }

  function writeAccounts(a) {
    localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(a));
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(KEY_SESSION)); }
    catch (e) { return null; }
  }

  async function signup(handle, email, password) {
    const accounts = readAccounts();
    const h = handle.trim().toLowerCase();
    if (!h) throw new Error("Pick a handle.");
    if (accounts[h]) throw new Error("That handle already exists on this device.");
    if (password.length < 8) throw new Error("Password needs at least 8 characters.");
    const salt = await PIKCrypto.makeSalt(16);
    const pwHash = await PIKCrypto.hashPassword(password, salt);
    const emailHash = email ? await PIKCrypto.sha256("pik-email:" + email.trim().toLowerCase()) : "";
    accounts[h] = {
      handle: h,
      salt,
      pwHash,
      emailHash,
      createdAt: new Date().toISOString()
    };
    writeAccounts(accounts);
    localStorage.removeItem("pik.lastEmail." + h);
    return startSession(h, email);
  }

  async function login(handle, email, password) {
    const accounts = readAccounts();
    const h = handle.trim().toLowerCase();
    const acct = accounts[h];
    if (!acct) throw new Error("No local account for that handle.");
    const test = await PIKCrypto.hashPassword(password, acct.salt);
    if (test !== acct.pwHash) throw new Error("Incorrect password.");
    let emailOk = true;
    if (email && acct.emailHash) {
      const eh = await PIKCrypto.sha256("pik-email:" + email.trim().toLowerCase());
      emailOk = eh === acct.emailHash;
    } else if (email && !acct.emailHash) {
      acct.emailHash = await PIKCrypto.sha256("pik-email:" + email.trim().toLowerCase());
      writeAccounts(accounts);
    }
    if (!emailOk) throw new Error("Email hash does not match this account.");
    return startSession(h, email);
  }

  async function startSession(handle, email) {
    const alias = await PIKCrypto.sha256("session:" + handle + ":" + Date.now() + ":" + Math.random());
    const session = {
      handle,
      sessionHash: alias,
      maskedIdentity: PIKCrypto.maskEmail(email || handle),
      startedAt: new Date().toISOString()
    };
    localStorage.setItem(KEY_SESSION, JSON.stringify(session));
    if (window.PIKAnonymity) PIKAnonymity.logActivity("auth", "session-opened");
    return session;
  }

  function logout() {
    localStorage.removeItem(KEY_SESSION);
    if (window.PIKAnonymity) PIKAnonymity.logActivity("auth", "session-closed");
  }

  function bindForm(form, mode) {
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const errEl = form.querySelector(".field__error");
      if (errEl) errEl.textContent = "";
      const btn = form.querySelector('button[type="submit"]');
      const fd = new FormData(form);
      const handle = fd.get("handle") || "";
      const email = fd.get("email") || "";
      const pw = fd.get("password") || "";
      if (btn) { btn.disabled = true; btn.classList.add("is-busy"); }
      try {
        let session;
        if (mode === "signup") {
          const confirm = fd.get("confirm") || "";
          if (pw !== confirm) throw new Error("Passwords do not match.");
          session = await signup(handle, email, pw);
        } else {
          session = await login(handle, email, pw);
        }
        PIKToasts.show({
          type: "success",
          title: "Signed in as " + session.handle,
          text: "Your credentials were hashed with PBKDF2-SHA256 and stored only in this browser's local storage. No email leaves your device."
        });
        setTimeout(() => { location.reload(); }, 900);
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
        PIKToasts.show({ type: "warn", title: "Could not sign in", text: err.message });
      } finally {
        if (btn) { btn.disabled = false; btn.classList.remove("is-busy"); }
      }
    });
  }

  function strengthOf(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
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
    const s = getSession();
    if (!el) return;
    if (s) {
      el.innerHTML = '<span class="dot-live"></span><span>' + s.handle + "</span>";
      el.classList.add("is-active");
    } else {
      el.textContent = "Anonymous · " + (PIKAnonymity ? "" : "");
      el.classList.remove("is-active");
    }
  }

  function renderAvatar(el) {
    const s = getSession();
    if (!el) return;
    if (!s) { el.textContent = "∅"; return; }
    PIKCrypto.sha256(s.handle).then(h => {
      el.textContent = s.handle.slice(0, 2).toUpperCase();
      el.setAttribute("data-hash", h.slice(0, 16));
    });
  }

  return { signup, login, logout, getSession, bindForm, bindStrength, renderSessionChip, renderAvatar, strengthOf };
})();
