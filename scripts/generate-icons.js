// Build icons from build/icon.svg (source of truth).
// Outputs: icon.ico (Windows), icon.icns (macOS), icon.png, Linux PNGs.
const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const SVG_PATH = path.join(BUILD_DIR, 'icon.svg');

// Windows ICO: include the full range so every shell context (taskbar,
// file list, Alt-Tab, large icons) gets a properly-rendered image.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// macOS ICNS keys
const ICNS_KEYS = { 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };

// Linux PNG directory layout (freedesktop)
const LINUX_SIZES = {
  '16x16': 16,
  '32x32': 32,
  '48x48': 48,
  '64x64': 64,
  '128x128': 128,
  '256x256': 256,
  '512x512': 512,
};

async function renderSvg(size) {
  return await sharp(SVG_PATH).resize(size, size).png().toBuffer();
}

async function generatePngs(sizes) {
  const pngs = {};
  for (const size of sizes) {
    pngs[size] = await renderSvg(size);
    console.log(`  Generated ${size}x${size} (${pngs[size].length} bytes)`);
  }
  return pngs;
}

async function createIco(pngs) {
  const pngBuffers = ICO_SIZES.map((s) => pngs[s]);
  const ico = await toIco(pngBuffers);
  return ico;
}

function createIcns(pngs) {
  // Need 128/256/512/1024; render 512/1024 from SVG if not present.
  const entries = [];
  for (const size of Object.keys(ICNS_KEYS).map(Number)) {
    if (!pngs[size]) continue;
    const data = pngs[size];
    const entrySize = 8 + data.length;
    const buf = Buffer.alloc(entrySize);
    buf.write(ICNS_KEYS[size], 0, 4, 'ascii');
    buf.writeUInt32BE(entrySize, 4);
    data.copy(buf, 8);
    entries.push(buf);
    console.log(`  Added ${ICNS_KEYS[size]} (${size}x${size}, ${entrySize} bytes)`);
  }
  const totalSize = 8 + entries.reduce((sum, e) => sum + e.length, 0);
  const icns = Buffer.alloc(totalSize);
  icns.write('icns', 0, 4, 'ascii');
  icns.writeUInt32BE(totalSize, 4);
  let offset = 8;
  for (const entry of entries) {
    entry.copy(icns, offset);
    offset += entry.length;
  }
  return icns;
}

async function main() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`SVG not found: ${SVG_PATH}`);
  }
  console.log(`Reading icon from ${SVG_PATH}\n`);

  // Step 1: Render all PNGs from the SVG
  console.log('Step 1: Rendering PNGs from SVG...');
  const pngs = await generatePngs([...ICO_SIZES, 512, 1024]);

  // Step 2: Windows ICO
  console.log('\nStep 2: Creating Windows icon.ico...');
  const ico = await createIco(pngs);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), ico);
  console.log(`  Wrote build/icon.ico (${ico.length} bytes)`);

  // Step 3: macOS ICNS
  console.log('\nStep 3: Creating macOS icon.icns...');
  const icns = createIcns(pngs);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns'), icns);
  console.log(`  Wrote build/icon.icns (${icns.length} bytes)`);

  // Step 4: Linux icons directory (with .png extension for freedesktop)
  console.log('\nStep 4: Creating Linux icons directory...');
  const linuxDir = path.join(BUILD_DIR, 'icons');
  if (fs.existsSync(linuxDir)) {
    fs.rmSync(linuxDir, { recursive: true });
  }
  fs.mkdirSync(linuxDir, { recursive: true });
  for (const [dirName, size] of Object.entries(LINUX_SIZES)) {
    const subDir = path.join(linuxDir, dirName);
    fs.mkdirSync(subDir, { recursive: true });
    if (!pngs[size]) pngs[size] = await renderSvg(size);
    fs.writeFileSync(path.join(subDir, 'apps.png'), pngs[size]);
    console.log(`  Wrote build/icons/${dirName}/apps.png`);
  }

  // Step 5: Generic 1024x1024 PNG
  console.log('\nStep 5: Writing generic build/icon.png (1024x1024)...');
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), pngs[1024]);
  console.log(`  Wrote build/icon.png (${pngs[1024].length} bytes)`);

  console.log('\n\x1b[32mDone! All icon files generated.\x1b[0m');
}

main().catch((err) => {
  console.error('\x1b[31mError:\x1b[0m', err);
  process.exit(1);
});