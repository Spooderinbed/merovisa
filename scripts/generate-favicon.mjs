// Regenerates app/favicon.ico from the brand mark in app/icon.svg (same geometry,
// rasterised here because we ship no image tooling). Run after any brand-colour
// change: node scripts/generate-favicon.mjs
// Output: PNG-in-ICO with 16px + 32px entries (PNG entries are fine for favicons;
// every evergreen browser and Windows Vista+ read them).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Literal values of --primary / --on-primary (light) — the same pair app/icon.svg
// uses. tests/styles/brand-surfaces.test.ts guards the SVG; this stays in sync by
// sharing the constants below.
const PLUM = { r: 0x6a, g: 0x2b, b: 0x57 }; // #6a2b57
const PAPER = { r: 0xfd, g: 0xf7, b: 0xfb }; // #fdf7fb

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Signed-distance coverage of a rounded square spanning 0..size, radius r. */
function roundedRectCoverage(cx, cy, size, r) {
  const h = size / 2;
  const qx = Math.abs(cx - h) - (h - r);
  const qy = Math.abs(cy - h) - (h - r);
  const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  return clamp01(0.5 - dist);
}

function segDist(px, py, [ax, ay], [bx, by]) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/** RGBA pixel buffer for one icon size: plum rounded square + paper "M" strokes. */
function drawIcon(size) {
  const s = size / 32;
  // The "M" polyline from app/icon.svg (32px space), scaled.
  const pts = [
    [9, 22],
    [9, 11],
    [16, 18],
    [23, 11],
    [23, 22],
  ].map(([x, y]) => [x * s, y * s]);
  const half = (2.6 / 2) * s; // stroke-width 2.6, round caps via segment distance
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const rect = roundedRectCoverage(cx, cy, size, 7 * s);
      let stroke = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        stroke = Math.max(stroke, clamp01(half - segDist(cx, cy, pts[i], pts[i + 1]) + 0.5));
      }
      const o = (y * size + x) * 4;
      px[o] = Math.round(PLUM.r + (PAPER.r - PLUM.r) * stroke);
      px[o + 1] = Math.round(PLUM.g + (PAPER.g - PLUM.g) * stroke);
      px[o + 2] = Math.round(PLUM.b + (PAPER.b - PLUM.b) * stroke);
      px[o + 3] = Math.round(rect * 255);
    }
  }
  return px;
}

// --- minimal PNG encoder (8-bit RGBA, filter 0) -----------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(...bufs) {
  let c = 0xffffffff;
  for (const buf of bufs) for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(t, data));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO assembly ------------------------------------------------------------

const sizes = [16, 32];
const pngs = sizes.map((size) => encodePng(size, drawIcon(size)));

const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const e = 6 + i * 16;
  header[e] = size % 256; // 256 encodes as 0
  header[e + 1] = size % 256;
  header.writeUInt16LE(1, e + 4); // planes
  header.writeUInt16LE(32, e + 6); // bpp
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "favicon.ico");
writeFileSync(out, Buffer.concat([header, ...pngs]));

// Evidence: sample an interior pixel of the 32px image (clear of the M strokes).
const sample = drawIcon(32);
const o = (16 * 32 + 4) * 4;
const hex = `#${[sample[o], sample[o + 1], sample[o + 2]]
  .map((v) => v.toString(16).padStart(2, "0"))
  .join("")}`;
console.log(
  `wrote ${out}: ${sizes.map((s, i) => `${s}px=${pngs[i].length}B`).join(", ")}; ` +
    `sample pixel (4,16)@32px = ${hex} alpha=${sample[o + 3]} (expect #6a2b57 / 255)`
);
