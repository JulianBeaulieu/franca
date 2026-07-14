import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const GREEN = [0x58, 0xcc, 0x02, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const p = pixels(x, y, size);
      raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; raw[o++] = p[3];
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Draw a cedar: a solid green field with a white triangle (foliage) + trunk.
// `pad` is the fraction of edge kept as background (maskable needs ~20%).
function cedar(pad) {
  return (x, y, size) => {
    const inset = size * pad;
    const w = size - 2 * inset;
    const cx = size / 2;
    // Foliage triangle from (inset*..) apex down to base at 78% height.
    const apexY = inset + w * 0.08;
    const baseY = inset + w * 0.72;
    const halfBase = w * 0.34;
    const trunkTop = baseY;
    const trunkBot = size - inset;
    const trunkHalf = w * 0.06;
    if (y >= apexY && y <= baseY) {
      const t = (y - apexY) / (baseY - apexY);
      const half = halfBase * t;
      if (x >= cx - half && x <= cx + half) return WHITE;
    }
    if (y >= trunkTop && y <= trunkBot && x >= cx - trunkHalf && x <= cx + trunkHalf) return WHITE;
    return GREEN;
  };
}

const outDir = join(process.cwd(), 'public', 'icons');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon-192.png'), encodePng(192, cedar(0.12)));
writeFileSync(join(outDir, 'icon-512.png'), encodePng(512, cedar(0.12)));
writeFileSync(join(outDir, 'icon-maskable-192.png'), encodePng(192, cedar(0.22)));
writeFileSync(join(outDir, 'icon-maskable-512.png'), encodePng(512, cedar(0.22)));
writeFileSync(join(process.cwd(), 'src', 'app', 'apple-icon.png'), encodePng(180, cedar(0.12)));
console.log('Icons written to public/icons and src/app/apple-icon.png');
