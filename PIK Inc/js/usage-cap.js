/* ============================================================================
   PIK//NEXUS — usage-cap.js
   The AI skill cap: a rolling daily budget for every remote inference call.
   - counts each chat completion (remote engines only; the on-device
     MicroEngine is unmetered because it costs nothing and leaks nothing)
   - persists timestamps in localStorage so reloads can't reset the cap
   - PIKUsage.gate() is consulted by PIKRouter before any network hop; when
     the cap is hit the router routes to the local core (if enabled) or shows
     an honest "skill cap reached" message with the reset countdown
   - exposes a small meter API used by the status bar + settings drawer
   ========================================================================= */
(function (global) {
  "use strict";

  var KEY = "pik.nexus.usage.day";
  var CAP = 60; // calls per rolling day — generous for :free tiers, stops abuse

  function dayStamp(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && Array.isArray(raw.t) && raw.d === dayStamp(Date.now())) return raw.t;
    } catch (e) {}
    return [];
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ d: dayStamp(Date.now()), t: list }));
    } catch (e) {}
  }

  var Usage = {
    _t: load(),

    total: function () { return this._t.length; },
    cap: function () { return CAP; },
    left: function () { return Math.max(0, CAP - this._t.length); },

    /* next midnight = reset point */
    resetsInMs: function () {
      var now = new Date();
      var nxt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      return nxt.getTime() - now.getTime();
    },
    resetsIn: function () {
      var ms = this.resetsInMs();
      var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
      return h + "h " + String(m).padStart(2, "0") + "m";
    },

    allowed: function () {
      this._t = load();
      return this._t.length < CAP;
    },

    record: function (engine) {
      this._t = load();
      if (engine === "local-micro") return true; // on-device is unmetered
      this._t.push(Date.now());
      save(this._t);
      document.dispatchEvent(new CustomEvent("pik:usage", {
        detail: { used: this._t.length, cap: CAP }
      }));
      return this._t.length <= CAP;
    },

    /* human-readable line for terminal `usage` + status tooltips */
    summary: function () {
      return this.total() + "/" + CAP + " calls today · resets in " + this.resetsIn();
    }
  };

  global.PIKUsage = Usage;
})(window);
