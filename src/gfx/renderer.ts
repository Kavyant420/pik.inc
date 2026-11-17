/**
 * The Kerr renderer.
 *
 * Implements the renderer contract from docs/architecture.md §4:
 *
 *   init(canvas)     → creates the WebGL2 context, compiles the shader
 *                      chain and resolves once the first frame is warm
 *   setState(state)  → called every frame with the camera/scene state
 *   render(dt)       → draws one frame
 *   getScreenCenter()→ the projected centre of the shadow in CSS pixels
 *   dispose()        → frees the GL resources
 *
 * The renderer owns the whole pipeline and nothing else: it never touches
 * the DOM beyond the canvas, never keeps a copy of the scroll progress and
 * never changes the physics. The quality governor may lower the resolution,
 * the supersampling and the integration budget — and nothing else.
 */

import type { BlackHoleState } from '../core/store';
import { createDiskModel } from '../physics/diskModel';
import { createGLContext, type GLContext } from './context';
import { Pipeline } from './pipeline';
import { createFragmentProgram, setUniforms, type Program } from './program';
import { KERR_RAY_FRAGMENT_SOURCE } from './shaders/kerrRay.glsl';

export interface BlackHoleRenderer {
  init(canvas: HTMLCanvasElement): Promise<void>;
  setState(s: BlackHoleState): void;
  render(dt: number): void;
  getScreenCenter(): { x: number; y: number };
  dispose(): void;
}

export interface RendererOptions {
  /** Vertical field of view, in radians. */
  fov?: number;
  /** Initial resolution scale (0.25 .. 1). */
  qualityScale?: number;
  /** The integration budget per ray. */
  maxSteps?: number;
  /** The step controller constant k (h ≈ k/r). */
  stepScale?: number;
  /** The radius at which a ray counts as escaped. */
  escapeRadius?: number;
  /** The brightness of the star field. */
  starBrightness?: number;
  /** The overall brightness of the disk. */
  diskScale?: number;
  /** The effective temperature of the disk at its inner edge, in kelvin. */
  diskPeakTemperatureK?: number;
  /** Linear exposure. */
  exposure?: number;
  /** Called once the renderer is warm. */
  onReady?: (info: { caps: string }) => void;
  /** Called when the quality governor changes the resolution scale. */
  onQualityChange?: (scale: number) => void;
}

/** The quality the governor believes the device can sustain. */
interface QualityState {
  scale: number;
  averageFrameMs: number;
  lastAdjust: number;
}

