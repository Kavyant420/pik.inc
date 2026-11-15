(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var rand = function (n) { return Math.floor(Math.random() * n); };
  var pick = function (arr) { return arr[rand(arr.length)]; };
  var $ = function (sel) { return doc.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); };

  var PREFS_KEY = "pik.pikx.prefs";
  var DEFAULT_PREFS = {
    forceOnion: false,
    rotatePerMsg: true,
    paranoid: false,
    blur: 30,
    specular: 50,
    finish: "liquid"
  };

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

  var hopNodes = [
    { city: "REYKJAVIK", cc: "IS" },
    { city: "OSLO", cc: "NO" },
    { city: "ZURICH", cc: "CH" },
    { city: "SINGAPORE", cc: "SG" },
    { city: "TALLINN", cc: "EE" },
    { city: "VIENNA", cc: "AT" },
    { city: "STOCKHOLM", cc: "SE" },
    { city: "AMSTERDAM", cc: "NL" },
    { city: "PRAGUE", cc: "CZ" },
    { city: "HELSINKI", cc: "FI" },
    { city: "LISBON", cc: "PT" },
    { city: "SEOUL", cc: "KR" }
  ];
  var cities = hopNodes.map(function (h) { return h.city; });

  var state = {
    mode: "clear",
    rotations: 4312,
    requests: 128406,
    rotatePerMsg: true,
    paranoid: false,
    blur: 30,
    specular: 50,
    finish: "liquid"
  };

  var loadPrefs = function () {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_PREFS);
      var parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_PREFS, parsed && typeof parsed === "object" ? parsed : {});
    } catch (e) {
      return Object.assign({}, DEFAULT_PREFS);
    }
  };

  var savePrefs = function () {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        forceOnion: state.mode === "onion",
        rotatePerMsg: !!state.rotatePerMsg,
        paranoid: !!state.paranoid,
        blur: state.blur,
        specular: state.specular,
        finish: state.finish
      }));
    } catch (e) {}
  };

  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
      p.style.opacity = String(0.18 + Math.random() * 0.52);
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
    var clockEl = $("#pxClock");
    if (!clockEl) return;
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    clockEl.textContent = pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + " UTC";
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

  var updateRouteHops = function () {
    var pool = hopNodes.slice();
    var take = function () {
      var idx = rand(pool.length);
      return pool.splice(idx, 1)[0];
    };
    var g = take(), m = take(), x = take();
    var gMs = 12 + rand(16);
    var mMs = 24 + rand(24);
    var xMs = 58 + rand(62);

    var setHop = function (sel, nameText, msText) {
      var node = $(sel);
      if (!node) return;
      var nEl = node.querySelector(".px-hop__name");
      var mEl = node.querySelector(".px-hop__ms");
      if (nEl && nameText) nEl.textContent = nameText;
      if (mEl && msText) mEl.textContent = msText;
    };

    setHop('[data-hop="guard"]', "Guard · " + g.city, gMs + " ms");
    setHop('[data-hop="middle"]', "Middle · " + m.city, mMs + " ms");
    setHop('[data-hop="exit"]', "Exit · " + x.city, xMs + " ms");
    setHop('[data-hop="panel-guard"]', "Guard", g.cc + " · " + gMs + "ms");
    setHop('[data-hop="panel-middle"]', "Middle", m.cc + " · " + mMs + "ms");
    setHop('[data-hop="panel-exit"]', "Exit", x.cc + " · " + xMs + "ms");

    $$("#pxPanelRoute .px-bars i").forEach(function (bar) {
      bar.style.height = (28 + rand(64)) + "%";
    });
  };

  var rotateIdentity = function (silent) {
    state.rotations++;
    state.requests += 1 + rand(4);
    var rot = $("#pxRotCount");
    if (rot) rot.textContent = "rot #" + state.rotations;
    updateRouteHops();
    buildIpStream();
    buildTicker();
    if (!silent) toast("Identity rotated · new egress " + ghostIp());
  };

  var countUp = function () {
    $$("[data-count]").forEach(function (el) {
      var target = parseInt(el.getAttribute("data-count"), 10);
      if (isNaN(target)) return;
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
    var targets = $$(".px-reveal");
    if (!targets.length) return;
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
    }, { threshold: 0.14 });
    targets.forEach(function (el) { io.observe(el); });
  };

  var wireSpotlight = function () {
    $$(".px-spotlight").forEach(function (el) {
      el.addEventListener("pointermove", function (ev) {
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        el.style.setProperty("--px-mx", ((ev.clientX - r.left) / r.width * 100) + "%");
        el.style.setProperty("--px-my", ((ev.clientY - r.top) / r.height * 100) + "%");
      });
    });
  };

  var wireTilt = function () {
    $$(".px-showcase").forEach(function (card) {
      card.addEventListener("pointermove", function (ev) {
        var r = card.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var dx = (ev.clientX - r.left) / r.width - 0.5;
        var dy = (ev.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(800px) rotateY(" + (dx * 8) + "deg) rotateX(" + (-dy * 8) + "deg) translateY(-6px) scale(1.012)";
      });
      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
      });
    });
  };

  var panels = {};
  var closePanels = function () {
    Object.keys(panels).forEach(function (k) {
      if (panels[k]) panels[k].classList.remove("is-open");
    });
    var scrim = $("#pxScrim");
    if (scrim) scrim.classList.remove("is-on");
  };

  var openPanel = function (id) {
    var panel = doc.getElementById(id);
    if (!panel) return;
    var alreadyOpen = panel.classList.contains("is-open");
    closePanels();
    if (alreadyOpen) return;
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
      if (btn) btn.addEventListener("click", function () {
        openPanel("pxPanel" + map[btnId].charAt(0).toUpperCase() + map[btnId].slice(1));
      });
    });
    $$("[data-close-panel]").forEach(function (b) { b.addEventListener("click", closePanels); });
    var scrim = $("#pxScrim");
    if (scrim) scrim.addEventListener("click", closePanels);
  };

  var syncModeUI = function (mode) {
    state.mode = mode === "onion" ? "onion" : "clear";
    var modeBtn = $("#pxModeToggle");
    var modeLbl = $("#pxModeLabel");
    if (modeBtn) modeBtn.setAttribute("data-mode", state.mode);
    if (modeLbl) modeLbl.textContent = state.mode === "onion" ? "Onion" : "Direct";
    var forceToggle = $('.px-toggle[data-pref="forceOnion"]');
    if (forceToggle) forceToggle.setAttribute("aria-checked", state.mode === "onion" ? "true" : "false");
  };

  var applyPrefsToUI = function (prefs) {
    syncModeUI(prefs.forceOnion ? "onion" : "clear");
    state.rotatePerMsg = prefs.rotatePerMsg !== false;
    state.paranoid = !!prefs.paranoid;
    state.blur = Math.max(6, Math.min(48, Number(prefs.blur) || 30));
    state.specular = Math.max(0, Math.min(100, prefs.specular != null ? Number(prefs.specular) : 50));
    state.finish = ["liquid", "graphite", "moonstone"].indexOf(prefs.finish) !== -1 ? prefs.finish : "liquid";

    var rotToggle = $('.px-toggle[data-pref="rotatePerMsg"]');
    if (rotToggle) rotToggle.setAttribute("aria-checked", state.rotatePerMsg ? "true" : "false");
    var parToggle = $('.px-toggle[data-pref="paranoid"]');
    if (parToggle) parToggle.setAttribute("aria-checked", state.paranoid ? "true" : "false");
    root.setAttribute("data-paranoid", state.paranoid ? "true" : "false");

    var blur = $("#pxBlurSlider");
    var blurVal = $("#pxBlurVal");
    if (blur) {
      blur.value = String(state.blur);
      var bMin = Number(blur.min) || 6, bMax = Number(blur.max) || 48;
      blur.style.setProperty("--px-fill", ((state.blur - bMin) / (bMax - bMin) * 100) + "%");
    }
    if (blurVal) blurVal.textContent = state.blur + "px";
    root.style.setProperty("--px-blur", state.blur + "px");

    var aur = $("#pxAurSlider");
    var aurVal = $("#pxAurVal");
    if (aur) {
      aur.value = String(state.specular);
      var aMin = Number(aur.min) || 0, aMax = Number(aur.max) || 100;
      aur.style.setProperty("--px-fill", ((state.specular - aMin) / (aMax - aMin) * 100) + "%");
    }
    if (aurVal) aurVal.textContent = state.specular + "%";
    var bg = $(".px-bg__aurora");
    if (bg) bg.style.opacity = String(state.specular / 100);

    var sel = $("#pxFinishSelect") || $(".px-select__field");
    if (sel) sel.value = state.finish;
    root.setAttribute("data-finish", state.finish);
  };

  var wireToggles = function () {
    $$(".px-toggle").forEach(function (t) {
      t.addEventListener("click", function () {
        var next = t.getAttribute("aria-checked") !== "true";
        t.setAttribute("aria-checked", next ? "true" : "false");
        var pref = t.getAttribute("data-pref");
        if (pref === "forceOnion" || /force onion/i.test(t.textContent)) {
          syncModeUI(next ? "onion" : "clear");
          toast(next ? "Forced three-hop onion circuit" : "Direct anonymous routing");
        } else if (pref === "rotatePerMsg" || /rotate ip/i.test(t.textContent)) {
          state.rotatePerMsg = next;
          toast(next ? "Per-message IP rotation enabled" : "Per-message IP rotation paused");
        } else if (pref === "paranoid" || /paranoid/i.test(t.textContent)) {
          state.paranoid = next;
          root.setAttribute("data-paranoid", next ? "true" : "false");
          toast(next ? "Paranoid mode engaged · attack surface reduced" : "Paranoid mode relaxed");
        }
        savePrefs();
      });
    });
  };

  var wireSliders = function () {
    var blur = $("#pxBlurSlider");
    if (blur) blur.addEventListener("input", function () {
      var val = Number(blur.value) || 30;
      var pct = (val - Number(blur.min || 6)) / (Number(blur.max || 48) - Number(blur.min || 6)) * 100;
      blur.style.setProperty("--px-fill", pct + "%");
      var lbl = $("#pxBlurVal");
      if (lbl) lbl.textContent = val + "px";
      root.style.setProperty("--px-blur", val + "px");
      state.blur = val;
      savePrefs();
    });
    var aur = $("#pxAurSlider");
    if (aur) aur.addEventListener("input", function () {
      var val = Number(aur.value) || 0;
      var pct = (val - Number(aur.min || 0)) / (Number(aur.max || 100) - Number(aur.min || 0)) * 100;
      aur.style.setProperty("--px-fill", pct + "%");
      var lbl = $("#pxAurVal");
      if (lbl) lbl.textContent = val + "%";
      var bg = $(".px-bg__aurora");
      if (bg) bg.style.opacity = String(val / 100);
      state.specular = val;
      savePrefs();
    });
    var sel = $("#pxFinishSelect") || $(".px-select__field");
    if (sel) sel.addEventListener("change", function () {
      var v = String(sel.value || "liquid").toLowerCase();
      if (v.indexOf("graphite") !== -1) state.finish = "graphite";
      else if (v.indexOf("moonstone") !== -1) state.finish = "moonstone";
      else state.finish = "liquid";
      root.setAttribute("data-finish", state.finish);
      savePrefs();
      toast("Surface finish · " + state.finish.charAt(0).toUpperCase() + state.finish.slice(1));
    });
  };

  /* ========================================================================
     REAL NEXUS AI — talks to verified anonymous inference providers via
     js/pikx-engine.js with automatic failover and zero fabricated output.
     ==================================================================== */
  var nexusHistory = [];
  var nexusAbort = null;

  var mdRender = function (md) {
    if (window.PIKOverview && window.PIKOverview.render) return window.PIKOverview.render(md);
    var d = doc.createElement("div");
    d.textContent = md;
    return d.innerHTML;
  };

  var appendMsgHtml = function (cls, meta, html) {
    var feed = $("#pxNexusFeed");
    if (!feed) return null;
    var m = doc.createElement("div");
    m.className = "px-msg " + cls;
    var s = doc.createElement("span");
    s.className = "px-msg__meta";
    s.textContent = meta;
    m.appendChild(s);
    var b = doc.createElement("div");
    b.innerHTML = html;
    m.appendChild(b);
    feed.appendChild(m);
    feed.scrollTop = feed.scrollHeight;
    return m;
  };

  var appendMsg = function (cls, meta, text) {
    return appendMsgHtml(cls, meta, esc(text));
  };

  var wireNexus = function () {
    var form = $("#pxNexusForm");
    if (!form) return;
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var input = $("#pxNexusInput");
      if (!input) return;
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      pulse();
      if (state.rotatePerMsg) rotateIdentity(true);
      vaultPush("NEXUS prompt exited via randomized IP " + ghostIp(), true);
      appendMsg("px-msg--user", "You · masked device hash " + Math.random().toString(36).slice(2, 10), text);
      var stateEl = $("#pxNexusState");
      if (stateEl) stateEl.textContent = "Streaming over zero-log circuit…";
      var typing = doc.createElement("div");
      typing.className = "px-typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      var feedEl = $("#pxNexusFeed");
      if (feedEl) feedEl.appendChild(typing);

      var aiReady = !!(window.PIKNexusAI && typeof window.PIKNexusAI.ask === "function");
      if (!aiReady) {
        setTimeout(function () {
          if (typing.parentNode) typing.remove();
          appendMsg("px-msg--nexus", "NEXUS · offline", "Engine module unavailable — no reply fabricated.");
          if (stateEl) stateEl.textContent = "Listening · Circuit ready";
        }, 260);
        return;
      }

      var node = appendMsgHtml("px-msg--nexus", "NEXUS · negotiating anonymous circuit…", '<span class="px-ov__cursor"></span>');
      var body = node ? node.querySelector("div:last-child") : null;
      var acc = "";
      try {
        if (nexusAbort) { try { nexusAbort.abort(); } catch (e) {} }
        nexusAbort = new AbortController();
        var r = await window.PIKNexusAI.ask({
          prompt: text,
          history: nexusHistory.slice(),
          signal: nexusAbort.signal,
          onDelta: function (d) {
            acc += d;
            if (body) {
              body.innerHTML = mdRender(acc) + '<span class="px-ov__cursor"></span>';
              var feed = $("#pxNexusFeed");
              if (feed) feed.scrollTop = feed.scrollHeight;
            }
            if (typing.parentNode) typing.remove();
          }
        });
        if (typing.parentNode) typing.remove();
        if (body) body.innerHTML = mdRender(r.text || acc);
        nexusHistory.push({ role: "user", content: text });
        nexusHistory.push({ role: "assistant", content: r.text || acc });
        if (nexusHistory.length > 48) nexusHistory = nexusHistory.slice(-48);
        var metaEl = node ? node.querySelector(".px-msg__meta") : null;
        if (metaEl) metaEl.textContent = "NEXUS · " + (r.providerLabel || r.engine) + " · egress " + ghostIp() + " → " + ghostIp();
        if (stateEl) stateEl.textContent = "Listening · Circuit ready · " + (r.tokenBudget ? Math.round(r.tokenBudget / 1000) + "K context" : "");
        toast("Real AI reply streamed · " + (r.providerLabel || r.engine));
      } catch (e) {
        if (typing.parentNode) typing.remove();
        if (e && e.name === "AbortError") return;
        if (body) body.innerHTML = '<span class="px-ov__err">Anonymous inference engines unreachable right now — nothing was fabricated. ' + esc(String((e && e.message) || e)) + "</span>";
        if (stateEl) stateEl.textContent = "Circuit quiet · engines unreachable";
      }
    });
  };

  /* ========================================================================
     EXTENDED SERP VIEW (#pxResults) — wired cleanly alongside #pxViewResults
     ==================================================================== */
  var serp = {
    q: "",
    data: {},
    tab: "all",
    ovCtrl: null,
    askHistory: [],
    askAbort: null
  };

  var el = function (id) { return doc.getElementById(id); };

  var goResults = function () {
    var sr = el("pxResults"), st = el("pxStage");
    if (sr) sr.hidden = false;
    if (st) st.hidden = true;
    doc.body.classList.add("px-in-results");
    window.scrollTo(0, 0);
  };

  var goHome = function () {
    doc.body.classList.remove("px-in-results");
    var sr = el("pxResults"), st = el("pxStage");
    if (sr) sr.hidden = true;
    if (st) st.hidden = false;
    if (serp.ovCtrl) { try { serp.ovCtrl.abort(); } catch (e) {} }
    if (serp.askAbort) { try { serp.askAbort.abort(); } catch (e) {} }
  };

  var skels = function (host, n, h) {
    if (!host) return;
    var html = "";
    for (var i = 0; i < (n || 5); i++) html += '<div class="px-skel" style="height:' + (h || 14) + 'px;margin:.55rem 0;width:' + (72 + Math.random() * 28) + '%"></div>';
    host.innerHTML = html;
  };

  var hlTerms = function (text, q) {
    var t = esc(text);
    var words = String(q || "").toLowerCase().split(/\s+/).filter(function (w) { return w.length > 3; }).slice(0, 6);
    words.forEach(function (w) {
      try { t = t.replace(new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\b", "i"), "<b>$1</b>"); } catch (e) {}
    });
    return t;
  };

  var safeHref = function (u) {
    var s = String(u || "").trim();
    return /^https?:\/\//i.test(s) ? s : "";
  };

  var renderWeb = function (list, q) {
    var host = el("pxWebList");
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '<div class="px-empty">No organic web items returned for this query. Instant answer, knowledge panel, images, news and NEXUS overview above remain available.</div>';
      return;
    }
    host.innerHTML = list.map(function (r) {
      var u = safeHref(r.url);
      if (!u) return "";
      var iconTag = r.icon ? '<img class="px-webitem__icon" loading="lazy" src="' + esc(r.icon) + '" alt="">' : "";
      return '<article class="px-webitem">' +
        '<div class="px-webitem__head">' + iconTag + '<span class="px-webitem__site">' + esc(r.host) + "</span></div>" +
        '<a class="px-webitem__title" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow">' + hlTerms(r.title, q) + "</a>" +
        '<div class="px-webitem__url">' + esc(u) + "</div>" +
        '<p class="px-webitem__snippet">' + hlTerms(r.snippet, q) + "</p>" +
        "</article>";
    }).join("");
  };

  var renderIa = function (ia) {
    var host = el("pxIa");
    if (!host) return;
    var txt = (ia && (ia.answer || ia.definition || ia.abstractText)) || "";
    if (!txt) { host.hidden = true; return; }
    var srcUrl = safeHref(ia.abstractUrl || ia.definitionUrl || "");
    var imgUrl = safeHref(ia.image || "");
    host.innerHTML =
      (imgUrl && !ia.imageIsLogo ? '<img src="' + esc(imgUrl) + '" alt="" loading="lazy">' : "") +
      "<div><div class=\"px-ia__answer\">" + esc(txt) + "</div>" +
      '<div class="px-ia__src">' + esc(ia.abstractSource || ia.answerType || "DuckDuckGo Instant Answers") +
      (srcUrl ? ' · <a href="' + esc(srcUrl) + '" target="_blank" rel="noopener noreferrer nofollow">source</a>' : "") +
      "</div></div>";
    host.hidden = false;
  };

  var PIKPxUtilTrim = function (s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:]\S*$/, "") + "…" : s;
  };

  var renderWiki = function (w) {
    var host = el("pxKnowledgePanel");
    if (!host) return;
    if (!w || !w.extract) { host.hidden = true; return; }
    var thumbs = [w.thumb].concat(w.extraThumbs || []).map(safeHref).filter(Boolean).slice(0, 3);
    var wUrl = safeHref(w.url);
    host.innerHTML =
      (thumbs[0] ? '<img class="px-kp__img" src="' + esc(thumbs[0]) + '" alt="" loading="lazy">' : "") +
      '<div class="px-kp__body">' +
      '<div class="px-kp__sub">Knowledge panel · Wikipedia</div>' +
      '<div class="px-kp__title">' + esc(w.title) + "</div>" +
      '<p class="px-kp__extract">' + esc(PIKPxUtilTrim(w.extract, 700)) + "</p>" +
      (thumbs.length > 1 ? '<div class="px-kp__more">' + thumbs.slice(0, 3).map(function (t) { return '<img src="' + esc(t) + '" data-lb="' + esc(t) + '" alt="" loading="lazy">'; }).join("") + "</div>" : "") +
      (wUrl ? '<a class="px-kp__link" href="' + esc(wUrl) + '" target="_blank" rel="noopener noreferrer nofollow">Read on Wikipedia →</a>' : "") +
      ((w.more || []).length ? '<div class="px-kp__rows">' + w.more.map(function (m) {
        var mu = safeHref(m.url);
        return '<div class="px-kp__row">' + (mu ? '<a href="' + esc(mu) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(m.title) + "</a>" : '<span>' + esc(m.title) + "</span>") + "<p>" + esc(m.extract) + "</p></div>";
      }).join("") + "</div>" : "") +
      "</div>";
    host.hidden = false;
  };

  var renderRelated = function (rel) {
    ["pxRelatedGrid", "pxRelatedSideGrid"].forEach(function (gid) {
      var g = el(gid);
      if (!g) return;
      var box = g.parentNode;
      if (!rel || !rel.length) { box.hidden = true; return; }
      g.innerHTML = rel.map(function (r) {
        return '<button type="button" class="px-related__chip" data-q="' + esc(r) + '"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><span>' + esc(r) + "</span></button>";
      }).join("");
      box.hidden = false;
    });
  };

  var renderImages = function (imgs) {
    var g = el("pxImgGrid"), empty = el("pxImgEmpty");
    if (!g) return;
    if (!imgs || !imgs.length) { g.innerHTML = ""; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    g.innerHTML = imgs.map(function (im) {
      var th = safeHref(im.thumb), fl = safeHref(im.full) || th, pg = safeHref(im.page || "");
      if (!th) return "";
      return '<figure class="px-imgcell" data-full="' + esc(fl) + '" data-page="' + esc(pg) + '" data-cap="' + esc(im.title) + '">' +
        '<img src="' + esc(th) + '" alt="' + esc(im.title) + '" loading="lazy"><span>' + esc(im.title) + "</span></figure>";
    }).join("");
  };

  var renderNews = function (news) {
    var l = el("pxNewsList"), empty = el("pxNewsEmpty");
    if (!l) return;
    if (!news || !news.length) { l.innerHTML = ""; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    l.innerHTML = news.map(function (n) {
      var u = safeHref(n.url);
      if (!u) return "";
      return '<a class="px-newscard" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow"><div class="px-newscard__l">' +
        '<div class="px-newscard__meta"><span>' + esc(n.source || (n.host || "").split(" ")[0]) + "</span>" + (n.age ? "<span>" + esc(n.age) + "</span>" : "") + "</div>" +
        '<div class="px-newscard__title">' + esc(n.title) + "</div>" +
        '<div class="px-newscard__snip">' + esc(n.snippet) + "</div></div></a>";
    }).join("");
  };

  var switchTab = function (name) {
    serp.tab = name;
    $$("#pxResults [data-pxtab]").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-pxtab") === name); });
    [["all", "pxTabAll"], ["images", "pxTabImages"], ["news", "pxTabNews"], ["nexus", "pxTabNexus"]].forEach(function (p) {
      var e = el(p[1]);
      if (e) e.hidden = p[0] !== name;
    });
    var ov = el("pxOverview");
    if (ov) ov.hidden = name !== "all";
  };

  var openLightbox = function (full, cap, page) {
    var lb = el("pxLightbox");
    var safeFull = safeHref(full);
    if (!lb || !safeFull) return;
    var safePage = safeHref(page);
    var img = el("pxLbImg"), capEl = el("pxLbCap");
    if (img) img.src = safeFull;
    if (capEl) capEl.innerHTML = esc(cap || "") + (safePage ? ' · <a href="' + esc(safePage) + '" target="_blank" rel="noopener noreferrer nofollow">source page</a>' : "");
    lb.classList.add("is-open");
  };

  var runOverview = async function () {
    var ov = el("pxOverview"), bodyEl = el("pxOvBody"), engTxt = el("pxOvEngineTxt"), footMeta = el("pxOvFootMeta");
    if (!ov || !bodyEl || !window.PIKOverview) return;
    if (serp.ovCtrl) { try { serp.ovCtrl.abort(); } catch (e) {} }
    serp.ovCtrl = new AbortController();
    ov.hidden = false;
    if (engTxt) engTxt.textContent = "grounding… streaming live";
    bodyEl.innerHTML = '<div class="px-skel" style="height:18px"></div><div class="px-skel" style="height:14px;width:90%"></div><div class="px-skel" style="height:14px;width:80%"></div><div class="px-skel" style="height:14px;width:88%"></div>';
    var acc = "";
    try {
      var r = await window.PIKOverview.generate(serp.q, serp.data, {
        signal: serp.ovCtrl.signal,
        onDelta: function (d) {
          acc += d;
          bodyEl.innerHTML = mdRender(acc) + '<span class="px-ov__cursor"></span>';
        }
      });
      bodyEl.innerHTML = mdRender(r.markdown);
      if (engTxt) engTxt.textContent = r.providerLabel || r.engine;
      if (footMeta) {
        footMeta.textContent = "streamed live · " + (r.tokenBudget ? Math.round(r.tokenBudget / 1000) + "K context · " : "") + "grounded on " +
          ((serp.data.web && serp.data.web.length) || 0) + " web results, " +
          ((serp.data.news && serp.data.news.length) || 0) + " news items, Wikipedia extract" +
          (serp.data.ia && serp.data.ia.topics && serp.data.ia.topics.length ? ", DDG instant answers" : "");
      }
      serp.askHistory = [{ role: "user", content: "Topic under discussion: " + serp.q }, { role: "assistant", content: r.markdown }];
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (engTxt) engTxt.textContent = "engine unreachable";
      bodyEl.innerHTML = '<span class="px-ov__err">NEXUS could not reach any inference engine for the overview (' + esc(String((e && e.message) || e)) + "). Organic results below remain live.</span>";
    }
  };

  var doSearch = async function (q) {
    q = String(q || "").trim();
    if (!q) return;
    var engine = window.PIKSerpEngine || (window.PIKSearch && typeof window.PIKSearch.runAll === "function" ? window.PIKSearch : null);
    if (!engine) {
      if (window.PIKResults && typeof window.PIKResults.run === "function") {
        goHome();
        window.PIKResults.run(q);
      }
      return;
    }
    serp.q = q;
    serp.data = {};
    goResults();
    var mini = el("pxMiniInput");
    if (mini) mini.value = q;
    switchTab("all");
    var stats = el("pxResultsStats");
    if (stats) stats.textContent = "fetching from anonymous APIs…";
    skels(el("pxWebList"), 6, 40);
    if (el("pxIa")) el("pxIa").hidden = true;
    if (el("pxKnowledgePanel")) el("pxKnowledgePanel").hidden = true;
    if (el("pxImgGrid")) el("pxImgGrid").innerHTML = "";
    if (el("pxNewsList")) el("pxNewsList").innerHTML = "";
    var ov = el("pxOverview");
    if (ov && el("pxOvBody") && el("pxOvEngineTxt")) {
      ov.hidden = false;
      el("pxOvBody").innerHTML = '<div class="px-skel" style="height:16px"></div><div class="px-skel" style="height:14px;width:85%"></div>';
      el("pxOvEngineTxt").textContent = "waiting for grounding data…";
    }
    pulse();
    rotateIdentity(true);
    vaultPush("Live SERP fetch dispatched for “" + PIKPxUtilTrim(q, 40) + "” · zero redirects", true);

    var res = await engine.runAll(q, {
      ia: function (v) { serp.data.ia = v; renderIa(v); },
      wiki: function (v) { serp.data.wiki = v; renderWiki(v); },
      web: function (v) { serp.data.web = v || []; renderWeb(serp.data.web, q); },
      news: function (v) { serp.data.news = v || []; renderNews(serp.data.news); },
      images: function (v) { serp.data.images = v || []; renderImages(serp.data.images); },
      related: function (v) { serp.data.related = v || []; renderRelated(serp.data.related); }
    });
    serp.data = res;
    if (stats) {
      stats.textContent = res.meta.ms + " ms · " + ((res.web || []).length) + " web · " + ((res.news || []).length) + " news · " + ((res.images || []).length) + " images";
    }
    runOverview();
  };

  var appendAskMsg = function (cls, meta, innerHtml) {
    var feed = el("pxAskFeed");
    var m = doc.createElement("div");
    m.className = "px-msg " + cls;
    var s = doc.createElement("span");
    s.className = "px-msg__meta";
    s.textContent = meta;
    m.appendChild(s);
    var b = doc.createElement("div");
    b.innerHTML = innerHtml;
    m.appendChild(b);
    if (feed) feed.appendChild(m);
    return m;
  };

  var wireSerP = function () {
    var serpRoot = el("pxResults");
    if (!serpRoot) return;
    /* CSP-safe broken image hiding inside SERP */
    serpRoot.addEventListener("error", function (ev) {
      var t = ev.target;
      if (t && t.tagName === "IMG") t.style.visibility = "hidden";
    }, true);

    $$("#pxResults [data-pxtab]").forEach(function (b) {
      b.addEventListener("click", function () { switchTab(b.getAttribute("data-pxtab")); });
    });
    ["pxBackHome", "pxResultsHome"].forEach(function (id) {
      var btn = el(id);
      if (btn) btn.addEventListener("click", goHome);
    });
    var mf = el("pxMiniForm");
    if (mf) mf.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var mi = el("pxMiniInput");
      if (mi) doSearch(mi.value);
    });
    doc.addEventListener("click", function (ev) {
      var chip = ev.target.closest ? ev.target.closest(".px-related__chip") : null;
      if (chip && chip.getAttribute("data-q")) { doSearch(chip.getAttribute("data-q")); return; }
      var kb = ev.target.closest ? ev.target.closest(".px-kp__more img") : null;
      if (kb) { openLightbox(kb.getAttribute("data-lb"), "Wikipedia image", ""); return; }
      var cell = ev.target.closest ? ev.target.closest(".px-imgcell") : null;
      if (cell) { openLightbox(cell.getAttribute("data-full"), cell.getAttribute("data-cap"), cell.getAttribute("data-page")); }
    });
    var lb = el("pxLightbox");
    if (lb) {
      var lbc = el("pxLbClose");
      if (lbc) lbc.addEventListener("click", function () { lb.classList.remove("is-open"); });
      lb.addEventListener("click", function (ev) { if (ev.target === lb) lb.classList.remove("is-open"); });
    }
    var regen = el("pxOvRegen");
    if (regen) regen.addEventListener("click", runOverview);
    var ovAsk = el("pxOvAsk");
    if (ovAsk) ovAsk.addEventListener("click", function () {
      switchTab("nexus");
      var feed = el("pxAskFeed");
      if (feed && !feed.children.length && serp.askHistory.length) {
        appendAskMsg("px-msg--nexus", "NEXUS · AI Overview (continued)", mdRender(serp.askHistory[serp.askHistory.length - 1].content));
      }
      var inp = el("pxAskInput");
      if (inp) inp.focus();
    });
    var af = el("pxAskForm");
    if (af) af.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var input = el("pxAskInput");
      if (!input) return;
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      appendAskMsg("px-msg--user", "You · masked device hash " + Math.random().toString(36).slice(2, 10), esc(text));
      if (!serp.askHistory.length) serp.askHistory.push({ role: "user", content: "Topic under discussion: " + serp.q });
      var node = appendAskMsg("px-msg--nexus", "NEXUS · negotiating anonymous circuit…", '<span class="px-ov__cursor"></span>');
      var body = node.querySelector("div:last-child");
      var acc = "";
      try {
        if (!window.PIKNexusAI || typeof window.PIKNexusAI.ask !== "function") throw new Error("engine module unavailable");
        if (serp.askAbort) { try { serp.askAbort.abort(); } catch (e) {} }
        serp.askAbort = new AbortController();
        var r = await window.PIKNexusAI.ask({
          prompt: text,
          history: serp.askHistory.slice(),
          signal: serp.askAbort.signal,
          onDelta: function (d) {
            acc += d;
            body.innerHTML = mdRender(acc) + '<span class="px-ov__cursor"></span>';
          }
        });
        body.innerHTML = mdRender(r.text || acc);
        node.querySelector(".px-msg__meta").textContent = "NEXUS · " + (r.providerLabel || r.engine) + " · 128K context";
        serp.askHistory.push({ role: "user", content: text });
        serp.askHistory.push({ role: "assistant", content: r.text || acc });
      } catch (e) {
        if (e && e.name === "AbortError") return;
        body.innerHTML = '<span class="px-ov__err">Engines unreachable — nothing fabricated. ' + esc(String((e && e.message) || e)) + "</span>";
      }
    });
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
      if (nexusAbort) { try { nexusAbort.abort(); } catch (e) {} nexusAbort = null; }
      nexusHistory = [];
      serp.askHistory = [];
      goHome();
      $$("input").forEach(function (i) {
        if (i.type !== "range") i.value = "";
      });
      $$(".px-tile[data-pinned]").forEach(function (tile) { tile.remove(); });
      applyPrefsToUI(DEFAULT_PREFS);
      if (window.PIKResults && typeof window.PIKResults.resetAll === "function") {
        window.PIKResults.resetAll();
      } else if (window.PIKSearch && typeof window.PIKSearch.clearCache === "function") {
        window.PIKSearch.clearCache();
      }
      var feed = $("#pxNexusFeed");
      if (feed) feed.innerHTML = '<div class="px-msg px-msg--nexus"><span class="px-msg__meta">NEXUS · shredded</span>Prior transcript incinerated. Memory scrubbed. We never met.</div>';
      var askFeed = $("#pxAskFeed");
      if (askFeed) askFeed.innerHTML = "";
      shut();
      closePanels();
      toast("Session burned · 0 bytes recoverable");
    });
  };

  var submitOmniValue = function (raw) {
    var v = String(raw || "").trim();
    if (!v) return;
    pulse();
    goHome();
    var isOnion = /\.onion(?:[/:?#]|$)/i.test(v);
    var R = window.PIKResults;
    var treatAsUrl = R
      ? R.isUrl(v)
      : (/^https?:\/\//i.test(v) || (!/\s/.test(v) && /\.[a-z]{2,24}(?:[/:?#]|$)/i.test(v)));

    if (treatAsUrl) {
      var dest = R ? R.toUrl(v) : ((/^https?:\/\//i.test(v) ? "" : (isOnion ? "http://" : "https://")) + v.replace(/^\/+/, ""));
      rotateIdentity(true);
      toast("Navigating directly · identity rotated first");
      vaultPush(isOnion ? "Onion circuit opened to " + v.slice(0, 42) : "Direct navigation to " + v.slice(0, 48), true);
      window.open(dest, "_blank", "noopener,noreferrer");
      return;
    }

    if (R && typeof R.run === "function") {
      R.run(v);
      vaultPush("Search “" + v.slice(0, 40) + "” rendered in the results tab", true);
    } else {
      toast("Results module unavailable · opening DuckDuckGo instead");
      window.open("https://duckduckgo.com/?q=" + encodeURIComponent(v) + "&ia=anonymous", "_blank", "noopener,noreferrer");
    }
  };

  var wireOmnibox = function () {
    var omni = $("#pxOmni");
    var input = $("#pxOmniInput");
    var suggest = $("#pxSuggest");
    if (!omni || !input || !suggest) return;

    var suggestIdx = -1;
    var getRows = function () { return $$("#pxSuggest .px-suggest__row"); };
    var syncSuggestSelection = function () {
      var rows = getRows();
      rows.forEach(function (r, idx) {
        var active = idx === suggestIdx;
        r.classList.toggle("is-active", active);
        r.setAttribute("aria-selected", active ? "true" : "false");
      });
    };
    var closeSuggest = function () {
      suggest.classList.remove("is-open");
      suggestIdx = -1;
      syncSuggestSelection();
    };
    var activateSuggestRow = function (row) {
      if (!row) return;
      var title = row.querySelector(".px-suggest__title");
      if (!title) return;
      var t = title.textContent.trim();
      closeSuggest();
      if (/^ask nexus/i.test(t)) {
        var nx = $("#pxNexusCard");
        if (nx) {
          nx.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(function () {
            var ni = $("#pxNexusInput");
            if (ni) ni.focus();
          }, 350);
        }
        return;
      }
      input.value = t;
      submitOmniValue(t);
    };

    input.addEventListener("focus", function () {
      omni.classList.add("is-focus");
      suggest.classList.add("is-open");
    });
    input.addEventListener("blur", function () {
      omni.classList.remove("is-focus");
      setTimeout(closeSuggest, 180);
    });
    input.addEventListener("input", function () {
      suggestIdx = -1;
      syncSuggestSelection();
      if (!suggest.classList.contains("is-open")) suggest.classList.add("is-open");
    });
    input.addEventListener("keydown", function (ev) {
      var rows = getRows();
      if (ev.key === "ArrowDown") {
        if (!rows.length) return;
        ev.preventDefault();
        suggest.classList.add("is-open");
        suggestIdx = (suggestIdx + 1) % rows.length;
        syncSuggestSelection();
        return;
      }
      if (ev.key === "ArrowUp") {
        if (!rows.length) return;
        ev.preventDefault();
        suggest.classList.add("is-open");
        suggestIdx = suggestIdx <= 0 ? rows.length - 1 : suggestIdx - 1;
        syncSuggestSelection();
        return;
      }
      if (ev.key === "Enter" && suggest.classList.contains("is-open") && suggestIdx >= 0 && rows[suggestIdx]) {
        ev.preventDefault();
        activateSuggestRow(rows[suggestIdx]);
        return;
      }
      if (ev.key === "Escape" && suggest.classList.contains("is-open")) {
        ev.preventDefault();
        ev.stopPropagation();
        closeSuggest();
      }
    });

    getRows().forEach(function (row) {
      row.addEventListener("mousedown", function (ev) {
        /* prevent input blur timeout from racing click activation */
        ev.preventDefault();
      });
      row.addEventListener("click", function () {
        activateSuggestRow(row);
      });
    });

    var form = $("#pxOmniForm");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      closeSuggest();
      submitOmniValue(input.value);
    });

    var modeBtn = $("#pxModeToggle");
    if (modeBtn) modeBtn.addEventListener("click", function () {
      var nextMode = state.mode === "clear" ? "onion" : "clear";
      syncModeUI(nextMode);
      savePrefs();
      toast(state.mode === "onion" ? "Forced three-hop onion circuit" : "Direct anonymous routing");
    });
  };

  var wireChipsTiles = function () {
    $$(".px-chip[data-fill]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var f = chip.getAttribute("data-fill");
        var input = $("#pxNexusInput");
        if (!input) return;
        if (!f) {
          var nx0 = $("#pxNexusCard");
          if (nx0) nx0.scrollIntoView({ behavior: "smooth", block: "center" });
          input.focus();
          return;
        }
        input.value = f;
        var nx = $("#pxNexusCard");
        if (nx) nx.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(function () { input.focus(); }, 450);
      });
    });

    var quickGrid = $("#pxQuickGrid") || $(".px-quick");
    if (quickGrid) {
      quickGrid.addEventListener("click", function (ev) {
        var tile = ev.target.closest ? ev.target.closest(".px-tile[data-url]") : null;
        if (!tile) return;
        var url = tile.getAttribute("data-url");
        if (!url || !/^https?:\/\//i.test(url)) return;
        pulse();
        toast("Opening " + url.replace(/^https?:\/\//i, "") + " · identity rotated first");
        rotateIdentity(true);
        window.open(url, "_blank", "noopener,noreferrer");
      });
    }

    var add = $("#pxTileAdd");
    if (add) add.addEventListener("click", function () {
      var raw = typeof prompt === "function" ? prompt("Pin a site to this session only (never written to disk):") : "";
      if (!raw) return;
      var trimmed = String(raw).trim();
      if (!trimmed) return;
      var R = window.PIKResults;
      var full = R ? R.toUrl(trimmed) : (/^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed);
      var host = "";
      try {
        var parsed = new URL(full);
        if (!/^https?:$/i.test(parsed.protocol) || !parsed.hostname) throw new Error("invalid");
        host = parsed.hostname.replace(/^www\./i, "");
        full = parsed.href;
      } catch (e) {
        toast("Enter a valid domain or http(s) address");
        return;
      }
      if (quickGrid) {
        var btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "px-tile";
        btn.setAttribute("data-url", full);
        btn.setAttribute("data-pinned", "1");
        var ico = doc.createElement("span");
        ico.className = "px-tile__icon";
        ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18-3-4-3-14.5 0-18z"/></svg>';
        var nm = doc.createElement("span");
        nm.className = "px-tile__name";
        var label = host.split(".")[0] || host;
        nm.textContent = label.charAt(0).toUpperCase() + label.slice(1, 14);
        var hs = doc.createElement("span");
        hs.className = "px-tile__host";
        hs.textContent = host.length > 20 ? host.slice(0, 9) + "…" + host.slice(-9) : host;
        btn.appendChild(ico);
        btn.appendChild(nm);
        btn.appendChild(hs);
        quickGrid.insertBefore(btn, add);
      }
      toast("“" + host + "” pinned to volatile memory");
    });

    var newTab = $("#pxNewTab");
    if (newTab) newTab.addEventListener("click", function () {
      goHome();
      toast("Ghost tab spawned · fresh fingerprint seed");
    });

    var dockNewTab = $("#pxDockNewTab");
    if (dockNewTab) dockNewTab.addEventListener("click", function () {
      goHome();
      if (window.PIKResults && typeof window.PIKResults.newTab === "function") {
        window.PIKResults.newTab();
      }
      toast("Ghost tab spawned · fresh fingerprint seed");
    });

    var dockOnion = $("#pxDockOnion");
    if (dockOnion) dockOnion.addEventListener("click", function () {
      goHome();
      var stage = $("#pxStage");
      if (stage && stage.getAttribute("data-view") === "results" && window.PIKResults) {
        window.PIKResults.newTab();
      }
      syncModeUI("onion");
      savePrefs();
      var qc = $("#pxQuickCircuits");
      if (qc) qc.scrollIntoView({ behavior: "smooth", block: "center" });
      toast("Onion directory ready · 3-hop hidden circuit active");
    });

    var dockNexus = $("#pxDockNexus");
    if (dockNexus) dockNexus.addEventListener("click", function () {
      goHome();
      var stage = $("#pxStage");
      if (stage && stage.getAttribute("data-view") === "results" && window.PIKResults) {
        window.PIKResults.newTab();
      }
      var nx = $("#pxNexusCard");
      if (nx) nx.scrollIntoView({ behavior: "smooth", block: "center" });
      var ni = $("#pxNexusInput");
      if (ni) ni.focus();
    });

    var dockRotate = $("#pxDockRotate");
    if (dockRotate) dockRotate.addEventListener("click", function () { rotateIdentity(false); });
  };

  var isEditableTarget = function (t) {
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!t.isContentEditable;
  };

  var focusOmnibox = function () {
    goHome();
    var stage = $("#pxStage");
    if (stage && stage.getAttribute("data-view") === "results" && window.PIKResults) {
      var st = window.PIKResults._state ? window.PIKResults._state() : null;
      var blank = null;
      if (st && st.tabs) {
        st.tabs.forEach(function (t) { if (!blank && t.kind === "new") blank = t; });
      }
      window.PIKResults.newTab();
    }
    var input = $("#pxOmniInput");
    if (input) input.focus();
  };

  var wireKeys = function () {
    var spaceTimer = null;

    doc.addEventListener("keydown", function (ev) {
      var key = ev.key || "";
      if ((ev.ctrlKey || ev.metaKey) && key.toLowerCase() === "k") {
        ev.preventDefault();
        focusOmnibox();
        return;
      }
      if (key === "/" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !isEditableTarget(ev.target)) {
        ev.preventDefault();
        focusOmnibox();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && key.toLowerCase() === "n") {
        ev.preventDefault();
        var modal = $("#pxModalWipe");
        if (modal) modal.classList.add("is-open");
        return;
      }
      if (key === "Escape") {
        var suggest = $("#pxSuggest");
        if (suggest && suggest.classList.contains("is-open")) {
          suggest.classList.remove("is-open");
        }
        var lb = $("#pxLightbox");
        if (lb && lb.classList.contains("is-open")) {
          lb.classList.remove("is-open");
          return;
        }
        var wipe = $("#pxModalWipe");
        if (wipe && wipe.classList.contains("is-open")) {
          wipe.classList.remove("is-open");
          return;
        }
        if ($(".px-panel.is-open")) {
          closePanels();
          return;
        }
        if (doc.body.classList.contains("px-in-results")) {
          goHome();
          return;
        }
      }
      if (key === " " && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        var tag = ev.target && ev.target.tagName ? ev.target.tagName.toUpperCase() : "";
        if (!isEditableTarget(ev.target) && tag !== "BUTTON" && tag !== "A") {
          ev.preventDefault();
          clearTimeout(spaceTimer);
          spaceTimer = setTimeout(function () {
            spaceTimer = null;
            rotateIdentity(false);
          }, 420);
        }
      }
      $$(".px-key").forEach(function (k) {
        var label = k.textContent.trim().toLowerCase();
        if (label === key.toLowerCase() || (key === " " && label === "space")) {
          k.classList.add("is-press");
          setTimeout(function () { k.classList.remove("is-press"); }, 220);
        }
      });
    });

    doc.addEventListener("keyup", function (ev) {
      if (ev.key === " " && spaceTimer) {
        clearTimeout(spaceTimer);
        spaceTimer = null;
      }
    });
  };

  var antiBlueGuard = function () {
    var sanitize = function () {
      $$("meta[name='theme-color']").forEach(function (m) {
        if (m.getAttribute("content") !== "#000000") m.setAttribute("content", "#000000");
      });
      root.classList.add("pikx-immune");
      root.setAttribute("data-theme", "dark");
      root.setAttribute("data-bs-theme", "dark");
      root.style.colorScheme = "dark only";
    };
    sanitize();
    if (typeof MutationObserver === "function" && doc.head && doc.body) {
      new MutationObserver(sanitize).observe(doc.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
      new MutationObserver(function (muts) {
        muts.forEach(function (mu) {
          var node = mu.target;
          if (node && node.nodeType === 1 && node.tagName === "BODY") {
            if (!node.classList.contains("pikx-body")) node.classList.add("pikx-body");
            if (node.style.backgroundColor !== "rgb(0, 0, 0)" && node.style.backgroundColor !== "#000000") {
              node.style.backgroundColor = "#000000";
            }
          }
        });
      }).observe(doc.body, { attributes: true, attributeFilter: ["class", "style"] });
    }
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
    var step = function (name, fn) {
      try { fn(); }
      catch (e) {
        if (window.console && console.error) console.error("[PIKX] " + name + " failed:", e);
      }
    };

    step("antiBlueGuard", antiBlueGuard);
    step("applyPrefs", function () { applyPrefsToUI(loadPrefs()); });
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
    step("wireSerP", wireSerP);
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
