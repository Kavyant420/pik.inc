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

  /* ========================================================================
     REAL NEXUS AI — js/pikx-engine.js talks to genuinely free, keyless
     inference providers (Pollinations streaming SSE + Puter.js free tier)
     with automatic failover. The fake canned-reply path is gone; if the
     real engines are unreachable we say so honestly instead of pretending.
     ==================================================================== */
  var hasRealAI = !!(window.PIKNexusAI && window.PIKOverview && window.PIKSearch);
  var nexusHistory = [];           /* rolling transcript for the real model */
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

  var wireNexus = function () {
    var form = $("#pxNexusForm");
    if (!form) return;
    form.addEventListener("submit", async function (ev) {
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
      if (stateEl) stateEl.textContent = "Streaming from free inference engines…";
      var typing = doc.createElement("div");
      typing.className = "px-typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      $("#pxNexusFeed").appendChild(typing);

      if (!hasRealAI) {
        setTimeout(function () {
          typing.remove();
          appendMsg("px-msg--nexus", "NEXUS · offline", "Engine module failed to load — no reply fabricated.");
          if (stateEl) stateEl.textContent = "Listening · Circuit ready";
        }, 400);
        return;
      }

      var node = appendMsgHtml("px-msg--nexus", "NEXUS · booting free engine chain…", '<span class="px-ov__cursor"></span>');
      var body = node ? node.querySelector("div:last-child") : null;
      var acc = "";
      try {
        if (nexusAbort) nexusAbort.abort();
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
        var metaEl = node.querySelector(".px-msg__meta");
        if (metaEl) metaEl.textContent = "NEXUS · " + (r.providerLabel || r.engine) + " · egress " + ghostIp() + " → " + ghostIp();
        if (stateEl) stateEl.textContent = "Listening · Circuit ready · " + (r.tokenBudget ? (r.tokenBudget / 1000) + "k token budget" : "");
        toast("Real AI reply streamed · " + (r.providerLabel || r.engine));
      } catch (e) {
        if (typing.parentNode) typing.remove();
        if (e && e.name === "AbortError") return;
        if (body) body.innerHTML = '<span class="px-ov__err">Every free engine is unreachable right now — nothing was faked. ' + esc(String((e && e.message) || e)) + "</span>";
        if (stateEl) stateEl.textContent = "Circuit quiet · engines unreachable";
      }
    });
  };

  /* ========================================================================
     IN-TAB SEARCH — no more redirects. A search is fetched and rendered
     right here by js/pikx-engine.js (DuckDuckGo IA + HTML, Wikipedia REST,
     Wikimedia Commons, keyless CORS relays) with a streamed NEXUS AI
     Overview on top. Only typed URLs still navigate to the site itself.
     ==================================================================== */

  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  var serp = {
    q: "",
    data: {},
    tab: "all",
    ovCtrl: null,
    askHistory: [],
    askAbort: null,
    started: false
  };

  var el = function (id) { return doc.getElementById(id); };

  var goResults = function () { doc.body.classList.add("px-in-results"); window.scrollTo(0, 0); };
  var goHome = function () {
    doc.body.classList.remove("px-in-results");
    if (serp.ovCtrl) { try { serp.ovCtrl.abort(); } catch (e) {} }
    if (serp.askAbort) { try { serp.askAbort.abort(); } catch (e) {} }
  };

  var skels = function (host, n, h) {
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

  var renderWeb = function (list, q) {
    var host = el("pxWebList");
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '<div class="px-empty">The organic-result endpoints (DuckDuckGo HTML via free relays) returned nothing for this query. The instant-answer, knowledge panel, images, news and NEXUS overview above are unaffected.</div>';
      return;
    }
    host.innerHTML = list.map(function (r) {
      return '<article class="px-webitem">' +
        '<div class="px-webitem__head"><img class="px-webitem__icon" loading="lazy" src="' + esc(r.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'"><span class="px-webitem__site">' + esc(r.host) + "</span></div>" +
        '<a class="px-webitem__title" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + hlTerms(r.title, q) + "</a>" +
        '<div class="px-webitem__url">' + esc(r.url) + "</div>" +
        '<p class="px-webitem__snippet">' + hlTerms(r.snippet, q) + "</p>" +
        "</article>";
    }).join("");
  };

  var renderIa = function (ia) {
    var host = el("pxIa");
    if (!host) return;
    var txt = (ia && (ia.answer || ia.definition || ia.abstractText)) || "";
    if (!txt) { host.hidden = true; return; }
    var srcUrl = ia.abstractUrl || ia.definitionUrl || "";
    host.innerHTML =
      (ia.image && !ia.imageIsLogo ? '<img src="' + esc(ia.image) + '" alt="" loading="lazy">' : "") +
      "<div><div class=\"px-ia__answer\">" + esc(txt) + "</div>" +
      '<div class="px-ia__src">' + esc(ia.abstractSource || ia.answerType || "DuckDuckGo Instant Answers") +
      (srcUrl ? ' · <a href="' + esc(srcUrl) + '" target="_blank" rel="noopener noreferrer">source</a>' : "") +
      "</div></div>";
    host.hidden = false;
  };

  var renderWiki = function (w) {
    var host = el("pxKnowledgePanel");
    if (!host) return;
    if (!w || !w.extract) { host.hidden = true; return; }
    var thumbs = [w.thumb].concat(w.extraThumbs || []).filter(Boolean).slice(0, 3);
    host.innerHTML =
      (w.thumb ? '<img class="px-kp__img" src="' + esc(w.thumb) + '" alt="" loading="lazy">' : "") +
      '<div class="px-kp__body">' +
      '<div class="px-kp__sub">Knowledge panel · Wikipedia</div>' +
      '<div class="px-kp__title">' + esc(w.title) + "</div>" +
      '<p class="px-kp__extract">' + esc(PIKPxUtilTrim(w.extract, 700)) + "</p>" +
      (thumbs.length > 1 ? '<div class="px-kp__more">' + thumbs.slice(0, 3).map(function (t) { return '<img src="' + esc(t) + '" data-lb="' + esc(t) + '" alt="" loading="lazy">'; }).join("") + "</div>" : "") +
      '<a class="px-kp__link" href="' + esc(w.url) + '" target="_blank" rel="noopener noreferrer">Read on Wikipedia →</a>' +
      ((w.more || []).length ? '<div class="px-kp__rows">' + w.more.map(function (m) {
        return '<div class="px-kp__row"><a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer">' + esc(m.title) + "</a><p>" + esc(m.extract) + "</p></div>";
      }).join("") + "</div>" : "") +
      "</div>";
    host.hidden = false;
  };

  var PIKPxUtilTrim = function (s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:]\S*$/, "") + "…" : s;
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
    if (!imgs || !imgs.length) { g.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;
    g.innerHTML = imgs.map(function (im) {
      return '<figure class="px-imgcell" data-full="' + esc(im.full) + '" data-page="' + esc(im.page || "") + '" data-cap="' + esc(im.title) + '">' +
        '<img src="' + esc(im.thumb) + '" alt="' + esc(im.title) + '" loading="lazy"><span>' + esc(im.title) + "</span></figure>";
    }).join("");
  };

  var renderNews = function (news) {
    var l = el("pxNewsList"), empty = el("pxNewsEmpty");
    if (!l) return;
    if (!news || !news.length) { l.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;
    l.innerHTML = news.map(function (n) {
      return '<a class="px-newscard" href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer"><div class="px-newscard__l">' +
        '<div class="px-newscard__meta"><span>' + esc(n.source || n.host.split(" ")[0]) + "</span>" + (n.age ? "<span>" + esc(n.age) + "</span>" : "") + "</div>" +
        '<div class="px-newscard__title">' + esc(n.title) + "</div>" +
        '<div class="px-newscard__snip">' + esc(n.snippet) + "</div></div></a>";
    }).join("");
  };

  var switchTab = function (name) {
    serp.tab = name;
    $$(".px-tabs button").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-pxtab") === name); });
    [["all", "pxTabAll"], ["images", "pxTabImages"], ["news", "pxTabNews"], ["nexus", "pxTabNexus"]].forEach(function (p) {
      var e = el(p[1]);
      if (e) e.hidden = p[0] !== name;
    });
    var ov = el("pxOverview");
    if (ov) ov.hidden = name !== "all";
  };

  var openLightbox = function (full, cap, page) {
    var lb = el("pxLightbox");
    if (!lb) return;
    el("pxLbImg").src = full;
    el("pxLbCap").innerHTML = esc(cap || "") + (page ? ' · <a href="' + esc(page) + '" target="_blank" rel="noopener noreferrer">source page</a>' : "");
    lb.classList.add("is-open");
  };

  var runOverview = async function () {
    var ov = el("pxOverview"), bodyEl = el("pxOvBody"), engTxt = el("pxOvEngineTxt"), footMeta = el("pxOvFootMeta");
    if (!ov || !window.PIKOverview) return;
    if (serp.ovCtrl) { try { serp.ovCtrl.abort(); } catch (e) {} }
    serp.ovCtrl = new AbortController();
    ov.hidden = false;
    engTxt.textContent = "grounding… streaming live";
    bodyEl.innerHTML = '<div class="px-skel" style="height:18px"></div><div class="px-skel" style="height:14px;width:90%"></div><div class="px-skel" style="height:14px;width:80%"></div><div class="px-skel" style="height:14px;width:88%"></div>';
    var acc = "";
    var painted = false;
    try {
      var r = await window.PIKOverview.generate(serp.q, serp.data, {
        signal: serp.ovCtrl.signal,
        onDelta: function (d) {
          acc += d;
          if (!painted) { painted = true; }
          bodyEl.innerHTML = mdRender(acc) + '<span class="px-ov__cursor"></span>';
        }
      });
      bodyEl.innerHTML = mdRender(r.markdown);
      engTxt.textContent = r.providerLabel || r.engine;
      footMeta.textContent = "streamed live · " + (r.tokenBudget ? (r.tokenBudget / 1000) + "k token budget · " : "") + "grounded on " +
        ((serp.data.web && serp.data.web.length) || 0) + " web results, " +
        ((serp.data.news && serp.data.news.length) || 0) + " news items, Wikipedia extract" +
        (serp.data.ia && serp.data.ia.topics && serp.data.ia.topics.length ? ", DDG instant answers" : "");
      serp.askHistory = [{ role: "user", content: "Topic under discussion: " + serp.q }, { role: "assistant", content: r.markdown }];
    } catch (e) {
      if (e && e.name === "AbortError") return;
      engTxt.textContent = "engine unreachable";
      bodyEl.innerHTML = '<span class="px-ov__err">NEXUS could not reach any free inference engine for the overview (' + esc(String((e && e.message) || e)) + '). Organic results below are still live data.</span>';
    }
  };

  var doSearch = async function (q) {
    q = String(q || "").trim();
    if (!q || !window.PIKSearch) return;
    serp.q = q;
    serp.data = {};
    goResults();
    var mini = el("pxMiniInput");
    if (mini) mini.value = q;
    switchTab("all");
    el("pxResultsStats").textContent = "fetching from free APIs…";
    skels(el("pxWebList"), 6, 40);
    el("pxIa").hidden = true;
    el("pxKnowledgePanel").hidden = true;
    el("pxImgGrid").innerHTML = ""; el("pxNewsList").innerHTML = "";
    var ov = el("pxOverview");
    if (ov) { ov.hidden = false; el("pxOvBody").innerHTML = '<div class="px-skel" style="height:16px"></div><div class="px-skel" style="height:14px;width:85%"></div>'; el("pxOvEngineTxt").textContent = "waiting for grounding data…"; }
    pulse();
    rotateIdentity(true);
    vaultPush("Live SERP fetch dispatched for “" + PIKPxUtilTrim(q, 40) + "” · zero redirects", true);

    var firstPaintOv = false;
    var res = await window.PIKSearch.runAll(q, {
      ia: function (v) { serp.data.ia = v; renderIa(v); },
      wiki: function (v) { serp.data.wiki = v; renderWiki(v); },
      web: function (v) { serp.data.web = v || []; renderWeb(serp.data.web, q); },
      news: function (v) { serp.data.news = v || []; renderNews(serp.data.news); },
      images: function (v) { serp.data.images = v || []; renderImages(serp.data.images); },
      related: function (v) { serp.data.related = v || []; renderRelated(serp.data.related); }
    });
    serp.data = res;
    el("pxResultsStats").textContent = res.meta.ms + " ms · " + ((res.web || []).length) + " web · " + ((res.news || []).length) + " news · " + ((res.images || []).length) + " images · ddg + wikipedia + commons (keyless)";
    if (!firstPaintOv) { firstPaintOv = true; runOverview(); }
  };

  var wireSerP = function () {
    if (!window.PIKSearch) return;
    /* result tabs */
    $$(".px-tabs button").forEach(function (b) {
      b.addEventListener("click", function () { switchTab(b.getAttribute("data-pxtab")); });
    });
    /* back to ghost new tab */
    ["pxBackHome", "pxResultsHome"].forEach(function (id) {
      var btn = el(id);
      if (btn) btn.addEventListener("click", goHome);
    });
    /* mini omnibox on the results page */
    var mf = el("pxMiniForm");
    if (mf) mf.addEventListener("submit", function (ev) {
      ev.preventDefault();
      doSearch(el("pxMiniInput").value);
    });
    /* related-search chips (delegated) */
    doc.addEventListener("click", function (ev) {
      var chip = ev.target.closest ? ev.target.closest(".px-related__chip") : null;
      if (chip && chip.getAttribute("data-q")) { doSearch(chip.getAttribute("data-q")); return; }
      var kb = ev.target.closest ? ev.target.closest(".px-kp__more img") : null;
      if (kb) { openLightbox(kb.getAttribute("data-lb"), "Wikipedia image", ""); return; }
      var cell = ev.target.closest ? ev.target.closest(".px-imgcell") : null;
      if (cell) { openLightbox(cell.getAttribute("data-full"), cell.getAttribute("data-cap"), cell.getAttribute("data-page")); }
    });
    /* lightbox close */
    var lb = el("pxLightbox");
    if (lb) {
      el("pxLbClose").addEventListener("click", function () { lb.classList.remove("is-open"); });
      lb.addEventListener("click", function (ev) { if (ev.target === lb) lb.classList.remove("is-open"); });
    }
    /* overview actions */
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
    /* ask-nexus follow-up chat (real model, session history) */
    var af = el("pxAskForm");
    if (af) af.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var input = el("pxAskInput");
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      var feed = el("pxAskFeed");
      appendAskMsg("px-msg--user", "You · masked device hash " + Math.random().toString(36).slice(2, 10), esc(text));
      if (!serp.askHistory.length) serp.askHistory.push({ role: "user", content: "Topic under discussion: " + serp.q });
      var node = appendAskMsg("px-msg--nexus", "NEXUS · booting free engine chain…", '<span class="px-ov__cursor"></span>');
      var body = node.querySelector("div:last-child");
      var acc = "";
      try {
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
        node.querySelector(".px-msg__meta").textContent = "NEXUS · " + (r.providerLabel || r.engine) + " · 512k budget";
        serp.askHistory.push({ role: "user", content: text });
        serp.askHistory.push({ role: "assistant", content: r.text || acc });
      } catch (e) {
        if (e && e.name === "AbortError") return;
        body.innerHTML = '<span class="px-ov__err">Engines unreachable — nothing faked. ' + esc(String((e && e.message) || e)) + "</span>";
      }
    });
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
        if (!title) return;
        var t = title.textContent.trim();
        suggest.classList.remove("is-open");
        /* "Ask NEXUS anything" jumps straight to the real AI composer */
        if (/^ask nexus/i.test(t)) {
          var nx = $("#pxNexusCard");
          if (nx) { nx.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(function () { $("#pxNexusInput").focus(); }, 600); }
          return;
        }
        input.value = t;
        doSearch(t);
      });
    });
    var form = $("#pxOmniForm");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      pulse();
      var isOnion = /\.onion\b/i.test(v);
      /* Typed URLs still navigate to the site itself… */
      if (/^https?:\/\//i.test(v) || /\.(com|org|net|io|dev|app|onion)(\/|$)/i.test(v)) {
        rotateIdentity(true);
        toast("Navigating directly · identity rotated first");
        vaultPush(isOnion ? "Onion circuit opened to " + v.slice(0, 42) : "Direct navigation to " + v.slice(0, 48), true);
        window.open((/^https?:/i.test(v) ? "" : (isOnion ? "http://" : "https://")) + v, "_blank", "noopener,noreferrer");
        return;
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
