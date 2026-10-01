// Builds the favicon and app icons (spec: Brand): a white "D" and an orange "!" on the
// gradient speech bubble. The "D" is converted to a path from Nunito 900, so the icons don't
// depend on any font. Run: npx tsx scripts/build-icons.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = process.cwd();
const fontPath = join(root, 'node_modules', '@fontsource', 'nunito', 'files', 'nunito-latin-900-normal.woff');
const fontBytes = readFileSync(fontPath);
const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength) as ArrayBuffer);
const d = font.getPath('D', 128, 318, 250).toPathData(2);

function iconSvg(padding: number): string {
  // A 512 canvas; `padding` shrinks the bubble for the maskable safe zone.
  const s = (512 - padding * 2) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0284c7"/><stop offset=".48" stop-color="#06b6d4"/><stop offset="1" stop-color="#0d9488"/></linearGradient>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#ea580c"/></linearGradient>
  </defs>
  ${padding > 0 ? '<rect width="512" height="512" fill="#121212"/>' : ''}
  <g transform="translate(${padding} ${padding}) scale(${s})">
    <path d="M96 40h320c44 0 80 36 80 80v200c0 44-36 80-80 80H224l-104 84c-12 10-28 0-24-14l14-70h-14c-44 0-80-36-80-80V120c0-44 36-80 80-80z" fill="url(#b)"/>
    <path d="${d}" fill="#ffffff"/>
    <g transform="rotate(11 382 215)">
      <path d="M368 110c0-18 30-18 30 0l-8 150c0 8-7 12-7 12s-7-4-7-12z" fill="url(#a)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>
      <circle cx="383" cy="310" r="20" fill="url(#a)" stroke="#fff" stroke-width="8"/>
    </g>
  </g>
</svg>`;
}

async function main() {
  mkdirSync(join(root, 'public', 'icons'), { recursive: true });
  const plain = iconSvg(0);
  writeFileSync(join(root, 'app', 'icon.svg'), plain);
  await sharp(Buffer.from(plain)).resize(180, 180).png().toFile(join(root, 'app', 'apple-icon.png'));
  await sharp(Buffer.from(plain)).resize(192, 192).png().toFile(join(root, 'public', 'icons', 'icon-192.png'));
  await sharp(Buffer.from(plain)).resize(512, 512).png().toFile(join(root, 'public', 'icons', 'icon-512.png'));
  await sharp(Buffer.from(iconSvg(64))).resize(512, 512).png().toFile(join(root, 'public', 'icons', 'icon-maskable-512.png'));
  console.log('icons written');
}

main();
