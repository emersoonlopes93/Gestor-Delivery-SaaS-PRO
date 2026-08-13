import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(process.cwd());
const readText = (relativePath: string) => readFileSync(resolve(appRoot, relativePath), 'utf8');

describe('driver Android source contract', () => {
  it('keeps a dedicated app identity and human app name', () => {
    const config = readText('capacitor.config.ts');
    const gradle = readText('android/app/build.gradle');
    const strings = readText('android/app/src/main/res/values/strings.xml');
    const instrumentedTest = readText('android/app/src/androidTest/java/com/pedehub/driver/ExampleInstrumentedTest.java');

    expect(config).toContain("appId: 'com.pedehub.driver'");
    expect(config).toContain("appName: 'PedeHub Entregador'");
    expect(gradle).toContain('namespace "com.pedehub.driver"');
    expect(gradle).toContain('applicationId "com.pedehub.driver"');
    expect(strings).toContain('<string name="app_name">PedeHub Entregador</string>');
    expect(instrumentedTest).toContain('assertEquals("com.pedehub.driver", appContext.getPackageName())');
    expect(`${config}${gradle}${strings}${instrumentedTest}`).not.toMatch(
      /My App|com\.getcapacitor\.(?:app|myapp)|com\.gestor\.tenant|br\.com\.gestordelivery\.storefront/,
    );
  });

  it('declares route foreground-service permissions without continuous background permission', () => {
    const manifest = readText('android/app/src/main/AndroidManifest.xml');
    const pluginManifest = readText('node_modules/@capacitor-community/background-geolocation/android/src/main/AndroidManifest.xml');
    const strings = readText('android/app/src/main/res/values/strings.xml');
    const css = readText('src/index.css');

    expect(manifest).toContain('android.permission.ACCESS_COARSE_LOCATION');
    expect(manifest).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(manifest).not.toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(pluginManifest).toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
    expect(pluginManifest).toContain('android.permission.POST_NOTIFICATIONS');
    expect(pluginManifest).toContain('android:foregroundServiceType="location"');
    expect(strings).toContain('Entrega em andamento');
    expect(strings).toContain('drawable/ic_stat_pedehub_driver');
    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
    expect(css).toContain('env(safe-area-inset-top, 0px)');
    expect(css).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('keeps the branded launcher asset instead of the Capacitor default', () => {
    const icon = readFileSync(resolve(appRoot, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'));
    const splash = readFileSync(resolve(appRoot, 'android/app/src/main/res/drawable/splash.png'));
    expect(createHash('sha256').update(icon).digest('hex'))
      .toBe('757b0bcfa54eeac3e47ee48ddd6d2deb5a46a4a3d1f5c576b3bb3fd86d828cba');
    expect(createHash('sha256').update(splash).digest('hex'))
      .toBe('5508f7f0acc693f26ccf9ce262a3e453f3055cb67a86197222cf40740f2a60e3');
  });
});
