/**
 * One-off: turn Five-Leaf Tree source into transparent / on-dark / icon exports.
 * Run: node scripts/process-brand-logo.mjs
 */
import { existsSync } from 'node:fs';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// sharp is nested under Next; avoid adding a direct dep just for this one-off.
const sharp = require(
  path.join(root, 'node_modules/.pnpm/sharp@0.34.5/node_modules/sharp')
);

const brandDir = path.join(root, 'public/images/brand');
const sourceOut = path.join(brandDir, 'five-leaf-tree-source.png');
// Prefer the normalized source; fall back to the original spaced filename if present.
const sourceInCandidates = [
  sourceOut,
  path.join(root, 'public/images/Five-Leaf Tree Logo.png'),
];
const sourceIn = sourceInCandidates.find((p) => existsSync(p));
if (!sourceIn) {
  throw new Error('No five-leaf tree source PNG found under public/images/');
}

/** Near-white → transparent; keep logo colors. */
function knockoutWhite(rgba, width, height) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    // Soft edge: fully transparent above threshold, fade near it
    if (r >= 250 && g >= 250 && b >= 250) {
      out[i + 3] = 0;
    } else if (r >= 240 && g >= 240 && b >= 240) {
      const whiteness = Math.min(r, g, b);
      out[i + 3] = Math.round(((255 - whiteness) / 15) * 255);
    }
  }
  return { data: out, info: { width, height, channels: 4 } };
}

/** Lighten very dark navy trunk/branches for dark backgrounds. */
function lightenNavy(rgba) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 8) continue;
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    // Navy-ish: dark, blue-dominant, low saturation of red/green
    const isDark = r < 80 && g < 90 && b < 120;
    const isBlueish = b >= r && b >= g - 10;
    if (isDark && isBlueish) {
      out[i] = Math.min(255, Math.round(r + 55));
      out[i + 1] = Math.min(255, Math.round(g + 70));
      out[i + 2] = Math.min(255, Math.round(b + 90));
    }
  }
  return out;
}

async function main() {
  await mkdir(brandDir, { recursive: true });
  if (sourceIn !== sourceOut) {
    await copyFile(sourceIn, sourceOut);
  }

  const { data, info } = await sharp(sourceIn).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const knocked = knockoutWhite(data, info.width, info.height);

  const transparentPng = await sharp(knocked.data, {
    raw: { width: knocked.info.width, height: knocked.info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  await sharp(transparentPng).png().toFile(path.join(brandDir, 'osr-tree.png'));

  const onDarkRaw = lightenNavy(knocked.data);
  const onDarkPng = await sharp(onDarkRaw, {
    raw: { width: knocked.info.width, height: knocked.info.height, channels: 4 },
  })
    .png()
    .toBuffer();
  await sharp(onDarkPng).png().toFile(path.join(brandDir, 'osr-tree-on-dark.png'));

  // Icon: fit into 512 with transparent padding
  await sharp(transparentPng)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(brandDir, 'osr-tree-icon.png'));

  // Google OAuth: 120×120 on white (consent screen often prefers opaque)
  await sharp(transparentPng)
    .resize(120, 120, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: '#ffffff' })
    .png()
    .toFile(path.join(brandDir, 'osr-tree-google-120.png'));

  // Next.js app icons
  await sharp(transparentPng)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(root, 'app/icon.png'));

  await sharp(transparentPng)
    .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#ffffff' })
    .png()
    .toFile(path.join(root, 'app/apple-icon.png'));

  console.log('Wrote brand assets to', brandDir);
  console.log('Wrote app/icon.png and app/apple-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
