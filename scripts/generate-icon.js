/**
 * Erzeugt build/icon.png (256×256) und build/icon.ico mit mehreren Größen
 * (16, 24, 32, 48, 64, 128, 256) – ohne externe Abhängigkeiten.
 *
 * Das Motiv (abgerundetes Quadrat, "M" und Pfeil) wird auflösungsunabhängig
 * mit 4×4-Supersampling gezeichnet, damit auch kleine Größen sauber aussehen.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const BG = { r: 79, g: 110, b: 247 };
const FG = { r: 255, g: 255, b: 255 };
const SS = 4; // Supersampling-Faktor

/**
 * Liefert für eine normierte Koordinate (0..1) die Deckkraft von Hintergrund und Vordergrund.
 */
function sample(u, v) {
  // Abgerundetes Quadrat
  const r = 0.17;
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  const inBg = Math.sqrt(dx * dx + dy * dy) <= r;
  if (!inBg) return { bg: 0, fg: 0 };

  // "M": zwei Balken + zwei Diagonalen
  const thick = 0.085;
  let fg = false;
  const inRect = (x1, y1, x2, y2) => u >= x1 && u <= x2 && v >= y1 && v <= y2;
  if (inRect(0.20, 0.21, 0.20 + thick, 0.68)) fg = true;
  if (inRect(0.80 - thick, 0.21, 0.80, 0.68)) fg = true;
  // Diagonalen: Abstand zu Linie von (0.20+thick/2, 0.21) nach (0.5, 0.52)
  const distToSeg = (ax, ay, bx, by) => {
    const px = u - ax, py = v - ay, vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy)));
    const cx = ax + t * vx - u, cy = ay + t * vy - v;
    return Math.sqrt(cx * cx + cy * cy);
  };
  if (distToSeg(0.20 + thick / 2, 0.23, 0.5, 0.54) <= thick * 0.52) fg = true;
  if (distToSeg(0.80 - thick / 2, 0.23, 0.5, 0.54) <= thick * 0.52) fg = true;

  // Pfeil nach unten
  if (inRect(0.5 - 0.03, 0.70, 0.5 + 0.03, 0.80)) fg = true;
  // Pfeilspitze (Dreieck)
  const tipY = 0.88, baseY = 0.78, half = 0.11;
  if (v >= baseY && v <= tipY) {
    const w = half * (tipY - v) / (tipY - baseY);
    if (Math.abs(u - 0.5) <= w) fg = true;
  }
  return { bg: 1, fg: fg ? 1 : 0 };
}

function renderRgba(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          bg += s.bg; fg += s.fg;
        }
      }
      bg /= SS * SS; fg /= SS * SS;
      const i = (y * size + x) * 4;
      // Vordergrund über Hintergrund mischen
      px[i] = Math.round(BG.r * (1 - fg) + FG.r * fg);
      px[i + 1] = Math.round(BG.g * (1 - fg) + FG.g * fg);
      px[i + 2] = Math.round(BG.b * (1 - fg) + FG.b * fg);
      px[i + 3] = Math.round(255 * bg);
    }
  }
  return px;
}

// ---- PNG ----
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    rgba.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- ICO (PNG-komprimierte Einträge, ab Windows Vista unterstützt) ----
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dirSize = 16 * entries.length;
  let offset = 6 + dirSize;
  const dirs = [];
  const blobs = [];
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    dirs.push(e);
    blobs.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...dirs, ...blobs]);
}

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const entries = SIZES.map(size => ({ size, png: encodePng(size, renderRgba(size)) }));
const largest = entries[entries.length - 1];
fs.writeFileSync(path.join(outDir, 'icon.png'), largest.png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(entries));
console.log(`icon.png: ${largest.png.length} Bytes (256×256)`);
console.log(`icon.ico: ${fs.statSync(path.join(outDir, 'icon.ico')).size} Bytes (${SIZES.join(', ')})`);
