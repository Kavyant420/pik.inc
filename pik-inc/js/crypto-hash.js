const PIKCrypto = (() => {
  const enc = new TextEncoder();

  function hasWebCrypto() {
    return typeof crypto !== "undefined" && !!crypto;
  }

  function hasSubtle() {
    return hasWebCrypto() && !!crypto.subtle;
  }

  function bytesToHex(buf) {
    const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let out = "";
    for (let i = 0; i < view.length; i++) {
      out += view[i].toString(16).padStart(2, "0");
    }
    return out;
  }

  function toBase64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function fromBase64(b64) {
    try {
      const raw = atob(String(b64 || ""));
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    } catch (e) {
      return enc.encode(String(b64 || ""));
    }
  }

  async function sha256(text) {
    const str = String(text ?? "");
    if (hasSubtle() && typeof crypto.subtle.digest === "function") {
      try {
        const digest = await crypto.subtle.digest("SHA-256", enc.encode(str));
        return bytesToHex(digest);
      } catch (err) {
        return fallbackSha256(str);
      }
    }
    return fallbackSha256(str);
  }

  const SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function fallbackSha256(str) {
    let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
    let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;
    const utf = enc.encode(String(str ?? ""));
    const bitLen = utf.length * 8;
    const wordCount = (((utf.length + 8) >> 6) + 1) * 16;
    const words = new Int32Array(wordCount);
    for (let i = 0; i < utf.length; i++) {
      words[i >> 2] |= utf[i] << (24 - (i % 4) * 8);
    }
    words[utf.length >> 2] |= 0x80 << (24 - (utf.length % 4) * 8);
    words[wordCount - 2] = Math.floor(bitLen / 0x100000000);
    words[wordCount - 1] = bitLen >>> 0;

    const w = new Int32Array(64);
    for (let j = 0; j < wordCount; j += 16) {
      for (let i = 0; i < 16; i++) w[i] = words[j + i];
      for (let i = 16; i < 64; i++) {
        const v15 = w[i - 15], v2 = w[i - 2];
        const s0 = ((v15 >>> 7) | (v15 << 25)) ^ ((v15 >>> 18) | (v15 << 14)) ^ (v15 >>> 3);
        const s1 = ((v2 >>> 17) | (v2 << 15)) ^ ((v2 >>> 19) | (v2 << 13)) ^ (v2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H0 = (H0 + a) | 0; H1 = (H1 + b) | 0; H2 = (H2 + c) | 0; H3 = (H3 + d) | 0;
      H4 = (H4 + e) | 0; H5 = (H5 + f) | 0; H6 = (H6 + g) | 0; H7 = (H7 + h) | 0;
    }
    return [H0, H1, H2, H3, H4, H5, H6, H7]
      .map(v => (v >>> 0).toString(16).padStart(8, "0"))
      .join("");
  }

  async function randomBytes(len) {
    const arr = new Uint8Array(len);
    if (hasWebCrypto() && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }

  async function makeSalt(len = 16) {
    return toBase64(await randomBytes(len));
  }

  async function hashPassword(password, saltB64, iterations = 120000) {
    const pw = String(password ?? "");
    const salt = fromBase64(saltB64);
    if (hasSubtle() && typeof crypto.subtle.importKey === "function") {
      try {
        const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits(
          { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
          key,
          256
        );
        return bytesToHex(bits);
      } catch (err) {
        return slowHash(pw, String(saltB64 || ""));
      }
    }
    return slowHash(pw, String(saltB64 || ""));
  }

  /* Pure-JS stretched SHA-256 fallback when crypto.subtle is unavailable
     (e.g. non-HTTPS local LAN preview or file:// protocol). */
  async function slowHash(password, salt) {
    let acc = fallbackSha256("pik-pbkdf2-fallback|" + salt + "|" + password);
    for (let i = 0; i < 2000; i++) {
      acc = fallbackSha256(acc + ":" + salt + ":" + i);
    }
    return acc;
  }

  async function fingerprintSeed() {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const scr = typeof screen !== "undefined" ? screen : { width: 0, height: 0 };
    let cal = "gregory";
    try {
      cal = Intl.DateTimeFormat().resolvedOptions().calendar || "gregory";
    } catch (e) {}
    const parts = [
      nav.userAgent || "ua",
      nav.language || "en",
      scr.width + "x" + scr.height + "@" + (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
      timezone(),
      String(nav.hardwareConcurrency || 0),
      cal
    ];
    return parts.join("|");
  }

  function timezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    } catch (e) {
      return "unknown";
    }
  }

  function shortHash(hex, len = 12) {
    return String(hex || "").slice(0, len);
  }

  function maskEmail(email) {
    const [name, domain] = String(email || "").split("@");
    if (!domain) return "*".repeat((name && name.length) || 6);
    const head = name.slice(0, 1);
    return head + "*".repeat(Math.max(3, name.length - 1)) + "@" + domain.charAt(0) + "***." + domain.split(".").pop();
  }

  return { sha256, hashPassword, makeSalt, randomBytes, fingerprintSeed, shortHash, maskEmail, bytesToHex };
})();

if (typeof window !== "undefined") {
  window.PIKCrypto = PIKCrypto;
}
