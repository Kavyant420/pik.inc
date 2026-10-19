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
        await PIKGitHub.refreshUser();
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

    /* ---------- connect: device flow first, PAT fallback ---------- */
    async connect() {
      var box = this.els.deviceBox, self = this;
      box.hidden = false;
      box.innerHTML = '<p style="font-size:.72rem;color:var(--nx-txt-faint)">Requesting a device code…</p>';
      try {
        var dc = await PIKGitHub.startDeviceFlow();
        box.innerHTML =
          '<p class="nx-rail__title">Enter this code at</p>' +
          '<div class="nx-codebox">' + esc(dc.user_code) + "</div>" +
          '<a class="nx-keystatus" target="_blank" rel="noopener" href="' + esc(dc.verification_uri_complete || dc.verification_uri) +
          '">' + esc(dc.verification_uri) + " ↗</a>" +
          '<p style="font-size:.68rem;color:var(--nx-txt-faint)">Waiting for authorization…</p>';
        this._pollAbort = new AbortController();
        await PIKGitHub.pollDeviceFlow(dc, dc.interval, this._pollAbort.signal);
        box.hidden = true;
      } catch (e) {
        var why = String(e.message || e);
        if (why.indexOf("device-flow") !== -1 || why.indexOf("Failed to fetch") !== -1) {
          box.innerHTML =
            '<p style="font-size:.72rem;color:var(--nx-txt-dim)">The browser can\'t reach GitHub\'s device endpoint directly (CORS).' +
            " Paste a <b>fine-grained PAT</b> or classic token with <code>repo</code> scope instead:</p>" +
            '<button class="nx-btn nx-btn--ghost" data-nx="pat-open">Use a personal access token</button>';
          box.querySelector("[data-nx='pat-open']").addEventListener("click", function () {
            box.hidden = true;
            self.els.patForm.hidden = false;
            self.els.pat.focus();
          });
        } else if (why === "aborted") {
          box.hidden = true;
        } else {
          box.innerHTML = '<p style="font-size:.72rem;color:var(--nx-danger)">GitHub said: ' + esc(why) + "</p>";
          setTimeout(function () { box.hidden = true; }, 4000);
        }
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
    async _loadRepos(mine) {
      var wrap = this.els.repos, self = this;
      wrap.hidden = false;
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
          for (var i = 0; i < owners.length; i++) {
            try {
              var res = await fetch("https://api.github.com/users/" + owners[i] + "/repos?per_page=3&sort=updated");
              if (!res.ok) continue;
              var arr = await res.json();
              arr.forEach(function (r) {
                items.push({ full_name: r.full_name, logo: r.owner.avatar_url, stars: r.stargazers_count, raw: r });
              });
            } catch (e) {}
          }
        }
        if (!items.length) { wrap.innerHTML = '<p style="font-size:.7rem;color:var(--nx-txt-faint);padding:6px">no repos found (rate limit?)</p>'; return; }
        wrap.innerHTML = items.map(function (r) {
          return '<div class="nx-repo" data-full="' + esc(r.full_name) + '">' +
            '<img src="' + esc(r.logo) + '" alt="" loading="lazy"><span>' + esc(r.full_name) + "</span>" +
            "<em>★ " + (r.stars || 0) + "</em></div>";
        }).join("");
        wrap.querySelectorAll(".nx-repo").forEach(function (el) {
          el.addEventListener("click", function () { self._onRepoPick(el.dataset.full); });
        });
      } catch (e) {
        wrap.innerHTML = '<p style="font-size:.7rem;color:var(--nx-danger);padding:6px">could not list repos</p>';
      }
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
