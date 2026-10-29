import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const png = readFileSync(new URL('../build/mac-icon-white.png', import.meta.url));
const size = png.readUInt32BE(16);
const kind = { 256: 'ic08', 512: 'ic09', 1024: 'ic10' }[size];
if (!kind || png.readUInt32BE(20) !== size) {
  throw new Error('The Mac icon requires a square 256, 512, or 1024 pixel PNG.');
}
const header = Buffer.alloc(16);
header.write('icns');
header.writeUInt32BE(png.length + 16, 4);
header.write(kind, 8);
header.writeUInt32BE(png.length + 8, 12);
mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
writeFileSync(new URL('../build/icon.icns', import.meta.url), Buffer.concat([header, png]));
