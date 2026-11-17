/**
 * The render pipeline: HDR targets and the post-processing chain.
 *
 *   [geodesic pass: RGBA16F] → [bloom: 3 mips] → [composite + glare + dither]
 *                                                                 → canvas (sRGB)
 *
 * This is the pipeline described in docs/architecture.md §4. The renderer
 * owns it; nothing else touches GL objects.
 *
 * The bloom chain is the classic three-mip pyramid: a soft-knee bright pass
 * at half resolution, two 13-tap downsamples, then two tent upsamples
 * blended back additively. The composite pass then adds the bloom and a
 * faint anamorphic streak to the scene, tone maps, dithers and writes to
 * the canvas in one go.
 */

import { targetFormat, type GLCaps, type HDRFormat } from './context';
import { createFragmentProgram, setUniform1i, setUniforms, type Program } from './program';
import { BLOOM_DOWN_FRAGMENT, BLOOM_PREFILTER_FRAGMENT, BLOOM_UP_FRAGMENT } from './shaders/bloom.glsl';
import { COMMON_GLSL } from './shaders/common.glsl';
import { COMPOSITE_FRAGMENT } from './shaders/composite.glsl';
import { DITHER_GLSL } from './shaders/dither.glsl';
import { TONEMAP_GLSL } from './shaders/tonemap.glsl';

/** A colour target with its framebuffer. */
export interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  dispose(): void;
}

export interface PipelineOptions {
  gl: WebGL2RenderingContext;
  caps: GLCaps;
  width: number;
  height: number;
  /** Number of bloom mips. Defaults to 3. */
  bloomMips?: number;
  /** Bright-pass threshold, in linear HDR units. */
  bloomThreshold?: number;
  /** Bright-pass soft knee width. */
  bloomKnee?: number;
  /** How much of the bloom is added to the scene. */
  bloomStrength?: number;
  /** How much of the anamorphic streak is added. */
  glareStrength?: number;
  /** The streak's length, in pixels. */
  streakLength?: number;
  /** Linear exposure. */
  exposure?: number;
  /** Seconds since start — drives film grain and star scintillation. */
  time?: number;
}

