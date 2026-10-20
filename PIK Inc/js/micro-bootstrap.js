/* ============================================================================
   PIK//NEXUS — micro-bootstrap.js
   Wires the PIK MicroEngine into the workbench UI:
     - registers "pik/microengine:local" in the model catalog (picker + status)
     - Settings drawer: enable toggle, tier ladder, Boot button + progress bar
     - exposes PIKMicro.bootIfEnabled() called on chat send when routed local
     - keeps a live resident-memory readout for the status pill
   ========================================================================= */
(function (global) {
  "use strict";

  var MICRO_ID = "pik/microengine:local";

  var Micro = {
    id: MICRO_ID,

    registerModel: function () {
      if (!global.PIKModels) return;
      var rec = {
        id: MICRO_ID,
        name: "PIK MicroEngine (on-device)",
        provider: "pik",
        ctx: 1024, maxOut: 240,
        modality: "text->text",
        vision: false, video: false, audio: false,
        reasoning: true, efforts: ["low", "medium", "high", "max"],
        defaultEffort: "medium", mandatoryReasoning: false,
        tools: false,
        desc: "A ~500-600 MB transformer that boots and runs entirely inside this browser tab. No server, no API key, nothing leaves the device. Best at scaffolds, recipes and short plans.",
        logo: null,
        suggested: false,
        local: true
      };
      PIKModels.all.unshift(rec);
      PIKModels.byId[MICRO_ID] = rec;
    },

    bindUI: async function () {
      var loadBtn = document.querySelector("[data-nx='micro-load']");
      var statusEl = document.querySelector("[data-nx='micro-status']");
      var bar = document.querySelector("[data-nx='micro-bar']");
      var ladder = document.querySelector("[data-nx='microsize']");
      var outVal = document.querySelector("[data-out='microsizeval']");
      if (!loadBtn || !statusEl) return;

      var settings = await NexusSettings.get();
      var tier = settings.microTier || "small";

      function paintLadder() {
        if (!ladder) return;
        Array.prototype.forEach.call(ladder.querySelectorAll("button"), function (b) {
          b.classList.toggle("is-on", b.dataset.size === tier);
        });
        if (outVal) outVal.textContent = tier;
      }
      paintLadder();
      if (ladder) {
        ladder.addEventListener("click", async function (e) {
          var b = e.target.closest("button[data-size]");
          if (!b) return;
          tier = b.dataset.size;
          await NexusSettings.patch({ microTier: tier });
          paintLadder();
          if (MicroEngine.ready && MicroEngine.tier !== tier) {
            Micro.setStatus("rebooting…", "warn");
          }
        });
      }

      loadBtn.addEventListener("click", function () {
        Micro.boot(tier, statusEl, bar);
      });

      document.addEventListener("pik:microboot", function (e) {
        var d = e.detail || {};
        if (d.ok) Micro.setStatus("online · " + d.tier + " core", "ok");
        else Micro.setStatus("boot failed: " + (d.error || ""), "bad");
      });

      /* auto-boot when the user enabled it previously and picked it */
      if (settings.localEnabled && PIKPicker.getSelected() === MICRO_ID) {
        Micro.boot(tier, statusEl, bar, true);
      }
    },

    setStatus: function (txt, kind) {
      var el = document.querySelector("[data-nx='micro-status']");
      if (el) { el.textContent = txt; el.dataset.kind = kind || ""; }
    },

    async boot(tier, statusEl, bar, quiet) {
      if (MicroEngine.booting) return;
      if (MicroEngine.ready && MicroEngine.tier === tier) {
        this.setStatus("online · " + tier + " core", "ok");
        return;
      }
      if (bar) { bar.hidden = false; bar.value = 0; }
      this.setStatus(quiet ? "auto-booting…" : "booting…", "warn");
      try {
        await MicroEngine.boot(tier, function (pct, label) {
          if (bar) bar.value = pct;
          if (statusEl) statusEl.textContent = label + " " + pct + "%";
        });
        if (bar) setTimeout(function () { bar.hidden = true; }, 700);
        if (!quiet && global.PIKToasts) {
          PIKToasts.show({ type: "success", title: "Local core online", text: "PIK MicroEngine (" + tier + ") resident — select it in the model picker to route NEXUS through it." });
        }
      } catch (e) {
        if (bar) bar.hidden = true;
        this.setStatus("failed", "bad");
        if (global.PIKToasts) PIKToasts.show({ type: "error", title: "MicroEngine boot failed", text: String(e.message || e).slice(0, 120) });
      }
    },

    isLocalModel: function (id) { return id === MICRO_ID; }
  };

  document.addEventListener("DOMContentLoaded", function () {
    Micro.registerModel();
    Micro.bindUI();
  });

  global.PIKMicro = Micro;
})(window);
