const PIKCrypto = (() => {
  const enc = new TextEncoder();

  function bytesToHex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function toBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function sha256(text) {
    if (crypto && crypto.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
      return bytesToHex(digest);
    }
    return fallbackSha256(text);
  }

  function rotl(x, n) {
    return (x << n) | (x >>> (32 - n));
  }

  function fallbackSha256(ascii) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const utf = unescape(encodeURIComponent(ascii));
    const words = [];
    for (let i = 0; i < utf.length; i++) words[i >> 2] |= utf.charCodeAt(i) << (24 - (i % 4) * 8);
    words[utf.length >> 2] |= 0x80 << (24 - (utf.length % 4) * 8);
    words[(((utf.length + 8) >> 6) << 4) + 15] = utf.length * 8;
    for (let j = 0; j < words.length; j += 16) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = words[j + i] | 0;
      for (let i = 16; i < 64; i++) {
        const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = H.map((v, i) => (v + [a, b, c, d, e, f, g, h][i]) | 0);
    }
    return H.map(v => (v >>> 0).toString(16).padStart(8, "0")).join("");
  }

  async function randomBytes(len) {
    const arr = new Uint8Array(len);
    if (crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  }

  async function makeSalt(len = 16) {
    return toBase64((await randomBytes(len)).buffer);
  }

  async function hashPassword(password, saltB64, iterations = 120000) {
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    if (crypto && crypto.subtle && crypto.subtle.importKey) {
      try {
        const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits(
          { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
          key,
          256
        );
        return bytesToHex(bits);
      } catch (err) {
        return slowHash(password, saltB64);
      }
    }
    return slowHash(password, saltB64);
  }

  async function slowHash(password, salt) {
    let acc = password + ":" + salt;
    for (let i = 0; i < 4; i++) acc = await sha256(acc + i);
    return acc;
  }

  async function fingerprintSeed() {
    const nav = navigator;
    const parts = [
      nav.userAgent,
      nav.language,
      screen.width + "x" + screen.height + "@" + (window.devicePixelRatio || 1),
      timezone(),
      String(nav.hardwareConcurrency || 0),
      Intl.DateTimeFormat().resolvedOptions().calendar || "gregory"
    ];
    return parts.join("|");
  }

  function timezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"; }
    catch (e) { return "unknown"; }
  }

  function shortHash(hex, len = 12) {
    return hex.slice(0, len);
  }

  function maskEmail(email) {
    const [name, domain] = String(email).split("@");
    if (!domain) return "*".repeat(name.length || 6);
    const head = name.slice(0, 1);
    return head + "*".repeat(Math.max(3, name.length - 1)) + "@" + domain.charAt(0) + "***." + domain.split(".").pop();
  }

  return { sha256, hashPassword, makeSalt, randomBytes, fingerprintSeed, shortHash, maskEmail, bytesToHex };
})();
