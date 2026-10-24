import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '..');
const webTenantRoot = resolve(repositoryRoot, 'apps/web-tenant');
const resourcesRoot = resolve(webTenantRoot, 'android/app/src/main/res');
const favicon = await readFile(resolve(webTenantRoot, 'public/favicon.svg'), 'utf8');
const faviconDataUrl = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;

const launcherSizes = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
];

const splashSizes = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];

function svgDataUrl(markup) {
  return `data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`;
}

function adaptiveForegroundMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><image href="${faviconDataUrl}" x="18" y="18" width="72" height="72" /></svg>`;
}

function splashMarkup(width, height) {
  const iconSize = Math.max(96, Math.min(240, Math.round(Math.min(width, height) * 0.28)));
  const x = Math.round((width - iconSize) / 2);
  const y = Math.round((height - iconSize) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#111827" /><image href="${faviconDataUrl}" x="${x}" y="${y}" width="${iconSize}" height="${iconSize}" /></svg>`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function writePng(path, markup, width, height, transparent = false) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;overflow:hidden"><img src="${svgDataUrl(markup)}" width="${width}" height="${height}" /></body></html>`);
  await page.screenshot({ path, omitBackground: transparent });
}

for (const [density, launcherSize, foregroundSize] of launcherSizes) {
  const destination = resolve(resourcesRoot, `mipmap-${density}`);
  await writePng(resolve(destination, 'ic_launcher.png'), favicon, launcherSize, launcherSize);
  await writePng(resolve(destination, 'ic_launcher_round.png'), favicon, launcherSize, launcherSize);
  await writePng(
    resolve(destination, 'ic_launcher_foreground.png'),
    adaptiveForegroundMarkup(),
    foregroundSize,
    foregroundSize,
    true,
  );
}

for (const [directory, width, height] of splashSizes) {
  await writePng(resolve(resourcesRoot, directory, 'splash.png'), splashMarkup(width, height), width, height);
}

await browser.close();
