import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const target = process.argv[2];
const url = target.startsWith('http') ? target : pathToFileURL(path.resolve(target)).href;

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(4000);

const info = await page.evaluate(() => {
  const canvas = document.querySelector('[data-canvas]');
  const gl = canvas?.getContext('webgl2');
  const labels = [...document.querySelectorAll('.pik-nav__label')].map((n) => n.textContent);
  const nav = document.querySelector('.pik-nav');
  return {
    hasHook: typeof window.__pik !== 'undefined',
    diag: window.__pik?.getDiagnostics?.(),
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    glLost: gl ? gl.isContextLost() : 'no-gl',
    rendererAttr: document.body.dataset.renderer ?? null,
    labels,
    navPresent: !!nav,
    hud: document.querySelector('.pik-hud')?.textContent?.slice(0, 80) ?? null,
  };
});
console.log(JSON.stringify(info, null, 2));
console.log('errors:', errors.slice(0, 8));
await page.screenshot({ path: 'shots/_smoke.png' });
await browser.close();
