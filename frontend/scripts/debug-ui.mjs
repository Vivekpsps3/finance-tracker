/**
 * UI smoke test (Playwright). Run from the frontend package root only:
 *   cd frontend && npm run debug:ui
 * Not: frontend/frontend/...
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, '..');
if (!existsSync(join(frontendRoot, 'angular.json'))) {
  console.error(
    'Run this from the Angular app root:\n  cd frontend && npm run debug:ui\n' +
      `(cwd should contain angular.json; script lives at frontend/scripts/debug-ui.mjs)`
  );
  process.exit(2);
}

const { chromium } = await import('playwright');

const url = process.env.APP_URL || 'http://localhost:4200/';
const errors = [];
const logs = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  logs.push(`${msg.type()}: ${msg.text()}`);
});

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
} catch (e) {
  await browser.close();
  console.error(`Could not open ${url}`);
  console.error('Start the dev server first:  cd frontend && npm start');
  console.error(e?.message || e);
  process.exit(2);
}
await page.waitForTimeout(3000);

const root = await page.locator('app-root').innerHTML().catch(() => '');
const main = await page.locator('#main-content').innerHTML().catch(() => '');
const nav = await page.locator('nav.navbar').count();
const dashboard = await page.locator('.dashboard').count();
const title = await page.title();

console.log('URL:', url);
console.log('Title:', title);
console.log('nav count:', nav);
console.log('dashboard count:', dashboard);
console.log('app-root length:', root.length);
console.log('main-content length:', main.length);
console.log('app-root snippet:', root.slice(0, 500));
console.log('--- errors ---');
errors.forEach((e) => console.log(e));
if (!errors.length) console.log('(none)');

await browser.close();
process.exit(errors.length ? 1 : 0);