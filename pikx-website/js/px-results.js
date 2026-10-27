/* ============================================================================
   PIKX — px-results.js
   ----------------------------------------------------------------------------
   Owns the results tab: the tab strip, the search lifecycle and the rendering
   of what js/px-search.js returns.

   This replaces the previous behaviour in pikx.js, which called
   window.open("https://duckduckgo.com/?q=…") and navigated the user away from
   PIKX entirely. Results are now fetched and rendered in place.

   SECURITY
   Titles, snippets and URLs all originate from third-party sites. Every one of
   them is assigned through textContent or set as a validated href — nothing is
   interpolated into innerHTML. Snippets may contain DDG's <b> highlight markup,
   which is escaped first and then re-permitted tag-by-tag via
   PIKSearch.allowBoldOnly, so a snippet cannot smuggle a script or an attribute.

   URLs are validated against an http/https allow-list before being used as an
   href, which blocks javascript: and data: payloads arriving via a result.

   NOTE ON CSP: pikx.html sets script-src 'self' with no 'unsafe-inline', so
   inline onerror="" attributes would be blocked. Image error handling is
   attached with addEventListener instead.
   ========================================================================= */
(function (global) {
  "use strict";

  var doc = document;
  var $ = function (s) { return doc.querySelector(s); };

  var S = global.PIKSearch;

  /* ------------------------------------------------------------ state ---- */
  var tabs = [];
  var activeId = null;
  var seq = 0;
  var inflight = null;          /* AbortController for the running search */

  var els = {};

  function cacheEls() {
    [
      "pxStage", "pxViewNewTab", "pxViewResults", "pxTabs", "pxNewTab",
      "pxResQuery", "pxResCount", "pxResTime", "pxResRefresh", "pxResSources",
      "pxResBanner", "pxResAnswer", "pxAnsSrc", "pxAnsTitle", "pxAnsText",
      "pxAnsLink", "pxAnsLinkHost", "pxResStatus", "pxResStatusText",
      "pxResList", "pxResEmpty", "pxEmptyTitle", "pxEmptyText",
      "pxEmptyRetry", "pxEmptyExternal", "pxOmniInput"
    ].forEach(function (id) { els[id] = doc.getElementById(id); });
  }

  /* ------------------------------------------------------- url safety ---- */

  function safeUrl(u) {
    var s = String(u || "").trim();
    if (!s) return "";
    /* Only http and https may become a link. This is what stops a malicious
       result from carrying javascript: or data: into an href. */
    if (!/^https?:\/\//i.test(s)) return "";
    try { new URL(s); } catch (e) { return ""; }
    return s;
  }

  /* ------------------------------------------------------------- tabs ---- */

  function makeTab(kind, query) {
    seq += 1;
    return {
      id: "t" + seq,
      kind: kind,                     /* "new" | "results" */
      query: query || "",
      title: kind === "results" ? labelFor(query) : "Ghost New Tab",
      envelope: null,
      loading: false,
      scrollY: 0
    };
  }

  function labelFor(q) {
    var s = String(q || "").trim();
    if (!s) return "Ghost New Tab";
    return s.length > 22 ? s.slice(0, 21) + "…" : s;
  }

  function activeTab() {
    for (var i = 0; i < tabs.length; i++) if (tabs[i].id === activeId) return tabs[i];
    return null;
  }

  function buildTabEl() {
    var btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "px-tabitem";
    btn.setAttribute("role", "tab");

    var dot = doc.createElement("i");
    dot.className = "px-tabitem__dot";

    var label = doc.createElement("span");
    label.className = "px-tabitem__label";

    var close = doc.createElement("span");
    close.className = "px-tabitem__close";
    close.setAttribute("role", "button");
    close.setAttribute("tabindex", "-1");
    close.setAttribute("aria-label", "Close tab");
    close.setAttribute("aria-hidden", "true");
    /* static markup, no interpolation */
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

    btn.appendChild(dot);
    btn.appendChild(label);
    btn.appendChild(close);
    return btn;
  }

  function updateTabEl(btn, t) {
    var isActive = t.id === activeId;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    if (isActive) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
    btn.dataset.tabId = t.id;
    btn.dataset.kind = t.kind;

    var label = btn.querySelector(".px-tabitem__label");
    if (label) {
      var text = t.loading ? "Searching…" : t.title;
      if (label.textContent !== text) label.textContent = text;
    }
    var dot = btn.querySelector(".px-tabitem__dot");
    if (dot) dot.classList.toggle("is-loading", !!t.loading);
  }

  /* Reconcile the strip in place rather than rebuilding it.

     The first version wiped #pxTabs and recreated every button on each render.
     That destroyed the focused node, so a keyboard user who activated a tab or
     pressed Ctrl+T had focus thrown back to <body> and lost their place in the
     strip. Reusing the existing elements keeps focus, selection and any
     in-flight CSS transition intact. */
  function renderTabs() {
    var host = els.pxTabs;
    if (!host) return;

    var byId = {};
    Array.prototype.forEach.call(host.querySelectorAll(".px-tabitem"), function (el) {
      if (el.dataset.tabId) byId[el.dataset.tabId] = el;
    });

    /* drop tabs that no longer exist */
    Object.keys(byId).forEach(function (id) {
      var stillThere = false;
      for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) stillThere = true;
      if (!stillThere && byId[id].parentNode) byId[id].parentNode.removeChild(byId[id]);
    });

    /* create-or-reuse, then fix ordering */
    tabs.forEach(function (t, idx) {
      var btn = byId[t.id];
      if (!btn) { btn = buildTabEl(); byId[t.id] = btn; }
      updateTabEl(btn, t);
      if (host.children[idx] !== btn) host.insertBefore(btn, host.children[idx] || null);
    });
  }

  function showView(kind) {
    if (!els.pxStage) return;
    var results = kind === "results";
    els.pxStage.setAttribute("data-view", results ? "results" : "newtab");
    if (els.pxViewResults) els.pxViewResults.hidden = !results;
    if (els.pxViewNewTab) els.pxViewNewTab.hidden = results;
  }

  function switchTo(id) {
    var t = null;
    tabs.forEach(function (x) { if (x.id === id) t = x; });
    if (!t) return;

    /* remember where the user was in the list they are leaving */
    var prev = activeTab();
    if (prev) prev.scrollY = global.scrollY || 0;

    activeId = id;
    renderTabs();

    if (t.kind === "new") {
      showView("new");
      if (els.pxOmniInput) {
        els.pxOmniInput.value = "";
        setTimeout(function () { els.pxOmniInput.focus(); }, 40);
      }
      return;
    }

    showView("results");
    if (t.envelope) {
      render(t);
      global.scrollTo(0, t.scrollY || 0);
    } else if (!t.loading) {
      run(t.query, { fresh: false });
    }
  }

  function closeTab(id) {
    var idx = -1;
    tabs.forEach(function (x, i) { if (x.id === id) idx = i; });
    if (idx === -1) return;
    tabs.splice(idx, 1);

    if (!tabs.length) {
      var fresh = makeTab("new");
      tabs.push(fresh);
      switchTo(fresh.id);
      return;
    }
    if (id === activeId) {
      var next = tabs[Math.min(idx, tabs.length - 1)];
      switchTo(next.id);
    } else {
      renderTabs();
    }
  }

  function newTab() {
    var t = makeTab("new");
    tabs.push(t);
    switchTo(t.id);
    return t;
  }

  /* ---------------------------------------------------------- rendering -- */

  function clearNode(n) { if (n) n.textContent = ""; }

  function showSkeleton() {
    if (!els.pxResList) return;
    clearNode(els.pxResList);
    /* PERFORMANCE: built off-DOM and committed in a single insertion. */
    var frag = doc.createDocumentFragment();
    for (var i = 0; i < 4; i++) {
      var s = doc.createElement("li");
      s.className = "px-skel";
      s.setAttribute("aria-hidden", "true");
      s.innerHTML =
        '<span class="px-skel__line px-skel__line--title"></span>' +
        '<span class="px-skel__line px-skel__line--a"></span>' +
        '<span class="px-skel__line px-skel__line--b"></span>';
      frag.appendChild(s);
    }
    els.pxResList.appendChild(frag);
  }

  function renderSources(env) {
    var host = els.pxResSources;
    if (!host) return;
    clearNode(host);

    var known = [
      { key: "duckduckgo", label: "DuckDuckGo" },
      { key: "duckduckgo-lite", label: "DDG Lite" },
      { key: "wikipedia", label: "Wikipedia" },
      { key: "duckduckgo-ia", label: "DDG Instant Answer" },
      { key: "instant-answer", label: "Instant Answer" }
    ];
    var seen = {};
    (env.sources || []).forEach(function (s) { seen[s] = true; });

    known.forEach(function (k) {
      if (!seen[k.key]) return;
      var b = doc.createElement("span");
      b.className = "px-srcbadge";
      var i = doc.createElement("i");
      var txt = doc.createElement("span");
      txt.textContent = k.label;
      b.appendChild(i);
      b.appendChild(txt);
      host.appendChild(b);
    });

    /* Be explicit when the proxy did not contribute, because that is the
       difference between "the web returned nothing" and "we could not ask". */
    if (!env.proxyAvailable) {
      var off = doc.createElement("span");
      off.className = "px-srcbadge px-srcbadge--off";
      off.title = "The /api/search proxy did not respond, so only CORS-enabled sources were used.";
      var oi = doc.createElement("i");
      var ot = doc.createElement("span");
      ot.textContent = "proxy offline";
      off.appendChild(oi); off.appendChild(ot);
      host.appendChild(off);
    }
  }

  function renderBanner(env) {
    var b = els.pxResBanner;
    if (!b) return;
    if (!env.error) { b.hidden = true; clearNode(b); return; }

    b.hidden = false;
    b.className = "px-results__banner " + (env.degraded ? "px-results__banner--error" : "px-results__banner--warn");
    clearNode(b);

    var msg = doc.createElement("span");
    if (env.degraded) {
      msg.textContent = "No source returned results for this query.";
    } else if (!env.proxyAvailable) {
      msg.textContent = "The search proxy is unreachable, so only knowledge-panel sources answered. Full web results need the /api/search function to be deployed.";
    } else {
      msg.textContent = "Some sources were unavailable, so this list may be incomplete.";
    }
    b.appendChild(msg);

    var code = doc.createElement("code");
    code.textContent = env.error;
    b.appendChild(doc.createElement("br"));
    b.appendChild(code);
  }

  function renderAnswer(env) {
    var card = els.pxResAnswer;
    if (!card) return;
    var a = env.answer;
    if (!a || !a.text) { card.hidden = true; return; }

    card.hidden = false;
    if (els.pxAnsTitle) els.pxAnsTitle.textContent = a.heading || env.query;
    if (els.pxAnsText) els.pxAnsText.textContent = a.text;
    if (els.pxAnsSrc) els.pxAnsSrc.textContent = a.source || "Instant Answer";

    var url = safeUrl(a.url);
    if (els.pxAnsLink) {
      if (url) {
        els.pxAnsLink.href = url;
        els.pxAnsLink.hidden = false;
        if (els.pxAnsLinkHost) els.pxAnsLinkHost.textContent = S.hostOf(url) || url;
      } else {
        els.pxAnsLink.hidden = true;
        els.pxAnsLink.removeAttribute("href");
      }
    }
  }

  function renderResult(r, i) {
    var li = doc.createElement("li");
    li.className = "px-result";
    li.style.setProperty("--i", String(i));

    var url = safeUrl(r.url);

    /* favicon */
    var fav = doc.createElement("img");
    fav.className = "px-result__favicon";
    fav.alt = "";
    fav.width = 20; fav.height = 20;
    fav.loading = "lazy";
    fav.decoding = "async";
    fav.src = S.faviconFor(r.url);
    /* CSP forbids inline onerror=, so hide broken favicons from here */
    fav.addEventListener("error", function () { fav.style.visibility = "hidden"; });

    var body = doc.createElement("div");
    body.className = "px-result__body";

    var host = doc.createElement("div");
    host.className = "px-result__host";
    var hostName = doc.createElement("span");
    hostName.textContent = r.host || S.hostOf(r.url) || url;
    host.appendChild(hostName);
    if (r.source) {
      var tag = doc.createElement("span");
      tag.className = "px-result__srctag";
      tag.textContent = r.source;
      host.appendChild(tag);
    }

    var h3 = doc.createElement("h3");
    h3.className = "px-result__title";
    var link = doc.createElement("a");
    link.className = "px-result__link";
    link.textContent = r.title || url || "(untitled)";
    if (url) {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow";
    } else {
      /* no safe URL: render the title as text, not as a link */
      link.removeAttribute("href");
      link.style.cursor = "default";
    }
    h3.appendChild(link);

    body.appendChild(host);
    body.appendChild(h3);

    if (r.snippet) {
      var p = doc.createElement("p");
      p.className = "px-result__snippet";
      /* escaped, then only <b> re-permitted — see header note */
      p.innerHTML = S.allowBoldOnly(r.snippet);
      body.appendChild(p);
    }

    if (url) {
      var u = doc.createElement("div");
      u.className = "px-result__url";
      u.textContent = url.replace(/^https?:\/\//, "").slice(0, 110);
      body.appendChild(u);
    }

    li.appendChild(fav);
    li.appendChild(body);

    if (r.thumb) {
      var turl = safeUrl(r.thumb);
      if (turl) {
        var img = doc.createElement("img");
        img.className = "px-result__thumb";
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.src = turl;
        img.addEventListener("error", function () { img.remove(); });
        li.appendChild(img);
      }
    }

    return li;
  }

  function renderEmpty(env) {
    if (!els.pxResEmpty) return;
    els.pxResEmpty.hidden = false;
    if (els.pxEmptyTitle) {
      els.pxEmptyTitle.textContent = env.proxyAvailable
        ? "No results for this query"
        : "Results unavailable — proxy not reachable";
    }
    if (els.pxEmptyText) {
      clearNode(els.pxEmptyText);
      var line = doc.createElement("span");
      line.textContent = env.proxyAvailable
        ? "Every source came back empty. Try different wording, or open the query in DuckDuckGo directly."
        : "This page could not reach /api/search, and the CORS-enabled sources had nothing for this query. Deploy the serverless function (see api/README.md) to enable full web results.";
      els.pxEmptyText.appendChild(line);
      if (env.error) {
        var c = doc.createElement("code");
        c.textContent = " " + env.error;
        els.pxEmptyText.appendChild(c);
      }
    }
    if (els.pxEmptyExternal) {
      els.pxEmptyExternal.href = "https://duckduckgo.com/?q=" + encodeURIComponent(env.query || "");
    }
  }

  function render(tab) {
    var env = tab.envelope;
    if (!env) return;

    if (els.pxResQuery) els.pxResQuery.textContent = env.query;
    if (els.pxResCount) {
      els.pxResCount.textContent = env.results.length
        ? env.results.length + (env.results.length === 1 ? " result" : " results")
        : "no results";
    }
    if (els.pxResTime) {
      els.pxResTime.textContent = env.fromCache ? "from session cache" : env.ms + " ms";
    }

    if (els.pxResStatus) els.pxResStatus.hidden = true;
    if (els.pxResEmpty) els.pxResEmpty.hidden = true;

    renderSources(env);
    renderBanner(env);
    renderAnswer(env);

    if (els.pxResList) {
      /* PERFORMANCE: append each <li> straight onto the live list before. Every
         insertion invalidated layout of a list sitting on top of blurred,
         animated background layers, so rendering N results cost N forced
         layouts. Build off-DOM in one DocumentFragment, commit once. */
      clearNode(els.pxResList);
      var frag = doc.createDocumentFragment();
      env.results.forEach(function (r, i) { frag.appendChild(renderResult(r, i)); });
      els.pxResList.appendChild(frag);
    }

    if (!env.results.length) renderEmpty(env);
  }

  /* ------------------------------------------------------------ search --- */

  function setStatus(text) {
    if (!els.pxResStatus) return;
    els.pxResStatus.hidden = false;
    if (els.pxResStatusText) els.pxResStatusText.textContent = text;
  }

  /**
   * Run a search in the active tab and render it.
   * @param {string} query
   * @param {object} [opts] { fresh }
   */
  async function run(query, opts) {
    if (!S) {
      /* module missing — fail visibly rather than silently doing nothing */
      showView("results");
      setStatus("Search module failed to load (js/px-search.js).");
      return null;
    }

    var q = String(query || "").trim();
    if (!q) return null;

    var tab = activeTab();
    if (!tab) { tab = makeTab("new"); tabs.push(tab); activeId = tab.id; }

    /* a search from the address bar turns a blank tab into a results tab */
    tab.kind = "results";
    tab.query = q;
    tab.title = labelFor(q);
    tab.loading = true;
    tab.envelope = null;
    tab.scrollY = 0;

    showView("results");
    renderTabs();
    if (els.pxResQuery) els.pxResQuery.textContent = q;
    if (els.pxResCount) els.pxResCount.textContent = "";
    if (els.pxResTime) els.pxResTime.textContent = "";
    if (els.pxResBanner) els.pxResBanner.hidden = true;
    if (els.pxResAnswer) els.pxResAnswer.hidden = true;
    if (els.pxResEmpty) els.pxResEmpty.hidden = true;
    if (els.pxResSources) clearNode(els.pxResSources);
    showSkeleton();
    setStatus("Fetching results…");
    global.scrollTo(0, 0);

    /* cancel whatever was still in flight — the user moved on */
    if (inflight) { try { inflight.abort(); } catch (e) {} }
    var ctrl = ("AbortController" in global) ? new AbortController() : null;
    inflight = ctrl;

    var env;
    try {
      env = await S.search(q, { signal: ctrl ? ctrl.signal : undefined, fresh: !!(opts && opts.fresh) });
    } catch (e) {
      var aborted = e && (e.name === "AbortError");
      tab.loading = false;
      renderTabs();
      if (aborted) return null;
      env = {
        query: q, results: [], answer: null, sources: [], proxyAvailable: false,
        degraded: true, partial: false,
        error: (e && e.message) || String(e), ms: 0, fromCache: false
      };
    }

    if (inflight === ctrl) inflight = null;

    /* a newer search may have replaced this tab's query while we awaited */
    if (tab.query !== q) return null;

    tab.loading = false;
    tab.envelope = env;
    if (activeId === tab.id) render(tab);
    renderTabs();
    return env;
  }

  /* -------------------------------------------------------------- wiring - */

  function wire() {
    if (els.pxTabs) {
      els.pxTabs.addEventListener("click", function (ev) {
        var closeEl = ev.target.closest ? ev.target.closest(".px-tabitem__close") : null;
        var tabEl = ev.target.closest ? ev.target.closest(".px-tabitem") : null;
        if (!tabEl) return;
        var id = tabEl.dataset.tabId;
        if (closeEl) { ev.stopPropagation(); closeTab(id); return; }
        switchTo(id);
      });
      /* middle-click closes, like a real browser */
      els.pxTabs.addEventListener("auxclick", function (ev) {
        if (ev.button !== 1) return;
        var tabEl = ev.target.closest ? ev.target.closest(".px-tabitem") : null;
        if (!tabEl) return;
        ev.preventDefault();
        closeTab(tabEl.dataset.tabId);
      });
    }

    if (els.pxNewTab) {
      /* pikx.js also binds this button to a toast; both handlers coexist. */
      els.pxNewTab.addEventListener("click", function () { newTab(); });
    }

    if (els.pxResRefresh) {
      els.pxResRefresh.addEventListener("click", function () {
        var t = activeTab();
        if (t && t.query) run(t.query, { fresh: true });
      });
    }

    if (els.pxEmptyRetry) {
      els.pxEmptyRetry.addEventListener("click", function () {
        var t = activeTab();
        if (t && t.query) run(t.query, { fresh: true });
      });
    }

    /* Ctrl/Cmd+W would close the browser window, so use Ctrl/Cmd+T for a new
       ghost tab and Escape to step back to the hero while a result is open. */
    doc.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "t") {
        ev.preventDefault();
        newTab();
        return;
      }
      if (ev.key === "Escape" && els.pxStage && els.pxStage.getAttribute("data-view") === "results") {
        var input = els.pxOmniInput;
        if (input && doc.activeElement === input) return;  /* let blur close suggest */
        var blank = null;
        tabs.forEach(function (t) { if (!blank && t.kind === "new") blank = t; });
        switchTo(blank ? blank.id : newTab().id);
      }
    });
  }

  var PIKResults = {
    init: function () {
      cacheEls();
      if (!tabs.length) {
        /* adopt the static tab already in the markup so the strip is not empty
           before JS runs, and so the first search reuses it */
        var first = els.pxTabs && els.pxTabs.querySelector(".px-tabitem");
        var t = makeTab("new");
        if (first && first.dataset.tabId) t.id = first.dataset.tabId;
        tabs.push(t);
        activeId = t.id;
      }
      renderTabs();
      showView("new");
      wire();
    },
    run: run,
    newTab: newTab,
    /* exposed so pikx.js can hand off a submitted query */
    isUrl: function (v) { return S ? S.isUrl(v) : false; },
    toUrl: function (v) { return S ? S.toUrl(v) : v; },
    _state: function () { return { tabs: tabs, activeId: activeId }; }
  };

  global.PIKResults = PIKResults;
})(window);
