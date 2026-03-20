/**
 * Generate a 256x256 ICO file with embedded PNG for electron-builder
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const pixels = Buffer.alloc(SIZE * SIZE * 4);

const bg = { r: 79, g: 110, b: 247, a: 255 };
const fg = { r: 255, g: 255, b: 255, a: 255 };

function setPixel(x, y, c) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  pixels[i] = c.r; pixels[i+1] = c.g; pixels[i+2] = c.b; pixels[i+3] = c.a;
}

function fillRect(x1, y1, w, h, c) {
  for (let y = y1; y < y1 + h; y++)
    for (let x = x1; x < x1 + w; x++)
      setPixel(x, y, c);
}

function fillRoundedRect(x1, y1, w, h, r, c) {
  for (let y = y1; y < y1 + h; y++) {
    for (let x = x1; x < x1 + w; x++) {
      let inside = true;
      if (x < x1 + r && y < y1 + r)
        inside = ((x - x1 - r) ** 2 + (y - y1 - r) ** 2) <= r * r;
      else if (x >= x1 + w - r && y < y1 + r)
        inside = ((x - x1 - w + r) ** 2 + (y - y1 - r) ** 2) <= r * r;
      else if (x < x1 + r && y >= y1 + h - r)
        inside = ((x - x1 - r) ** 2 + (y - y1 - h + r) ** 2) <= r * r;
      else if (x >= x1 + w - r && y >= y1 + h - r)
        inside = ((x - x1 - w + r) ** 2 + (y - y1 - h + r) ** 2) <= r * r;
      if (inside) setPixel(x, y, c);
    }
  }
}

// Rounded blue background
fillRoundedRect(0, 0, SIZE, SIZE, 44, bg);

// "M" letter
const thick = 22;
// Left bar
fillRect(52, 55, thick, 120, fg);
// Right bar
fillRect(182, 55, thick, 120, fg);
// Left diagonal
for (let i = 0; i < 68; i++) {
  fillRect(74 + i, 55 + Math.floor(i * 1.15), thick - 6, 5, fg);
}
// Right diagonal
for (let i = 0; i < 68; i++) {
  fillRect(182 - i - thick + 6, 55 + Math.floor(i * 1.15), thick - 6, 5, fg);
}

// Down arrow
const cx = 128, ay = 195;
fillRect(cx - 4, ay - 18, 8, 36, fg);
for (let i = 0; i < 18; i++) {
  fillRect(cx - 18 + i, ay + 12 + i, 4, 4, fg);
  fillRect(cx + 18 - i, ay + 12 + i, 4, 4, fg);
}

// === Create PNG ===
const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

const rawData = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  rawData[y * (1 + SIZE * 4)] = 0; // filter byte
  pixels.copy(rawData, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const compressed = zlib.deflateSync(rawData, { level: 9 });

const png = Buffer.concat([
  pngSig,
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', compressed),
  makeChunk('IEND', Buffer.alloc(0))
]);

// === ICO wrapper ===
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2); // ICO type
icoHeader.writeUInt16LE(1, 4); // 1 image

const entry = Buffer.alloc(16);
entry[0] = 0; // 0 = 256
entry[1] = 0; // 0 = 256
entry.writeUInt16LE(1, 4);  // color planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8); // size
entry.writeUInt32LE(22, 12); // offset

const ico = Buffer.concat([icoHeader, entry, png]);

const outDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
console.log('icon.png:', png.length, 'bytes');
console.log('icon.ico:', ico.length, 'bytes');
console.log('Done! 256x256 icon created.');
