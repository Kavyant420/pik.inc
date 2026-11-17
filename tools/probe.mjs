import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 4000)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 2000)));
await page.goto('http://127.0.0.1:5178/?steps=24&scale=0.25', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(15000);
const info = await page.evaluate(() => {
  const c = document.getElementById('pik-canvas');
  const gl = c?.getContext('webgl2');
  return { w: c?.width, h: c?.height, gl: !!gl, err: gl ? gl.getError() : null,
           renderer: gl ? gl.getParameter(gl.RENDERER) : null,
           version: gl ? gl.getParameter(gl.VERSION) : null };
});
console.log(info);
await browser.close();
