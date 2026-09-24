import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SOURCE = 'assets/icon-source.png';
const SIZES = [16, 32, 48, 128];

await mkdir('icons', { recursive: true });
for (const size of SIZES) {
  await sharp(SOURCE).resize(size, size).png().toFile(`icons/icon${size}.png`);
  console.log(`wrote icons/icon${size}.png`);
}
