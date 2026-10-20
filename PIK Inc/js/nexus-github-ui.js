/* ============================================================================
   PIK//NEXUS — nexus-github-ui.js
   Left-rail GitHub panel: connect (device flow with a PAT fallback), fork a
   repo into your account, import a repo's files into the workspace, and push
   agent-written files back on a dedicated branch. Logos via CDN favicons.
   ========================================================================= */
(function (global) {
  "use strict";

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  var GHUI = {
    els: {},
    _pollAbort: null,

    mount: function (refs) {
      this.els = refs;
      var self = this;

      refs.connect.addEventListener("click", function () { self.connect(); });
      refs.patForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var v = refs.pat.value.trim();
        if (!v) return;
        await NexusSettings.setKey("github", v);
        refs.pat.value = "";
        var u = await PIKGitHub.refreshUser();
        if (window.PIKToasts) PIKToasts.show(u
          ? { type: "success", title: "GitHub connected", text: "Signed in as @" + u.login }
          : { type: "warn", title: "Token rejected", text: "GitHub returned 401 \u2014 check the token has repo scope and isn't expired." });
      });
      refs.forkBtn && refs.forkBtn.addEventListener("click", function () { self._toggleList("fork"); });
      refs.importBtn && refs.importBtn.addEventListener("click", function () { self._toggleList("import"); });
      refs.logout && refs.logout.addEventListener("click", async function () {
        await NexusSettings.setKey("github", "");
        PIKGitHub.user = null;
        self._renderAuthed(null);
      });

      PIKGitHub.onAuth(function (u) { self._renderAuthed(u); });
      PIKGitHub.refreshUser(); // restores session from encrypted store if present

      /* suggested repos when not connected yet -> public search by owner */
      this._loadRepos();
    },

    /* ---------- connect: device flow first, manual/PAT fallback ---------- */
    async connect() {
      var box = this.els.deviceBox, self = this;
      box.hidden = false;
      box.innerHTML = '<p style="font-size:.72rem;color:var(--nx-txt-faint)">Requesting a device code\u2026</p>';
      try {
        var dc = await PIKGitHub.startDeviceFlow();
        var verifyUrl = (dc.verification_uri_complete || (dc.verification_uri + "?code=" + encodeURIComponent(dc.user_code)));
        box.innerHTML =
          '<p class="nx-rail__title">Enter this code at</p>' +
          '<div class="nx-codebox">' + esc(dc.user_code) + "</div>" +
          '<a class="nx-keystatus" target="_blank" rel="noopener" href="' + esc(verifyUrl) +
          '">Open github.com/login/device \u2197</a>' +
          '<p style="font-size:.68rem;color:var(--nx-txt-faint)">Waiting for authorization\u2026 ' +
          '<button class="nx-inlinecancel" data-nx="dev-cancel">cancel</button></p>';
        var cancelBtn = box.querySelector("[data-nx='dev-cancel']");
        this._pollAbort = new AbortController();
        if (cancelBtn) cancelBtn.addEventListener("click", function () { self._pollAbort.abort(); });
        await PIKGitHub.pollDeviceFlow(dc, dc.interval, this._pollAbort.signal);
        box.hidden = true;
        box.innerHTML = "";
      } catch (e) {
        var why = String(e.message || e);
        if (why.indexOf("abort") !== -1) { box.hidden = true; box.innerHTML = ""; return; }
        // Device endpoint unreachable from the browser -> direct them to GitHub
        // and offer the guaranteed PAT path.
        box.innerHTML =
          '<p style="font-size:.72rem;color:var(--nx-txt-dim)">GitHub blocks direct browser access to its device endpoint.' +
          ' Easiest path: create a token with <code>repo</code> scope and paste it.</p>' +
          '<a class="nx-btn nx-btn--ghost nx-btn--sm" style="width:100%;text-decoration:none" target="_blank" rel="noopener" ' +
          'href="https://github.com/settings/tokens/new?scopes=repo,gist&amp;description=PIK%20NEXUS">' +
          'Create a token on GitHub \u2197</a>' +
          '<button class="nx-btn nx-btn--ghost" data-nx="pat-open">Use a personal access token</button>';
        var po = box.querySelector("[data-nx='pat-open']");
        if (po) po.addEventListener("click", function () {
          box.hidden = true;
          self.els.patForm.hidden = false;
          self.els.pat.focus();
        });
      }
    },

    _renderAuthed: function (u) {
      var row = this.els.who, gh = this.els.panel;
      gh.classList.toggle("is-authed", !!u);
      if (u) {
        row.innerHTML =
          '<img class="nx-gh__avatar" src="' + esc(u.avatar_url) + '" alt="">' +
          '<span class="nx-gh__who">' + esc(u.name || u.login) + "<small>@" + esc(u.login) + " · " + u.public_repos + " repos</small></span>";
        this._loadRepos(true);
      } else {
        row.innerHTML = '<span class="nx-gh__who" style="color:var(--nx-txt-faint)">not connected</span>';
      }
      if (this.els.connect) this.els.connect.style.display = u ? "none" : "";
    },

    /* ---------- repo list (mine when authed, curated orgs otherwise) ---- */
    _ghCache: null,          // in-memory cache of the public-org listing
    _ghCacheAt: 0,
    _ghCacheTtlMs: 10 * 60 * 1000,
    async _loadRepos(mine) {
      var wrap = this.els.repos, self = this;
      wrap.hidden = false;

      /* Unauthenticated GitHub REST calls are rate-limited per-IP (60/hr),
         which is why six parallel requests came back HTTP 403. Serve the
         cached listing when fresh, and stop hammering on 403/429. */
      if (!mine && this._ghCache && (Date.now() - this._ghCacheAt) < this._ghCacheTtlMs) {
        this._renderRepoList(wrap, this._ghCache);
        return;
      }

      wrap.innerHTML = '<p style="font-size:.7rem;color:var(--nx-txt-faint);padding:6px">loading repositories…</p>';
      try {
        var items = [];
        if (mine) {
          var rs = await PIKGitHub.myRepos();
          items = rs.slice(0, 40).map(function (r) {
            return { full_name: r.full_name, logo: "https://www.google.com/s2/favicons?domain=github.com&sz=64",
                     stars: r.stargazers_count, raw: r };
          });
        } else {
          var owners = ["minimax-io", "google-deepmind", "NVIDIA", "poolsideai", "mistralai", "cohere-ai"];
          var rateLimited = false;
          for (var i = 0; i < owners.length; i++) {
            if (rateLimited) break; // stop hammering once GitHub signals the quota is gone
            try {
              var res = await fetch("https://api.github.com/users/" + owners[i] + "/repos?per_page=3&sort=updated");
              if (res.status === 403 || res.status === 429) { rateLimited = true; continue; }
              if (!res.ok) continue;
              var arr = await res.json();
              arr.forEach(function (r) {
                items.push({ full_name: r.full_name, logo: r.owner.avatar_url, stars: r.stargazers_count, raw: r });
              });
            } catch (e) {}
          }
          if (items.length && !rateLimited) { this._ghCache = items; this._ghCacheAt = Date.now(); }
        }
        if (!items.length) {
          /* fall back to a stale cache instead of an empty panel */
          if (this._ghCache) { this._renderRepoList(wrap, this._ghCache); return; }
          wrap.innerHTML = '<p style="font-size:.7rem;color:var(--nx-txt-faint);padding:6px">GitHub rate limit reached — connect (top button) or retry in a few minutes.</p>';
          return;
        }
        this._renderRepoList(wrap, items);
      } catch (e) {
        wrap.innerHTML = '<p style="font-size:.7rem;color:var(--nx-danger);padding:6px">could not list repos</p>';
      }
    },

    /* shared renderer for the repo list (fresh fetch, cache hit, or stale) */
    _renderRepoList: function (wrap, items) {
      var self = this;
      wrap.innerHTML = items.map(function (r) {
        return '<div class="nx-repo" data-full="' + esc(r.full_name) + '">' +
          '<img src="' + esc(r.logo) + '" alt="" loading="lazy"><span>' + esc(r.full_name) + "</span>" +
          "<em>★ " + (r.stars || 0) + "</em></div>";
      }).join("");
      wrap.querySelectorAll(".nx-repo").forEach(function (el) {
        el.addEventListener("click", function () { self._onRepoPick(el.dataset.full); });
      });
    },

    _mode: "fork",
    _toggleList: function (mode) {
      this._mode = mode;
      this.els.forkBtn.classList.toggle("is-on", mode === "fork");
      this.els.importBtn.classList.toggle("is-on", mode === "import");
      this.els.railTitle.textContent = mode === "fork" ? "pick a repo to FORK" : "pick a repo to IMPORT";
      this._loadRepos(!!PIKGitHub.user);
    },

    /* ---------- fork / import ---------- */
    async _onRepoPick(full) {
      var parts = full.split("/"), self = this;
      if (this._mode === "fork") {
        if (!PIKGitHub.user) { this.els.connect.click(); return; }
        this._toast("Forking " + full + "…");
        try {
          var f = await PIKGitHub.forkRepo(parts[0], parts[1]);
          this._toast("Fork ready: " + f.full_name, "success");
          PIKWorkspace.newProject(f.name, "github-fork", { owner: f.owner.login, name: f.name, branch: f.default_branch });
          document.dispatchEvent(new CustomEvent("pik:project"));
        } catch (e) { this._toast("fork failed: " + e.message, "warn"); }
      } else {
        this._toast("Importing " + full + " (top-level text files)…");
        try {
          var t = await PIKGitHub.tree(parts[0], parts[1], "HEAD");
          PIKWorkspace.newProject(parts[1], "github-import", { owner: parts[0], name: parts[1], branch: "HEAD" });
          var files = t.filter(function (x) { return x.type === "blob" && x.size < 400000 && /\.(js|ts|jsx|tsx|py|html|css|json|md|yml|yaml|sh|go|rs|java|txt|toml|ini)$/i.test(x.path); }).slice(0, 40);
          for (var i = 0; i < files.length; i++) {
            try {
              var c = await PIKGitHub.fileContent(parts[0], parts[1], files[i].path, "HEAD");
              if (c != null) PIKWorkspace.writeFile(files[i].path, c, { by: "github", note: "import " + full });
            } catch (e) {}
          }
          this._toast("Imported " + files.length + " files", "success");
          document.dispatchEvent(new CustomEvent("pik:project"));
        } catch (e) { this._toast("import failed: " + e.message, "warn"); }
      }
    },

    /* ---------- push all project files back ---------- */
    async pushAll(branchInput) {
      var proj = PIKWorkspace.project;
      if (!proj.repo) { this._toast("No repo bound — fork or import first.", "warn"); return; }
      var branch = (branchInput.value || "").trim() || "pik-nexus/agent";
      var files = PIKWorkspace.listFiles().filter(function (p) {
        var f = PIKWorkspace.project.files[p];
        return f && !f.binary && f.content;
      }).map(function (p) { return { path: p, content: PIKWorkspace.readFile(p) }; });
      if (!files.length) { this._toast("Nothing to push yet.", "warn"); return; }
      this._toast("Pushing " + files.length + " file(s) to " + proj.repo.owner + "/" + proj.repo.name + "@" + branch + "…");
      var out = await PIKGitHub.pushMany(proj.repo.owner, proj.repo.name, files, branch);
      var ok = out.filter(function (r) { return r.ok; }).length;
      out.forEach(function (r) {
        document.dispatchEvent(new CustomEvent("pik:log", { detail:
          (r.ok ? "pushed " : "FAILED ") + r.path + (r.digest ? " [sha256:" + r.digest.slice(0, 10) + "]" : " " + r.error) }));
      });
      this._toast(ok + "/" + files.length + " committed on " + branch, ok ? "success" : "warn");
    },

    _toast: function (text, type) {
      if (window.PIKToasts) PIKToasts.show({ type: type || "info", title: "GitHub", text: text });
    }
  };

  global.PIKGHUI = GHUI;
})(window);
