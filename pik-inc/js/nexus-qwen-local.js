(function (global) {
  "use strict";
  var ID = "pik/qwen3-0.6b-gguf:local";
  var VERSION = "3.8.1";
  var engine = null, runtime = null, busy = false, filename = "", panel = null;

  function $(s, root) { return (root || document).querySelector(s); }
  function notify(type, title, text) {
    if (global.PIKToasts && PIKToasts.show) PIKToasts.show({type:type,title:title,text:text});
  }
  function modelRecord() {
    return {
      id: ID, name: "Qwen3-0.6B · local GGUF", provider: "qwen",
      ctx: 2048, maxOut: 384, modality: "text->text",
      vision: false, video: false, audio: false, reasoning: false,
      efforts: ["low"], defaultEffort: "low", tools: false,
      local: true, suggested: false,
      desc: "Qwen3 GGUF running on this device through llama.cpp WebAssembly.",
      logo: global.PIKModels.logoUrl ? PIKModels.logoUrl("qwen") : null
    };
  }
  function registerModel() {
    var m = global.PIKModels;
    if (!m || !m.byId || !m.all) return;
    if (!m.byId[ID]) { m.byId[ID] = modelRecord(); m.all.unshift(m.byId[ID]); }
    if (m._emit) m._emit();
  }
  function selectModel() {
    registerModel();
    if (global.PIKPicker && PIKPicker.setSelected) PIKPicker.setSelected(ID);
    notify("success", "Local Qwen selected", "The next message will use the loaded on-device model.");
  }
  function status(message, kind) {
    if (!panel) return;
    panel.querySelector("[data-qwen-status]").textContent = message;
    panel.querySelector("[data-qwen-status]").dataset.kind = kind || "idle";
    panel.querySelector("[data-qwen-load]").disabled = busy;
    panel.querySelector("[data-qwen-use]").disabled = !engine || busy;
    panel.querySelector("[data-qwen-unload]").disabled = !engine || busy;
  }
  async function getRuntime() {
    if (!runtime) {
      runtime = Promise.all([
        import("https://esm.sh/@wllama/wllama@" + VERSION),
        import("https://esm.sh/@wllama/wllama@" + VERSION + "/esm/wasm-from-cdn.js")
      ]).then(function (mods) {
        var Wllama = mods[0].Wllama;
        var wasmConfig = mods[1].default || mods[1];
        if (typeof Wllama !== "function") throw new Error("Wllama constructor unavailable.");
        return {Wllama:Wllama, config:wasmConfig};
      }).catch(function (e) { runtime = null; throw e; });
    }
    return runtime;
  }
  async function loadFile(file) {
    if (!file || !/\.gguf$/i.test(file.name || "")) throw new Error("Choose a .gguf model file.");
    if (file.size < 4 || file.size > 2 * 1024 * 1024 * 1024) throw new Error("Model file is empty or exceeds the 2 GB browser limit.");
    var magic = new TextDecoder().decode(await file.slice(0,4).arrayBuffer());
    if (magic !== "GGUF") throw new Error("Invalid GGUF file header.");
    busy = true; status("Loading local inference runtime…", "busy");
    var candidate = null;
    try {
      if (engine) { try { await engine.exit(); } catch (_) {} engine = null; }
      var rt = await getRuntime();
      candidate = new rt.Wllama(rt.config);
      status("Loading " + file.name + " into memory…", "busy");
      await candidate.loadModel([file], {
        n_ctx: 2048, n_gpu_layers: 0, jinja: true
      });
      var md = candidate.getModelMetadata ? candidate.getModelMetadata() : {};
      var meta = md && md.meta ? md.meta : {};
      var arch = String(meta["general.architecture"] || "").toLowerCase();
      if (arch.indexOf("qwen3") !== 0) {
        throw new Error("Expected a Qwen3 GGUF; detected " + (arch || "unknown") + ".");
      }
      engine = candidate; candidate = null; filename = file.name;
      registerModel();
      status("Loaded · " + filename + " · " + Math.round(file.size/1048576) + " MB", "ok");
      selectModel();
      notify("success", "Qwen3 loaded", "Inference will run locally on the device. The GGUF is not uploaded.");
    } catch (e) {
      if (candidate) { try { await candidate.exit(); } catch (_) {} }
      status("Load failed · " + String(e.message || e), "bad");
      notify("error", "Could not load Qwen3", String(e.message || e));
    } finally { busy = false; if (engine) status("Ready · " + filename, "ok"); }
  }
  async function localChat(opts) {
    if (!engine) throw new Error("Load a Qwen3 GGUF in Settings → Local Qwen3 first.");
    if (busy) throw new Error("Local Qwen3 is already generating.");
    busy = true; status("Generating locally…", "busy");
    try {
      var messages = (opts.messages || []).map(function (m) {
        var c = m.content;
        if (Array.isArray(c)) c = c.map(function (p) { return p && p.type === "text" ? p.text : ""; }).join("\n");
        return {role:m.role, content:String(c || "")};
      });
      var stream = await engine.createChatCompletion({
        messages: messages, max_tokens: 384, temperature: 0.7,
        top_p: 0.8, top_k: 20, stream: true,
        abortSignal: opts.signal || undefined
      });
      var output = "";
      for await (var chunk of stream) {
        if (opts.signal && opts.signal.aborted) break;
        var delta = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        if (delta && delta.content) {
          output += delta.content;
          if (opts.onDelta) opts.onDelta(delta.content, false);
        }
      }
      if (opts.signal && opts.signal.aborted) {
        var err = new Error("Generation stopped."); err.name = "AbortError"; throw err;
      }
      return {text:output, rawText:output, reasoning:"", engine:"local-qwen-gguf",
        model:filename || "Qwen3 GGUF", digest:null, usedFallback:false, local:true};
    } finally { busy = false; status(engine ? "Ready · " + filename : "Model unloaded", engine ? "ok" : "idle"); }
  }
  function hookRouter() {
    if (!global.PIKRouter || !PIKRouter.chat || PIKRouter._localQwenHooked) return;
    var original = PIKRouter.chat;
    PIKRouter.chat = function (opts) {
      if (opts && opts.model === ID) return localChat(opts);
      return original.apply(this, arguments);
    };
    PIKRouter._localQwenHooked = true;
  }
  function mount() {
    var body = $("[data-nx='drawer'] .nx-drawer__body");
    if (!body || panel) return;
    panel = document.createElement("section");
    panel.className = "nx-qwen-local";
    panel.style.cssText = "margin:14px 0;padding:14px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:rgba(255,255,255,.035)";
    panel.innerHTML =
      "<h3 style='margin:0 0 7px;font-size:.86rem'>Local Qwen3 GGUF</h3>" +
      "<p style='font-size:.72rem;line-height:1.5;color:var(--nx-txt-faint);margin:0 0 10px'>Select a Qwen3 GGUF stored on this device. Inference runs locally through WebAssembly. The runtime is fetched from a CDN on first use; this is not yet a fully offline installation.</p>" +
      "<input type='file' accept='.gguf,application/octet-stream' hidden data-qwen-file>" +
      "<div style='display:flex;gap:7px;flex-wrap:wrap'>" +
      "<button type='button' class='nx-btn nx-btn--sm' data-qwen-load>Choose GGUF</button>" +
      "<button type='button' class='nx-btn nx-btn--ghost nx-btn--sm' data-qwen-use disabled>Use Qwen</button>" +
      "<button type='button' class='nx-btn nx-btn--ghost nx-btn--sm' data-qwen-unload disabled>Unload</button></div>" +
      "<small data-qwen-status data-kind='idle' style='display:block;margin-top:10px;overflow-wrap:anywhere;color:var(--nx-txt-faint)'>No model loaded</small>";
    var danger = $(".nx-danger-zone", body);
    if (danger) body.insertBefore(panel, danger); else body.appendChild(panel);
    var input = $("[data-qwen-file]", panel);
    $("[data-qwen-load]", panel).addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { var f=input.files && input.files[0]; if(f) loadFile(f); input.value=""; });
    $("[data-qwen-use]", panel).addEventListener("click", selectModel);
    $("[data-qwen-unload]", panel).addEventListener("click", async function () {
      if (busy) return;
      if (engine) { await engine.exit(); engine=null; }
      filename=""; status("Model unloaded · choose the GGUF again next time", "idle");
    });
  }
  function init() {
    hookRouter(); mount(); registerModel();
    if (global.PIKModels && PIKModels.onChange) PIKModels.onChange(function () { registerModel(); });
  }
  global.PIKQwenLocal = {id:ID, loadFile:loadFile, chat:localChat,
    unload:async function(){if(engine){await engine.exit();engine=null;} filename="";status("Model unloaded","idle");},
    isLoaded:function(){return !!engine;}};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})(window);
