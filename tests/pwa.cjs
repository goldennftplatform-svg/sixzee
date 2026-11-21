const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.name, 'Sixzee — Six Dice. One Champion.');
assert.equal(manifest.short_name, 'Sixzee');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.theme_color, '#06171f');

const iconSizes = manifest.icons.map(icon => icon.sizes);
assert.ok(iconSizes.includes('192x192'), 'manifest needs a 192px Android icon');
assert.ok(iconSizes.includes('512x512'), 'manifest needs a 512px Android icon');
assert.ok(
  manifest.icons.some(icon => icon.purpose.includes('maskable')),
  'manifest needs a maskable Android icon'
);
for (const icon of manifest.icons) {
  assert.ok(exists(icon.src.replace(/^\.\//, '')), `missing icon ${icon.src}`);
}

const html = read('index.html');
assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
assert.match(html, /rel="apple-touch-icon" href="assets\/icon-192\.png"/);
assert.match(html, /id="install-btn"/);
assert.match(html, /src="pwa\.js/);

const sw = read('sw.js');
assert.match(sw, /addEventListener\('install'/);
assert.match(sw, /addEventListener\('fetch'/);
assert.ok(sw.includes('./manifest.webmanifest'));
assert.ok(sw.includes('./assets/icon-192.png'));
assert.ok(sw.includes('./pwa.js'));
assert.ok(!sw.includes('/api/*'), 'service worker must not intercept relay API routes');

console.log('PWA manifest, icons, install UX, and service worker checks passed.');
