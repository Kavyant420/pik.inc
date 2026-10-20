/* ============================================================================
   PIK//NEXUS — github.js
   GitHub integration: OAuth device flow (no client secret in the browser),
   list repos, FORK a repo into the project field, read file trees, and push
   agent-written files back as commits on a dedicated branch.
   ========================================================================= */
(function (global) {
  "use strict";

  var CFG = global.PIK_CONFIG;

  var GitHub = {
    user: null,
    _onAuth: [],

    /* ---------- auth status ---------- */
    async token() { return await PIKCrypto.loadSecret(CFG.LS.KEY_GH); },
    onAuth(fn) { this._onAuth.push(fn); },

    async api(path, opts) {
      opts = opts || {};
      var tk = await this.token();
      if (!tk) throw new Error("github-not-authenticated");
      var headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      };
      if (tk) headers["Authorization"] = "Bearer " + tk;
      if (opts.body && typeof opts.body !== "string") {
        headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(opts.body);
      }
      var res = await fetch(CFG.GH_API + path, Object.assign({ headers: headers }, opts));
      if (res.status === 401) throw new Error("github-token-invalid");
      if (!res.ok) {
        var t = ""; try { t = await res.text(); } catch (e) {}
        throw new Error("github HTTP " + res.status + " " + t.slice(0, 200));
      }
      if (res.status === 204) return null;
      return res.json();
    },

    /* ---------- Device Flow (client id is public; secret stays server-side) --
       GitHub's /login/device/code endpoint does NOT send CORS headers, so a
       direct browser fetch always fails ("Failed to fetch"). We therefore try
       the device endpoint through a tiny public CORS relay first; if that is
       unavailable we fall back to the manual link flow: open github.com/login/
       device in a new tab ourselves and still poll for the token — polling
       /login/oauth/access_token DOES work from the browser via the same relay.
       A PAT paste remains the guaranteed offline path.                     */
    _ghRelay(path, bodyForm) {
      // jsDelivr-hosted CORS relays are unreliable for POSTs; use corsproxy.io style
      var targets = [
        "https://corsproxy.io/?url=" + encodeURIComponent("https://github.com" + path),
        "https://api.cors.lol/?url=" + encodeURIComponent("https://github.com" + path)
      ];
      return { targets: targets, body: bodyForm };
    },

    async startDeviceFlow() {
      var params = new URLSearchParams({ client_id: CFG.GH_CLIENT_ID, scope: "repo,gist" });
      var relay = this._ghRelay("/login/device/code", params.toString());
      var lastErr = null;
      for (var i = 0; i < relay.targets.length; i++) {
        try {
          var res = await fetch(relay.targets[i], {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
            body: relay.body
          });
          if (!res.ok) { lastErr = new Error(res.status === 404 ? "device-flow-disabled" : "device HTTP " + res.status); continue; }
          var text = await res.text();
          var data = Object.fromEntries(new URLSearchParams(text));
          if (!data.device_code) {
            // relay may have returned JSON
            try { data = JSON.parse(text); } catch (e) {}
          }
          if (data.device_code) {
            data._relay = relay.targets[i]; // remember which relay worked for polling
            return data; // { device_code, user_code, verification_uri, interval, expires_in }
          }
          lastErr = new Error(data.error || "bad-payload");
        } catch (e) { lastErr = e; }
      }
      // Direct attempt too (works if GitHub ever enables CORS or under extensions)
      try {
        var res2 = await fetch("https://github.com/login/device/code", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString()
        });
        if (res2.ok) {
          var t2 = await res2.text();
          var d2 = Object.fromEntries(new URLSearchParams(t2));
          if (d2.device_code) return d2;
        }
      } catch (e) {}
      var err = new Error("device-flow-unreachable");
      err.fallbackUrl = "https://github.com/login/device";
      throw err;
    },

    async pollDeviceFlow(dc, interval, signal, onManualOpen) {
      interval = Math.max(3, interval || 5);
      var deadline = Date.now() + (dc.expires_in || 900) * 1000;
      var pollTargets = dc._relay
        ? [dc._relay, this._ghRelay("/login/oauth/access_token", "").targets[1]]
        : ["https://corsproxy.io/?url=" + encodeURIComponent("https://github.com/login/oauth/access_token"),
           "https://api.cors.lol/?url=" + encodeURIComponent("https://github.com/login/oauth/access_token")];
      while (Date.now() < deadline) {
        await new Promise(function (r, rej) {
          var id = setTimeout(r, interval * 1000);
          if (signal) signal.addEventListener("abort", function () { clearTimeout(id); rej(new Error("aborted")); });
        });
        var payload = JSON.stringify({
          client_id: CFG.GH_CLIENT_ID,
          device_code: dc.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        });
        for (var ti = 0; ti < pollTargets.length; ti++) {
          try {
            var res = await fetch(pollTargets[ti], {
              method: "POST",
              headers: { "Accept": "application/json", "Content-Type": "application/json" },
              body: payload
            });
            if (!res.ok) continue;
            var j = await res.json().catch(function () {
              return res.text().then(function (t) { return Object.fromEntries(new URLSearchParams(t)); });
            });
            if (j && j.access_token) {
              await NexusSettings.setKey("github", j.access_token);
              await this.refreshUser();
              return j.access_token;
            }
            if (j && (j.error === "expired_token" || j.error === "access_denied")) throw new Error(j.error);
            if (j && j.error === "authorization_pending") break; // try next target only on transport junk
          } catch (e) {
            if (String(e.message) === "authorization_pending") break;
            if (e.message === "expired_token" || e.message === "access_denied") throw e;
            if (e.name === "AbortError" || e.message === "aborted") throw e;
          }
        }
      }
      throw new Error("device-flow-timeout");
    },

    /* ---------- Classic OAuth redirect helper (needs a tiny exchange server;
       see /server/README.md). Builds the authorize URL with PKCE so even the
       code exchange can't be intercepted. ------------------------------------*/
    async buildAuthorizeUrl(redirectUri) {
      var verifierBytes = crypto.getRandomValues(new Uint8Array(48));
      var verifier = PIKCrypto.b64(verifierBytes).replace(/[^a-zA-Z0-9\-_.]/g, "");
      var challenge = await this._sha256B64url(verifier);
      sessionStorage.setItem(CFG.LS.OAUTH_VERIFIER, verifier);
      var state = PIKCrypto.b64(crypto.getRandomValues(new Uint8Array(16)));
      sessionStorage.setItem(CFG.LS.OAUTH_STATE, state);
      var u = new URL(CFG.GH_AUTH_URL);
      u.searchParams.set("client_id", CFG.GH_CLIENT_ID);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("scope", "repo");
      u.searchParams.set("state", state);
      u.searchParams.set("code_challenge", challenge);
      u.searchParams.set("code_challenge_method", "S256");
      return u.toString();
    },
    async _sha256B64url(str) {
      var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
      var bytes = new Uint8Array(d);
      var b = "";
      for (var i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
      return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },

    /* ---------- account ---------- */
    async refreshUser() {
      try {
        this.user = await this.api("/user");
        this._fire(this.user);
      } catch (e) { this.user = null; }
      return this.user;
    },
    _fire(u) { this._onAuth.forEach(function (fn) { try { fn(u); } catch (e) {} }); },

    /* ---------- repos & forking ---------- */
    async myRepos() { return this.api("/user/repos?per_page=100&sort=updated"); },

    async repo(owner, name) { return this.api("/repos/" + owner + "/" + name); },

    /* Fork owner/name into the authenticated user's account. GitHub forks
       asynchronously, so we poll until the fork is addressable. */
    async forkRepo(owner, name) {
      var f = await this.api("/repos/" + owner + "/" + name + "/forks", { method: "POST" });
      for (var i = 0; i < 20; i++) {
        try { await this.api("/repos/" + f.owner.login + "/" + f.name); return f; }
        catch (e) { await new Promise(function (r) { setTimeout(r, 1500); }); }
      }
      return f;
    },

    /* ---------- tree / contents ---------- */
    async tree(owner, name, branch) {
      var ref = branch || "HEAD";
      var r = await this.api("/repos/" + owner + "/" + name + "/git/trees/" + encodeURIComponent(ref) + "?recursive=1");
      return r.tree || [];
    },

    async fileContent(owner, name, path, ref) {
      var q = ref ? "?ref=" + encodeURIComponent(ref) : "";
      var j = await this.api("/repos/" + owner + "/" + name + "/contents/" + encodeURI(path) + q);
      if (Array.isArray(j)) return null;
      if (j.content) {
        var bin = atob(j.content.replace(/\n/g, ""));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }
      return null;
    },

    /* ---------- push (create/update a file on a branch) -------------------- */
    async pushFile(owner, name, path, content, message, branch) {
      branch = branch || "pik-nexus/agent";
      var sha = null;
      try {
        var cur = await this.api("/repos/" + owner + "/" + name + "/contents/" + encodeURI(path) + "?ref=" + branch);
        sha = cur.sha;
      } catch (e) { /* file doesn't exist yet on branch */ }

      // ensure branch exists off default
      if (!sha) {
        try {
          var repo = await this.repo(owner, name);
          var defSha = (await this.api("/repos/" + owner + "/" + name + "/git/ref/heads/" + encodeURIComponent(repo.default_branch))).object.sha;
          await this.api("/repos/" + owner + "/" + name + "/git/refs", {
            method: "POST",
            body: { ref: "refs/heads/" + branch, sha: defSha }
          }).catch(function () { /* already exists */ });
        } catch (e) {}
      }

      var b64 = btoa(unescape(encodeURIComponent(content)));
      var body = { message: message || ("PIK NEXUS \u2731 " + path), content: b64, branch: branch };
      if (sha) body.sha = sha;
      return this.api("/repos/" + owner + "/" + name + "/contents/" + encodeURI(path), { method: "PUT", body: body });
    },

    /* Push many files sequentially, returns per-file results */
    async pushMany(owner, name, files, branch) {
      var out = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        try {
          var digest = await PIKCrypto.sha256(f.content);
          var r = await this.pushFile(owner, name, f.path, f.content,
            "PIK NEXUS agent commit \u2014 " + f.path + " [sha256:" + digest.slice(0, 12) + "]", branch);
          out.push({ path: f.path, ok: true, digest: digest, commit: r && r.commit && r.commit.sha });
        } catch (e) {
          out.push({ path: f.path, ok: false, error: String(e.message || e) });
        }
      }
      return out;
    }
  };

  global.PIKGitHub = GitHub;
})(window);
