import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

function decode(path) {
  const d = readFileSync(path);
  let pos = 8;
  let w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (pos < d.length) {
    const len = d.readUInt32BE(pos);
    const type = d.toString('ascii', pos + 4, pos + 8);
    const data = d.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bpp = ch * (bd / 8);
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let i = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[i++];
    const line = Buffer.from(raw.subarray(i, i + stride));
    i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = v & 255;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { w, h, bpp, px: out };
}

const img = decode(process.argv[2]);
console.log(`${process.argv[2]} ${img.w}x${img.h} bpp=${img.bpp}`);
const at = (x, y) => {
  const o = y * img.w * img.bpp + x * img.bpp;
  return [img.px[o], img.px[o + 1], img.px[o + 2], img.bpp === 4 ? img.px[o + 3] : 255];
};
const pts = [[0, 0], [img.w >> 1, img.h >> 1], [img.w >> 1, (img.h >> 1) - 120], [100, 300], [img.w - 60, img.h >> 1], [20, 20]];
for (const p of pts) console.log(p, at(p[0], p[1]));
// histogram of luminance
let sum = 0, max = 0, nonBlack = 0;
for (let y = 0; y < img.h; y += 3) {
  for (let x = 0; x < img.w; x += 3) {
    const [r, g, b] = at(x, y);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l; if (l > max) max = l; if (l > 12) nonBlack++;
  }
}
const n = Math.ceil(img.h / 3) * Math.ceil(img.w / 3);
console.log(`mean luma ${(sum / n).toFixed(2)} max ${max.toFixed(0)} pixels>12: ${(100 * nonBlack / n).toFixed(2)}%`);
