import sharp from "sharp";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const screenshotsDir = join(root, "public", "screenshots");

mkdirSync(screenshotsDir, { recursive: true });

// Blue background with a centered map-pin icon as a simple placeholder
function buildSvgPlaceholder(width, height, label) {
  const cx = width / 2;
  const cy = height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#2563eb"/>
  <rect x="${cx - 140}" y="${cy - 40}" width="280" height="80" rx="16" fill="rgba(0,0,0,0.25)"/>
  <text x="${cx}" y="${cy + 12}" font-family="sans-serif" font-size="28" font-weight="bold"
        fill="white" text-anchor="middle">旅行プランナー</text>
  <text x="${cx}" y="${cy + 48}" font-family="sans-serif" font-size="16"
        fill="rgba(255,255,255,0.8)" text-anchor="middle">${label}</text>
</svg>`;
}

await sharp(Buffer.from(buildSvgPlaceholder(390, 844, "モバイル表示")))
  .png()
  .toFile(join(screenshotsDir, "mobile.png"));
console.log("Generated screenshots/mobile.png");

await sharp(Buffer.from(buildSvgPlaceholder(1280, 800, "デスクトップ表示")))
  .png()
  .toFile(join(screenshotsDir, "desktop.png"));
console.log("Generated screenshots/desktop.png");

console.log("All screenshots generated. Replace with real app screenshots before production.");
