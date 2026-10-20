/* ============================================================================
   PIK//NEXUS — chat.js
   The agentic conversation loop:
     - user turn (text + any-file attachments) -> PIKRouter.chat()
     - streamed answer with a live, viewable/closeable THINKING panel
       (reasoning deltas render inside it; effort = Low/Medium/High/Max)
     - agent output is parsed for file blocks and written into the workspace
       tree (separate IDE environment), surfaced as clickable file chips
     - engine failover badge (OpenRouter -> Pollinations) shown inline
     - Enter sends, Shift+Enter newline, Esc aborts the stream
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* markdown renderer — PIKMD handles blocks (headings/tables/lists) and
     stashes math sentinels unescaped; PIKMath renders the TeX inside them. */
  function mdLite(s) {
    var raw = String(s == null ? "" : s);
    if (global.PIKMD) {
      var html = PIKMD.render(raw);
      if (global.PIKMath) html = PIKMath.renderHtml(html);
      return html;
    }
    if (global.PIKMath) return PIKMath.render(raw);
    return "<p>" + esc(raw).replace(/\n/g, "<br>") + "</p>";
  }

  var SVG_FILE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  var SVG_DL = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
  var SVG_CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

  /* ---------- fancy "generating" overlay (logo + shimmering label) ----------
     Replaces the old live writing process: while the agent works we show a
     monochrome logo mark with orbiting rings, a word-shimmer headline and an
     indeterminate scanline. Clicking it opens the full reasoning modal. */
  function genMarkup(modelLogo) {
    return '' +
      '<div class="nx-gen">' +
        '<div class="nx-gen__mark">' +
          (modelLogo
            ? '<img src="' + modelLogo + '" alt="" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'is-fallback\')">'
            : '') +
          '<span class="nx-gen__glyph">NX</span>' +
          '<i class="nx-gen__ring"></i><i class="nx-gen__ring nx-gen__ring--b"></i>' +
        '</div>' +
        '<div class="nx-gen__label">G E N E R A T I N G</div>' +
        '<div class="nx-gen__dots"><i></i><i></i><i></i></div>' +
        '<div class="nx-gen__scan"></div>' +
      '</div>';
  }

  /* strip emoji / pictographs from any rendered output — CDN icons only */
  var EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;
  function scrubEmoji(elOrText) {
    if (typeof elOrText === "string") return elOrText.replace(EMOJI_RE, "");
    try {
      var w = document.createTreeWalker(elOrText, NodeFilter.SHOW_TEXT);
      var n, dirty = false;
      while ((n = w.nextNode())) {
        if (EMOJI_RE.test(n.nodeValue)) { n.nodeValue = n.nodeValue.replace(EMOJI_RE, ""); dirty = true; }
      }
      return dirty;
    } catch (e) { return elOrText; }
  }

  var Chat = {
    els: {},
    history: [],          // {role, content}
    pendingFiles: [],     // attachment paths queued for next message
    busy: false,
    controller: null,
    lastEffort: "high",
    _streamBuf: "",
    _streamRAF: 0,

    mount: function (refs) {
      this.els = refs;
      var self = this;

      this.els.send.addEventListener("click", function () { self.busy ? self.abort() : self.send(); });
      this.els.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); self.send(); }
        if (e.key === "Escape" && self.busy) self.abort();
        // auto-grow
        setTimeout(function () {
          e.target.style.height = "auto";
          e.target.style.height = Math.min(240, e.target.scrollHeight) + "px";
        }, 0);
      });

      /* attach button opens the hidden file input */
      var attachBtn = document.getElementById("nx-attach-btn");
      if (attachBtn) attachBtn.addEventListener("click", function () { self.els.fileIn.click(); });

      /* ladder buttons */
      this.els.ladder.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          self.els.ladder.querySelectorAll("button").forEach(function (x) { x.classList.remove("is-on"); });
          b.classList.add("is-on");
          self.lastEffort = b.dataset.level;
          NexusSettings.patch({ thinking: self.lastEffort });
          if (global.PIKFX) PIKFX.orb(self.els.orb, self.lastEffort);
          document.dispatchEvent(new CustomEvent("pik:effort", { detail: self.lastEffort }));
        });
      });

      /* attach: accept ANY file type */
      this.els.fileIn.addEventListener("change", async function () {
        for (var i = 0; i < self.els.fileIn.files.length; i++) {
          var p = await PIKWorkspace.attachFile(self.els.fileIn.files[i]);
          self.pendingFiles.push(p);
          self._renderAttList();
        }
        self.els.fileIn.value = "";
      });

      /* engine change -> toast + pill */
      PIKRouter.onEngineChange = function (engine, reason) {
        var keyless = engine !== "openrouter";
        if (window.PIKToasts) PIKToasts.show({
          type: keyless ? "warn" : "info",
          title: keyless ? "Switched to free keyless engine" : "Back on OpenRouter",
          text: keyless
            ? "OpenRouter free tier exhausted or no key set \u2014 NEXUS now runs on " + engine +
              " (no API key needed)" + (reason ? ", reason: " + reason : "") + "."
            : "OpenRouter budget available again."
        });
        document.dispatchEvent(new CustomEvent("pik:engine", { detail: { engine: engine, reason: reason } }));
      };
    },

    _renderAttList: function () {
      var wrap = this.els.attlist, self = this;
      wrap.innerHTML = "";
      this.pendingFiles.forEach(function (p, idx) {
        var el = document.createElement("span");
        el.className = "nx-att";
        el.innerHTML = "<i>" + esc(p.split("/").pop()) + "</i>";
        var x = document.createElement("button");
        x.textContent = "×";
        x.onclick = function () { self.pendingFiles.splice(idx, 1); self._renderAttList(); };
        el.appendChild(x);
        wrap.appendChild(el);
      });
    },

    setEffort: function (lvl) {
      var b = this.els.ladder.querySelector('[data-level="' + lvl + '"]');
      if (b) b.click();
    },

    /* ---------- build multimodal-aware content ---------- */
    _contentForModel: function (text) {
      var info = PIKModels.get(this.modelId());
      var useVision = info && info.vision;
      var parts = [{ type: "text", text: text }];
      var self = this;
      this.pendingFiles.forEach(function (p) {
        var f = PIKWorkspace.project.files[PIKWorkspace._clean(p)];
        if (!f) return;
        if (useVision && f.binary && f.dataUrl) {
          parts.push({ type: "image_url", image_url: { url: f.dataUrl } });
        } else if (!f.binary) {
          parts.push({ type: "text", text: "[attached file: " + p + "]\n```\n" + (f.content || "").slice(0, 24000) + "\n```" });
        } else {
          parts.push({ type: "text", text: "[attached binary: " + p + " sha256:" + String(f.digest || "").slice(0, 12) + "]" });
        }
      });
      // plain string when there are no attachments (max model compatibility)
      return this.pendingFiles.length ? parts : text;
    },

    modelId: function () {
      return this.els.modelchip.dataset.model || CFG.SUGGESTED_MODEL;
    },

    /* ---------- main send loop ---------- */
    send: async function () {
      if (this.busy) return;
      var text = this.els.input.value.trim();
      if (!text && !this.pendingFiles.length) return;
      var self = this;
      this.busy = true;
      this._btnState(true);
      if (global.PIKFX) { PIKFX.orb(this.els.orb, this.lastEffort); this.els.orb.classList.remove("is-idle"); }

      var content = this._contentForModel(text || "(see attached files)");
      this.history.push({ role: "user", content: content });
      this._addUserMsg(text || "(attachments)", this.pendingFiles.slice());
      this.pendingFiles = []; this._renderAttList();
      this.els.input.value = ""; this.els.input.style.height = "auto";
      this._hideHero();

      /* assistant shell: think-panel + body. No live writing process anymore —
         a fancy GENERATING overlay (logo + shimmer) shows while the agent
         works; clicking it opens the full reasoning modal. */
      var node = this._addAssistantShell();
      var bodyEl = node.body, thinkWrap = node.think, thinkBody = node.thinkBody;
      var genLogo = (global.PIKModels && PIKModels.logoFor) ? PIKModels.logoFor(this.modelId().split("/")[0]) : null;
      bodyEl.innerHTML = genMarkup(genLogo);
      bodyEl.classList.add("is-generating");
      node.genShown = true;
      var genEl = bodyEl.querySelector(".nx-gen");
      if (genEl) genEl.addEventListener("click", function () {
        /* click the generating card -> see the entire thinking process */
        if (global.PIKThinkPanel) {
          thinkWrap.hidden = false;
          if (!thinkBody.textContent) thinkBody.textContent = "Reasoning is being collected\u2026";
          PIKThinkPanel.open(thinkWrap.__think || { getText: function () { return thinkBody.textContent || ""; }, model: self.modelId(), engine: PIKRouter.engine, effort: self.lastEffort });
        }
      });

      /* Codex/Claude-Code style incremental rendering: rAF-batched paints,
         virtually-closed code fences while streaming, blinking block caret. */
      var sr = null;
      if (global.PIKStream) {
        try { sr = PIKStream.create(bodyEl); } catch (e) { sr = null; }
      }

      try {
        var res = await PIKRouter.chat({
          model: this.modelId(),
          messages: this.history.slice(-24),
          thinking: this.lastEffort,
          signal: (this.controller = new AbortController()).signal,
          onDelta: function (d, isReasoning) {
            if (isReasoning) {
              thinkWrap.hidden = false;
              thinkBody.textContent += d;
              thinkBody.scrollTop = thinkBody.scrollHeight;
              /* live reasoning arrived -> reveal the panel automatically */
              if (!node._autoOpened) { node._autoOpened = true; node.think.classList.remove("is-closed"); }
              /* keep the full-trace modal live if the user opened it mid-stream */
              if (global.PIKThinkPanel) { try { PIKThinkPanel.tick(); } catch (e) {} }
            } else {
              /* first answer token -> retire the GENERATING overlay; the body
                 fills in only at completion (no live writing process shown) */
              if (node.genShown) { node.genShown = false; bodyEl.classList.remove("is-generating"); bodyEl.innerHTML = ""; }
              if (sr) { sr.push(d); }
              else { bodyEl.textContent += d; self._scrollThread(); }
            }
          }
        });

        /* final render with markdown syntax (## headings, **bold**, tables, math) */
        bodyEl.classList.add("md");
        if (sr) {
          sr.finish(); // flush any pending rAF paint and drop the caret
          if (!res.text) bodyEl.innerHTML = '<em style="color:var(--nx-txt-faint)">(empty response)</em>';
        } else {
          bodyEl.innerHTML = mdLite(res.text || "(empty response)");
        }
        if (global.PIKMD && PIKMD.wire) PIKMD.wire(bodyEl);
        if (global.PIKCodeEnhance) PIKCodeEnhance.enhance(bodyEl);
        scrubEmoji(bodyEl); // CDN icons only — no emoji ever in AI output
        if (res.reasoning && !thinkBody.textContent) thinkBody.textContent = res.reasoning;
        if (!res.reasoning) {
          thinkWrap.hidden = true; // no chain-of-thought tokens from this engine
          node.thinkLabel.textContent = "";
        } else {
          /* collapse by default but keep the strip visible & expandable */
          node.thinkLabel.textContent = "THOUGHT PROCESS";
          node.think.classList.add("is-closed");
          if (node._autoOpened) node.think.classList.remove("is-closed");
        }

        if (res.digest) node.digest.innerHTML = "<b>sha256</b> " + esc(res.digest.slice(0, 20)) +
          " <b>engine</b> " + esc(res.engine) + " <b>model</b> " + esc(String(res.model || ""));

        /* ingest file blocks into the IDE workspace */
        var wrote = PIKWorkspace.ingestAgentText(res.text || "");
        if (wrote.length) {
          var chipWrap = document.createElement("div");
          chipWrap.className = "nx-files";
          wrote.forEach(function (f, i) {
            var c = document.createElement("span");
            c.className = "nx-filechip is-new";
            c.style.animationDelay = (i * 90) + "ms";
            c.title = "Click: open in IDE \u00b7 Download icon: save to disk";
            c.innerHTML = SVG_FILE + "<span class=\"nx-filechip__p\">" + esc(f.path) + "</span>";
            /* clicking the chip name opens the file in the IDE */
            c.addEventListener("click", function () {
              document.dispatchEvent(new CustomEvent("pik:openfile", { detail: f.path }));
            });
            /* dedicated download button inside the chip -> real file download */
            var dl = document.createElement("button");
            dl.className = "nx-filechip__dl";
            dl.title = "Download " + f.path;
            dl.innerHTML = SVG_DL;
            dl.addEventListener("click", function (ev) {
              ev.stopPropagation();
              if (global.PIKPreview) PIKPreview.downloadFile(f.path);
            });
            c.appendChild(dl);
            chipWrap.appendChild(c);
          });
          node.body.parentNode.appendChild(chipWrap);
          /* tell the live-preview dock the agent finished writing files */
          document.dispatchEvent(new CustomEvent("pik:agentfiles", { detail: wrote.map(function (w) { return w.path; }) }));
          if (window.PIKToasts) PIKToasts.show({ type: "success", title: "Workspace updated",
            text: wrote.length + " file(s) written by the agent into the IDE — click a chip to open, or hit its download icon." });
        }

        this.history.push({ role: "assistant", content: res.text || "" });
      } catch (e) {
        if (String(e.message || e).indexOf("aborted") !== -1 || e.name === "AbortError") {
          bodyEl.innerHTML = '<em style="color:var(--nx-txt-faint)">— stream stopped by user —</em>';
        } else {
          var em = String(e.message || e);
          if (/401/.test(em)) em += " \u2014 every keyless engine refused; check your internet connection and press send again.";
          bodyEl.innerHTML = '<span style="color:var(--nx-danger)">transport error: ' + esc(em) +
            '</span> <button class="nx-retry" type="button">retry</button>';
          var rb = bodyEl.querySelector(".nx-retry");
          if (rb) rb.addEventListener("click", function () { self.send(); });
        }
      } finally {
        this.busy = false;
        this._btnState(false);
        this.els.orb.classList.add("is-idle");
        this._scrollThread();
      }
    },

    abort: function () { if (this.controller) this.controller.abort(); },

    _btnState: function (on) {
      this.els.send.disabled = false;
      this.els.send.classList.toggle("is-streaming", on);
      this.els.send.title = on ? "Stop (Esc)" : "Send (Enter)";
      // explicit width/height attrs + fill rule so the glyph can never render
      // at 0x0 even if a stylesheet fails to load or is stale-cached
      this.els.send.innerHTML = on
        ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>'
        : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 8 6 8z"/></svg>';
    },

    _scrollThread: function () {
      var t = this.els.thread;
      if (t.scrollHeight - t.scrollTop - t.clientHeight < 160) t.scrollTop = t.scrollHeight;
    },

    _hideHero: function () {
      var h = this.els.thread.querySelector(".nx-hero");
      if (h) { h.style.transition = "opacity .4s, transform .4s"; h.style.opacity = 0; h.style.transform = "scale(.96)"; setTimeout(function(){h.remove();}, 420); }
    },

    _addUserMsg: function (text, files) {
      var div = document.createElement("div");
      div.className = "nx-msg nx-msg--user";
      div.innerHTML =
        '<div class="nx-msg__avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0c0c0e" stroke-width="2.4"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.8-4 5-6 8-6s6.2 2 8 6"/></svg></div>' +
        '<div class="nx-msg__body"><div class="nx-msg__head"><span class="nx-msg__who">You</span>' +
        (files && files.length ? '<span class="nx-msg__tag">' + files.length + ' file(s)</span>' : "") + "</div>" +
        '<div class="nx-msg__text md">' + mdLite(text) + "</div></div>";
      PIKMD.wire && PIKMD.wire(div);
      this.els.thread.appendChild(div);
      this._scrollThread();
    },

    _addAssistantShell: function () {
      var m = PIKModels.get(this.modelId()) || { name: "NEXUS", logo: null };
      var div = document.createElement("div");
      div.className = "nx-msg nx-msg--ai";
      div.innerHTML =
        '<div class="nx-msg__avatar">' + (m.logo ? '<img src="' + m.logo + '" alt="" loading="lazy">' : "NX") + "</div>" +
        '<div class="nx-msg__body">' +
          '<div class="nx-think" hidden><div class="nx-think__bar">' +
            '<span class="nx-think__label">THINKING…</span>' +
            '<span class="nx-think__effort">' + this.lastEffort.toUpperCase() + "</span>" +
            '<span class="nx-think__chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></span>' +
          '</div><div class="nx-think__body"></div></div>' +
          '<div class="nx-msg__head"><span class="nx-msg__who">' + esc(m.name) + "</span>" +
          '<span class="nx-msg__tag">' + esc(this.modelId().split("/")[0]) + "</span></div>" +
          '<div class="nx-msg__text"></div>' +
          '<div class="nx-msg__digest"></div>' +
        "</div>";
      this.els.thread.appendChild(div);
      var think = div.querySelector(".nx-think");
      var thinkBodyEl = think.querySelector(".nx-think__body");
      think.querySelector(".nx-think__bar").addEventListener("click", function () {
        think.classList.toggle("is-closed");
      });
      /* register the full reasoning trace so clicking the panel opens the
         modal with the entire thinking process (think-panel.js) */
      if (global.PIKThinkPanel) {
        PIKThinkPanel.bind(think, {
          getText: function () { return thinkBodyEl.textContent || ""; },
          model: this.modelId(),
          engine: "nexus",
          effort: this.lastEffort
        });
      }
      return {
        node: div,
        body: div.querySelector(".nx-msg__text"),
        digest: div.querySelector(".nx-msg__digest"),
        think: think,
        thinkLabel: think.querySelector(".nx-think__label"),
        thinkBody: think.querySelector(".nx-think__body")
      };
    },

    /* expand/collapse the reasoning panel from the shimmering Thinking chip */
    _toggleThink: function (node) {
      node.think.hidden = false;
      node.think.classList.toggle("is-closed");
      var body = node.thinkBody;
      if (!body.textContent) {
        body.textContent = "Waiting for reasoning tokens\u2026 some free engines batch the whole chain-of-thought and deliver it when the answer completes \u2014 it will appear here.";
      }
    }
  };

  global.PIKChat = Chat;
})(window);
