/**
 * WebGL2 context creation and capability detection.
 *
 * The renderer needs a WebGL2 context with float render targets: the
 * geodesic pass writes unbounded HDR (the blueshifted edge of the disk is
 * several orders of magnitude brighter than the receding side) and the
 * composite pass works on that HDR buffer before the tone map.
 *
 * If float render targets are not available the renderer falls back to
 * half-float, and if neither is available the site falls back to the
 * pre-rendered sequence (docs/architecture.md §5) rather than rendering
 * something wrong.
 */

/** What the device can actually do. */
export interface GLCaps {
  /** RGBA16F can be rendered into. */
  colorBufferFloat: boolean;
  /** RGBA16F can be blended into. */
  floatBlend: boolean;
  /** The largest render target the device accepts. */
  maxTextureSize: number;
  /** The unmasked renderer string (for the quality governor and the HUD). */
  renderer: string;
  /** The unmasked vendor string. */
  vendor: string;
  /** A human-readable summary used in error messages. */
  summary: string;
}

/** A live WebGL2 context plus its capabilities. */
export interface GLContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  caps: GLCaps;
  /** Release the context. */
  dispose(): void;
}

export interface ContextOptions {
  /** Request a high-performance GPU. Defaults to true. */
  highPerformance?: boolean;
  /** Keep the drawing buffer (needed for screenshots). Defaults to false. */
  preserveDrawingBuffer?: boolean;
}

/** The internal format of the HDR targets. */
export type HDRFormat = 'rgba16f' | 'rgba8';

export function createGLContext(canvas: HTMLCanvasElement, opts: ContextOptions = {}): GLContext {
  const attributes: WebGLContextAttributes = {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    powerPreference: opts.highPerformance === false ? 'low-power' : 'high-performance',
    desynchronized: false,
  };

  const gl = canvas.getContext('webgl2', attributes);
  if (!gl) {
    throw new Error(
      'WebGL2 is not available. The Kerr renderer needs a WebGL2 context; ' +
        'see docs/architecture.md §5 for the fallback.',
    );
  }

  const hasFloat = gl.getExtension('EXT_color_buffer_float') !== null;
  const hasHalf = gl.getExtension('EXT_color_buffer_half_float') !== null;
  const blend = gl.getExtension('EXT_float_blend') !== null;

  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug
    ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const vendor = debug
    ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL))
    : String(gl.getParameter(gl.VENDOR));

  const caps: GLCaps = {
    colorBufferFloat: hasFloat || hasHalf,
    floatBlend: blend,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    renderer,
    vendor,
    summary: `${vendor} / ${renderer}`,
  };

  return {
    gl,
    canvas,
    caps,
    dispose: () => {
      const lose = gl.getExtension('WEBGL_lose_context');
      lose?.loseContext();
    },
  };
}

/**
 * The HDR format to use for the intermediate targets.
 *
 * RGBA16F is preferred (it is what the composite pass is written for);
 * RGBA8 is the last-resort fallback that still produces a picture, at the
 * cost of clipping the highlights.
 */
export function chooseHDRFormat(caps: GLCaps): HDRFormat {
  return caps.colorBufferFloat ? 'rgba16f' : 'rgba8';
}

/** The internal format, type and filter for a colour target. */
export function targetFormat(format: HDRFormat): {
  internalFormat: number;
  format: number;
  type: number;
  filter: number;
} {
  // The numeric values are fixed by the WebGL2 specification:
  // RGBA16F = 0x881A, RGBA = 0x1908, HALF_FLOAT = 0x140B, UNSIGNED_BYTE = 0x1401.
  if (format === 'rgba16f') {
    return {
      internalFormat: 0x881a,
      format: 0x1908,
      type: 0x140b,
      filter: 0x2601, // LINEAR
    };
  }
  return {
    internalFormat: 0x1908,
    format: 0x1908,
    type: 0x1401,
    filter: 0x2601,
  };
}
