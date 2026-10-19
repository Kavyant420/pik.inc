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

  /* tiny markdown-ish renderer (bold / inline code / fenced blocks stay raw) */
  function mdLite(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`\n]+)`/g, '<code class="nx-inline">$1</code>');
  }

  var Chat = {
    els: {},
    history: [],          // {role, content}
    pendingFiles: [],     // attachment paths queued for next message
    busy: false,
    controller: null,
    lastEffort: "high",

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
        if (window.PIKToasts) PIKToasts.show({
          type: engine === "pollinations" ? "warn" : "info",
          title: engine === "pollinations" ? "Failover engaged" : "Engine switch",
          text: engine === "pollinations"
            ? "Free OpenRouter budget reached — routed through pollinations.ai with your custom system prompt."
            : "Back on OpenRouter."
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

      /* assistant shell: think-panel + body + typing dots */
      var node = this._addAssistantShell();
      var bodyEl = node.body, thinkWrap = node.think, thinkBody = node.thinkBody;
      bodyEl.innerHTML = '<span class="nx-typing"><i></i><i></i><i></i></span>';

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
            } else {
              if (bodyEl.querySelector(".nx-typing")) bodyEl.innerHTML = "";
              bodyEl.textContent += d;
            }
            self._scrollThread();
          }
        });

        /* final render with light markdown */
        bodyEl.innerHTML = mdLite(res.text || "(empty response)");
        if (res.reasoning && !thinkBody.textContent) thinkBody.textContent = res.reasoning;
        if (!res.reasoning) thinkWrap.hidden = true; // no chain-of-thought from this engine/model

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
            c.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' + esc(f.path);
            c.onclick = function () { document.dispatchEvent(new CustomEvent("pik:openfile", { detail: f.path })); };
            chipWrap.appendChild(c);
          });
          node.body.parentNode.appendChild(chipWrap);
          if (window.PIKToasts) PIKToasts.show({ type: "success", title: "Workspace updated",
            text: wrote.length + " file(s) written by the agent into the IDE." });
        }

        this.history.push({ role: "assistant", content: res.text || "" });
      } catch (e) {
        if (String(e.message || e).indexOf("aborted") !== -1 || e.name === "AbortError") {
          bodyEl.innerHTML = '<em style="color:var(--nx-txt-faint)">— stream stopped by user —</em>';
        } else {
          bodyEl.innerHTML = '<span style="color:var(--nx-danger)">transport error: ' + esc(String(e.message || e)) + "</span>";
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
      this.els.send.innerHTML = on
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 12l16-8-6 8 6 8z"/></svg>';
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
        '<div class="nx-msg__text">' + mdLite(text) + "</div></div>";
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
            '<span class="nx-think__label">THINKING</span>' +
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
      think.querySelector(".nx-think__bar").addEventListener("click", function () {
        think.classList.toggle("is-closed");
      });
      return {
        node: div,
        body: div.querySelector(".nx-msg__text"),
        digest: div.querySelector(".nx-msg__digest"),
        think: think,
        thinkBody: think.querySelector(".nx-think__body")
      };
    }
  };

  global.PIKChat = Chat;
})(window);