/** Create a colour render target. */
export function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  format: HDRFormat,
): RenderTarget {
  const spec = targetFormat(format);

  const texture = gl.createTexture();
  if (!texture) throw new Error('could not create a render target texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, spec.internalFormat, width, height, 0, spec.format, spec.type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, spec.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, spec.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('could not create a framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error(`render target incomplete (0x${status.toString(16)})`);
  }

  return {
    texture,
    framebuffer,
    width,
    height,
    dispose: () => {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
}

export class Pipeline {
  readonly gl: WebGL2RenderingContext;

  private readonly format: HDRFormat;
  private readonly bloomMips: number;
  private readonly bloomThreshold: number;
  private readonly bloomKnee: number;
  private readonly bloomStrength: number;
  private readonly glareStrength: number;
  private readonly streakLength: number;
  exposure: number;
  /** Seconds since start — drives film grain and star scintillation. */
  time: number;

  /** The HDR target the geodesic pass writes into. */
  scene!: RenderTarget;
  /** The bloom pyramid, largest first. */
  bloom: RenderTarget[] = [];

  private vao: WebGLVertexArrayObject | null = null;
  private programs: Program[] = [];
  private prefilter!: Program;
  private down!: Program;
  private up!: Program;
  private composite!: Program;

  constructor(opts: PipelineOptions) {
    this.gl = opts.gl;
    this.format = opts.caps.colorBufferFloat ? 'rgba16f' : 'rgba8';
    this.bloomMips = Math.max(1, opts.bloomMips ?? 5);
    this.bloomThreshold = opts.bloomThreshold ?? 1.0;
    this.bloomKnee = opts.bloomKnee ?? 0.6;
    this.bloomStrength = opts.bloomStrength ?? 0.7;
    this.glareStrength = opts.glareStrength ?? 0.18;
    this.streakLength = opts.streakLength ?? 26;
    this.exposure = opts.exposure ?? 1;
    this.time = opts.time ?? 0;

    this.vao = this.gl.createVertexArray();

    this.prefilter = createFragmentProgram(this.gl, BLOOM_PREFILTER_FRAGMENT, 'bloom:prefilter');
    this.down = createFragmentProgram(this.gl, BLOOM_DOWN_FRAGMENT, 'bloom:down');
    this.up = createFragmentProgram(this.gl, BLOOM_UP_FRAGMENT, 'bloom:up');
    this.composite = createFragmentProgram(
      this.gl,
      COMPOSITE_FRAGMENT,
      'composite',
      [COMMON_GLSL, TONEMAP_GLSL, DITHER_GLSL],
    );
    this.programs = [this.prefilter, this.down, this.up, this.composite];

    this.resize(opts.width, opts.height);
  }

  /** (Re)allocate the targets for a new drawing buffer size. */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));

    this.disposeTargets();

    this.scene = createRenderTarget(this.gl, w, h, this.format);

    this.bloom = [];
    for (let i = 0; i < this.bloomMips; i++) {
      const scale = 2 << i; // 2, 4, 8
      this.bloom.push(
        createRenderTarget(
          this.gl,
          Math.max(1, Math.floor(w / scale)),
          Math.max(1, Math.floor(h / scale)),
          this.format,
        ),
      );
    }
  }

  /** Run the post-processing chain and write the result to the canvas. */
  present(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // --- bloom: prefilter ---
    this.bindTarget(this.bloom[0]);
    gl.disable(gl.BLEND);
    this.use(this.prefilter);
    this.bindTexture(this.prefilter, 'uScene', 0, this.scene.texture);
    setUniforms(gl, this.prefilter, {
      uThreshold: this.bloomThreshold,
      uKnee: this.bloomKnee,
    });
    this.drawTriangle();

    // --- bloom: downsample ---
    this.use(this.down);
    for (let i = 1; i < this.bloom.length; i++) {
      const src = this.bloom[i - 1];
      this.bindTarget(this.bloom[i]);
      this.bindTexture(this.down, 'uSource', 0, src.texture);
      setUniforms(gl, this.down, {
        uTexel: [1 / src.width, 1 / src.height] as [number, number],
      });
      this.drawTriangle();
    }

    // --- bloom: upsample (additive) ---
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.use(this.up);
    for (let i = this.bloom.length - 1; i > 0; i--) {
      const src = this.bloom[i];
      this.bindTarget(this.bloom[i - 1]);
      this.bindTexture(this.up, 'uSource', 0, src.texture);
      setUniforms(gl, this.up, {
        uTexel: [1 / src.width, 1 / src.height] as [number, number],
        uRadius: 1.0,
        uStrength: 1.0,
      });
      this.drawTriangle();
    }
    gl.disable(gl.BLEND);

    // --- composite to the canvas ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.scene.width, this.scene.height);
    this.use(this.composite);
    this.bindTexture(this.composite, 'uScene', 0, this.scene.texture);
    this.bindTexture(this.composite, 'uBloom', 1, this.bloom[0].texture);
    setUniforms(gl, this.composite, {
      uResolution: [this.scene.width, this.scene.height] as [number, number],
      uExposure: this.exposure,
      uBloomStrength: this.bloomStrength,
      uGlareStrength: this.glareStrength,
      uStreakLength: this.streakLength,
      uTime: this.time,
    });
    this.drawTriangle();

    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.disposeTargets();
    for (const program of this.programs) program.dispose();
    this.programs = [];
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    this.vao = null;
  }

  private disposeTargets(): void {
    this.scene?.dispose();
    for (const target of this.bloom) target.dispose();
    this.bloom = [];
  }

  private use(program: Program): void {
    this.gl.useProgram(program.program);
  }

  private bindTarget(target: RenderTarget): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer);
    this.gl.viewport(0, 0, target.width, target.height);
  }

  private bindTexture(program: Program, name: string, unit: number, texture: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    setUniform1i(gl, program, name, unit);
  }

  private drawTriangle(): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }
}