export function createRenderer(opts: RendererOptions = {}): BlackHoleRenderer {
  const fov = opts.fov ?? 0.62;
  const maxSteps = opts.maxSteps ?? 512;
  const stepScale = opts.stepScale ?? 0.02;
  const escapeRadius = opts.escapeRadius ?? 400;
  const starBrightness = opts.starBrightness ?? 1;
  const diskScale = opts.diskScale ?? 90;
  const diskPeakTemperatureK = opts.diskPeakTemperatureK ?? 12000;
  const exposure = opts.exposure ?? 1;

  let context: GLContext | null = null;
  let pipeline: Pipeline | null = null;
  let geodesic: Program | null = null;
  let canvas: HTMLCanvasElement | null = null;

  let state: BlackHoleState = {
    radius: 50,
    inclination: Math.PI / 2 - 0.085,
    spin: 0.999,
    time: 0,
  };

  let disposed = false;
  const quality: QualityState = {
    scale: clamp(opts.qualityScale ?? 1, 0.25, 1),
    averageFrameMs: 16.7,
    lastAdjust: 0,
  };

  const disk = createDiskModel(state.spin, diskPeakTemperatureK);

  /** Size the drawing buffer for the current quality scale. */
  const resize = (): void => {
    if (!canvas || !pipeline || !context) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const max = context.caps.maxTextureSize;

    const width = Math.min(max, Math.max(1, Math.round(rect.width * dpr * quality.scale)));
    const height = Math.min(max, Math.max(1, Math.round(rect.height * dpr * quality.scale)));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      pipeline.resize(width, height);
    }
  };

  /** The quality governor: resolution only, never the physics. */
  const govern = (frameMs: number, now: number): void => {
    quality.averageFrameMs += (frameMs - quality.averageFrameMs) * 0.05;
    if (now - quality.lastAdjust < 1200) return;

    const average = quality.averageFrameMs;
    let next = quality.scale;
    if (average > 34 && quality.scale > 0.25) next = Math.max(0.25, quality.scale - 0.15);
    else if (average < 19 && quality.scale < 1) next = Math.min(1, quality.scale + 0.1);

    if (next !== quality.scale) {
      quality.scale = next;
      quality.lastAdjust = now;
      resize();
      opts.onQualityChange?.(next);
    }
  };

  const drawGeodesicPass = (): void => {
    if (!pipeline || !geodesic || !context) return;
    const gl = context.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, pipeline.scene.framebuffer);
    gl.viewport(0, 0, pipeline.scene.width, pipeline.scene.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(geodesic.program);
    setUniforms(gl, geodesic, {
      uResolution: [pipeline.scene.width, pipeline.scene.height] as [number, number],
      uTime: state.time,
      uSpin: state.spin,
      uRadius: state.radius,
      uTheta: state.inclination,
      uFov: fov,
      uMaxSteps: maxSteps,
      uStepScale: stepScale,
      uEscapeRadius: escapeRadius,
      uStarBrightness: starBrightness,
      uSupersample: quality.scale >= 0.9 ? 1 : 1,
      uDiskInner: disk.innerRadius,
      uDiskOuter: disk.outerRadius,
      uDiskPeakK: disk.peakTemperatureK,
      uDiskScale: diskScale,
    });

    // The fullscreen triangle needs a bound vertex array.
    gl.bindVertexArray(fullscreenVao(context));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  const renderer: BlackHoleRenderer = {
    async init(target: HTMLCanvasElement): Promise<void> {
      canvas = target;
      context = createGLContext(target);

      geodesic = createFragmentProgram(context.gl, KERR_RAY_FRAGMENT_SOURCE, 'geodesic');
      pipeline = new Pipeline({
        gl: context.gl,
        caps: context.caps,
        width: 1,
        height: 1,
        exposure,
      });
      pipeline.exposure = exposure;

      resize();

      // Compile and warm up: render one frame so the driver has finished
      // linking and the first real frame is not a stutter.
      renderer.setState(state);
      renderer.render(1 / 60);

      opts.onReady?.({ caps: context.caps.summary });
    },

    setState(next: BlackHoleState): void {
      state = next;
      if (next.spin !== disk.spin) {
        disk.spin = next.spin;
        disk.innerRadius = createDiskModel(next.spin, diskPeakTemperatureK).innerRadius;
      }
    },

    render(dt: number): void {
      if (disposed || !pipeline || !context) return;
      const started = performance.now();

      resize();
      drawGeodesicPass();
      pipeline.present();

      govern(performance.now() - started, started);
      void dt;
    },

    getScreenCenter(): { x: number; y: number } {
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      // The camera looks straight at the hole, so the shadow is projected on
      // the centre of the canvas.
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },

    dispose(): void {
      disposed = true;
      geodesic?.dispose();
      geodesic = null;
      pipeline?.dispose();
      pipeline = null;
      context?.dispose();
      context = null;
    },
  };

  return renderer;
}

/* The empty vertex array used for the fullscreen triangle. */
let vaoCache: WeakMap<WebGL2RenderingContext, WebGLVertexArrayObject> | null = null;

function fullscreenVao(context: GLContext): WebGLVertexArrayObject {
  if (!vaoCache) vaoCache = new WeakMap();
  const existing = vaoCache.get(context.gl);
  if (existing) return existing;
  const vao = context.gl.createVertexArray();
  if (!vao) throw new Error('could not create a vertex array');
  vaoCache.set(context.gl, vao);
  return vao;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
