#!/usr/bin/env node
/**
 * The screenshot tool.
 *
 * Starts the built site, drives it to 0/25/50/75/100 % of the scroll and
 * writes a PNG for each. The images are what the visual review of a change
 * looks like, and they are the gate the architecture mentions:
 *
 *   npm run build && npm run shots
 *
 * Options:
 *   --url <url>      use a running server instead of starting one
 *   --out <dir>      where to put the images (default: shots/)
 *   --width <px>     the viewport width  (default: 1440)
 *   --height <px>    the viewport height (default: 900)
 *   --scale <n>      the device pixel ratio (default: 1)
 *   --settle <ms>    how long to wait for the renderer after each scroll
 */

import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function parseArgs(argv) {
  const args = {
    url: null,
    out: path.join(ROOT, 'shots'),
    width: 1440,
    height: 900,
    scale: 1,
    settle: 1200,
    keep: false,
    quality: 0.35,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[++i];
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--width') args.width = Number(argv[++i]);
    else if (arg === '--height') args.height = Number(argv[++i]);
    else if (arg === '--scale') args.scale = Number(argv[++i]);
    else if (arg === '--settle') args.settle = Number(argv[++i]);
    else if (arg === '--quality') args.quality = Number(argv[++i]);
    else if (arg === '--keep') args.keep = true;
  }
  return args;
}

const SHOTS = [
  { name: '000', progress: 0 },
  { name: '025', progress: 0.25 },
  { name: '050', progress: 0.5 },
  { name: '075', progress: 0.75 },
  { name: '100', progress: 1 },
];

/** Start `vite preview` and wait for it to answer. */
async function startServer(port) {
  const child = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return { child, url };
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  child.kill();
  throw new Error(`the preview server did not come up:\n${output}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let server = null;
  let url = args.url;
  if (!url) {
    server = await startServer(4173);
    url = server.url;
  }

  await mkdir(args.out, { recursive: true });

  const browser = await chromium.launch({
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: args.scale,
    });
    const page = await context.newPage();

    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto(`${url}${url.includes('?') ? '&' : '?'}quality=${args.quality}`, {
      waitUntil: 'load',
    });

    // Wait for the renderer to be warm.
    await page.waitForFunction(() => window.__pik !== undefined, null, { timeout: 30000 });
    await page.waitForTimeout(1500);

    for (const shot of SHOTS) {
      await page.evaluate((progress) => window.__pik.scrollTo(progress), shot.progress);
      await page.waitForTimeout(args.settle);

      const diagnostics = await page.evaluate(() => window.__pik.getDiagnostics());
      const file = path.join(args.out, `pik-${shot.name}.png`);
      await page.screenshot({ path: file, animations: 'disabled', timeout: 120000 });

      console.log(
        `${shot.name}  progress=${diagnostics.progress.toFixed(3)} r=${diagnostics.radius.toFixed(2)}M ` +
          `theta=${diagnostics.inclination.toFixed(3)} q=${diagnostics.qualityScale.toFixed(2)} ` +
          `frames=${diagnostics.frames} -> ${path.relative(ROOT, file)}`,
      );
    }

    if (errors.length) {
      console.error(`\n${errors.length} console error(s):`);
      for (const error of errors.slice(0, 10)) console.error(`  ${error}`);
    }
  } finally {
    await browser.close();
    if (server) server.child.kill();
  }
}

main().catch((error) => {
  console.error(`shoot: ${error?.message ?? error}`);
  process.exitCode = 1;
});
