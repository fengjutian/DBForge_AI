const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const SVG_PATH = path.join(BUILD_DIR, 'icon.svg');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function generatePngs() {
  const pngs = {};
  for (const size of SIZES) {
    const pngBuffer = await sharp(SVG_PATH)
      .resize(size, size)
      .png()
      .toBuffer();
    pngs[size] = pngBuffer;
    console.log(`  Generated ${size}x${size} PNG (${pngBuffer.length} bytes)`);
  }
  return pngs;
}

function createIco(png256) {
  console.log('  Creating ICO...');
  return toIco([png256], { resize: false });
}

function createIcns(pngs) {
  // ICNS format: Big-endian container
  // Header: 'icns' (4 bytes) + total_size (4 bytes, big-endian)
  // Entries: type (4 bytes) + entry_size (4 bytes BE, includes 8-byte header) + data

  // macOS icon types using PNG data:
  // ic07 = 128x128
  // ic08 = 256x256
  // ic09 = 512x512
  // ic10 = 1024x1024

  const entries = {};
  if (pngs[128]) entries['ic07'] = pngs[128];
  if (pngs[256]) entries['ic08'] = pngs[256];
  if (pngs[512]) entries['ic09'] = pngs[512];
  if (pngs[1024]) entries['ic10'] = pngs[1024];

  const entryBuffers = [];
  for (const [type, data] of Object.entries(entries)) {
    const entrySize = 8 + data.length;
    const buf = Buffer.alloc(entrySize);
    buf.write(type, 0, 4, 'ascii');
    buf.writeUInt32BE(entrySize, 4);
    data.copy(buf, 8);
    entryBuffers.push(buf);
    console.log(`  Added ${type} entry (${entrySize} bytes)`);
  }

  const totalSize = 8 + entryBuffers.reduce((sum, e) => sum + e.length, 0);
  const icns = Buffer.alloc(totalSize);
  icns.write('icns', 0, 4, 'ascii');
  icns.writeUInt32BE(totalSize, 4);

  let offset = 8;
  for (const entry of entryBuffers) {
    entry.copy(icns, offset);
    offset += entry.length;
  }

  return icns;
}

async function main() {
  console.log('Generating icons from build/icon.svg...\n');

  // Step 1: Rasterize SVG to PNGs
  console.log('Step 1: Rasterizing SVG to PNGs...');
  const pngs = await generatePngs();

  // Step 2: ICO (Windows)
  console.log('\nStep 2: Creating Windows icon.ico...');
  const icoBuffer = await createIco(pngs[256]);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer);
  console.log(`  Wrote build/icon.ico (${icoBuffer.length} bytes)`);

  // Step 3: ICNS (macOS)
  console.log('\nStep 3: Creating macOS icon.icns...');
  const icnsBuffer = createIcns(pngs);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns'), icnsBuffer);
  console.log(`  Wrote build/icon.icns (${icnsBuffer.length} bytes)`);

  // Step 4: Linux icons
  console.log('\nStep 4: Creating Linux icons directory...');
  const linuxIconsDir = path.join(BUILD_DIR, 'icons');
  if (fs.existsSync(linuxIconsDir)) {
    fs.rmSync(linuxIconsDir, { recursive: true });
  }
  fs.mkdirSync(linuxIconsDir, { recursive: true });

  const linuxSizes = {
    '16x16': 16,
    '32x32': 32,
    '48x48': 48,
    '64x64': 64,
    '128x128': 128,
    '256x256': 256,
    '512x512': 512,
  };

  for (const [dirName, size] of Object.entries(linuxSizes)) {
    const subDir = path.join(linuxIconsDir, dirName);
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'apps'), pngs[size]);
    console.log(`  Wrote build/icons/${dirName}/apps`);
  }

  // Root 1024px PNG for generic use
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), pngs[1024]);
  console.log(`\n  Wrote build/icon.png (1024x1024)`);

  console.log('\n\x1b[32mDone! All icon files generated.\x1b[0m');
}

main().catch(err => {
  console.error('\x1b[31mError:\x1b[0m', err);
  process.exit(1);
});
