/* ============================================================================
   PIK//NEXUS — terminal-commands.js
   The nexus-sh command set. Every command operates on the real hashed
   workspace, so the terminal is a second pair of hands over exactly what the
   agent sees. Colour output uses the ANSI layer (terminal-ansi.js).
   ========================================================================= */
(function (global) {
  "use strict";

  function ok(out) { return { out: out == null ? "" : out, code: 0 }; }
  function fail(out, code) { return { out: out || "", code: code || 1 }; }

  var C = {
    help: async function (args, env) {
      return ok([
        "nexus-sh — commands operating directly on the hashed workspace",
        "",
        "  ls [-l] [dir]          list entries        pwd / cd <dir>       navigate",
        "  cat <file>             print file          touch <file>         create empty",
        "  mkdir <dir>            create folder       rm [-r] <path>       delete",
        "  mv <a> <b>             move/rename         cp <a> <b>           copy",
        "  echo <text>            print (supports > and >> redirects)",
        "  write <file> <text>    one-line file write",
        "  tree                   workspace tree      find <term>          path search",
        "  grep <pat> [files…]    content search      wc <file>            counts",
        "  head/tail [-n N] f     partial read        sha <file>           digest",
        "  history                recent commands     clear                reset view",
        "  open <file>            open in editor      run                  build + preview",
        "  deploy                 publish to Nexus Pages",
        "  status                 model/keys/engine   micro <boot|ask …>   local core",
        "  ask <question>         route prompt to current model from CLI",
        "  git <status|log>       VCS mirror info     whoami / date / uname / ps / df",
        "  neofetch               system summary      exit                 close pane",
        "",
        "pipes (a | b), redirection (> file, >> file) and globs (*.js) work."
      ].join("\n"));
    },

    ls: async function (args, ctx) {
      var long = args.indexOf("-l") !== -1;
      var rest = args.filter(function (a) { return a[0] !== "-"; });
      var dir = rest[0] || ".";
      var ents = ctx.kernel.entries(dir);
      if (!ents.length && dir !== ".") return fail("ls: " + dir + ": No such file or directory\n", 2);
      if (long) {
        var lines = ents.map(function (e) {
          var content = e.dir ? null : ctx.kernel.read(e.path);
          var size = content != null ? String(content.length).padStart(7) : "      -";
          return (e.dir ? "d" : "-") + "rw-r--r--  " + size + "  " + e.name + (e.dir ? "/" : "");
        });
        return ok(lines.join("\n") + "\n");
      }
      return ok(ents.map(function (e) { return e.name + (e.dir ? "/" : ""); }).join("   ") + "\n");
    },

    pwd: async function (a, ctx) { return ok(ctx.kernel.displayPath() + "\n"); },

    cd: async function (args, ctx) {
      var target = ctx.kernel.resolve(args[0] || "/");
      if (!target || ctx.kernel.isDir(target)) { ctx.kernel.cwd = target; return ok(""); }
      if (ctx.kernel.exists(target)) return fail("cd: " + args[0] + ": Not a directory\n", 1);
      return fail("cd: " + args[0] + ": No such file or directory\n", 1);
    },

    cat: async function (args, ctx) {
      if (!args.length) return ctx.stdin ? ok(ctx.stdin) : fail("cat: missing operand\n", 2);
      var out = "";
      for (var i = 0; i < args.length; i++) {
        var t = ctx.kernel.read(args[i]);
        if (t == null) return fail("cat: " + args[i] + ": No such file\n", 1);
        out += t;
        if (t.length && t[t.length - 1] !== "\n") out += "\n";
      }
      return ok(out);
    },

    touch: async function (args, ctx) {
      if (!args[0]) return fail("touch: missing file operand\n", 2);
      if (ctx.kernel.read(args[0]) == null) ctx.kernel.write(args[0], "", "touch");
      return ok("");
    },

    mkdir: async function (args, ctx) {
      if (!args[0]) return fail("mkdir: missing operand\n", 2);
      var p = args[0].replace(/\/+$/, "");
      if (ctx.kernel.exists(p)) return fail("mkdir: " + p + ": already exists\n", 1);
      ctx.kernel.write(p + "/.keep", "", "mkdir");
      return ok("");
    },

    rm: async function (args, ctx) {
      var rec = args.indexOf("-r") !== -1 || args.indexOf("-rf") !== -1 || args.indexOf("-fr") !== -1;
      var targets = args.filter(function (a) { return a[0] !== "-"; });
      if (!targets.length) return fail("rm: missing operand\n", 2);
      var removed = 0;
      targets.forEach(function (t) {
        var full = ctx.kernel.resolve(t);
        if (ctx.kernel.read(full) != null) { ctx.kernel.remove(full); removed++; return; }
        if (rec && ctx.kernel.isDir(full)) {
          PIKWorkspace.listFiles().forEach(function (f) {
            if (f.indexOf(full + "/") === 0) { PIKWorkspace.deleteFile(f); removed++; }
          });
        } else if (ctx.kernel.isDir(full)) {
          throw new Error("rm: " + t + " is a directory (use -r)");
        }
      });
      return ok(removed ? removed + " entry(ies) removed\n" : "");
    },

    mv: async function (args, ctx) {
      if (args.length < 2) return fail("mv: usage mv <src> <dst>\n", 2);
      var src = ctx.kernel.resolve(args[0]), dst = ctx.kernel.resolve(args[1]);
      var content = ctx.kernel.read(src);
      if (content == null) return fail("mv: " + args[0] + ": not found\n", 1);
      ctx.kernel.write(dst, content, "mv");
      ctx.kernel.remove(src);
      return ok("");
    },

    cp: async function (args, ctx) {
      if (args.length < 2) return fail("cp: usage cp <src> <dst>\n", 2);
      var content = ctx.kernel.read(args[0]);
      if (content == null) return fail("cp: " + args[0] + ": not found\n", 1);
      ctx.kernel.write(args[1], content, "cp");
      return ok("");
    },

    write: async function (args, ctx) {
      if (args.length < 2) return fail("write: usage write <file> <text…>\n", 2);
      ctx.kernel.write(args[0], args.slice(1).join(" ") + "\n", "write");
      return ok("");
    },

    echo: async function (args) { return ok(args.join(" ") + "\n"); },

    tree: async function (args, ctx) {
      function collect(kernel, dir) {
        var lines = [];
        kernel.entries(dir || ".").forEach(function (e, i, arr) {
          var last = i === arr.length - 1;
          lines.push((last ? "└── " : "├── ") + e.name + (e.dir ? "/" : ""));
          if (e.dir) collect(kernel, e.path).forEach(function (sub) {
            lines.push((last ? "    " : "│   ") + sub);
          });
        });
        return lines;
      }
      var ents = collect(ctx.kernel, ctx.kernel.cwd);
      var rootName = "/" + ctx.kernel.cwd || "/";
      return ok(rootName + "\n" + ents.join("\n") + (ents.length ? "\n" : "(empty)\n"));
    },

    find: async function (args, ctx) {
      if (!args[0]) return fail("find: missing pattern\n", 2);
      var pat = args[0].toLowerCase();
      var hits = PIKWorkspace.listFiles().filter(function (f) { return f.toLowerCase().indexOf(pat) !== -1; });
      return ok(hits.length ? hits.join("\n") + "\n" : "");
    },

    grep: async function (args, ctx) {
      if (!args[0]) return fail("grep: missing pattern\n", 2);
      var pat = args[0];
      var files = args.slice(1);
      var sources = files.length ? files : PIKWorkspace.listFiles();
      var re;
      try { re = new RegExp(pat, "i"); } catch (e) { re = new RegExp(escapeRe(pat), "i"); }
      var out = "";
      var stdinMode = !files.length && ctx.stdin;
      if (stdinMode) {
        String(ctx.stdin).split("\n").forEach(function (ln) { if (re.test(ln)) out += ln + "\n"; });
        return ok(out);
      }
      for (var i = 0; i < sources.length; i++) {
        var c = ctx.kernel.read(sources[i]);
        if (c == null) continue;
        c.split("\n").forEach(function (ln, n) {
          if (re.test(ln)) out += sources[i] + ":" + (n + 1) + ": " + ln.trim().slice(0, 120) + "\n";
        });
      }
      return ok(out || "");
    },

    wc: async function (args, ctx) {
      var text = args.length ? ctx.kernel.read(args[0]) : ctx.stdin;
      if (text == null) return fail("wc: no input\n", 1);
      var lines = text.split("\n").length - 1, words = text.split(/\s+/).filter(Boolean).length;
      return ok(" " + lines + "  " + words + "  " + text.length + (args[0] ? "  " + args[0] : "") + "\n");
    },

    head: async function (args, ctx) { return sliceLines(args, ctx, false); },
    tail: async function (args, ctx) { return sliceLines(args, ctx, true); },

    sha: async function (args, ctx) {
      if (!args[0]) return fail("sha: missing file\n", 2);
      var meta = PIKWorkspace.fileMeta(args[0]);
      if (!meta) return fail("sha: " + args[0] + ": not found\n", 1);
      return ok(meta.digest + "  " + args[0] + "\n");
    },

    history: async function (args, ctx) {
      var h = (ctx.ctx && ctx.ctx.history) || [];
      return ok(h.map(function (line, i) { return "  " + (i + 1) + "  " + line; }).join("\n") + "\n");
    },

    clear: async function () { return { out: "", code: 0, clear: true }; },

    open: async function (args, ctx) {
      if (!args[0]) return fail("open: missing file\n", 2);
      if (ctx.kernel.read(args[0]) == null) return fail("open: " + args[0] + ": not found\n", 1);
      document.dispatchEvent(new CustomEvent("pik:openfile", { detail: args[0] }));
      return ok("opened " + args[0] + " in the editor\n");
    },

    run: async function (args, ctx) {
      if (!global.PIKNexusPane) return fail("run: pane unavailable\n", 1);
      var r = await PIKNexusPane.runPreview();
      return r.ok ? ok("preview rebuilt — " + r.files + " file(s) bundled · switching to Preview tab\n") :
                    fail("run: " + (r.error || "no runnable entry (need an html file)") + "\n", 1);
    },

    deploy: async function (args, ctx) {
      if (!global.PIKHosting) return fail("deploy: hosting backend unavailable\n", 1);
      var res = await PIKHosting.deployCurrent();
      if (!res.ok) return fail("deploy: " + (res.error || "failed") + "\n", 1);
      return ok("deployed → " + res.url + "\nedge-cached · keyless protection active\n");
    },

    status: async function (args, ctx) {
      var sel = global.PIKPicker ? PIKPicker.getSelected() : "?";
      var gh = await PIKCrypto.hasKey(CFG.LS.KEY_GH);
      var or = await PIKCrypto.hasKey(CFG.LS.KEY_OR);
      var lines = [
        "model   : " + sel,
        "engine  : " + (sel.indexOf("microengine") !== -1 ? "local MicroEngine (" + (MicroEngine.tier || "-") + ")" : "cloud (OpenRouter → Pollinations ladder)"),
        "github  : " + (gh ? "token present" : "anonymous"),
        "or key  : " + (or ? "present" : "none — :free only"),
        "files   : " + PIKWorkspace.listFiles().length + " hashed in workspace",
        "usage   : " + PIKUsage.total() + " call(s) today (cap " + CFG.USAGE_CAP_PER_DAY + ")",
        "uptime  : " + Math.round(performance.now() / 1000) + "s session"
      ];
      return ok(lines.join("\n") + "\n");
    },

    micro: async function (args, ctx) {
      var sub = args[0] || "state";
      if (sub === "boot") {
        var tier = args[1] || ((await NexusSettings.get()).microTier || "small");
        PIKMicro.boot(tier, null, null);
        return ok("booting MicroEngine (" + tier + ") — watch Settings ▸ Local inference core\n");
      }
      if (sub === "ask") {
        var q = args.slice(1).join(" ");
        if (!q) return fail("micro ask: missing question\n", 2);
        if (!MicroEngine.ready) return fail("micro: core offline — run `micro boot` first\n", 1);
        var res = await MicroEngine.generate({ messages: [{ role: "user", content: q }], thinking: "low" });
        return ok(res.text + "\n[" + res.tps + " tok/s · fully local]\n");
      }
      if (sub === "off") { MicroEngine.ready = false; return ok("micro core unloaded\n"); }
      return ok("MicroEngine: " + (MicroEngine.ready ? "online (" + MicroEngine.tier + ", ~" + MicroWeights.memEstimateMB() + " MB quantised weights)" : "offline") +
        "\nusage: micro boot [tiny|small|mid] · micro ask <q> · micro off\n");
    },

    ask: async function (args, ctx) {
      var q = args.join(" ");
      if (!q) return fail("ask: missing prompt\n", 2);
      if (!global.PIKNexusAsk) return fail("ask: chat loop unavailable\n", 1);
      var out = await PIKNexusAsk(q, function (delta) { if (ctx.ctx && ctx.ctx.onDelta) ctx.ctx.onDelta(delta); });
      return ok(out + "\n");
    },

    git: async function (args, ctx) {
      var sub = args[0] || "status";
      if (sub === "status") {
        var files = PIKWorkspace.listFiles();
        return ok("On branch " + (document.querySelector("[data-nx='branch']") || {}).value + "\n" +
          "Changes staged by NEXUS:\n" + files.slice(0, 30).map(function (f) { return "  modified: " + f; }).join("\n") +
          (files.length ? "\n(" + files.length + " file(s), each SHA-256 versioned)\n" : "\n(nothing to commit)\n"));
      }
      if (sub === "log") {
        var lines = [];
        PIKWorkspace.listFiles().slice(0, 8).forEach(function (f) {
          var m = PIKWorkspace.fileMeta(f);
          var h = m && m.history ? m.history[m.history.length - 1] : null;
          if (h) lines.push("commit " + String(h.digest).slice(0, 12) + "  " + f + "  by " + h.by + "  " + new Date(h.ts).toISOString());
        });
        return ok(lines.join("\n") + "\n");
      }
      return fail("git: nexus-sh mirrors 'status' and 'log' only — use the GitHub rail for live ops\n", 2);
    },

    whoami: async function () { return ok("nexus@field\n"); },
    date: async function () { return ok(new Date().toString() + "\n"); },
    uname: async function () {
      return ok("NexusOS " + navigator.platform + " nexus-sh 5.15 (browser kernel, " + (navigator.hardwareConcurrency || "?") + " cores)\n");
    },
    ps: async function () {
      return ok(["PID TTY   TIME     CMD",
        "  1 ?        0:00   nexus-shell",
        " 42 ?        0:0" + Math.min(9, Math.round(performance.now() / 60000)) + "   agent-loop --effort=" + PIKChat.effort,
        MicroEngine.ready ? " 77 ?        0:01   micro-core --tier=" + MicroEngine.tier : " 77 ?        0:00   micro-core --stopped"].join("\n") + "\n");
    },
    df: async function (a, ctx) {
      var bytes = 0;
      PIKWorkspace.listFiles().forEach(function (f) { bytes += (ctx.kernel.read(f) || "").length; });
      return ok("Filesystem   Size   Used  Avail  Use%  Mounted on\nworkspace    4 MB   " +
        Math.max(1, Math.round(bytes / 1024)) + " KB   ~4 MB   " + Math.min(99, Math.round(bytes / 41943)) + "%  / (hashed)\n");
    },

    neofetch: async function (a, ctx) {
      var sel = global.PIKPicker ? PIKPicker.getSelected() : "?";
      return ok([
        "        ▄▄▄▄▄        nexus@field",
        "     ▄█████████▄     ─────────────",
        "    ███▀     ▀███    OS: NexusOS (browser kernel)",
        "   ███   PIK    ███   Shell: nexus-sh 5.15",
        "   ███  NEXUS   ███   Model: " + sel,
        "    ███▄     ▄███    Core: " + (MicroEngine.ready ? "micro/" + MicroEngine.tier : "cloud"),
        "     ▀█████████▀     Files: " + PIKWorkspace.listFiles().length + " hashed",
        "        ▀▀▀▀▀        Uptime: " + Math.round(performance.now() / 1000) + "s"
      ].join("\n") + "\n");
    },

    exit: async function () { if (global.PIKNexusPane) PIKNexusPane.hide(); return ok(""); }
  };

  async function sliceLines(args, ctx, fromEnd) {
    var n = 10;
    var ni = args.indexOf("-n");
    if (ni !== -1) n = parseInt(args[ni + 1], 10) || 10;
    var file = args.filter(function (a) { return a[0] !== "-" && isNaN(a); })[0];
    var text = file != null ? ctx.kernel.read(file) : ctx.stdin;
    if (text == null) return fail("usage: head|tail [-n N] [file]\n", 2);
    var lines = String(text).replace(/\n$/, "").split("\n");
    return ok((fromEnd ? lines.slice(-n) : lines.slice(0, n)).join("\n") + "\n");
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  global.PIKTerminalCommands = C;
})(window);
