const PIKToasts = (() => {
  let stack = null;

  function getStack() {
    if (!stack) {
      stack = document.querySelector(".toast-stack");
      if (!stack) {
        stack = document.createElement("div");
        stack.className = "toast-stack";
        stack.setAttribute("aria-live", "polite");
        document.body.appendChild(stack);
      }
    }
    return stack;
  }

  const ICONS = {
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l9 17H3z"/><path d="M12 10v4M12 17v.5"/></svg>',
    feature: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.1 5.4L20 9.6l-4.4 3.4 1.3 5.7L12 15.9l-4.9 2.8 1.3-5.7L4 9.6l5.9-1.2z"/></svg>'
  };

  function dismiss(el) {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 380);
  }

  function show(opts) {
    const o = Object.assign({ type: "info", title: "", text: "", actions: [], timeout: 6000, sticky: false }, opts);
    const el = document.createElement("div");
    el.className = "toast toast--" + o.type;
    el.setAttribute("role", "status");

    const icon = document.createElement("span");
    icon.className = "toast__icon";
    icon.innerHTML = ICONS[o.type] || ICONS.info;

    const body = document.createElement("div");
    body.className = "toast__body";
    const title = document.createElement("div");
    title.className = "toast__title";
    title.textContent = o.title;
    const text = document.createElement("div");
    text.className = "toast__text";
    text.textContent = o.text;
    body.appendChild(title);
    body.appendChild(text);

    el.appendChild(icon);
    el.appendChild(body);

    if (o.actions && o.actions.length) {
      const acts = document.createElement("div");
      acts.className = "toast__actions";
      o.actions.forEach(a => {
        const btn = document.createElement("button");
        btn.className = "btn " + (a.primary ? "btn--primary" : "btn--ghost") + " btn--sm";
        btn.textContent = a.label;
        btn.addEventListener("click", () => { if (a.onClick) a.onClick(); dismiss(el); });
        acts.appendChild(btn);
      });
      el.appendChild(acts);
    }

    const close = document.createElement("button");
    close.className = "toast__dismiss icon-btn";
    close.setAttribute("aria-label", "Dismiss notification");
    close.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    close.addEventListener("click", () => dismiss(el));
    el.appendChild(close);

    getStack().appendChild(el);
    if (!o.sticky && o.timeout > 0) setTimeout(() => { if (el.isConnected) dismiss(el); }, o.timeout);
    return el;
  }

  return { show: show, push: function (text, type) { return show({ type: type || "info", text: text }); } };
})();

/* window-references for sandboxed/strict loading + back-compat alias */
if (typeof window !== "undefined") {
  window.PIKToasts = PIKToasts;
  window.Toast = PIKToasts;
}

const PIKWireless = (() => {
  const KEY = "pik.feature.wireless.seen";

  function maybeAnnounce(force) {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch (e) {}
    if (seen && !force) return;
    PIKToasts.show({
      type: "feature",
      sticky: true,
      title: "New · Wireless Communication",
      text: "PIK now pairs directly with nearby devices over Bluetooth instead of routing through cellular or Wi-Fi data — messages hop device-to-device on an encrypted mesh. The only trade-off is range: both devices need to stay within Bluetooth distance for the link to hold.",
      actions: [
        { label: "Try it", primary: true, onClick: () => { location.href = pageRoot() + "wireless-communication.html"; } },
        { label: "Later" }
      ]
    });
    try { localStorage.setItem(KEY, "1"); } catch (e) {}
    if (window.PIKAnonymity) PIKAnonymity.logActivity("feature-view", "wireless-communication");
  }

  function pageRoot() {
    return document.body.getAttribute("data-root") || "./";
  }

  return { maybeAnnounce };
})();

if (typeof window !== "undefined") {
  window.PIKWireless = PIKWireless;
}
