/* ============================================================================
   PIK//NEXUS — terminal-kernel.js
   The virtual OS beneath the NEXUS terminal. Everything lives in the hashed
   workspace (PIKWorkspace), so `ls` shows what the agent wrote, `cat` reads
   real file contents, and `rm` is version-hashed like every other mutation.
     - path resolution with cwd + relative segments, no traversal escapes
     - glob-lite matching for ls src/*.js style args
     - pipes:  a | b  (stdout of a becomes stdin of b)
     - redirection: cmd > file  /  cmd >> file
     - exit codes follow POSIX conventions (0 ok, 1 generic, 2 misuse…)
   ========================================================================= */
(function (global) {
  "use strict";

  var Kernel = {
    cwd: "",           // "" == project root; otherwise "src" etc.
    lastExit: 0,
    env: { HOME: "/", USER: "nexus", SHELL: "nexus-sh", TERM: "nx-256color", PIK: "1" },

    /* ---------- paths ---------- */
    resolve: function (p) {
      p = String(p == null ? "" : p).trim();
      if (!p || p === "~" || p === "/") return this.norm(this.cwd);
      if (p[0] === "/") p = p.slice(1);
      else p = (this.cwd ? this.cwd + "/" : "") + p;
      return this.norm(p);
    },
    norm: function (p) {
      var parts = String(p).split("/").filter(Boolean), out = [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === ".") continue;
        else if (parts[i] === "..") out.pop();
        else out.push(parts[i]);
      }
      return out.join("/");
    },
    displayPath: function () { return "/" + this.cwd; },

    /* ---------- fs facade over PIKWorkspace ---------- */
    exists: function (path) {
      path = this.resolve(path);
      if (!path) return true;                       // root always exists
      if (PIKWorkspace.readFile(path) != null) return true;
      var prefix = path + "/";
      return PIKWorkspace.listFiles().some(function (f) { return f.indexOf(prefix) === 0; });
    },
    isDir: function (path) {
      path = this.resolve(path);
      if (!path) return true;
      var prefix = path + "/";
      return PIKWorkspace.listFiles().some(function (f) { return f.indexOf(prefix) === 0; });
    },
    read: function (path) { return PIKWorkspace.readFile(this.resolve(path)); },
    write: function (path, content, note) {
      PIKWorkspace.writeFile(this.resolve(path), content, { by: "terminal", note: note || "shell write" });
    },
    remove: function (path) { PIKWorkspace.deleteFile(this.resolve(path)); },
    entries: function (dirPath) {
      dirPath = this.resolve(dirPath || ".");
      var prefix = dirPath ? dirPath + "/" : "";
      var seen = Object.create(null), out = [];
      PIKWorkspace.listFiles().forEach(function (f) {
        if (prefix && f.indexOf(prefix) !== 0) return;
        var rest = f.slice(prefix.length);
        if (!rest) return;
        var slash = rest.indexOf("/");
        var name = slash === -1 ? rest : rest.slice(0, slash);
        if (!seen[name]) {
          seen[name] = true;
          out.push({ name: name, dir: slash !== -1, path: prefix + name });
        }
      });
      return out.sort(function (a, b) { return (b.dir - a.dir) || a.name.localeCompare(b.name); });
    },

    /* ---------- arg parsing with quotes ---------- */
    splitArgs: function (line) {
      var out = [], cur = "", q = null;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (q) {
          if (c === q) q = null; else cur += c;
        } else if (c === '"' || c === "'") q = c;
        else if (/\s/.test(c)) { if (cur) { out.push(cur); cur = ""; } }
        else cur += c;
      }
      if (cur) out.push(cur);
      return out;
    },

    expandGlob: function (arg) {
      if (arg.indexOf("*") === -1) return [arg];
      var re = new RegExp("^" + arg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      var matched = PIKWorkspace.listFiles().filter(function (f) {
        var base = f.split("/").pop();
        return re.test(f) || re.test(base) || re.test(f.replace(/^.*\//, ""));
      });
      return matched.length ? matched : [arg];
    },

    /* ---------- pipeline executor ---------- */
    async execLine(line, ctx) {
      line = String(line || "").trim();
      if (!line) return { out: "", code: 0 };
      if (line[0] === "#") return { out: "", code: 0 };
      if (line[0] === "$") line = line.slice(1).trim();       // tolerate pasted prompts

      /* redirection first */
      var redirect = null, appendMode = false;
      var m = line.match(/^(.*?)(>>?)\s*([^\s|]+)\s*$/);
      if (m && m[1].indexOf("|") === -1) {
        line = m[1].trim();
        appendMode = m[2] === ">>";
        redirect = m[3];
      }

      var stages = line.split("|").map(function (s) { return s.trim(); }).filter(Boolean);
      var stdin = ctx && ctx.stdin != null ? ctx.stdin : "";
      var result = { out: "", code: 0 };
      for (var i = 0; i < stages.length; i++) {
        var argvRaw = this.splitArgs(stages[i]);
        var argv = [];
        for (var a = 0; a < argvRaw.length; a++) {
          var expanded = this.expandGlob(argvRaw[a]);
          for (var e = 0; e < expanded.length; e++) argv.push(expanded[e]);
        }
        if (!argv.length) continue;
        var cmdName = argv[0];
        var args = argv.slice(1);
        var fn = global.PIKTerminalCommands && PIKTerminalCommands[cmdName];
        if (!fn) {
          result = { out: "nexus-sh: " + cmdName + ": command not found\n", code: 127 };
        } else {
          try {
            result = await fn.call(global.PIKTerminalCommands, args, {
              kernel: this, stdin: stdin, ctx: ctx, env: this.env
            }) || { out: "", code: 0 };
          } catch (err) {
            result = { out: "nexus-sh: " + cmdName + ": " + String(err.message || err) + "\n", code: 1 };
          }
        }
        if (result.code !== 0) break;
        stdin = result.out;
      }
      this.lastExit = result.code;

      if (redirect && result.code === 0) {
        var prev = appendMode ? (this.read(redirect) || "") : "";
        this.write(redirect, prev + result.out, "redirect");
        result.out = "";
      }
      return result;
    }
  };

  global.PIKTerminalKernel = Kernel;
})(window);
