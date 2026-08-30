// Family Finance PWA icons — flat raster, no image libraries.
//   node scripts/gen-icons.mjs
// Deep-green rounded square + gold coin + green leaf + a hand-drawn ৳ mark.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const DEEP = [0, 84, 47];       // #00542F
const DEEP2 = [0, 107, 60];     // #006B3C
const GOLD = [251, 191, 36];    // #FBBF24
const ORANGE = [249, 115, 22];  // #F97316
const LEAF = [34, 197, 94];     // #22C55E
const LEAF2 = [22, 163, 74];    // #16A34A
const MARK = [124, 45, 18];     // #7C2D12

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// hand-drawn Taka mark inside a unit box (0..1)
function inMark(u, v) {
  const bar1 = v > 0.30 && v < 0.40 && u > 0.30 && u < 0.74;
  const bar2 = v > 0.46 && v < 0.55 && u > 0.22 && u < 0.66;
  const stem = u > 0.46 && u < 0.58 && v > 0.30 && v < 0.78;
  const foot = v > 0.70 && v < 0.79 && u > 0.30 && u < 0.74;
  const hook = Math.abs(u - 0.76 + (v - 0.30) * 0.4) < 0.055 && v > 0.16 && v < 0.42;
  return bar1 || bar2 || stem || foot || hook;
}

function png(size) {
  const s = size, r = s * 0.22;
  const cx = s * 0.5, cy = s * 0.6, coinR = s * 0.3;          // coin
  const rows = [];
  for (let y = 0; y < s; y++) {
    const row = Buffer.alloc(1 + s * 4);
    for (let x = 0; x < s; x++) {
      const o = 1 + x * 4;
      // rounded-rect mask
      const dx = Math.min(x, s - 1 - x), dy = Math.min(y, s - 1 - y);
      if (dx < r && dy < r && (r - dx) ** 2 + (r - dy) ** 2 > r * r) {
        row[o] = row[o + 1] = row[o + 2] = row[o + 3] = 0;
        continue;
      }
      let col = mix(DEEP, DEEP2, y / s); // bg gradient

      // leaf, top-right blob + vein
      const lx = (x - s * 0.62) / (s * 0.26), ly = (y - s * 0.30) / (s * 0.22);
      if (lx * lx + ly * ly < 1 && x - y * 0.5 > s * 0.35) {
        col = (lx + ly) < 0 ? LEAF : LEAF2;
      }

      // coin
      const cd = Math.hypot(x - cx, (y - cy) * 1.05);
      if (cd < coinR) {
        col = mix(GOLD, ORANGE, (y - (cy - coinR)) / (2 * coinR));
        if (cd < coinR * 0.8) {
          const u = (x - (cx - coinR)) / (2 * coinR);
          const v = (y - (cy - coinR)) / (2 * coinR);
          if (inMark(u, v)) col = MARK;
        }
      }

      row[o] = col[0]; row[o + 1] = col[1]; row[o + 2] = col[2]; row[o + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192], ['icon-512.png', 512],
  ['apple-touch-icon.png', 180], ['icon-maskable-512.png', 512],
]) {
  writeFileSync(`public/${name}`, png(size));
  console.log('wrote public/' + name);
}
