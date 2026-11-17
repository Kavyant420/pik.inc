#!/usr/bin/env node
/**
 * Render frames of the Kerr black hole with the real shader chain and save
 * them as PNGs.
 *
 * This is the only way to check the *physics* of the renderer without a
 * page: the geodesic pass runs in a headless Chromium (SwiftShader), the
 * HDR target is read back, tone mapped and written out.
 *
 *   node tools/render-frame.mjs                      # the default camera
 *   node tools/render-frame.mjs --radius 6 --width 480 --height 270
 *   node tools/render-frame.mjs --r 40 12 5         # several radii at once
 *
 * The images land in tools/frames/.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'frames');

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = {
    radii: [],
    width: 320,
    height: 180,
    steps: 320,
    out: OUT,
    diskScale: 90,
    theta: Math.PI / 2 - 0.085,
    spin: 0.999,
    stars: 1,
    fov: 0.62,
    exposure: 0.4,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--radius' || arg === '--r') args.radii.push(Number(argv[++i]));
    else if (arg === '--width') args.width = Number(argv[++i]);
    else if (arg === '--height') args.height = Number(argv[++i]);
    else if (arg === '--steps') args.steps = Number(argv[++i]);
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--disk-scale') args.diskScale = Number(argv[++i]);
    else if (arg === '--theta') args.theta = Number(argv[++i]);
    else if (arg === '--spin') args.spin = Number(argv[++i]);
    else if (arg === '--stars') args.stars = Number(argv[++i]);
    else if (arg === '--fov') args.fov = Number(argv[++i]);
    else if (arg === '--exposure') args.exposure = Number(argv[++i]);
  }
  if (!args.radii.length) args.radii = [24, 12, 6, 4.2];
  return args;
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

async function collectSources() {
  const gfx = path.join(ROOT, 'src', 'gfx', 'shaders');
  const grab = async (file, name) =>
    (await readFileSafe(path.join(gfx, file))).match(
      new RegExp(`export const ${name} = /\\* glsl \\*/ \`([\\s\\S]*?)\`;`),
    )?.[1] ?? '';

  const df64 = await grab('df64.glsl.ts', 'DF64_GLSL');
  const common = await grab('common.glsl.ts', 'COMMON_GLSL');
  const starfield = await grab('starfield.glsl.ts', 'STARFIELD_GLSL');
  const disk = await grab('disk.glsl.ts', 'DISK_GLSL');
  const kerrRay = await grab('kerrRay.glsl.ts', 'KERR_RAY_FRAGMENT');

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
    fragment: `${header}${df64}\n${common}\n${starfield}\n${disk}\n${kerrRay}`,
  };
}

/**
 * Patch the geodesic fragment so that it tone maps and writes to the
 * default framebuffer.
 *
 * The alternative — rendering into an RGBA16F target and reading it back as
 * RGBA/FLOAT — hangs on SwiftShader, and the diagnostic does not need the
 * HDR values anyway: it needs a picture.
 */
function toneMappedFragment(source, exposure) {
  const patched = source.replace(
    'fragColor = vec4(acc, 1.0);',
    `{
      vec3 c = vec3(
        (isnan(acc.x) || isinf(acc.x)) ? 0.0 : acc.x,
        (isnan(acc.y) || isinf(acc.y)) ? 0.0 : acc.y,
        (isnan(acc.z) || isinf(acc.z)) ? 0.0 : acc.z);
      c = clamp(c * ${exposure.toFixed(6)}, 0.0, 1.0);
      fragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
    }`,
  );
  if (patched === source) throw new Error('could not patch the geodesic fragment');
  return patched;
}

async function readFileSafe(file) {
  const { readFile } = await import('node:fs/promises');
  return readFile(file, 'utf8');
}

/* ------------------------------------------------------------------ */
/* The page script                                                     */
/* ------------------------------------------------------------------ */

