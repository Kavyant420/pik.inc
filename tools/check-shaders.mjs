#!/usr/bin/env node
/**
 * Compile the whole shader chain in a real WebGL2 context.
 *
 * The GLSL in src/gfx/shaders is the one part of the renderer that a
 * type-checker cannot see. This script launches a headless Chromium with
 * SwiftShader, compiles every program the pipeline builds, links it, and
 * reports the driver's error log with the offending source lines.
 *
 *   node tools/check-shaders.mjs
 *   node tools/check-shaders.mjs --save   also write a rendered frame to /tmp
 *
 * Exit code 0 means every program compiled and linked.
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** The sources, assembled the same way the pipeline assembles them. */
async function collectSources() {
  const gfx = path.join(ROOT, 'src', 'gfx', 'shaders');

  const df64 = (await readFile(path.join(gfx, 'df64.glsl.ts'), 'utf8')).match(
    /export const DF64_GLSL = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const common = (await readFile(path.join(gfx, 'common.glsl.ts'), 'utf8')).match(
    /export const COMMON_GLSL = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const starfield = (await readFile(path.join(gfx, 'starfield.glsl.ts'), 'utf8')).match(
    /export const STARFIELD_GLSL = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const disk = (await readFile(path.join(gfx, 'disk.glsl.ts'), 'utf8')).match(
    /export const DISK_GLSL = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const kerrRay = (await readFile(path.join(gfx, 'kerrRay.glsl.ts'), 'utf8')).match(
    /export const KERR_RAY_FRAGMENT = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const bloomPrefilter = (
    await readFile(path.join(gfx, 'bloom.glsl.ts'), 'utf8')
  ).match(/export const BLOOM_PREFILTER_FRAGMENT = \/\* glsl \*\/ `([\s\S]*?)`;/)?.[1];
  const bloomDown = (await readFile(path.join(gfx, 'bloom.glsl.ts'), 'utf8')).match(
    /export const BLOOM_DOWN_FRAGMENT = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const bloomUp = (await readFile(path.join(gfx, 'bloom.glsl.ts'), 'utf8')).match(
    /export const BLOOM_UP_FRAGMENT = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const tonemap = (await readFile(path.join(gfx, 'tonemap.glsl.ts'), 'utf8')).match(
    /export const TONEMAP_GLSL = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const dither = (await readFile(path.join(gfx, 'dither.glsl.ts'), 'utf8')).match(
    /export const DITHER_GLSL = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];
  const composite = (await readFile(path.join(gfx, 'composite.glsl.ts'), 'utf8')).match(
    /export const COMPOSITE_FRAGMENT = \/\* glsl \*\/ `([\s\S]*?)`;/,
  )?.[1];

  const header = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

  const vertex = `${header}
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

  return {
    vertex,
    programs: [
      { label: 'geodesic', fragment: `${header}${df64}\n${common}\n${starfield}\n${disk}\n${kerrRay}` },
      { label: 'bloom:prefilter', fragment: `${header}${bloomPrefilter}` },
      { label: 'bloom:down', fragment: `${header}${bloomDown}` },
      { label: 'bloom:up', fragment: `${header}${bloomUp}` },
      { label: 'composite', fragment: `${header}${common}\n${tonemap}\n${dither}\n${composite}` },
    ],
  };
}

/** The page that does the compiling. */
function pageScript(sources) {
  return (sources) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl2');
    if (!gl) return { error: 'no webgl2 context' };

    const results = [];
    for (const spec of sources.programs) {
      const make = (type, source, label) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        const log = gl.getShaderInfoLog(shader) || '';
        if (!ok) {
          const numbered = source
            .split('\n')
            .map((l, i) => String(i + 1).padStart(4, ' ') + ' | ' + l)
            .join('\n');
          gl.deleteShader(shader);
          return { ok: false, log, numbered, label };
        }
        return { ok: true, shader, log, label };
      };

      const vs = make(gl.VERTEX_SHADER, sources.vertex, `${spec.label}:vert`);
      if (!vs.ok) {
        results.push({ label: spec.label, stage: 'vertex', log: vs.log, numbered: vs.numbered });
        continue;
      }
      const fs = make(gl.FRAGMENT_SHADER, spec.fragment, `${spec.label}:frag`);
      if (!fs.ok) {
        results.push({ label: spec.label, stage: 'fragment', log: fs.log, numbered: fs.numbered });
        continue;
      }

      const program = gl.createProgram();
      gl.attachShader(program, vs.shader);
      gl.attachShader(program, fs.shader);
      gl.linkProgram(program);
      const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
      const log = gl.getProgramInfoLog(program) || '';
      if (!linked) {
        results.push({ label: spec.label, stage: 'link', log });
      } else {
        results.push({ label: spec.label, stage: 'ok', log });
      }
    }
    return { results, renderer: gl.getParameter(gl.RENDERER) };
  };
}

async function main() {
  const sources = await collectSources();
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  let result;
  try {
    const page = await browser.newPage();
    result = await page.evaluate(pageScript(sources), sources);
  } finally {
    await browser.close();
  }

  if (result.error) {
    console.error(`check-shaders: ${result.error}`);
    await browser.close();
    process.exitCode = 1;
    return;
  }

  console.log(`renderer: ${result.renderer}\n`);

  let failed = 0;
  for (const entry of result.results) {
    if (entry.stage === 'ok') {
      console.log(`  OK    ${entry.label}`);
    } else {
      failed++;
      console.error(`  FAIL  ${entry.label} (${entry.stage})`);
      console.error(`        ${entry.log.trim()}`);
      if (entry.numbered) {
        const lines = entry.numbered.split('\n');
        console.error(lines.map((l) => `        ${l}`).join('\n'));
      }
    }
  }

  await browser.close();

  if (failed) {
    console.error(`\n${failed} program(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nall ${result.results.length} programs compiled and linked.`);
  }
}

main().catch((error) => {
  console.error(`check-shaders: ${error?.message ?? error}`);
  process.exitCode = 1;
});
