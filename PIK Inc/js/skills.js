/* ============================================================================
   PIK//NEXUS — skills.js
   Agent skill library for the prompt well:
     - curated on-device skill catalogue (deep reasoning, visualization, web
       research, code architect, debug surgeon, security review, data analysis,
       writing, planning, test engineering…)
     - every skill carries a precise instruction block that is injected into
       the system prompt of the next turn -> top-tier output in that domain
     - "Fetch skills" surfs the live internet (via PIKSurfer relays) and turns
       any page into new skill entries with keyless AI distillation through
       the pollinations text endpoint — so the library grows from real docs
     - chosen skills render as removable chips under the prompt bar
   ========================================================================= */
(function (global) {
  "use strict";

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  var LS_KEY = "pik.nexus.skills.custom";
  var MAX_ACTIVE = 4; // hard cap keeps the system prompt lean & effective

  /* ---------- curated seed catalogue --------------------------------------
     `inst` blocks are appended verbatim to the system prompt while active. */
  var SEED = [
    { id: "deep-reasoning", name: "Deep Reasoning", icon: "brain", src: "builtin",
      desc: "Exhaustive chain-of-thought, first-principles analysis, explicit trade-offs.",
      inst: "SKILL DEEP REASONING: before answering, decompose the problem into first principles, enumerate assumptions, consider at least two competing solution paths and their failure modes, then present only the distilled conclusion with a short 'Reasoning path' section showing the decisive steps." },
    { id: "visualization", name: "Visualization", icon: "chart", src: "builtin",
      desc: "Rich diagrams: Mermaid charts, inline SVG, ASCII art, data-viz code.",
      inst: "SKILL VISUALIZATION: when structure, flow, comparison or data is involved, include visuals — Mermaid code blocks (flowchart/sequenceDiagram/graph), compact hand-crafted inline SVG, or clean ASCII diagrams. Prefer one excellent diagram over many mediocre ones; always caption it." },
    { id: "web-research", name: "Web Research", icon: "globe", src: "builtin",
      desc: "Live page fetches via WEBGET[...] to ground answers in current sources.",
      inst: "SKILL WEB RESEARCH: actively emit WEBGET[https://…] calls (max 3 per answer) for any fact that could be stale — versions, APIs, pricing, news — then answer strictly from the fetched '[web research]' context and cite the source URLs inline." },
    { id: "code-architect", name: "Code Architect", icon: "code", src: "builtin",
      desc: "Production-grade file trees, SOLID design, complete runnable files.",
      inst: "SKILL CODE ARCHITECT: design before writing — sketch the file tree and module boundaries, apply SOLID and separation of concerns, then emit COMPLETE runnable files as ```path blocks with imports, error handling and types. No snippets, no elisions." },
    { id: "debug-surgeon", name: "Debug Surgeon", icon: "bug", src: "builtin",
      desc: "Root-cause tracing, minimal repros, surgical verified fixes.",
      inst: "SKILL DEBUG SURGEON: reproduce mentally, trace the failure to its root cause (not the symptom), explain the causal chain step by step, then apply the smallest correct fix and list exactly how to verify it passes." },
    { id: "security-review", name: "Security Review", icon: "shield", src: "builtin",
      desc: "Threat modeling, OWASP checks, hardened code output.",
      inst: "SKILL SECURITY REVIEW: audit every snippet for injection, XSS, SSRF, path traversal, secrets leakage and broken auth (OWASP top 10); harden proactively (validation, escaping, least privilege) and report findings as PASS/FIXED/VULNERABLE lines." },
    { id: "data-analysis", name: "Data Analysis", icon: "data", src: "builtin",
      desc: "Statistics, pandas pipelines, honest uncertainty, insight-first.",
      inst: "SKILL DATA ANALYSIS: state what question the data answers, check distributions and missingness before modelling, report effect sizes with uncertainty, avoid p-hacking; deliver clean reproducible pipelines plus the insight in plain language." },
    { id: "writing-polish", name: "Writing Polish", icon: "pen", src: "builtin",
      desc: "Editor-grade prose: clarity, rhythm, zero fluff, strong structure.",
      inst: "SKILL WRITING POLISH: rewrite for maximum signal — lead with the point, cut filler and hedging, vary sentence rhythm, use concrete verbs, keep paragraphs under four sentences, and preserve the author's voice." },
    { id: "plan-mode", name: "Plan First", icon: "map", src: "builtin",
      desc: "Numbered execution plan with milestones before any code is written.",
      inst: "SKILL PLAN FIRST: never write code immediately — produce a numbered execution plan with milestones, dependencies and risks, mark the decisions that need user input, then proceed only after the plan is stated." },
    { id: "test-engineer", name: "Test Engineer", icon: "check", src: "builtin",
      desc: "Meaningful unit/integration suites, edge cases, coverage that matters.",
      inst: "SKILL TEST ENGINEERING: write tests that break on real regressions — cover happy path, edges, and failure modes; use AAA structure, descriptive names, no brittle snapshots; emit them as complete files under tests/ with the exact runner command." },
    { id: "perf-optimizer", name: "Perf Optimizer", icon: "zap", src: "builtin",
      desc: "Measure first, complexity budgets, memory & latency wins.",
      inst: "SKILL PERFORMANCE: identify the hot path and its complexity class before touching code; quantify expected gains (Big-O, allocations, round-trips); prefer algorithmic wins over micro-tweaks; note profiling commands to confirm." },
    { id: "explain-teach", name: "Explain & Teach", icon: "book", src: "builtin",
      desc: "Socratic layered explanations from intuition to formalism.",
      inst: "SKILL EXPLAIN AND TEACH: build understanding in layers — one-sentence intuition, analogy, then precise technical formalism, then a minimal example; finish with 2-3 checking questions the reader should now be able to answer." }
  ];

  var ICONS = {
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V15a3 3 0 0 0 4 2.8M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V15a3 3 0 0 1-4 2.8M9 3h6M9 21h6M12 3v18"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6l-5 6 5 6m8-12l5 6-5 6"/></svg>',
    bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="6" width="8" height="12" rx="4"/><path d="M8 10H4m16 0h-4M8 14H4m16 0h-4M9 6 7 3m8 3 2-3M9 18l-2 3m8-3 2 3"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v6m0 6v6m9-9h-6M9 12H3m13.5-6.5-4 4m-3 3-4 4m0-11 4 4m3 3 4 4"/></svg>'
  };

  var Skills = {
    all: SEED.slice(),
    active: [],        // ids, order = selection order
    els: {},
    _open: false,
    _fetching: false,

    mount: function (refs) {
      this.els = refs;
      var self = this;

      /* load custom fetched skills persisted on device */
      try {
        var saved = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
        if (Array.isArray(saved)) {
          saved.forEach(function (s) { if (s && s.id && s.inst && !self.byId(s.id)) self.all.push(s); });
        }
      } catch (e) {}

      refs.toggle.addEventListener("click", function (e) { e.stopPropagation(); self._toggle(); });
      document.addEventListener("click", function (e) {
        if (self._open && refs.wrap && !refs.wrap.contains(e.target)) self._toggle(false);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && self._open) self._toggle(false);
      });

      /* Fetch-skills button — guard against overlapping runs. */
      refs.fetch.addEventListener("click", function (e) {
        e.stopPropagation(); // never let the click bubble to the doc close-listener
        self.fetchFromWeb();
      });

      /* Clear button — robustly wired:
         - bound directly on the element AND via delegation on the popover, so
           it works even if the button is re-rendered or covered by a ripple
           overlay that swallows the direct target;
         - stopPropagation keeps the document-level outside-click closer from
           racing with it;
         - actually empties `active`, chips, list highlights and the count
           badge, dispatches pik:skills, and confirms with a transient
           "cleared ✓" state + toast when there was something to clear. */
      var doClear = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        var had = self.active.length > 0;
        /* Belt & braces: also empty the chips DOM row directly, so even a
           stale render can never leave ghost chips after pressing clear. */
        try { if (self.els.chips) self.els.chips.innerHTML = ""; } catch (_) {}
        self.setActive([]); // re-renders chips/list/count + dispatches pik:skills
        if (had && global.PIKToasts) { try { PIKToasts.show({ type: "success", title: "Skills", text: "All skills cleared" }); } catch (_) {} }
        var btn = refs.reset;
        if (btn) {
          btn.textContent = "cleared ✓";
          btn.classList.add("is-done");
          clearTimeout(self._clearT);
          self._clearT = setTimeout(function () {
            btn.textContent = "clear";
            btn.classList.remove("is-done");
          }, 1200);
        }
      };
      refs.reset.addEventListener("click", doClear);
      refs.pop.addEventListener("click", function (e) {
        if (e.target.closest("[data-nx='skills-reset']")) doClear(e);
      });

      this.renderChips();
      this.renderList();
      this.renderCount();
    },

    byId: function (id) {
      for (var i = 0; i < this.all.length; i++) if (this.all[i].id === id) return this.all[i];
      return null;
    },

    _toggle: function (force) {
      this._open = typeof force === "boolean" ? force : !this._open;
      this.els.pop.hidden = !this._open;
      this.els.toggle.classList.toggle("is-on", this._open);
      if (this._open) this.renderList();
    },

    /* ---------- selection ---------- */
    isActive: function (id) { return this.active.indexOf(id) !== -1; },

    toggleSkill: function (id) {
      var i = this.active.indexOf(id);
      if (i !== -1) this.active.splice(i, 1);
      else {
        if (this.active.length >= MAX_ACTIVE) this.active.shift(); // oldest drops out
        this.active.push(id);
      }
      this.renderChips();
      this.renderList();
      this.renderCount();
      document.dispatchEvent(new CustomEvent("pik:skills", { detail: this.active.slice() }));
    },

    setActive: function (ids) {
      this.active = (ids || []).filter(function (id) { return true; }).slice(0, MAX_ACTIVE);
      this.renderChips();
      this.renderList();
      this.renderCount();
      document.dispatchEvent(new CustomEvent("pik:skills", { detail: this.active.slice() }));
    },

    /* the instruction block chat.js injects into the system prompt */
    promptBlock: function () {
      var self = this;
      if (!this.active.length) return "";
      var parts = this.active.map(function (id) {
        var s = self.byId(id);
        return s ? s.inst : "";
      }).filter(Boolean);
      if (!parts.length) return "";
      return "\nACTIVE AGENT SKILLS (apply each one rigorously in this turn):\n- " + parts.join("\n- ");
    },

    /* count badge on the skills toggle button */
    renderCount: function () {
      var c = this.els && this.els.count;
      if (!c) return;
      var n = this.active.length;
      c.textContent = String(n);
      c.hidden = n === 0;
    },

    renderChips: function () {
      var wrap = this.els.chips, self = this;
      if (!this.active.length) { wrap.innerHTML = ""; return; }
      wrap.innerHTML = this.active.map(function (id) {
        var s = self.byId(id);
        if (!s) return "";
        return '<span class="nx-skill-chip" title="' + esc(s.desc) + '">' +
          (ICONS[s.icon] || ICONS.spark) + esc(s.name) +
          '<button data-drop="' + s.id + '" aria-label="Remove skill">&times;</button></span>';
      }).join("");
      wrap.querySelectorAll("[data-drop]").forEach(function (b) {
        b.addEventListener("click", function (e) { e.stopPropagation(); self.toggleSkill(b.dataset.drop); });
      });
    },

    renderList: function () {
      var list = this.els.list, self = this;
      list.innerHTML = this.all.map(function (s) {
        var on = self.isActive(s.id);
        return '<button class="nx-skill' + (on ? " is-on" : "") + '" data-skill="' + s.id + '" title="' + esc(s.desc) + '">' +
          '<span class="nx-skill__icon">' + (ICONS[s.icon] || ICONS.spark) + "</span>" +
          '<span class="nx-skill__meta"><b>' + esc(s.name) + "</b><i>" + esc(s.desc) + "</i></span>" +
          '<span class="nx-skill__src">' + esc(s.src) + "</span>" +
          "</button>";
      }).join("");
      list.querySelectorAll("[data-skill]").forEach(function (b) {
        b.addEventListener("click", function () { self.toggleSkill(b.dataset.skill); });
      });
    },

    /* ---------- live skill acquisition from the open internet -------------
       PIKSurfer fetches real pages (skill catalogues, docs, awesome-lists)
       through keyless relays; a keyless pollinations call distils each page
       into structured skill JSON which joins the library. Fully offline-safe:
       any failure just reports honestly via toast. */
    SOURCES: [
      "https://gist.github.com/adamshelton/1d2613998af7db1138cb9c8efcc4dc86", // agent persona prompts
      "https://raw.githubusercontent.com/frixa/awesome-ai-agents/main/README.md",
      "https://raw.githubusercontent.com/danielmiessler/fabric/main/patterns/index.json"
    ],

    async fetchFromWeb() {
      if (this._fetching) return;
      if (!global.PIKSurfer) { this._toast("warn", "Web surfer unavailable", "Load the surfing engine first."); return; }
      this._fetching = true;
      var self = this;
      this.els.fetch.classList.add("is-busy");
      this.els.fetch.querySelector("span").textContent = "surfing…";

      var urls = this.SOURCES.slice(0, PIKSurfer.MAX_PER_TURN || 3);
      var added = 0, failed = 0;
      try {
        var results = await PIKSurfer.surf(urls, new AbortController().signal, function (st) {
          if (st && st.url) self.els.fetch.querySelector("span").textContent =
            "reading " + (st.index + 1) + "/" + st.total + "…";
        });

        var okPages = (results || []).filter(function (r) { return r && r.ok && r.text; });
        for (var i = 0; i < okPages.length; i++) {
          try {
            var fresh = await this._distill(okPages[i]);
            fresh.forEach(function (s) {
              if (!self.byId(s.id)) { self.all.push(s); added++; }
            });
          } catch (e) { failed++; }
        }
        if (added) this._persistCustom();
        this.renderList();
        this._toast(added ? "success" : "warn",
          added ? ("Fetched " + added + " new skill" + (added > 1 ? "s" : "") + " from the web") : "No new skills found",
          failed ? (failed + " source(s) unreachable — try again.") : "Library refreshed from live sources.");
      } catch (e) {
        this._toast("error", "Skill fetch failed", String(e && e.message || e).slice(0, 140));
      } finally {
        this._fetching = false;
        this.els.fetch.classList.remove("is-busy");
        this.els.fetch.querySelector("span").textContent = "Fetch skills";
      }
    },

    /* keyless distillation: ask a free model to turn raw page text into a
       strict JSON array of skills. Falls back to heuristic extraction when
       the LLM hop fails, so fetching never dead-ends. */
    async _distill(page) {
      var raw = String(page.text || "").replace(/\s+/g, " ").slice(0, 6000);
      var host = "";
      try { host = new URL(page.url).host; } catch (e) { host = "web"; }
      var task =
        "From the web page below (source: " + host + "), extract up to 4 reusable AI-agent SKILLS. " +
        "Respond ONLY with a JSON array, no prose, each item shaped:\n" +
        '[{"name":"Title Case","desc":"one line <=90 chars","inst":"imperative instruction block <=320 chars telling an AI agent exactly how to apply this skill"}]\n' +
        "Only include genuinely actionable capabilities (reasoning techniques, visualisation, research, tooling patterns).\n\nPAGE TEXT:\n" + raw;

      var parsed = null;
      try {
        var res = await fetch("https://text.pollinations.ai/openai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai", private: true, referrer: "pik.nexus",
            messages: [{ role: "user", content: task }],
            stream: false, temperature: 0.3
          })
        });
        if (res.ok) {
          var j = await res.json();
          var txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || "";
          parsed = this._parseJsonArr(txt);
        }
      } catch (e) { /* fall through to heuristics */ }

      if (!parsed || !parsed.length) parsed = this._heuristicSkills(raw, host);

      return parsed.slice(0, 4).map(function (s, idx) {
        var name = String(s.name || "").trim().slice(0, 40) || ("Web Skill " + (idx + 1));
        var id = "web-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) +
                 "-" + Math.random().toString(36).slice(2, 6);
        return {
          id: id, name: name, icon: "spark", src: host,
          desc: String(s.desc || "Fetched from " + host).trim().slice(0, 110),
          inst: String(s.inst || ("Apply the \"" + name + "\" discipline: " + (s.desc || "")).replace(/\s+/g, " ").trim()).slice(0, 400)
        };
      }).filter(function (s) { return s.inst.length > 24; });
    },

    _parseJsonArr: function (txt) {
      var m = /\[[\s\S]*\]/.exec(String(txt || ""));
      if (!m) return null;
      try {
        var arr = JSON.parse(m[0]);
        return Array.isArray(arr) ? arr.filter(function (x) { return x && x.name && (x.inst || x.desc); }) : null;
      } catch (e) { return null; }
    },

    /* no-LLM fallback: mine headings/bullets that look like capability names */
    _heuristicSkills: function (raw, host) {
      var out = [];
      var re = /(?:^|\.\s|[-•*]\s)([A-Z][A-Za-z0-9+ .'-]{4,36}(?:ing|ion|ics|ist|er|ator|reasoning|analysis|research|planning|design))(?:[:\u2014-]\s*(.{10,140}?))[.\n]/g;
      var m, seen = {};
      while ((m = re.exec(raw)) !== null && out.length < 4) {
        var name = m[1].trim(), desc = (m[2] || "").trim();
        var k = name.toLowerCase();
        if (seen[k]) continue; seen[k] = 1;
        out.push({ name: name, desc: desc.slice(0, 90) || ("Capability surfaced from " + host),
          inst: ("Apply the \"" + name + "\" skill rigorously in this turn: " + (desc || "use established best practices for " + name.toLowerCase())).replace(/\s+/g, " ").slice(0, 320) });
      }
      return out;
    },

    _persistCustom: function () {
      try {
        var custom = this.all.filter(function (s) { return s.src !== "builtin"; });
        localStorage.setItem(LS_KEY, JSON.stringify(custom.slice(-24))); // cap stored size
      } catch (e) {}
    },

    _toast: function (type, title, text) {
      if (global.PIKToasts) PIKToasts.show({ type: type, title: title, text: text });
    }
  };

  global.PIKSkills = Skills;
})(window);