function renderScript() {
  return (opts) => {
    const { width, height, radius, theta, spin, steps, sources, diskScale, stars, fov } = opts;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return { error: 'no webgl2' };
    console.log('context ok');

    const compile = (type, source, label) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        return { error: `${label}: ${gl.getShaderInfoLog(shader)}` };
      }
      return { shader };
    };

    const vs = compile(gl.VERTEX_SHADER, sources.vertex, 'vertex');
    if (vs.error) return { error: vs.error };
    console.log('vertex ok');
    const fs = compile(gl.FRAGMENT_SHADER, sources.fragment, 'fragment');
    if (fs.error) return { error: fs.error };
    console.log('fragment ok');

    const program = gl.createProgram();
    gl.attachShader(program, vs.shader);
    gl.attachShader(program, fs.shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return { error: `link: ${gl.getProgramInfoLog(program)}` };
    }
    gl.useProgram(program);

    // The HDR target is not used: the fragment is patched to tone map, so
    // everything happens in the default framebuffer.
    // Render into an RGBA8 framebuffer: reading the *default* framebuffer
    // hangs in a headless browser (no compositor to swap), and reading
    // RGBA/FLOAT out of a half-float target hangs in SwiftShader.
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      return { error: 'framebuffer incomplete' };
    }

    const uniform = (name) => gl.getUniformLocation(program, name);
    gl.uniform2f(uniform('uResolution'), width, height);
    gl.uniform1f(uniform('uTime'), 0);
    gl.uniform1f(uniform('uSpin'), spin);
    gl.uniform1f(uniform('uRadius'), radius);
    gl.uniform1f(uniform('uTheta'), theta);
    gl.uniform1f(uniform('uFov'), fov);
    gl.uniform1i(uniform('uMaxSteps'), steps);
    gl.uniform1f(uniform('uStepScale'), 0.02);
    gl.uniform1f(uniform('uEscapeRadius'), 400);
    gl.uniform1f(uniform('uStarBrightness'), stars);
    gl.uniform1i(uniform('uSupersample'), 1);
    gl.uniform1f(uniform('uDiskInner'), 1.1818);
    gl.uniform1f(uniform('uDiskOuter'), 22);
    gl.uniform1f(uniform('uDiskPeakK'), 12000);
    gl.uniform1f(uniform('uDiskScale'), diskScale);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    const t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const t1 = performance.now();
    console.log('drawn');

    // Read back the 8-bit framebuffer.
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const t2 = performance.now();
    console.log('read back');

    // The shader already wrote sRGB-encoded bytes: just flip the rows.
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    const image = ctx.createImageData(width, height);

    let peak = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      peak = Math.max(peak, pixels[i], pixels[i + 1], pixels[i + 2]);
    }

    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * width * 4;
      const dst = y * width * 4;
      for (let x = 0; x < width; x++) {
        const s = src + x * 4;
        const t = dst + x * 4;
        image.data[t] = pixels[s];
        image.data[t + 1] = pixels[s + 1];
        image.data[t + 2] = pixels[s + 2];
        image.data[t + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    console.log('tone mapped');

    const url = out.toDataURL('image/png');
    console.log('encoded');
    return { dataUrl: url, peak: peak / 255, hasFloat: true, drawMs: t1 - t0, readMs: t2 - t1 };
  };
}

/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = await collectSources();
  sources.fragment = toneMappedFragment(sources.fragment, args.exposure);

  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  await mkdir(args.out, { recursive: true });

  try {
    for (const radius of args.radii) {
      const page = await browser.newPage();
      page.on('console', (message) => console.error(`  [page] ${message.text()}`));
      const result = await page.evaluate(renderScript(), {
        width: args.width,
        height: args.height,
        radius,
        theta: args.theta,
        spin: args.spin,
        steps: args.steps,
        diskScale: args.diskScale,
        stars: args.stars,
        fov: args.fov,
        sources,
      });

      if (result.error) {
        console.error(`r=${radius}: ${result.error}`);
        await page.close();
        continue;
      }

      const base64 = result.dataUrl.split(',')[1];
      const file = path.join(args.out, `kerr-r${String(radius).replace('.', 'p')}.png`);
      await writeFile(file, Buffer.from(base64, 'base64'));
      console.log(
        `r=${radius} -> ${path.relative(ROOT, file)} (peak HDR ${result.peak.toFixed(3)}, float=${result.hasFloat}, draw ${result.drawMs.toFixed(0)}ms, read ${result.readMs.toFixed(0)}ms)`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`render-frame: ${error?.message ?? error}`);
  process.exitCode = 1;
});
