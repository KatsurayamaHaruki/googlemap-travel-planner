import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const iconsDir = join(root, "public", "icons");

mkdirSync(iconsDir, { recursive: true });

const svgBase = readFileSync(join(iconsDir, "icon.svg"), "utf-8");

// Maskable variant: content scaled to 80% with blue background filling the entire canvas
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2563eb"/>
  <g transform="translate(51.2,51.2) scale(0.8)">
    <path fill="white" d="M256 96c-72.7 0-132 59.3-132 132 0 99 132 212 132 212s132-113 132-212c0-72.7-59.3-132-132-132zm0 180c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48z"/>
  </g>
</svg>`;

const sizes = [192, 512];

for (const size of sizes) {
  await sharp(Buffer.from(svgBase)).resize(size, size).png().toFile(join(iconsDir, `icon-${size}.png`));
  console.log(`Generated icon-${size}.png`);

  await sharp(Buffer.from(svgMaskable)).resize(size, size).png().toFile(join(iconsDir, `icon-maskable-${size}.png`));
  console.log(`Generated icon-maskable-${size}.png`);
}

console.log("All icons generated.");
