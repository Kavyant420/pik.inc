/**
 * Shader compilation and program linking.
 *
 * The error messages are the point of this module: a GLSL compile failure
 * on a driver nobody has ever tested on is close to undebuggable if the
 * console only says "ERROR: 0:412: syntax error". So the source is
 * numbered, the offending lines are printed with a caret, and the whole
 * thing is thrown with the label of the pass that failed.
 */

/** The fragment/vertex source header the host prepends to every chunk. */
export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/**
 * The fullscreen pass vertex shader.
 *
 * A single triangle that covers the whole viewport: no vertex buffer, no
 * attributes, no index buffer — `gl_VertexID` is enough. It avoids the
 * diagonal seam a two-triangle quad produces in the rasteriser.
 */
export const FULLSCREEN_VERTEX = /* glsl */ `
out vec2 vUv;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** A compiled program and the cached uniform locations. */
export interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
  /**
   * The GLSL type of each active uniform, so that a whole number can be
   * written to a float uniform and an integer uniform is written with
   * `uniform1i`. Without this, `glUniform1f` on an `int` uniform is an
   * INVALID_OPERATION on every frame.
   */
  uniformTypes: Map<string, number>;
  label: string;
  dispose(): void;
}

/** Compile one shader stage, with a readable error on failure. */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`[${label}] could not create a shader object`);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    const numbered = numberSource(source);
    gl.deleteShader(shader);
    throw new Error(`[${label}] shader compile failed:\n${log}\n\n${numbered}`);
  }

  return shader;
}

/** Link a program and cache its uniform locations. */
export function linkProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label: string,
): Program {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label}:vert`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label}:frag`);

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(`[${label}] could not create a program object`);
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  // The shaders are no longer needed once they are attached.
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`[${label}] program link failed:\n${log}`);
  }

  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const uniformTypes = new Map<string, number>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    uniforms.set(name, gl.getUniformLocation(program, name));
    uniformTypes.set(name, info.type);
  }

  return {
    program,
    uniforms,
    uniformTypes,
    label,
    dispose: () => gl.deleteProgram(program),
  };
}

/**
 * Build a program from a fragment body.
 *
 * The body is appended to the standard header and the fullscreen vertex
 * shader, so the chunks in src/gfx/shaders can stay free of boilerplate.
 */
export function createFragmentProgram(
  gl: WebGL2RenderingContext,
  body: string,
  label: string,
  extraChunks: string[] = [],
): Program {
  const fragmentSource = GLSL_HEADER + extraChunks.join('\n') + '\n' + body;
  return linkProgram(gl, GLSL_HEADER + FULLSCREEN_VERTEX, fragmentSource, label);
}

/** Values a uniform can take. */
export type UniformValue = number | boolean | [number, number] | [number, number, number, number] | Float32Array;

/** Set a whole set of uniforms in one go. Unknown names are ignored. */
export function setUniforms(
  gl: WebGL2RenderingContext,
  program: Program,
  values: Record<string, UniformValue>,
): void {
  for (const [name, value] of Object.entries(values)) {
    const location = program.uniforms.get(name);
    if (location === undefined || location === null) continue;
    const type = program.uniformTypes.get(name);
    const isInteger =
      type === gl.INT ||
      type === gl.BOOL ||
      type === gl.SAMPLER_2D ||
      type === gl.SAMPLER_CUBE ||
      type === gl.SAMPLER_3D;
    if (typeof value === 'number') {
      if (isInteger) gl.uniform1i(location, Math.round(value));
      else gl.uniform1f(location, value);
    } else if (typeof value === 'boolean') {
      gl.uniform1i(location, value ? 1 : 0);
    } else if (value instanceof Float32Array) {
      if (value.length === 2) gl.uniform2fv(location, value);
      else if (value.length === 3) gl.uniform3fv(location, value);
      else if (value.length === 4) gl.uniform4fv(location, value);
      else gl.uniform1fv(location, value);
    } else {
      const arr = value as readonly number[];
      switch (arr.length) {
        case 2:
          gl.uniform2f(location, arr[0], arr[1]);
          break;
        case 3:
          gl.uniform3f(location, arr[0], arr[1], arr[2]);
          break;
        case 4:
          gl.uniform4f(location, arr[0], arr[1], arr[2], arr[3]);
          break;
        default:
          break;
      }
    }
  }
}

/** Set an integer uniform (samplers, counters). */
export function setUniform1i(
  gl: WebGL2RenderingContext,
  program: Program,
  name: string,
  value: number,
): void {
  const location = program.uniforms.get(name);
  if (location === undefined || location === null) return;
  gl.uniform1i(location, value);
}

/** Number the source lines and point at the lines the driver complained about. */
export function numberSource(source: string, maxLines = 400): string {
  const lines = source.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    out.push(`${String(i + 1).padStart(4, ' ')} | ${lines[i]}`);
  }
  if (lines.length > maxLines) {
    out.push(`... ${lines.length - maxLines} more lines`);
  }
  return out.join('\n');
}
