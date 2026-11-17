import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.argv[2];
const out = process.argv[3] ?? 'shots/_probe.png';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pik !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const canvas = document.querySelector('[data-canvas]');
  const cs = canvas ? getComputedStyle(canvas) : null;
  const body = getComputedStyle(document.body);
  return {
    diag: window.__pik.getDiagnostics(),
    canvasAttr: canvas ? [canvas.width, canvas.height] : null,
    canvasRect: canvas?.getBoundingClientRect().toJSON(),
    canvasBg: cs?.backgroundColor,
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    preloadPresent: !!document.querySelector('.pik-preload'),
    firstPull: document.querySelector('.pik-pull')?.getAttribute('style') ?? null,
    firstPullRect: document.querySelector('.pik-pull')?.getBoundingClientRect().toJSON() ?? null,
    ledeRect: document.querySelector('.pik-chapter__lede')?.getBoundingClientRect().toJSON() ?? null,
    pullCount: document.querySelectorAll('.pik-pull').length,
  };
});
console.log(JSON.stringify(info, null, 2));

// Screenshot a small region (fast) of the canvas area.
await page.screenshot({ path: out, clip: { x: 250, y: 150, width: 400, height: 300 }, timeout: 120000 });
const buf = readFileSync(out);
console.log('screenshot bytes', buf.length);
console.log('errors:', errors.slice(0, 10));
await browser.close();
