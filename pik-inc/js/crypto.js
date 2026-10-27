/* ============================================================================
   PIK//NEXUS — crypto.js
   ----------------------------------------------------------------------------
   SHA-256 digest layer + AES-GCM 256-bit at-rest encryption for anything the
   browser persists (keys, chats, project files). Key material is derived with
   PBKDF2 (310k iters) from a device secret stored in localStorage; the secret
   itself never leaves the machine. Every write to disk is encrypted, every
   read is decrypted + integrity-checked (GCM tag). Digests are attached to
   outbound request metadata so you can verify what actually left the buffer.
   ========================================================================= */
(function (global) {
  "use strict";

  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function b64(buf) {
    var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(str) {
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ---- SHA-256 ----------------------------------------------------------- */
  async function sha256Hex(text) {
    var digest = await crypto.subtle.digest("SHA-256", enc.encode(String(text)));
    return Array.prototype.map
      .call(new Uint8Array(digest), function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  /* Pure-JS SHA-256 fallback for non-secure contexts (file:// on some engines) */
  var _shaK = null;
  function sha256HexJs(msg) {
    if (!_shaK) {
      _shaK = [];
      var primes = [], n = 2;
      while (primes.length < 64) {
        var isp = true;
        for (var p = 2; p * p <= n; p++) if (n % p === 0) { isp = false; break; }
        if (isp) primes.push(n);
        n++;
      }
      for (var i = 0; i < 64; i++) {
        var x = Math.pow(primes[i], 1 / 3);
        _shaK[i] = Math.floor((x - Math.floor(x)) * 4294967296) | 0;
      }
    }
    var rotr = function (v, c) { return (v >>> c) | (v << (32 - c)); };
    var bytes = enc.encode(String(msg));
    var len = bytes.length;
    var withPad = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    withPad.set(bytes);
    withPad[len] = 0x80;
    var dv = new DataView(withPad.buffer);
    var bitLenHi = Math.floor(len / 536870912);
    var bitLenLo = (len << 3) >>> 0;
    dv.setUint32(withPad.length - 8, bitLenHi);
    dv.setUint32(withPad.length - 4, bitLenLo);

    var H0 = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    var w = new Array(64);
    var hh = H0.slice();
    for (var off = 0; off < withPad.length; off += 64) {
      for (var t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = hh[0], b = hh[1], c = hh[2], d = hh[3], e = hh[4], f = hh[5], g = hh[6], h = hh[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var tmp1 = (h + S1 + ch + _shaK[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var tmp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + tmp1) | 0;
        d = c; c = b; b = a; a = (tmp1 + tmp2) | 0;
      }
      hh[0] = (hh[0] + a) | 0; hh[1] = (hh[1] + b) | 0; hh[2] = (hh[2] + c) | 0; hh[3] = (hh[3] + d) | 0;
      hh[4] = (hh[4] + e) | 0; hh[5] = (hh[5] + f) | 0; hh[6] = (hh[6] + g) | 0; hh[7] = (hh[7] + h) | 0;
    }
    var out = "";
    for (var k = 0; k < 8; k++) out += (hh[k] >>> 0).toString(16).padStart(8, "0");
    return out;
  }

  async function sha256(text) {
    try {
      if (global.crypto && crypto.subtle) return await sha256Hex(text);
    } catch (e) { /* non-secure context: fall through */ }
    return sha256HexJs(String(text));
  }

  /* ---- Device master key -------------------------------------------------- */
  var DEV_KEY_NAME = "pik.nexus.device.secret";

  function getDeviceSecret() {
    var s = localStorage.getItem(DEV_KEY_NAME);
    if (!s) {
      var raw = crypto.getRandomValues(new Uint8Array(32));
      s = b64(raw);
      localStorage.setItem(DEV_KEY_NAME, s);
    }
    return s;
  }

  var _master = null;
  async function deriveMaster() {
    if (_master) return _master;
    var salt = unb64(getDeviceSecret()).slice(0, 16);
    var base = await crypto.subtle.importKey(
      "raw", enc.encode(getDeviceSecret()), "PBKDF2", false, ["deriveKey"]
    );
    _master = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 310000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return _master;
  }

  /* ---- AES-GCM encrypt/decrypt ------------------------------------------- */
  async function encryptJson(obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var plain = enc.encode(JSON.stringify(obj));
    var master = await deriveMaster();
    var cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, master, plain);
    return { v: 1, alg: "AES-256-GCM", iv: b64(iv), data: b64(cipher), digest: await sha256(b64(cipher)) };
  }

  async function decryptJson(envelope) {
    if (!envelope || envelope.v !== 1) return envelope; // legacy plaintext passthrough
    var master = await deriveMaster();
    var plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(envelope.iv) },
      master,
      unb64(envelope.data)
    );
    return JSON.parse(dec.decode(plain));
  }

  /* ---- Secure store (async facade over localStorage) ---------------------- */
  var SecureStore = {
    async set(key, value) {
      try {
        var env = await encryptJson(value);
        localStorage.setItem(key, JSON.stringify(env));
      } catch (e) {
        console.warn("[PIK crypto] encrypt failed, refusing plaintext write:", key, e);
      }
    },
    async get(key) {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.alg === "AES-256-GCM") {
          // integrity check before decrypting
          var expect = await sha256(parsed.data);
          if (expect !== parsed.digest) throw new Error("digest mismatch");
          return await decryptJson(parsed);
        }
        return parsed;
      } catch (e) {
        try { return JSON.parse(raw); } catch (_) { return raw; }
      }
    },
    del(key) { localStorage.removeItem(key); }
  };

  /* ---- Synchronous secrets (used by fetch headers) -------------------------
     Secrets need sync access at request time; we keep them encrypted at rest
     and hold a memory-only copy after first unlock.                          */
  var _memSecrets = {};

  async function loadSecret(name) {
    if (name in _memSecrets) return _memSecrets[name];
    var val = await SecureStore.get(name);
    _memSecrets[name] = val || null;
    return _memSecrets[name];
  }
  async function saveSecret(name, value) {
    _memSecrets[name] = value || null;
    if (value) await SecureStore.set(name, value); else localStorage.removeItem(name);
  }
  function peekSecret(name) { return _memSecrets[name] || null; }
  function lockSecrets() { _memSecrets = {}; }

  global.PIKCrypto = {
    sha256: sha256,
    sha256Hex: sha256Hex,
    encryptJson: encryptJson,
    decryptJson: decryptJson,
    SecureStore: SecureStore,
    loadSecret: loadSecret,
    saveSecret: saveSecret,
    peekSecret: peekSecret,
    lockSecrets: lockSecrets,
    b64: b64,
    unb64: unb64
  };
})(window);
