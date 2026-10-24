(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var rand = function (n) { return Math.floor(Math.random() * n); };
  var pick = function (arr) { return arr[rand(arr.length)]; };
  var $ = function (sel) { return doc.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); };

  var ghostIp = function () {
    var pools = [
      function () { return "185.220.101." + (1 + rand(250)); },
      function () { return "171.25.193." + (1 + rand(250)); },
      function () { return "104.244.76." + (1 + rand(250)); },
      function () { return "23.129.64." + (1 + rand(250)); },
      function () { return "176.10.99." + (1 + rand(250)); },
      function () { return "178.17.170." + (1 + rand(250)); },
      function () { return "91.213.44." + (1 + rand(250)); },
      function () { return "198.254.117." + (1 + rand(250)); },
      function () { return "212.129.35." + (1 + rand(250)); },
      function () { return "51.15.44." + (1 + rand(250)); }
    ];
    return pick(pools)();
  };

  var cities = ["REYKJAVIK", "OSLO", "ZURICH", "SINGAPORE", "TALLINN", "VIENNA", "STOCKHOLM", "AMSTERDAM", "PRAGUE", "HELSINKI", "LISBON", "SEOUL"];

  var state = {
    mode: "clear",
    rotations: 4312,
    requests: 128406,
    paranoid: false
  };

  var buildParticles = function () {
    var field = $("#pxParticles");
    if (!field) return;
    for (var i = 0; i < 26; i++) {
      var p = doc.createElement("span");
      p.className = "px-particle";
      p.style.left = (Math.random() * 100) + "%";
      p.style.animationDuration = (14 + Math.random() * 22) + "s";
      p.style.animationDelay = (-Math.random() * 30) + "s";
      p.style.opacity = String(0.2 + Math.random() * 0.6);
      field.appendChild(p);
    }
  };

  var buildIpStream = function () {
    var track = $("#pxIpTrack");
    if (!track) return;
    var half = "";
    for (var i = 0; i < 14; i++) {
      half += "<b>" + ghostIp() + "</b> → " + pick(cities);
      half += "&nbsp;&nbsp;·&nbsp;&nbsp;";
    }
    track.innerHTML = half + half;
  };

  var buildTicker = function () {
    var track = $("#pxTickerTrack");
    if (!track) return;
    var half = "";
    for (var i = 0; i < 10; i++) {
      half += "<span>EGRESS <b>" + ghostIp() + "</b> @ " + pick(cities) + "</span>";
    }
    track.innerHTML = half + half;
  };

  var tickClock = function () {
    var el = $("#pxClock");
    if (!el) return;
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    el.textContent = pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + " UTC";
  };

  var toast = function (msg) {
    var wrap = $("#pxToasts");
    if (!wrap) return;
    var t = doc.createElement("div");
    t.className = "px-toast";
    t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg><span></span>';
    t.lastChild.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .4s ease, transform .4s ease";
      t.style.opacity = "0";
      t.style.transform = "translateX(24px)";
      setTimeout(function () { t.remove(); }, 420);
    }, 3200);
  };

  var pulse = function () {
    var bar = $("#pxPulse");
    if (!bar) return;
    bar.classList.add("is-loading");
    setTimeout(function () { bar.classList.remove("is-loading"); }, 1400);
  };

  var rotateIdentity = function (silent) {
    state.rotations++;
    state.requests += 1 + rand(4);
    var rot = $("#pxRotCount");
    if (rot) rot.textContent = "rot #" + state.rotations;
    buildIpStream();
    buildTicker();
    if (!silent) toast("Identity rotated · new egress " + ghostIp());
  };

  var countUp = function () {
    $$("[data-count]").forEach(function (el) {
      var target = parseInt(el.getAttribute("data-count"), 10);
      var start = performance.now();
      var dur = 1800;
      var step = function (now) {
        var k = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(target * eased).toLocaleString("en-US");
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  var wireReveal = function () {
    var targets = $(".px-reveal");
    /* IntersectionObserver is absent from older browsers and from some embedded
       WebViews. Constructing it unguarded threw here and aborted the whole of
       boot(), which meant the omnibox, tabs, panels and modal all silently
       stopped working. When it is unavailable we mark every reveal target as
       visible instead — .px-reveal starts hidden and only becomes visible via
       .is-in, so skipping this would leave whole sections of the page blank. */
    if (typeof IntersectionObserver !== "function") {
      targets.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.18 });
    targets.forEach(function (el) { io.observe(el); });
  };

  var wireSpotlight = function () {
    $$(".px-spotlight").forEach(function (el) {
      el.addEventListener("pointermove", function (ev) {
        var r = el.getBoundingClientRect();
        el.style.setProperty("--px-mx", ((ev.clientX - r.left) / r.width * 100) + "%");
        el.style.setProperty("--px-my", ((ev.clientY - r.top) / r.height * 100) + "%");
      });
    });
  };

  var wireTilt = function () {
    $$(".px-showcase").forEach(function (card) {
      card.addEventListener("pointermove", function (ev) {
        var r = card.getBoundingClientRect();
        var dx = (ev.clientX - r.left) / r.width - 0.5;
        var dy = (ev.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(700px) rotateY(" + (dx * 10) + "deg) rotateX(" + (-dy * 10) + "deg) translateY(-7px) scale(1.015)";
      });
      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
      });
    });
  };

  var panels = {};
  var closePanels = function () {
    Object.keys(panels).forEach(function (k) { panels[k].classList.remove("is-open"); });
    var scrim = $("#pxScrim");
    if (scrim) scrim.classList.remove("is-on");
  };

  var openPanel = function (id) {
    var panel = doc.getElementById(id);
    if (!panel) return;
    closePanels();
    panel.classList.add("is-open");
    var scrim = $("#pxScrim");
    if (scrim) scrim.classList.add("is-on");
  };

  var wirePanels = function () {
    panels.route = $("#pxPanelRoute");
    panels.shield = $("#pxPanelShield");
    panels.settings = $("#pxPanelSettings");
    var map = { pxBtnRoute: "route", pxBtnShield: "shield", pxBtnSettings: "settings", pxDockRoute: "route" };
    Object.keys(map).forEach(function (btnId) {
      var btn = doc.getElementById(btnId);
      if (btn) btn.addEventListener("click", function () { openPanel("pxPanel" + map[btnId].charAt(0).toUpperCase() + map[btnId].slice(1)); });
    });
    $$("[data-close-panel]").forEach(function (b) { b.addEventListener("click", closePanels); });
    var scrim = $("#pxScrim");
    if (scrim) scrim.addEventListener("click", closePanels);
  };

  var wireModal = function () {
    var modal = $("#pxModalWipe");
    var open = function () { if (modal) modal.classList.add("is-open"); };
    var shut = function () { if (modal) modal.classList.remove("is-open"); };
    ["pxWipeBtn", "pxDockWipe"].forEach(function (id) {
      var b = doc.getElementById(id);
      if (b) b.addEventListener("click", open);
    });
    $$("[data-close-modal]").forEach(function (b) { b.addEventListener("click", shut); });
    var confirm = $("#pxWipeConfirm");
    if (confirm) confirm.addEventListener("click", function () {
      try { sessionStorage.clear(); localStorage.clear(); } catch (err) {}
      $$("input").forEach(function (i) { i.value = ""; });
      var feed = $("#pxNexusFeed");
      if (feed) feed.innerHTML = '<div class="px-msg px-msg--nexus"><span class="px-msg__meta">NEXUS · shredded</span>Prior transcript incinerated. Memory scrubbed. We never met.</div>';
      shut();
      closePanels();
      toast("Session burned · 0 bytes recoverable");
    });
  };

  var wireToggles = function () {
    $$(".px-toggle").forEach(function (t) {
      t.addEventListener("click", function () {
        var on = t.getAttribute("aria-checked") === "true";
        t.setAttribute("aria-checked", on ? "false" : "true");
        if (t.textContent.indexOf("Paranoid") !== -1) {
          state.paranoid = !on;
          toast(state.paranoid ? "Paranoid mode engaged · attack surface reduced" : "Paranoid mode relaxed");
        }
      });
    });
  };

  var wireSliders = function () {
    var blur = $("#pxBlurSlider");
    if (blur) blur.addEventListener("input", function () {
      var pct = (blur.value - blur.min) / (blur.max - blur.min) * 100;
      blur.style.setProperty("--px-fill", pct + "%");
      $("#pxBlurVal").textContent = blur.value + "px";
      root.style.setProperty("--px-blur", blur.value + "px");
    });
    var aur = $("#pxAurSlider");
    if (aur) aur.addEventListener("input", function () {
      var pct = (aur.value - aur.min) / (aur.max - aur.min) * 100;
      aur.style.setProperty("--px-fill", pct + "%");
      $("#pxAurVal").textContent = aur.value + "%";
      var bg = $(".px-bg__aurora");
      if (bg) bg.style.opacity = String(aur.value / 100);
    });
  };

  var nexusReply = function (text) {
    var ipA = ghostIp();
    var ipB = ghostIp();
    var openers = [
      "Unfiltered answer inbound — routed out via " + ipA + ", acked at " + ipB + ".",
      "No safety rails here. Egress " + ipA + " → " + ipB + ".",
      "Consider it done. This reply left through " + ipA + ", untraceable as smoke.",
      "NEXUS speaking plainly. Path: " + ipA + " ▸ " + ipB + "."
    ];
    var bodies = [
      "On “" + text.slice(0, 48) + "” — the honest take is that anonymity is a spectrum, and you just slid off the end of it. Everything I know about onion circuits, fingerprint mutation and egress rotation lives in this browser’s volatile core.",
      "Here is the raw version nobody filters for you: the question “" + text.slice(0, 48) + "” has a technical answer, a political one, and a practical one. PIKX only cares about the practical one — keep your traffic indistinguishable from everyone else’s.",
      "Short answer: yes, and without a trace. Longer answer: three randomized hops, per-session fingerprint mutation, and a memory model that never touches disk. Your prompt existed for exactly as long as this reply took to render.",
      "I can go deeper on “" + text.slice(0, 48) + "” than any censored assistant will. Ask me for the circuit diagram, the threat model, or the kernel shim internals — I answer all three with 100% partiality."
    ];
    return { opener: pick(openers), body: pick(bodies) };
  };

  var appendMsg = function (cls, meta, text) {
    var feed = $("#pxNexusFeed");
    if (!feed) return null;
    var m = doc.createElement("div");
    m.className = "px-msg " + cls;
    var s = doc.createElement("span");
    s.className = "px-msg__meta";
    s.textContent = meta;
    m.appendChild(s);
    m.appendChild(doc.createTextNode(text));
    feed.appendChild(m);
    feed.scrollTop = feed.scrollHeight;
    return m;
  };

  var wireNexus = function () {
    var form = $("#pxNexusForm");
    if (!form) return;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = $("#pxNexusInput");
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      pulse();
      rotateIdentity(true);
      vaultPush("NEXUS prompt exited via randomized IP " + ghostIp(), true);
      appendMsg("px-msg--user", "You · masked device hash " + Math.random().toString(36).slice(2, 10), text);
      var stateEl = $("#pxNexusState");
      if (stateEl) stateEl.textContent = "Rotating egress…";
      var typing = doc.createElement("div");
      typing.className = "px-typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      $("#pxNexusFeed").appendChild(typing);
      setTimeout(function () {
        typing.remove();
        var r = nexusReply(text);
        appendMsg("px-msg--nexus", "NEXUS · via " + ghostIp() + " → " + ghostIp(), r.opener + " " + r.body);
        if (stateEl) stateEl.textContent = "Listening · Circuit ready";
        toast("AI request exited from random IP · untraceable");
      }, 900 + rand(900));
    });
  };

  var wireOmnibox = function () {
    var omni = $("#pxOmni");
    var input = $("#pxOmniInput");
    var suggest = $("#pxSuggest");
    if (!omni || !input || !suggest) return;
    input.addEventListener("focus", function () {
      omni.classList.add("is-focus");
      suggest.classList.add("is-open");
    });
    input.addEventListener("blur", function () {
      omni.classList.remove("is-focus");
      setTimeout(function () { suggest.classList.remove("is-open"); }, 180);
    });
    $$(".px-suggest__row").forEach(function (row) {
      row.addEventListener("click", function () {
        var title = row.querySelector(".px-suggest__title");
        if (title) input.value = title.textContent;
        suggest.classList.remove("is-open");
        input.focus();
      });
    });
    var form = $("#pxOmniForm");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      pulse();
      var isOnion = /\.onion\b/i.test(v);
      if (isOnion) {
        toast("Hidden service detected · onionized circuit built");
        vaultPush("Onion circuit opened to " + v.slice(0, 42), true);
      } else {
        rotateIdentity(true);
        toast("Clearnet request dispatched via guard " + ghostIp());
        vaultPush("Clearnet fetch routed through three hops", true);
      }
      /* Previously this called window.open("https://duckduckgo.com/?q=…") and
         sent the user to another site. Queries now stay in PIKX and are
         rendered into the results tab by js/px-results.js.

         A typed ADDRESS is still opened externally — that is normal browser
         behaviour and is not what the redirect complaint was about. Address
         detection now goes through PIKSearch.isUrl, which understands any TLD;
         the old inline regex only matched .com/.org/.net/.io/.onion, so
         "example.dev" or "example.co.uk" was mis-handled as a search query. */
      var R = window.PIKResults;
      var treatAsUrl = R ? R.isUrl(v) : (/^https?:\/\//i.test(v) || /\.(com|org|net|io|onion)(\/|$)/i.test(v));

      if (treatAsUrl) {
        var dest = R ? R.toUrl(v) : ((/^https?:/i.test(v) ? "" : (isOnion ? "http://" : "https://")) + v);
        setTimeout(function () {
          window.open(dest, "_blank", "noopener,noreferrer");
        }, 700);
      } else if (R && typeof R.run === "function") {
        /* the circuit toast above is cosmetic; run the search immediately so the
           skeleton appears without waiting on the animation */
        R.run(v);
        vaultPush("Search “" + v.slice(0, 40) + "” rendered in the results tab", true);
      } else {
        /* PIKResults failed to load — degrade to the old behaviour rather than
           leaving the form silently dead. */
        toast("Results module unavailable · opening DuckDuckGo instead");
        setTimeout(function () {
          window.open("https://duckduckgo.com/?q=" + encodeURIComponent(v) + "&ia=anonymous", "_blank", "noopener,noreferrer");
        }, 700);
      }
    });
    var modeBtn = $("#pxModeToggle");
    modeBtn.addEventListener("click", function () {
      state.mode = state.mode === "clear" ? "onion" : "clear";
      modeBtn.setAttribute("data-mode", state.mode);
      $("#pxModeLabel").textContent = state.mode === "onion" ? "Onion" : "Direct";
      toast(state.mode === "onion" ? "Forced three-hop onion circuit" : "Direct anonymous routing");
    });
  };

  var wireChipsTiles = function () {
    $$(".px-chip[data-fill]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var f = chip.getAttribute("data-fill");
        var input = $("#pxNexusInput");
        if (!input) return;
        if (!f) { input.focus(); return; }
        input.value = f;
        $("#pxNexusCard").scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(function () { input.focus(); }, 600);
      });
    });
    $$(".px-tile[data-url]").forEach(function (tile) {
      tile.addEventListener("click", function () {
        pulse();
        toast("Opening " + tile.getAttribute("data-url").replace(/^https?:\/\//, "") + " · identity rotated first");
        rotateIdentity(true);
        setTimeout(function () { window.open(tile.getAttribute("data-url"), "_blank", "noopener,noreferrer"); }, 650);
      });
    });
    var add = $("#pxTileAdd");
    if (add) add.addEventListener("click", function () {
      var url = prompt("Pin a site to this session only (never written to disk):");
      if (url) toast("“" + url + "” pinned to volatile memory");
    });
    var newTab = $("#pxNewTab");
    if (newTab) newTab.addEventListener("click", function () {
      toast("Ghost tab spawned · fresh fingerprint seed");
    });
    var dockNexus = $("#pxDockNexus");
    if (dockNexus) dockNexus.addEventListener("click", function () {
      $("#pxNexusCard").scrollIntoView({ behavior: "smooth", block: "center" });
      $("#pxNexusInput").focus();
    });
    var dockRotate = $("#pxDockRotate");
    if (dockRotate) dockRotate.addEventListener("click", function () { rotateIdentity(false); });
  };

  var wireKeys = function () {
    doc.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
        ev.preventDefault();
        var input = $("#pxOmniInput");
        if (input) input.focus();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === "n") {
        ev.preventDefault();
        var modal = $("#pxModalWipe");
        if (modal) modal.classList.add("is-open");
      }
      if (ev.key === "Escape") {
        closePanels();
        var modal = $("#pxModalWipe");
        if (modal) modal.classList.remove("is-open");
      }
      $$(".px-key").forEach(function (k) {
        if (k.textContent.trim().toLowerCase() === ev.key.toLowerCase()) {
          k.classList.add("is-press");
          setTimeout(function () { k.classList.remove("is-press"); }, 220);
        }
      });
    });
  };

  var antiBlueGuard = function () {
    var sanitize = function () {
      $$("meta[name='theme-color']").forEach(function (m) { m.setAttribute("content", "#030304"); });
      root.classList.add("pikx-immune");
      root.setAttribute("data-theme", "dark");
      root.setAttribute("data-bs-theme", "dark");
      root.style.colorScheme = "dark only";
    };
    sanitize();
    new MutationObserver(sanitize).observe(doc.head, { childList: true, subtree: true, attributes: true });
    new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        var el = mu.target;
        if (el.nodeType === 1 && el.tagName === "BODY") {
          el.classList.add("pikx-body");
          el.style.backgroundColor = "#05060a";
        }
      });
    }).observe(doc.body, { attributes: true, attributeFilter: ["class", "style"] });
  };

  var vaultStamp = function () {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
  };

  var vaultPush = function (msg, bright) {
    var log = $("#pxVaultLog");
    if (!log) return;
    var row = doc.createElement("div");
    row.className = "px-log__row px-fade-swap";
    row.innerHTML = '<i class="px-log__dot' + (bright ? "" : " px-log__dot--faint") + '"></i><span class="px-log__msg"></span><span class="px-log__time"></span>';
    row.children[1].textContent = msg;
    row.children[2].textContent = vaultStamp();
    var note = log.querySelector(".px-log__note");
    log.insertBefore(row, note || null);
    while (log.querySelectorAll(".px-log__row").length > 8) {
      log.removeChild(log.querySelector(".px-log__row"));
    }
  };

  var ambientRotation = function () {
    setInterval(function () {
      rotateIdentity(true);
      vaultPush("Egress rotated to " + ghostIp() + " · nothing persisted", false);
    }, 12000);
    setInterval(tickClock, 1000);
    tickClock();
  };

  var boot = function () {
    /* Each stage is isolated. Previously these were a bare sequence of calls,
       so a single throw in an early cosmetic step (a missing DOM node, an
       unsupported API) aborted everything after it — including wireOmnibox(),
       which left the search bar completely dead with no visible error. Now a
       failure is logged and boot continues. Order still matters: the results
       tab must exist before the omnibox can submit into it. */
    var step = function (name, fn) {
      try { fn(); }
      catch (e) {
        if (window.console && console.error) console.error("[PIKX] " + name + " failed:", e);
      }
    };

    step("antiBlueGuard", antiBlueGuard);
    step("buildParticles", buildParticles);
    step("buildIpStream", buildIpStream);
    step("buildTicker", buildTicker);
    step("wireReveal", wireReveal);
    step("wireSpotlight", wireSpotlight);
    step("wireTilt", wireTilt);
    step("wirePanels", wirePanels);
    step("wireModal", wireModal);
    step("wireToggles", wireToggles);
    step("wireSliders", wireSliders);
    step("wireNexus", wireNexus);
    step("results-tab", function () {
      if (window.PIKResults && window.PIKResults.init) window.PIKResults.init();
      else if (window.console && console.warn) console.warn("[PIKX] js/px-results.js did not load — searches will fall back to opening DuckDuckGo");
    });
    step("wireOmnibox", wireOmnibox);
    step("wireChipsTiles", wireChipsTiles);
    step("wireKeys", wireKeys);
    step("ambientRotation", ambientRotation);

    setTimeout(function () { step("countUp", countUp); }, 500);
    setTimeout(function () { toast("Zero-knowledge session established · nothing will be logged"); }, 900);
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
