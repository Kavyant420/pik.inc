/* ============================================================================
   PIK//NEXUS — nexus-settings.js
   Persisted app settings (AES-256-GCM at rest via crypto.js) + the Settings
   drawer logic: keys, system prompt for the pollinations fallback, thinking
   default, temperature, privacy toggles.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  var DEFAULTS = {
    model: CFG.SUGGESTED_MODEL,
    thinking: "high",                 // low | medium | high | max
    temperature: 0.7,
    systemPrompt:
      "You are PIK NEXUS, an autonomous agentic coding partner running inside a VS Code-like workbench.\n" +
      "- Think step by step before writing code.\n" +
      "- When you create or modify files, emit fenced blocks with the path on the info string, e.g. ```src/app.js\\ncode\\n``` so the workbench writes them into the project tree.\n" +
      "- Prefer complete, runnable code over snippets.\n" +
      "- Never reveal secrets or environment contents.",
    polliModel: CFG.POLLINATIONS_DEFAULT_MODEL, // best free reasoning model on pollinations
    showReasoningByDefault: true,
    auditLedger: true,
    orAppUrl: "",
    autoPushBranchPrefix: "pik-nexus/"
  };

  var Settings = {
    _cache: null,

    async get() {
      if (this._cache) return this._cache;
      var saved = await PIKCrypto.SecureStore.get(CFG.LS.SETTINGS);
      this._cache = Object.assign({}, DEFAULTS, saved || {});
      return this._cache;
    },

    async patch(partial) {
      var cur = await this.get();
      this._cache = Object.assign({}, cur, partial);
      await PIKCrypto.SecureStore.set(CFG.LS.SETTINGS, this._cache);
      document.dispatchEvent(new CustomEvent("pik:settings", { detail: this._cache }));
      return this._cache;
    },

    async reset() {
      this._cache = Object.assign({}, DEFAULTS);
      await PIKCrypto.SecureStore.set(CFG.LS.SETTINGS, this._cache);
      return this._cache;
    },

    /* ---------- key management ---------- */
    async setKey(which, value) {
      var name = which === "github" ? CFG.LS.KEY_GH : CFG.LS.KEY_OR;
      var clean = (value || "").trim();
      await PIKCrypto.saveSecret(name, clean || null);
      document.dispatchEvent(new CustomEvent("pik:keys", { detail: { which: which, set: !!clean } }));
      return !!clean;
    },
    async hasKey(which) {
      var name = which === "github" ? CFG.LS.KEY_GH : CFG.LS.KEY_OR;
      var v = PIKCrypto.peekSecret(name);
      if (v !== null) return !!v;
      v = await PIKCrypto.loadSecret(name);
      return !!v;
    },
    async keyFingerprint(which) {
      var name = which === "github" ? CFG.LS.KEY_GH : CFG.LS.KEY_OR;
      var v = await PIKCrypto.loadSecret(name);
      if (!v) return null;
      var d = await PIKCrypto.sha256(v);
      return d.slice(0, 8) + "\u2026" + d.slice(-4); // show digest, never the key
    },

    /* ---------- bind the settings drawer ---------- */
    bindDrawer(root) {
      var self = this;
      function $(sel) { return root.querySelector(sel); }

      this.get().then(function (s) {
        var sp = $("[data-set='systemPrompt']"); if (sp) sp.value = s.systemPrompt;
        var pm = $("[data-set='polliModel']"); if (pm) pm.value = s.polliModel;
        var tp = $("[data-set='temperature']");
        if (tp) {
          tp.value = s.temperature;
          var out = $("[data-out='tempval']"); if (out) out.textContent = Number(s.temperature).toFixed(2);
        }
        var sr = $("[data-set='showReasoning']"); if (sr) sr.checked = s.showReasoningByDefault;
        var au = $("[data-set='audit']"); if (au) au.checked = s.auditLedger;
      });

      root.addEventListener("input", function (ev) {
        var t = ev.target, k = t.getAttribute("data-set");
        if (!k) return;
        var patch = {};
        if (t.type === "checkbox") patch[k === "showReasoning" ? "showReasoningByDefault" : k] = t.checked;
        else if (t.type === "range") {
          patch[k] = parseFloat(t.value);
          var o = $("[data-out='tempval']"); if (o) o.textContent = t.value;
        } else patch[k] = t.value;
        self.patch(patch);
      });

      /* API key fields: write-through to encrypted storage, masked display */
      var orInput = $("[data-key='openrouter']");
      var ghInput = $("[data-key='github']");
      if (orInput) orInput.addEventListener("change", async function () {
        await self.setKey("openrouter", orInput.value);
        orInput.value = "";
        orInput.placeholder = "stored \u2014 fingerprint " + (await self.keyFingerprint("openrouter") || "none");
      });
      if (ghInput) ghInput.addEventListener("change", async function () {
        await self.setKey("github", ghInput.value);
        ghInput.value = "";
        ghInput.placeholder = "stored \u2014 fingerprint " + (await self.keyFingerprint("github") || "none");
      });

      var wipe = $("[data-action='wipe-keys']");
      if (wipe) wipe.addEventListener("click", async function () {
        await self.setKey("openrouter", "");
        await self.setKey("github", "");
        PIKCrypto.lockSecrets();
        if (global.Toast) Toast.push("All secrets wiped from device", "warn");
      });
    }
  };

  global.NexusSettings = Settings;
})(window);
