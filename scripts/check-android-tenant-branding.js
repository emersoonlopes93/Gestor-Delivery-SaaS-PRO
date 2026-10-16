const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const capacitorConfig = read('apps/web-tenant/capacitor.config.ts');
const strings = read('apps/web-tenant/android/app/src/main/res/values/strings.xml');
const manifest = read('apps/web-tenant/android/app/src/main/AndroidManifest.xml');

assert(/appName:\s*['"]PedeHub Lojista['"]/.test(capacitorConfig), 'Expected the tenant Capacitor appName to be PedeHub Lojista.');
assert(!/appName:\s*['"]My App['"]/.test(capacitorConfig), 'The tenant Capacitor appName must not use the Capacitor default.');
assert(/<string name=["']app_name["']>PedeHub Lojista<\/string>/.test(strings), 'Expected Android app_name to be PedeHub Lojista.');
assert(/android:label=["']@string\/app_name["']/.test(manifest), 'Expected the Android application label to resolve through @string/app_name.');

const requiredAssets = [
  'apps/web-tenant/public/favicon.svg',
  'scripts/generate-android-branding-assets.mjs',
  'apps/web-tenant/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
  'apps/web-tenant/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
  'apps/web-tenant/android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
  'apps/web-tenant/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png',
  'apps/web-tenant/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png',
  'apps/web-tenant/android/app/src/main/res/drawable/splash.png',
];

for (const relativePath of requiredAssets) {
  assert(fs.existsSync(path.join(root, relativePath)), `Missing tenant Android branding asset: ${relativePath}`);
}

console.log('Tenant Android branding guard passed.');
