(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))i(r);new MutationObserver(r=>{for(const s of r)if(s.type==="childList")for(const o of s.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&i(o)}).observe(document,{childList:!0,subtree:!0});function e(r){const s={};return r.integrity&&(s.integrity=r.integrity),r.referrerPolicy&&(s.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?s.credentials="include":r.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(r){if(r.ep)return;r.ep=!0;const s=e(r);fetch(r.href,s)}})();const ls=3.2,us=400;class cs{state;listeners=new Set;dirty=!1;constructor(t={}){this.state={progress:0,radius:50,inclination:Math.PI/2-.085,spin:.999,time:0,reducedMotion:!1,qualityScale:1,blackHoleScreenCenter:{x:0,y:0},aspect:1,hud:{radiusM:50,radiusSchwarzschild:25,timeDilation:1,inclinationDeg:4.87,spin:.999},frames:0,...t}}subscribe(t){return this.listeners.add(t),()=>this.listeners.delete(t)}setProgress(t){const e=Te(t,0,1);e!==this.state.progress&&(this.state.progress=e,this.markDirty())}setCamera(t,e){this.state.radius=Te(t,ls,us),this.state.inclination=e,this.state.hud.radiusM=this.state.radius,this.state.hud.radiusSchwarzschild=this.state.radius/2,this.state.hud.inclinationDeg=(Math.PI/2-e)*(180/Math.PI),this.markDirty()}setSpin(t){this.state.spin=Te(t,-.9999,.9999),this.state.hud.spin=this.state.spin,this.markDirty()}setTime(t){this.state.time=t}setReducedMotion(t){this.state.reducedMotion=t,this.markDirty()}setQualityScale(t){this.state.qualityScale=Te(t,.25,1),this.markDirty()}setScreenCenter(t,e){this.state.blackHoleScreenCenter.x=t,this.state.blackHoleScreenCenter.y=e}setAspect(t){this.state.aspect=t}bumpFrame(){this.state.frames++}markDirty(){this.dirty=!0}flush(){if(this.dirty){this.dirty=!1;for(const t of this.listeners)t(this.state)}}}function Te(n,t,e){return n<t?t:n>e?e:n}function hs(n,t=!1){const i=1+Math.cbrt(1-n*n)*(Math.cbrt(1+n)+Math.cbrt(1-n)),r=Math.sqrt(3*n*n+i*i),s=Math.sqrt((3-i)*(3+i+2*r));return 3+r+(t?s:-s)}function fs(n,t=!1){const e=t?n:-n;return 2*(1+Math.cos(2/3*Math.acos(Math.max(-1,Math.min(1,e)))))}function ds(n){const t=hs(n),e=fs(n);return Math.max(t,e*.999)}function ps(n){return 22}function Ai(n,t=12e3){return{spin:n,innerRadius:ds(n),outerRadius:ps(),peakTemperatureK:t}}function ms(n,t={}){const e={alpha:!1,depth:!1,stencil:!1,antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:t.preserveDrawingBuffer??!1,powerPreference:t.highPerformance===!1?"low-power":"high-performance",desynchronized:!1},i=n.getContext("webgl2",e);if(!i)throw new Error("WebGL2 is not available. The Kerr renderer needs a WebGL2 context; see docs/architecture.md §5 for the fallback.");const r=i.getExtension("EXT_color_buffer_float")!==null,s=i.getExtension("EXT_color_buffer_half_float")!==null,o=i.getExtension("EXT_float_blend")!==null,a=i.getExtension("WEBGL_debug_renderer_info"),l=String(a?i.getParameter(a.UNMASKED_RENDERER_WEBGL):i.getParameter(i.RENDERER)),u=String(a?i.getParameter(a.UNMASKED_VENDOR_WEBGL):i.getParameter(i.VENDOR)),c={colorBufferFloat:r||s,floatBlend:o,maxTextureSize:i.getParameter(i.MAX_TEXTURE_SIZE),renderer:l,vendor:u,summary:`${u} / ${l}`};return{gl:i,canvas:n,caps:c,dispose:()=>{i.getExtension("WEBGL_lose_context")?.loseContext()}}}function _s(n){return n==="rgba16f"?{internalFormat:34842,format:6408,type:5131,filter:9729}:{internalFormat:6408,format:6408,type:5121,filter:9729}}const Di=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`,gs=`
out vec2 vUv;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;function Oi(n,t,e,i){const r=n.createShader(t);if(!r)throw new Error(`[${i}] could not create a shader object`);if(n.shaderSource(r,e),n.compileShader(r),!n.getShaderParameter(r,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(r)??"unknown error",o=bs(e);throw n.deleteShader(r),new Error(`[${i}] shader compile failed:
${s}

${o}`)}return r}function vs(n,t,e,i){const r=Oi(n,n.VERTEX_SHADER,t,`${i}:vert`),s=Oi(n,n.FRAGMENT_SHADER,e,`${i}:frag`),o=n.createProgram();if(!o)throw n.deleteShader(r),n.deleteShader(s),new Error(`[${i}] could not create a program object`);if(n.attachShader(o,r),n.attachShader(o,s),n.linkProgram(o),n.deleteShader(r),n.deleteShader(s),!n.getProgramParameter(o,n.LINK_STATUS)){const c=n.getProgramInfoLog(o)??"unknown error";throw n.deleteProgram(o),new Error(`[${i}] program link failed:
${c}`)}const a=new Map,l=new Map,u=n.getProgramParameter(o,n.ACTIVE_UNIFORMS);for(let c=0;c<u;c++){const f=n.getActiveUniform(o,c);if(!f)continue;const d=f.name.replace(/\[0\]$/,"");a.set(d,n.getUniformLocation(o,d)),l.set(d,f.type)}return{program:o,uniforms:a,uniformTypes:l,label:i,dispose:()=>n.deleteProgram(o)}}function ne(n,t,e,i=[]){const r=Di+i.join(`
`)+`
`+t;return vs(n,Di+gs,r,e)}function oe(n,t,e){for(const[i,r]of Object.entries(e)){const s=t.uniforms.get(i);if(s==null)continue;const o=t.uniformTypes.get(i),a=o===n.INT||o===n.BOOL||o===n.SAMPLER_2D||o===n.SAMPLER_CUBE||o===n.SAMPLER_3D;if(typeof r=="number")a?n.uniform1i(s,Math.round(r)):n.uniform1f(s,r);else if(typeof r=="boolean")n.uniform1i(s,r?1:0);else if(r instanceof Float32Array)r.length===2?n.uniform2fv(s,r):r.length===3?n.uniform3fv(s,r):r.length===4?n.uniform4fv(s,r):n.uniform1fv(s,r);else{const l=r;switch(l.length){case 2:n.uniform2f(s,l[0],l[1]);break;case 3:n.uniform3f(s,l[0],l[1],l[2]);break;case 4:n.uniform4f(s,l[0],l[1],l[2],l[3]);break}}}}function ys(n,t,e,i){const r=t.uniforms.get(e);r!=null&&n.uniform1i(r,i)}function bs(n,t=400){const e=n.split(`
`),i=[];for(let r=0;r<Math.min(e.length,t);r++)i.push(`${String(r+1).padStart(4," ")} | ${e[r]}`);return e.length>t&&i.push(`... ${e.length-t} more lines`),i.join(`
`)}const xs=`
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uKnee;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));

  /* Soft knee (Jimenez / "Next Generation Post Processing in Call of
   * Duty: Advanced Warfare"): quadratic ramp between threshold−knee and
   * threshold+knee. */
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contribution = max(soft, br - uThreshold) / max(br, 1e-5);

  fragColor = vec4(c * contribution, 1.0);
}
`,ws=`
uniform sampler2D uSource;
uniform vec2 uTexel;   /* 1 / source resolution */

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 t = uTexel;

  vec3 a = texture(uSource, vUv + vec2(-2.0,  2.0) * t).rgb;
  vec3 b = texture(uSource, vUv + vec2( 0.0,  2.0) * t).rgb;
  vec3 c = texture(uSource, vUv + vec2( 2.0,  2.0) * t).rgb;

  vec3 d = texture(uSource, vUv + vec2(-2.0,  0.0) * t).rgb;
  vec3 e = texture(uSource, vUv).rgb;
  vec3 f = texture(uSource, vUv + vec2( 2.0,  0.0) * t).rgb;

  vec3 g = texture(uSource, vUv + vec2(-2.0, -2.0) * t).rgb;
  vec3 h = texture(uSource, vUv + vec2( 0.0, -2.0) * t).rgb;
  vec3 i = texture(uSource, vUv + vec2( 2.0, -2.0) * t).rgb;

  vec3 j = texture(uSource, vUv + vec2(-1.0,  1.0) * t).rgb;
  vec3 k = texture(uSource, vUv + vec2( 1.0,  1.0) * t).rgb;
  vec3 l = texture(uSource, vUv + vec2(-1.0, -1.0) * t).rgb;
  vec3 m = texture(uSource, vUv + vec2( 1.0, -1.0) * t).rgb;

  vec3 result = e * 0.125;
  result += (a + c + g + i) * 0.03125;
  result += (b + d + f + h) * 0.0625;
  result += (j + k + l + m) * 0.125;

  fragColor = vec4(result, 1.0);
}
`,Ss=`
uniform sampler2D uSource;   /* the smaller mip   */
uniform vec2 uTexel;         /* 1 / source resolution */
uniform float uRadius;       /* tent radius in texels */
uniform float uStrength;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 t = uTexel * uRadius;

  vec3 s = texture(uSource, vUv + vec2(-1.0,  1.0) * t).rgb;
  s += texture(uSource, vUv + vec2( 0.0,  1.0) * t).rgb * 2.0;
  s += texture(uSource, vUv + vec2( 1.0,  1.0) * t).rgb;
  s += texture(uSource, vUv + vec2(-1.0,  0.0) * t).rgb * 2.0;
  s += texture(uSource, vUv).rgb * 4.0;
  s += texture(uSource, vUv + vec2( 1.0,  0.0) * t).rgb * 2.0;
  s += texture(uSource, vUv + vec2(-1.0, -1.0) * t).rgb;
  s += texture(uSource, vUv + vec2( 0.0, -1.0) * t).rgb * 2.0;
  s += texture(uSource, vUv + vec2( 1.0, -1.0) * t).rgb;
  s *= 0.0625;

  fragColor = vec4(s * uStrength, 1.0);
}
`,sr=`
#define PI  3.141592653589793
#define TAU 6.283185307179586

/* ------------------------------------------------------------------ */
/* Hashing                                                             */
/* ------------------------------------------------------------------ */

/* Dave Hoskins' hash functions: no trig, stable across drivers. */
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash23(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

/* ------------------------------------------------------------------ */
/* Value noise                                                         */
/* ------------------------------------------------------------------ */

/* Trilinear value noise with a smoothstep interpolation. */
float vnoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n = i.x + i.y * 157.0 + i.z * 113.0;

  float a = hash11(n);
  float b = hash11(n + 1.0);
  float c = hash11(n + 157.0);
  float d = hash11(n + 158.0);
  float e = hash11(n + 113.0);
  float g = hash11(n + 114.0);
  float h = hash11(n + 270.0);
  float k = hash11(n + 271.0);

  return mix(
    mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
    mix(mix(e, g, f.x), mix(h, k, f.x), f.y),
    f.z);
}

/* Fractional Brownian motion. 'octaves' is a compile-time-ish small int. */
float fbm3(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise3(p);
    norm += amp;
    amp *= 0.5;
    p *= 2.02;
  }
  return norm > 0.0 ? sum / norm : 0.0;
}

/* Ridged variant — used for the filamentary structure of the disk. */
float ridged3(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(vnoise3(p) * 2.0 - 1.0);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    p *= 2.07;
  }
  return norm > 0.0 ? sum / norm : 0.0;
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

/* Rec.709 luminance weights, used by the bloom and the composite pass. */
float luma709(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`,Ts=`
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uGlareStrength;
uniform float uStreakLength;

in vec2 vUv;
out vec4 fragColor;

/* A cheap horizontal streak: nine taps of the smallest bloom mip, spaced
 * along x. It is the "lens flare" of a real optic, and it is what makes
 * the photon ring feel like a light source rather than a line. */
vec3 anamorphicStreak(vec2 uv) {
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    float fi = float(i);
    float w = exp(-fi * fi * 0.22);
    sum += texture(uBloom, uv + vec2(fi * uStreakLength / uResolution.x, 0.0)).rgb * w;
    wsum += w;
  }
  return sum / max(wsum, 1e-5);
}

void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 streak = anamorphicStreak(vUv);

  vec3 color = scene + bloom * uBloomStrength + streak * uGlareStrength;

  /* Linear HDR -> display. */
  color = linearToSrgb(acesFilmic(color * uExposure));

  /* Dither before the 8-bit write. */
  vec2 frag = gl_FragCoord.xy;
  color.r = ditherValue(color.r, frag);
  color.g = ditherValue(color.g, frag);
  color.b = ditherValue(color.b, frag);

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`,Es=`
/* 8x8 Bayer matrix, values in [0, 1).
 *
 * The matrix is defined bit-wise: for each bit position i of the cell
 * coordinates, the two bits of the index are (x_i XOR y_i) and y_i, with
 * the pairs interleaved from the least significant end.
 */
float bayer8(vec2 p) {
  int x = int(mod(p.x, 8.0));
  int y = int(mod(p.y, 8.0));
  int v = 0;
  for (int i = 0; i < 3; i++) {
    int bx = (x >> i) & 1;
    int by = (y >> i) & 1;
    v |= (((bx ^ by) << 1) | by) << (2 * i);
  }
  return float(v) / 64.0;
}

/* Triangular PDF noise: the difference of two uniforms. */
float triangularNoise(vec2 p) {
  return (hash21(p) - hash21(p + 17.13)) ;
}

/* Apply ±0.5 LSB of dither to a value in [0, 1]. */
float ditherValue(float v, vec2 fragCoord) {
  float b = bayer8(fragCoord) - 0.5;
  float t = triangularNoise(fragCoord) - 0.5;
  return v + (b * 0.5 + t * 0.5) / 255.0;
}
`,ks=`
/* Narkowicz's fit of the ACES RRT+ODT. */
vec3 acesFilmic(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

/* The exact sRGB opto-electronic transfer function. */
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92,
             1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), c));
}

/* sRGB -> linear (for textures that arrive already encoded). */
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92,
             pow((c + 0.055) / 1.055, vec3(2.4)),
             step(vec3(0.04045), c));
}
`;function Fi(n,t,e,i){const r=_s(i),s=n.createTexture();if(!s)throw new Error("could not create a render target texture");n.bindTexture(n.TEXTURE_2D,s),n.texImage2D(n.TEXTURE_2D,0,r.internalFormat,t,e,0,r.format,r.type,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,r.filter),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,r.filter),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);const o=n.createFramebuffer();if(!o)throw new Error("could not create a framebuffer");n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,s,0);const a=n.checkFramebufferStatus(n.FRAMEBUFFER);if(n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindTexture(n.TEXTURE_2D,null),a!==n.FRAMEBUFFER_COMPLETE)throw n.deleteFramebuffer(o),n.deleteTexture(s),new Error(`render target incomplete (0x${a.toString(16)})`);return{texture:s,framebuffer:o,width:t,height:e,dispose:()=>{n.deleteFramebuffer(o),n.deleteTexture(s)}}}class Ms{gl;format;bloomMips;bloomThreshold;bloomKnee;bloomStrength;glareStrength;streakLength;exposure;scene;bloom=[];vao=null;programs=[];prefilter;down;up;composite;constructor(t){this.gl=t.gl,this.format=t.caps.colorBufferFloat?"rgba16f":"rgba8",this.bloomMips=Math.max(1,t.bloomMips??3),this.bloomThreshold=t.bloomThreshold??1,this.bloomKnee=t.bloomKnee??.6,this.bloomStrength=t.bloomStrength??.7,this.glareStrength=t.glareStrength??.18,this.streakLength=t.streakLength??26,this.exposure=t.exposure??1,this.vao=this.gl.createVertexArray(),this.prefilter=ne(this.gl,xs,"bloom:prefilter"),this.down=ne(this.gl,ws,"bloom:down"),this.up=ne(this.gl,Ss,"bloom:up"),this.composite=ne(this.gl,Ts,"composite",[sr,ks,Es]),this.programs=[this.prefilter,this.down,this.up,this.composite],this.resize(t.width,t.height)}resize(t,e){const i=Math.max(1,Math.floor(t)),r=Math.max(1,Math.floor(e));this.disposeTargets(),this.scene=Fi(this.gl,i,r,this.format),this.bloom=[];for(let s=0;s<this.bloomMips;s++){const o=2<<s;this.bloom.push(Fi(this.gl,Math.max(1,Math.floor(i/o)),Math.max(1,Math.floor(r/o)),this.format))}}present(){const t=this.gl;t.bindVertexArray(this.vao),t.disable(t.DEPTH_TEST),t.disable(t.CULL_FACE),this.bindTarget(this.bloom[0]),t.disable(t.BLEND),this.use(this.prefilter),this.bindTexture(this.prefilter,"uScene",0,this.scene.texture),oe(t,this.prefilter,{uThreshold:this.bloomThreshold,uKnee:this.bloomKnee}),this.drawTriangle(),this.use(this.down);for(let e=1;e<this.bloom.length;e++){const i=this.bloom[e-1];this.bindTarget(this.bloom[e]),this.bindTexture(this.down,"uSource",0,i.texture),oe(t,this.down,{uTexel:[1/i.width,1/i.height]}),this.drawTriangle()}t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE),this.use(this.up);for(let e=this.bloom.length-1;e>0;e--){const i=this.bloom[e];this.bindTarget(this.bloom[e-1]),this.bindTexture(this.up,"uSource",0,i.texture),oe(t,this.up,{uTexel:[1/i.width,1/i.height],uRadius:1,uStrength:1}),this.drawTriangle()}t.disable(t.BLEND),t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,this.scene.width,this.scene.height),this.use(this.composite),this.bindTexture(this.composite,"uScene",0,this.scene.texture),this.bindTexture(this.composite,"uBloom",1,this.bloom[0].texture),oe(t,this.composite,{uResolution:[this.scene.width,this.scene.height],uExposure:this.exposure,uBloomStrength:this.bloomStrength,uGlareStrength:this.glareStrength,uStreakLength:this.streakLength}),this.drawTriangle(),t.bindVertexArray(null)}dispose(){this.disposeTargets();for(const t of this.programs)t.dispose();this.programs=[],this.vao&&this.gl.deleteVertexArray(this.vao),this.vao=null}disposeTargets(){this.scene?.dispose();for(const t of this.bloom)t.dispose();this.bloom=[]}use(t){this.gl.useProgram(t.program)}bindTarget(t){this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,t.framebuffer),this.gl.viewport(0,0,t.width,t.height)}bindTexture(t,e,i,r){const s=this.gl;s.activeTexture(s.TEXTURE0+i),s.bindTexture(s.TEXTURE_2D,r),ys(s,t,e,i)}drawTriangle(){this.gl.drawArrays(this.gl.TRIANGLES,0,3)}}const Rs=`

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const float DF64_MAX_F32       = 3.4028234663852886e38;   // largest finite float32
const float DF64_MIN_NORMAL_F32 = 1.1754943508222875e-38;  // smallest normal float32
const float DF64_MIN_SUBNORMAL_F32 = 1.401298464324817e-45; // smallest float32 (subnormal)

/* Dekker splitter for binary32: 2^12 + 1 = 4097. */
const float DF64_SPLITTER = 4097.0;

/* ------------------------------------------------------------------ */
/* Exact primitives                                                    */
/* ------------------------------------------------------------------ */

/**
 * Exact sum of two float32s.
 * Returns (s, e) with s = fl(a + b) and s + e === a + b exactly
 * (no rounding, no overflow of the error term).
 */
vec2 twoSum(float a, float b) {
  float s = a + b;
  float bb = s - a;
  float err = (a - (s - bb)) + (b - bb);
  return vec2(s, err);
}

/**
 * Split a float32 into (hi, lo) such that hi + lo === a exactly and
 * hi carries at most the top 12 significand bits while lo carries the
 * remaining 12. All four partial products hi*hi, hi*lo, lo*hi, lo*lo are then
 * exactly representable in binary32, which is what makes twoProd exact.
 *
 * The arithmetic form (c = 4097*a; hi = c - (c - a); lo = a - hi) is the
 * classic Dekker split; it needs 4097*a to be finite, i.e. |a| <= 8.3e34.
 * Above that the exact significand truncation is used instead.
 */
vec2 dsSplit(float a) {
  float c = DF64_SPLITTER * a;
  if (abs(c) <= DF64_MAX_F32) {
    float hi = c - (c - a);
    float lo = a - hi;
    return vec2(hi, lo);
  }
  /* Overflow fallback: keep the top 12 significand bits, move the low 12 out. */
  highp uint bits = floatBitsToUint(a);
  highp uint mant = bits & 0x007fffffu;
  highp uint hiBits = (bits & 0xff800000u) | (mant & 0x007ff000u);
  float hi = uintBitsToFloat(hiBits);
  float lo = a - hi;
  return vec2(hi, lo);
}

/**
 * Exact product of two float32s using Dekker's splitting.
 * Returns (p, e) with p = fl(a * b) and p + e === a * b exactly.
 */
vec2 twoProd(float a, float b) {
  float p = a * b;
  vec2 as = dsSplit(a);
  vec2 bs = dsSplit(b);
  float err = ((as.x * bs.x - p) + as.x * bs.y) + as.y * bs.x;
  err = err + as.y * bs.y;
  return vec2(p, err);
}

/* ------------------------------------------------------------------ */
/* Double-single arithmetic                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a float32 into a double-single (identity split).
 */
vec2 dsFromFloat(float a) {
  return vec2(a, 0.0);
}

/**
 * Collapse a double-single back to a single float32
 * (rounds the low part into the high one).
 */
float dsToFloat(vec2 a) {
  return a.x + a.y;
}

/**
 * Renormalise a double-single: the returned pair has |low| < ulp(high)/2 and
 * represents exactly the same value as the input.
 */
vec2 dsNormalize(vec2 a) {
  vec2 s = twoSum(a.x, a.y);
  return vec2(s.x, s.y);
}

/**
 * Full double-single addition; returns (high, low).
 *
 * The textbook form recovers the residual with lo - (x - hi), i.e. by
 * cancelling two nearly equal floats. Some shader compilers fold or
 * re-associate that pattern away (and some evaluate compile-time constants in
 * double precision), so the final split is done with the error-free two-sum
 * instead: twoSum(hi, lo) returns (fl(hi+lo), the exact error of that
 * rounding), which is the very same pair the textbook form produces, but
 * without relying on a cancellation.
 */
vec2 dsAddFull(vec2 a, vec2 b) {
  float hi = a.x + b.x;
  float e = hi - a.x;
  float lo = ((a.x - (hi - e)) + (b.x - e)) + a.y + b.y;
  vec2 rr = twoSum(hi, lo);
  return vec2(rr.x, rr.y);
}

/**
 * High part of the double-single sum a + b.
 */
float dsAdd(vec2 a, vec2 b) {
  return dsAddFull(a, b).x;
}

/**
 * Full double-single subtraction; returns (high, low).
 */
vec2 dsSubFull(vec2 a, vec2 b) {
  return dsAddFull(a, vec2(-b.x, -b.y));
}

/**
 * High part of the double-single difference a - b.
 */
float dsSub(vec2 a, vec2 b) {
  return dsSubFull(a, b).x;
}

/**
 * Full double-single multiplication; returns (high, low).
 *
 * As in dsAddFull the high/low split is done with the error-free two-sum
 * instead of a cancellation. The a.y*b.y term is folded in with a second
 * two-sum, which is the renormalisation step of the classic algorithm.
 */
vec2 dsMulFull(vec2 a, vec2 b) {
  vec2 p = twoProd(a.x, b.x);
  float e = p.y + (a.x * b.y + a.y * b.x);
  vec2 s = twoSum(p.x, e);            /* (fl(p.x + e), exact error) */
  vec2 s2 = twoSum(s.x, a.y * b.y);   /* fold in the a.y*b.y term */
  return vec2(s2.x, s.y + s2.y);
}

/**
 * Double-single product of two double-single numbers.
 * Alias of dsMulFull (the product is a single double-single number, not a
 * per-component product).
 */
vec2 dsMul(vec2 a, vec2 b) {
  return dsMulFull(a, b);
}

/**
 * High part of the double-single product of two float32s.
 */
float dsMul(float a, float b) {
  return dsMulFull(vec2(a, 0.0), vec2(b, 0.0)).x;
}

/**
 * Full double-single division; returns (high, low).
 * Two Newton steps on the residual: q1 = a.x/b.x, then the residual
 * r = a - q1*b is corrected twice and the quotient renormalised.
 */
vec2 dsDivFull(vec2 a, vec2 b) {
  float q1 = a.x / b.x;
  vec2 r1 = dsSubFull(a, dsMulFull(vec2(q1, 0.0), b));
  float q2 = r1.x / b.x;
  vec2 r2 = dsSubFull(r1, dsMulFull(vec2(q2, 0.0), b));
  float q3 = r2.x / b.x;
  vec2 q = dsAddFull(dsAddFull(vec2(q1, 0.0), vec2(q2, 0.0)), vec2(q3, 0.0));
  return dsNormalize(q);
}

/**
 * High part of the double-single quotient a / b.
 */
float dsDiv(float a, float b) {
  return dsDivFull(vec2(a, 0.0), vec2(b, 0.0)).x;
}

/**
 * Magnitude of the residual of a double-single, expressed in ulps of its
 * high part. A well normalised double-single reports a small number (< 0.5);
 * the value itself is obtained with dsToFloat().
 */
float dsErrorEstimate(vec2 a) {
  float ax = abs(a.x);
  float ulp;
  if (ax < DF64_MIN_NORMAL_F32) {
    /* zero or subnormal high part: the spacing is the smallest subnormal. */
    ulp = DF64_MIN_SUBNORMAL_F32;
  } else {
    highp uint bits = floatBitsToUint(ax);
    int e = int((bits >> 23) & 0xffu) - 127;
    ulp = exp2(float(e - 23));
  }
  return abs(a.y) / ulp;
}
`,Ps=`
/* One magnitude layer of stars.
 *
 * 'density'  cells per cube face
 * 'sharp'    inverse of the point-spread width in cell units
 * 'seed'     decorrelates the layers
 */
vec3 starLayer(vec3 dir, float density, float sharp, float seed) {
  vec3 a = abs(dir);
  vec2 uv;
  float face;

  if (a.x >= a.y && a.x >= a.z) {
    uv = dir.zy / max(a.x, 1e-6);
    face = dir.x > 0.0 ? 0.0 : 1.0;
  } else if (a.y >= a.z) {
    uv = dir.xz / max(a.y, 1e-6);
    face = dir.y > 0.0 ? 2.0 : 3.0;
  } else {
    uv = dir.xy / max(a.z, 1e-6);
    face = dir.z > 0.0 ? 4.0 : 5.0;
  }

  vec3 p = vec3(uv * density, face * 37.0 + seed);
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;

  vec3 h = hash33(id + seed);
  /* Stars sit away from the cell borders so the faces do not show seams. */
  vec2 offset = (h.xy - 0.5) * 0.72;
  float d = length(f.xy - offset);

  /* A steep magnitude distribution: a few bright stars, many faint ones. */
  float mag = pow(hash13(id + 19.7 + seed), 9.0);
  float s = mag * exp(-d * d * sharp);

  /* Stellar colour: mostly white, some warm, some blue. */
  float t = hash13(id + 41.3 + seed);
  vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.86, 1.0), smoothstep(0.35, 1.0, t));
  tint = mix(vec3(1.0), tint, 0.75);

  return tint * s;
}

/* The full sky: three magnitude classes, no diffuse background. */
vec3 starfield(vec3 dir, float brightness) {
  vec3 c = vec3(0.0);
  c += starLayer(dir,  22.0, 240.0,  0.0)  * 1.60;  /* bright, sparse  */
  c += starLayer(dir,  58.0, 900.0, 11.0)  * 0.55;  /* mid             */
  c += starLayer(dir, 150.0, 2600.0, 23.0) * 0.16;  /* faint, dense    */
  return c * brightness;
}
`,Cs=`
uniform float uDiskInner;    /* inner edge of the disk, in M      */
uniform float uDiskOuter;    /* outer edge of the disk, in M      */
uniform float uDiskPeakK;    /* effective temperature at the inner edge, K */
uniform float uDiskScale;    /* overall brightness of the disk    */

/* The Novikov–Thorne flux shape F(r) up to an overall constant.
 *
 * Returns a value >= 0. The denominator vanishes at the equatorial photon
 * orbit, which lies inside the ISCO for every spin, so the disk (truncated
 * at the ISCO) never reaches it; the floor is only a safety net.
 *
 * The escaping flux carries the photon-capture factor: the fraction of the
 * locally emitted photons that escape the hole's photon well. The capture
 * cone closes at the photon orbit, which removes the unphysical pole of the
 * closed form.
 */
float ntFluxShape(float r, float a) {
  float ri = max(r, 1.0);
  float s  = sqrt(ri);
  float w  = 1.0 - 3.0 / ri + 2.0 * a / (ri * s);
  w = max(w, 2.0e-3);
  float num = 1.0 + (1.0 - a) / (ri * s);
  float shape = num / (ri * ri * ri * w);

  /* r_ph = 2(1 + cos((2/3) acos(-a))) — the prograde equatorial photon orbit. */
  float rPh = 2.0 * (1.0 + cos((2.0 / 3.0) * acos(clamp(-a, -1.0, 1.0))));
  float escape = max(1.0 - sqrt(rPh / ri), 0.0);

  return shape * escape;
}

/* The Planckian locus (Kim et al. 2002) — chromaticity in xy for a
 * blackbody of temperature T, then converted to linear sRGB.
 */
vec3 blackbodyChroma(float T) {
  T = clamp(T, 1200.0, 40000.0);
  float t2 = T * T;
  float t3 = t2 * T;

  float x;
  if (T < 4000.0) {
    x = -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / T + 0.179910;
  } else {
    x = -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / T + 0.240390;
  }

  float x2 = x * x;
  float x3 = x2 * x;
  float y;
  if (T < 2222.0) {
    y = -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683;
  } else if (T < 4000.0) {
    y = -0.9549476 * x3 - 1.37418593 * x2 + 2.62591848 * x - 0.62408774;
  } else {
    y = 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  }
  return vec3(x, y, 1.0 - x - y);
}

/* Linear sRGB of a blackbody, normalised so the brightest channel is 1.
 * The intensity comes from the flux, not from the colour. */
vec3 blackbodyRgb(float T) {
  vec3 xy = blackbodyChroma(T);
  vec3 XYZ = vec3(xy.x, xy.y, xy.z) / max(xy.y, 1e-4);
  mat3 toRgb = mat3(
     3.2404542, -0.9692660,  0.0556434,
    -1.5371385,  1.8760108, -0.2040259,
    -0.4985314,  0.0415560,  1.0572252);
  vec3 rgb = max(toRgb * XYZ, vec3(0.0));
  float m = max(rgb.r, max(rgb.g, rgb.b));
  return m > 1e-6 ? rgb / m : vec3(1.0);
}

/* The Keplerian angular velocity of the disk material (M = 1). */
float diskOmega(float r, float a) {
  return 1.0 / (pow(max(r, 1.0), 1.5) + a);
}

/* The redshift/blueshift factor g for a photon emitted by the disk at
 * radius r and received by a distant observer:
 *
 *     g = 1 / [ u^t (1 - Omega L / E) ]
 *
 * 'L' is the angular momentum of the *forward* photon (the tracer works
 * with the backward ray, whose L has the opposite sign).
 */
float diskRedshift(float r, float a, float E, float L) {
  float ri = max(r, 1.0);
  float s  = sqrt(ri);
  float w  = 1.0 - 3.0 / ri + 2.0 * a / (ri * s);
  w = max(w, 1.0e-4);
  float ut = (1.0 + a / (ri * s)) / sqrt(w);
  float om = diskOmega(r, a);
  float denom = ut * (1.0 - om * L / max(E, 1e-9));
  return 1.0 / denom;
}

/* The emitted light of the disk at one point of the equatorial plane.
 *
 *   r      radius of the crossing, in M
 *   phi    azimuth of the crossing, in radians
 *   g      redshift factor (>= 1 blueshifted)
 *   a      spin
 *   time   seconds, used to shear the turbulence
 */
vec3 diskEmission(float r, float phi, float g, float a, float time) {
  float shape = ntFluxShape(r, a);

  /* The emitted effective temperature, normalised to the inner edge. */
  float shapeIn = ntFluxShape(uDiskInner, a);
  float T = uDiskPeakK * pow(max(shape / max(shapeIn, 1e-12), 1e-9), 0.25);

  /* The observer sees the temperature shifted by the redshift factor. */
  T *= g;
  vec3 tint = blackbodyRgb(T);

  /* Turbulence. The texture is sheared by the local Keplerian rate, so the
   * inner rings really do run ahead of the outer ones. */
  float om = diskOmega(r, a);
  float shear = phi - om * time;
  float turb = fbm3(vec3(r * 0.30, shear * 0.85, time * 0.04), 4);
  float fil  = ridged3(vec3(r * 0.75, shear * 1.70, time * 0.07), 3);
  float profile = 0.45 + 1.15 * turb * (0.55 + 0.85 * fil);

  /* Bolometric beaming: I_obs = g^4 I_em. */
  float g2 = g * g;
  float intensity = shape * g2 * g2 * profile * uDiskScale;

  return tint * intensity;
}
`,As=`
uniform vec2  uResolution;   /* drawing buffer size, pixels             */
uniform float uTime;         /* seconds since the renderer started      */
uniform float uSpin;          /* a/M                                  */
uniform float uRadius;        /* camera radius r, in M                */
uniform float uTheta;         /* camera polar angle, in radians       */
uniform float uFov;           /* vertical field of view, in radians    */
uniform int   uMaxSteps;      /* integration budget per ray            */
uniform float uStepScale;     /* step controller constant k            */
uniform float uEscapeRadius;  /* radius at which a ray is "gone"       */
uniform float uStarBrightness;
uniform int   uSupersample;   /* 1 or 2 (2x2 rotated grid)             */

out vec4 fragColor;

/* ------------------------------------------------------------------ */
/* Per-ray state (globals: GLSL has no cheap way to return 12 values)  */
/* ------------------------------------------------------------------ */

float gE;        /* energy at infinity                                */
float gL;        /* azimuthal angular momentum (of the BACKWARD ray)  */
float gQ;        /* Carter constant                                    */
float gC;        /* (L - aE)² + Q                                      */
float gBetaF;    /* 2a²E² - 2aEL - C (float32 copy)                   */
vec2  gE2;       /* E²  as double-single                               */
vec2  gBeta;     /* beta as double-single                              */
vec2  gTwoC;     /* 2C as double-single                                */
vec2  gA2Q;      /* a²Q as double-single                               */

/* ------------------------------------------------------------------ */
/* Metric                                                              */
/* ------------------------------------------------------------------ */

/* Σ = r² + a²cos²θ */
float kSigma(float r, float ct) {
  float a2 = uSpin * uSpin;
  return r * r + a2 * ct * ct;
}

/* Δ = r² − 2r + a² */
float kDelta(float r) {
  float a2 = uSpin * uSpin;
  return r * r - 2.0 * r + a2;
}

/* A = (r²+a²)² − a²Δ sin²θ */
float kMetricA(float r, float ct) {
  float a2 = uSpin * uSpin;
  float s = r * r + a2;
  float st2 = 1.0 - ct * ct;
  return s * s - a2 * kDelta(r) * st2;
}

/* Outer event horizon r₊ = 1 + √(1−a²) */
float kHorizon() {
  float a2 = uSpin * uSpin;
  return 1.0 + sqrt(max(0.0, 1.0 - a2));
}

/* ------------------------------------------------------------------ */
/* Conserved quantities and the potentials                            */
/* ------------------------------------------------------------------ */

/*
 * E = −p_t, L = p_φ, Q = p_θ² + L²cot²θ − a²E²cos²θ
 *
 * 'd' is the unit direction in the camera's orthonormal triad
 * (e_r̂, e_θ̂, e_φ̂); the tetrad is the *static* observer's.
 */
void conservedFromDirection(float r, float ct, vec3 d, out float E, out float L, out float Q) {
  float a = uSpin;
  float a2 = a * a;
  float st2 = max(1.0 - ct * ct, 1e-8);
  float S = r * r + a2 * ct * ct;
  float D = r * r - 2.0 * r + a2;
  float gtt = -(1.0 - 2.0 * r / S);
  float gtp = -2.0 * a * r * st2 / S;
  float gpp = st2 * (r * r + a2 + 2.0 * a2 * r * st2 / S);

  float alpha = inversesqrt(-gtt);          /* lapse of the static observer */
  float ut = alpha;                        /* u^t                        */
  float c = -gtp / (gtt * ut);              /* e_φ̂'s time component       */
  float invNorm = inversesqrt(max(gpp - gtp * gtp / gtt, 1e-30));

  /* p^μ = E_obs (u^μ + d·e^μ), with E_obs = 1 */
  float pt = ut * (1.0 + d.z * c);
  float pr = d.x * sqrt(D / S);
  float pth = d.y / sqrt(S);
  float pph = d.z * invNorm;

  float p_t = gtt * pt + gtp * pph;
  float p_phi = gtp * pt + gpp * pph;
  float p_theta = S * pth;

  E = -p_t;
  L = p_phi;
  Q = p_theta * p_theta + L * L * (ct * ct / st2) - a2 * E * E * ct * ct;
}

/* R(r) = E²r⁴ + βr² + 2Cr − a²Q, evaluated in double-single. */
vec2 dsRadialPotential(float r) {
  vec2 rr = dsFromFloat(r);
  vec2 r2 = dsMulFull(rr, rr);
  vec2 r4 = dsMulFull(r2, r2);
  vec2 t = dsAddFull(dsMulFull(gE2, r4), dsMulFull(gBeta, r2));
  return dsAddFull(t, dsSubFull(dsMulFull(gTwoC, rr), gA2Q));
}

/* R'(r) = 4E²r³ + 2βr + 2C (float32 is plenty for a derivative). */
float radialDerivative(float r) {
  return 4.0 * gE * gE * r * r * r + 2.0 * gBetaF * r + 2.0 * gC;
}

/* The radial potential as a single float. */
float radialPotential(float r) {
  vec2 v = dsRadialPotential(r);
  return v.x + v.y;
}

/* W(u) = −a²E²u⁴ + (a²E² − Q − L²)u² + Q, with u = cosθ. */
float polarPotential(float u) {
  float a2E2 = uSpin * uSpin * gE * gE;
  float u2 = u * u;
  return -a2E2 * u2 * u2 + (a2E2 - gQ - gL * gL) * u2 + gQ;
}

/* W'(u) */
float polarDerivative(float u) {
  float a2E2 = uSpin * uSpin * gE * gE;
  return -4.0 * a2E2 * u * u * u + 2.0 * (a2E2 - gQ - gL * gL) * u;
}

/* dφ/dσ = 2arE/Δ + L(Δ − a²sin²θ)/(Δ sin²θ) */
float phiDot(float r, float ct) {
  float D = kDelta(r);
  float st2 = max(1.0 - ct * ct, 1e-6);
  float a = uSpin;
  return (2.0 * a * r * gE) / D + (gL * (D - a * a * st2)) / (D * st2);
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

/*
 * The camera looks *inwards*, at the hole:
 *
 *   forward = −e_r̂      (towards the hole)
 *   up      = −e_θ̂      (towards the spin axis, +z)
 *   right   = +e_φ̂
 *
 * 'ndc' is the screen position with x in [−aspect/2, aspect/2] and
 * y ∈ [−0.5, 0.5].
 */
vec3 cameraDirection(vec2 ndc, float tanHalfFov) {
  float x = ndc.x * 2.0 * tanHalfFov;
  float y = ndc.y * 2.0 * tanHalfFov;
  return normalize(vec3(-1.0, -y, x));
}

/* The ray's direction in the local triad at an arbitrary point. */
vec3 localDirection(float r, float ct, float vr, float vu) {
  float a = uSpin;
  float a2 = a * a;
  float st2 = max(1.0 - ct * ct, 1e-8);
  float st = sqrt(st2);
  float S = r * r + a2 * ct * ct;
  float D = r * r - 2.0 * r + a2;
  float gtt = -(1.0 - 2.0 * r / S);
  float gtp = -2.0 * a * r * st2 / S;
  float gpp = st2 * (r * r + a2 + 2.0 * a2 * r * st2 / S);
  float alpha = inversesqrt(-gtt);
  float c = -gtp / (gtt * alpha);
  float invNorm = inversesqrt(max(gpp - gtp * gtp / gtt, 1e-30));

  /* Covariant momenta from the Carter-time state (dσ = dλ/Σ). */
  float pr = vr / S;                 /* dr/dλ  */
  float pth = -vu / (st * S);        /* dθ/dλ  */
  float pph = phiDot(r, ct) / S;     /* dφ/dλ  */

  /* Local (orthonormal) components: p·e_hat, divided by the local energy. */
  float eLoc = max(gE * alpha, 1e-12);
  float dr = pr * sqrt(S / D) / eLoc;
  float dth = pth * sqrt(S) / eLoc;
  float dph = (gE * gtp / gtt + gL * invNorm) / eLoc;

  return vec3(dr, dth, dph);
}

/* Local triad components -> a world direction with z along the spin axis. */
vec3 localToWorld(vec3 d, float ct, float phi) {
  float st = sqrt(max(1.0 - ct * ct, 0.0));
  float cp = cos(phi);
  float sp = sin(phi);
  vec3 er = vec3(st * cp, st * sp, ct);
  vec3 eth = vec3(ct * cp, ct * sp, -st);
  vec3 ephi = vec3(-sp, cp, 0.0);
  return normalize(d.x * er + d.y * eth + d.z * ephi);
}

/* ------------------------------------------------------------------ */
/* The tracer                                                          */
/* ------------------------------------------------------------------ */

vec3 traceRay(vec2 ndc) {
  float a = uSpin;
  float r = uRadius;
  float ct = cos(uTheta);
  float tanHalf = tan(uFov * 0.5);

  vec3 d = cameraDirection(ndc, tanHalf);

  float E, L, Q;
  conservedFromDirection(r, ct, d, E, L, Q);

  gE = E;
  gL = L;
  gQ = Q;
  gC = (L - a * E) * (L - a * E) + Q;
  gBetaF = 2.0 * a * a * E * E - 2.0 * a * E * L - gC;
  gE2 = dsMulFull(dsFromFloat(E), dsFromFloat(E));
  gBeta = dsFromFloat(gBetaF);
  gTwoC = dsFromFloat(2.0 * gC);
  gA2Q = dsFromFloat(a * a * Q);

  float u = ct;
  float phi = 0.0;
  float rHorizon = kHorizon();

  /*
   * The motion in Carter time: dr/dsigma = sR*sqrt(R(r)) and
   * du/dsigma = sU*sqrt(W(u)). The signs are flipped by hand at the
   * turning points, where the potential vanishes.
   */
  float sR = (d.x >= 0.0) ? 1.0 : -1.0;   /* +1: moving outwards */
  float sU = -(d.y >= 0.0 ? 1.0 : -1.0);  /* sign of du/dsigma   */

  float Rcur = radialPotential(r);
  float Wcur = polarPotential(u);

  float uPrev = u;
  float rPrev = r;
  float phiPrev = phi;
  bool captured = false;

  /*
   * The loop bound is a uniform, not a constant: a constant bound lets the
   * shader compiler try to unroll a thousand iterations of a body that
   * contains a bisection, and the resulting compile time on some drivers is
   * measured in minutes. GLSL ES 3.00 allows a dynamic bound.
   */
  for (int i = 0; i < uMaxSteps; i++) {
    /* h ≈ k/r keeps the relative radial step constant. */
    float h = clamp(uStepScale / max(r, 1.0), 2.0e-5, 0.25);

    /* --- radial: dr/dsigma = sR * sqrt(R(r)) --- */
    float vr = sR * sqrt(max(Rcur, 0.0));
    float rNext = r + vr * h;
    float Rnext = radialPotential(rNext);
    if (Rnext < 0.0) {
      /* The step overshot the radial turning point: bisect for the root. */
      float lo = min(r, rNext);
      float hi = max(r, rNext);
      for (int k = 0; k < 6; k++) {
        float mid = 0.5 * (lo + hi);
        if (radialPotential(mid) < 0.0) lo = mid; else hi = mid;
      }
      r = hi;              /* the allowed side of the root */
      sR = -sR;            /* and the ray turns around */
      /* Restart with the Taylor step, otherwise the ray would sit on the
       * root for ever: at the turning point sqrt(R) = 0 and the energy form
       * has no acceleration term to push the ray off it. */
      float acc = 0.5 * radialDerivative(r);
      r += sign(acc) * 0.5 * abs(acc) * h * h;
      Rcur = radialPotential(r);
    } else {
      r = rNext;
      Rcur = Rnext;
    }

    /* --- polar: du/dsigma = sU * sqrt(W(u)) --- */
    float vu = sU * sqrt(max(Wcur, 0.0));
    float uNext = u + vu * h;
    float Wnext = polarPotential(uNext);
    if (Wnext < 0.0) {
      float lo = min(u, uNext);
      float hi = max(u, uNext);
      for (int k = 0; k < 6; k++) {
        float mid = 0.5 * (lo + hi);
        if (polarPotential(mid) < 0.0) lo = mid; else hi = mid;
      }
      u = hi;
      sU = -sU;
      float acc = 0.5 * polarDerivative(u);
      u += sign(acc) * 0.5 * abs(acc) * h * h;
      Wcur = polarPotential(u);
    } else {
      u = uNext;
      Wcur = Wnext;
    }

    phi += phiDot(r, u) * h;

    /* Equatorial crossing? */
    if (uPrev != 0.0 && sign(uPrev) != sign(u)) {
      float f = uPrev / (uPrev - u);
      float rc = rPrev + f * (r - rPrev);
      float pc = phiPrev + f * (phi - phiPrev);
      if (rc >= uDiskInner && rc <= uDiskOuter) {
        /* The tracer walks the ray backwards, so the forward photon carries
         * the opposite angular momentum. */
        float g = diskRedshift(rc, a, E, -L);
        return diskEmission(rc, pc, g, a, uTime);
      }
    }

    uPrev = u;
    rPrev = r;
    phiPrev = phi;

    if (r <= rHorizon * (1.0 + 1e-7)) {
      captured = true;
      break;
    }
    if (r > uEscapeRadius && sR > 0.0) break;   /* escaped */
    if (abs(u) > 1.0 + 1e-6) break;              /* left the sphere */
  }

  if (captured) return vec3(0.0);                   /* the shadow */

  /*
   * The sky. The direction in which the ray leaves the potential well is
   * the direction of the star it came from: the ray was traced backwards
   * from the camera, so its far end *is* the source.
   */
  float vrEnd = sR * sqrt(max(radialPotential(r), 0.0));
  float vuEnd = sU * sqrt(max(polarPotential(u), 0.0));
  vec3 local = localDirection(r, u, vrEnd, vuEnd);
  vec3 sky = localToWorld(local, u, phi);
  return starfield(sky, uStarBrightness);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

void main() {
  int ss = clamp(uSupersample, 1, 2);
  float inv = 1.0 / float(ss);
  vec3 acc = vec3(0.0);

  for (int j = 0; j < 2; j++) {
    if (j >= ss) break;
    for (int i = 0; i < 2; i++) {
      if (i >= ss) break;
      vec2 jitter = (vec2(float(i), float(j)) + 0.5) * inv - 0.5;
      vec2 frag = gl_FragCoord.xy + jitter;
      vec2 ndc = (frag - 0.5 * uResolution) / uResolution.y;
      acc += traceRay(ndc);
    }
  }

  acc /= float(ss * ss);
  fragColor = vec4(acc, 1.0);
}
`,Ds=Rs+sr+Ps+Cs+As;function Os(n={}){const t=n.fov??.62,e=n.maxSteps??512,i=n.stepScale??.02,r=n.escapeRadius??400,s=n.starBrightness??1,o=n.diskScale??90,a=n.diskPeakTemperatureK??12e3,l=n.exposure??1;let u=null,c=null,f=null,d=null,p={radius:50,inclination:Math.PI/2-.085,spin:.999,time:0},m=!1;const h={scale:Ls(n.qualityScale??1,.25,1),averageFrameMs:16.7,lastAdjust:0},_=Ai(p.spin,a),g=()=>{if(!d||!c||!u)return;const v=d.getBoundingClientRect(),T=Math.min(window.devicePixelRatio||1,2),w=u.caps.maxTextureSize,E=Math.min(w,Math.max(1,Math.round(v.width*T*h.scale))),S=Math.min(w,Math.max(1,Math.round(v.height*T*h.scale)));(d.width!==E||d.height!==S)&&(d.width=E,d.height=S,c.resize(E,S))},y=(v,T)=>{if(h.averageFrameMs+=(v-h.averageFrameMs)*.05,T-h.lastAdjust<1200)return;const w=h.averageFrameMs;let E=h.scale;w>34&&h.scale>.25?E=Math.max(.25,h.scale-.15):w<19&&h.scale<1&&(E=Math.min(1,h.scale+.1)),E!==h.scale&&(h.scale=E,h.lastAdjust=T,g(),n.onQualityChange?.(E))},b=()=>{if(!c||!f||!u)return;const v=u.gl;v.bindFramebuffer(v.FRAMEBUFFER,c.scene.framebuffer),v.viewport(0,0,c.scene.width,c.scene.height),v.disable(v.BLEND),v.disable(v.DEPTH_TEST),v.useProgram(f.program),oe(v,f,{uResolution:[c.scene.width,c.scene.height],uTime:p.time,uSpin:p.spin,uRadius:p.radius,uTheta:p.inclination,uFov:t,uMaxSteps:e,uStepScale:i,uEscapeRadius:r,uStarBrightness:s,uSupersample:(h.scale>=.9,1),uDiskInner:_.innerRadius,uDiskOuter:_.outerRadius,uDiskPeakK:_.peakTemperatureK,uDiskScale:o}),v.bindVertexArray(Fs(u)),v.drawArrays(v.TRIANGLES,0,3),v.bindVertexArray(null)},x={async init(v){d=v,u=ms(v),f=ne(u.gl,Ds,"geodesic"),c=new Ms({gl:u.gl,caps:u.caps,width:1,height:1,exposure:l}),c.exposure=l,g(),x.setState(p),x.render(),n.onReady?.({caps:u.caps.summary})},setState(v){p=v,v.spin!==_.spin&&(_.spin=v.spin,_.innerRadius=Ai(v.spin,a).innerRadius)},render(v){if(m||!c||!u)return;const T=performance.now();g(),b(),c.present(),y(performance.now()-T,T)},getScreenCenter(){if(!d)return{x:0,y:0};const v=d.getBoundingClientRect();return{x:v.left+v.width/2,y:v.top+v.height/2}},dispose(){m=!0,f?.dispose(),f=null,c?.dispose(),c=null,u?.dispose(),u=null}};return x}let Ee=null;function Fs(n){Ee||(Ee=new WeakMap);const t=Ee.get(n.gl);if(t)return t;const e=n.gl.createVertexArray();if(!e)throw new Error("could not create a vertex array");return Ee.set(n.gl,e),e}function Ls(n,t,e){return n<t?t:n>e?e:n}function Ns(){const n=Math.PI/2-.085,t=Math.PI/2,e=Math.PI/2+.03;return[{at:0,radius:140,inclination:n},{at:.16,radius:62,inclination:n},{at:.38,radius:26,inclination:n-.01},{at:.6,radius:11,inclination:t-.012},{at:.8,radius:5.4,inclination:t+.004},{at:1,radius:3.2,inclination:e}]}function zs(n){const t=n<0?0:n>1?1:n;return t*t*(3-2*t)}function Is(n={}){const t=(n.beats??Ns()).slice().sort((i,r)=>i.at-r.at);return{sample:i=>{const r=i<0?0:i>1?1:i;let s=0;for(let f=0;f<t.length;f++)t[f].at<=r&&(s=f);const o=t[s],a=t[Math.min(s+1,t.length-1)],l=a.at-o.at,u=l>1e-9?zs((r-o.at)/l):0,c=Math.log(o.radius)+(Math.log(a.radius)-Math.log(o.radius))*u;return{radius:Math.exp(c),inclination:o.inclination+(a.inclination-o.inclination)*u}},beats:t}}var Li="1.3.27";function nr(n,t,e){return Math.max(n,Math.min(t,e))}function Us(n,t,e){return(1-e)*n+e*t}function Bs(n,t,e,i){return Us(n,t,1-Math.exp(-e*i))}function qs(n,t){return(n%t+t)%t}var Vs=class{isRunning=!1;value=0;from=0;to=0;currentTime=0;lerp;duration;easing;onUpdate;advance(n){if(!this.isRunning)return;let t=!1;if(this.duration&&this.easing){this.currentTime+=n;const e=nr(0,this.currentTime/this.duration,1);t=e>=1;const i=t?1:this.easing(e);this.value=this.from+(this.to-this.from)*i}else this.lerp?(this.value=Bs(this.value,this.to,this.lerp*60,n),Math.round(this.value)===Math.round(this.to)&&(this.value=this.to,t=!0)):(this.value=this.to,t=!0);t&&this.stop(),this.onUpdate?.(this.value,t)}stop(){this.isRunning=!1}fromTo(n,t,{lerp:e,duration:i,easing:r,onStart:s,onUpdate:o}){this.from=this.value=n,this.to=t,this.lerp=e,this.duration=i,this.easing=r,this.currentTime=0,this.isRunning=!0,s?.(),this.onUpdate=o}};function Ws(n,t){let e;return function(...i){clearTimeout(e),e=setTimeout(()=>{e=void 0,n.apply(this,i)},t)}}var Xs=class{width=0;height=0;scrollHeight=0;scrollWidth=0;debouncedResize;wrapperResizeObserver;contentResizeObserver;constructor(n,t,{autoResize:e=!0,debounce:i=250}={}){this.wrapper=n,this.content=t,e&&(this.debouncedResize=Ws(this.resize,i),this.wrapper instanceof Window?window.addEventListener("resize",this.debouncedResize):(this.wrapperResizeObserver=new ResizeObserver(this.debouncedResize),this.wrapperResizeObserver.observe(this.wrapper)),this.contentResizeObserver=new ResizeObserver(this.debouncedResize),this.contentResizeObserver.observe(this.content)),this.resize()}destroy(){this.wrapperResizeObserver?.disconnect(),this.contentResizeObserver?.disconnect(),this.wrapper===window&&this.debouncedResize&&window.removeEventListener("resize",this.debouncedResize)}resize=()=>{this.onWrapperResize(),this.onContentResize()};onWrapperResize=()=>{this.wrapper instanceof Window?(this.width=window.innerWidth,this.height=window.innerHeight):(this.width=this.wrapper.clientWidth,this.height=this.wrapper.clientHeight)};onContentResize=()=>{this.wrapper instanceof Window?(this.scrollHeight=this.content.scrollHeight,this.scrollWidth=this.content.scrollWidth):(this.scrollHeight=this.wrapper.scrollHeight,this.scrollWidth=this.wrapper.scrollWidth)};get limit(){return{x:this.scrollWidth-this.width,y:this.scrollHeight-this.height}}},or=class{events={};emit(n,...t){const e=this.events[n]||[];for(let i=0,r=e.length;i<r;i++)e[i]?.(...t)}on(n,t){return this.events[n]?this.events[n].push(t):this.events[n]=[t],()=>{this.events[n]=this.events[n]?.filter(e=>t!==e)}}off(n,t){this.events[n]=this.events[n]?.filter(e=>t!==e)}destroy(){this.events={}}};const Gs=100/6,xt={passive:!1};function Ni(n,t){return n===1?Gs:n===2?t:1}var Hs=class{touchStart={x:0,y:0};lastDelta={x:0,y:0};window={width:0,height:0};emitter=new or;constructor(n,t={wheelMultiplier:1,touchMultiplier:1}){this.element=n,this.options=t,window.addEventListener("resize",this.onWindowResize),this.onWindowResize(),this.element.addEventListener("wheel",this.onWheel,xt),this.element.addEventListener("touchstart",this.onTouchStart,xt),this.element.addEventListener("touchmove",this.onTouchMove,xt),this.element.addEventListener("touchend",this.onTouchEnd,xt)}on(n,t){return this.emitter.on(n,t)}destroy(){this.emitter.destroy(),window.removeEventListener("resize",this.onWindowResize),this.element.removeEventListener("wheel",this.onWheel,xt),this.element.removeEventListener("touchstart",this.onTouchStart,xt),this.element.removeEventListener("touchmove",this.onTouchMove,xt),this.element.removeEventListener("touchend",this.onTouchEnd,xt)}onTouchStart=n=>{const{clientX:t,clientY:e}=n.targetTouches?n.targetTouches[0]:n;this.touchStart.x=t,this.touchStart.y=e,this.lastDelta={x:0,y:0},this.emitter.emit("scroll",{deltaX:0,deltaY:0,event:n})};onTouchMove=n=>{const{clientX:t,clientY:e}=n.targetTouches?n.targetTouches[0]:n,i=-(t-this.touchStart.x)*this.options.touchMultiplier,r=-(e-this.touchStart.y)*this.options.touchMultiplier;this.touchStart.x=t,this.touchStart.y=e,this.lastDelta={x:i,y:r},this.emitter.emit("scroll",{deltaX:i,deltaY:r,event:n})};onTouchEnd=n=>{this.emitter.emit("scroll",{deltaX:this.lastDelta.x,deltaY:this.lastDelta.y,event:n})};onWheel=n=>{let{deltaX:t,deltaY:e,deltaMode:i}=n;const r=Ni(i,this.window.width),s=Ni(i,this.window.height);t*=r,e*=s,t*=this.options.wheelMultiplier,e*=this.options.wheelMultiplier,this.emitter.emit("scroll",{deltaX:t,deltaY:e,event:n})};onWindowResize=()=>{this.window={width:window.innerWidth,height:window.innerHeight}}};const zi=n=>Math.min(1,1.001-2**(-10*n));var Ys=class{_isScrolling=!1;_isStopped=!1;_isLocked=!1;_preventNextNativeScrollEvent=!1;_resetVelocityTimeout=null;_rafId=null;_isDraggingSelection=!1;reducedMotionMediaQuery=window.matchMedia("(prefers-reduced-motion: reduce)");isTouching;isIos;time=0;userData={};lastVelocity=0;velocity=0;direction=0;options;targetScroll;animatedScroll;animate=new Vs;emitter=new or;dimensions;virtualScroll;constructor({wrapper:n=window,content:t=document.documentElement,eventsTarget:e=n,smoothWheel:i=!0,syncTouch:r=!1,syncTouchLerp:s=.075,touchInertiaExponent:o=1.7,duration:a,easing:l,lerp:u=.1,infinite:c=!1,orientation:f="vertical",gestureOrientation:d=f==="horizontal"?"both":"vertical",touchMultiplier:p=1,wheelMultiplier:m=1,autoResize:h=!0,prevent:_,virtualScroll:g,overscroll:y=!0,autoRaf:b=!1,anchors:x=!1,autoToggle:v=!1,allowNestedScroll:T=!1,__experimental__naiveDimensions:w=!1,naiveDimensions:E=w,stopInertiaOnNavigate:S=!1,respectReducedMotion:k=!0}={}){window.lenisVersion=Li,window.lenis||(window.lenis={}),window.lenis.version=Li,f==="horizontal"&&(window.lenis.horizontal=!0),r===!0&&(window.lenis.touch=!0),this.isIos=/(iPad|iPhone|iPod)/g.test(navigator.userAgent),(!n||n===document.documentElement)&&(n=window),typeof a=="number"&&typeof l!="function"?l=zi:typeof l=="function"&&typeof a!="number"&&(a=1),this.options={wrapper:n,content:t,eventsTarget:e,smoothWheel:i,syncTouch:r,syncTouchLerp:s,touchInertiaExponent:o,duration:a,easing:l,lerp:u,infinite:c,gestureOrientation:d,orientation:f,touchMultiplier:p,wheelMultiplier:m,autoResize:h,prevent:_,virtualScroll:g,overscroll:y,autoRaf:b,anchors:x,autoToggle:v,allowNestedScroll:T,naiveDimensions:E,stopInertiaOnNavigate:S,respectReducedMotion:k},this.dimensions=new Xs(n,t,{autoResize:h}),this.updateClassName(),this.targetScroll=this.animatedScroll=this.actualScroll,this.options.wrapper.addEventListener("scroll",this.onNativeScroll),this.options.wrapper.addEventListener("scrollend",this.onScrollEnd,{capture:!0}),(this.options.anchors||this.options.stopInertiaOnNavigate)&&this.options.wrapper.addEventListener("click",this.onClick),this.options.wrapper.addEventListener("pointerdown",this.onPointerDown),this.virtualScroll=new Hs(e,{touchMultiplier:p,wheelMultiplier:m}),this.virtualScroll.on("scroll",this.onVirtualScroll),this.options.autoToggle&&(this.checkOverflow(),this.rootElement.addEventListener("transitionend",this.onTransitionEnd)),this.options.autoRaf&&(this._rafId=requestAnimationFrame(this.raf))}destroy(){this.emitter.destroy(),this._resetVelocityTimeout!==null&&(clearTimeout(this._resetVelocityTimeout),this._resetVelocityTimeout=null),this.options.wrapper.removeEventListener("scroll",this.onNativeScroll),this.options.wrapper.removeEventListener("scrollend",this.onScrollEnd,{capture:!0}),this.options.wrapper.removeEventListener("pointerdown",this.onPointerDown),(this.options.anchors||this.options.stopInertiaOnNavigate)&&this.options.wrapper.removeEventListener("click",this.onClick),this.virtualScroll.destroy(),this.dimensions.destroy(),this.cleanUpClassName(),this._rafId&&cancelAnimationFrame(this._rafId)}on(n,t){return this.emitter.on(n,t)}off(n,t){return this.emitter.off(n,t)}onScrollEnd=n=>{n instanceof CustomEvent||(this.isScrolling==="smooth"||this.isScrolling===!1)&&n.stopPropagation()};dispatchScrollendEvent=()=>{this.options.wrapper.dispatchEvent(new CustomEvent("scrollend",{bubbles:this.options.wrapper===window,detail:{lenisScrollEnd:!0}}))};get overflow(){const n=this.isHorizontal?"overflow-x":"overflow-y";return getComputedStyle(this.rootElement)[n]}checkOverflow(){["hidden","clip"].includes(this.overflow)?this.internalStop():this.internalStart()}onTransitionEnd=n=>{n.propertyName?.includes("overflow")&&n.target===this.rootElement&&this.checkOverflow()};setScroll(n){this.isHorizontal?this.options.wrapper.scrollTo({left:n,behavior:"instant"}):this.options.wrapper.scrollTo({top:n,behavior:"instant"})}onClick=n=>{const t=n.composedPath().filter(i=>i instanceof HTMLAnchorElement&&i.href).map(i=>new URL(i.href)),e=new URL(window.location.href);if(this.options.anchors){const i=t.find(r=>e.host===r.host&&e.pathname===r.pathname&&r.hash);if(i){const r=typeof this.options.anchors=="object"&&this.options.anchors?this.options.anchors:void 0,s=decodeURIComponent(i.hash);this.scrollTo(s,r);return}}if(this.options.stopInertiaOnNavigate&&t.some(i=>e.host===i.host&&e.pathname!==i.pathname)){this.reset();return}};onPointerDown=n=>{n.button===1&&this.reset()};isTouchOnSelectionHandle(n){const t=window.getSelection();if(!t||t.isCollapsed||t.rangeCount===0)return!1;const e=n.targetTouches[0]??n.changedTouches[0];if(!e)return!1;const i=t.getRangeAt(0).getClientRects();if(i.length===0)return!1;const r=i[0],s=i[i.length-1],o=40,a=Math.hypot(e.clientX-r.left,e.clientY-r.top)<=o,l=Math.hypot(e.clientX-s.right,e.clientY-s.bottom)<=o;return a||l}onVirtualScroll=n=>{if(typeof this.options.virtualScroll=="function"&&this.options.virtualScroll(n)===!1)return;const{deltaX:t,deltaY:e,event:i}=n;if(this.emitter.emit("virtual-scroll",{deltaX:t,deltaY:e,event:i}),i.ctrlKey||i.lenisStopPropagation)return;const r=i.type.includes("touch"),s=i.type.includes("wheel");if(r&&this.isIos&&(i.type==="touchstart"&&(this._isDraggingSelection=this.isTouchOnSelectionHandle(i)),this._isDraggingSelection)){i.type==="touchend"&&(this._isDraggingSelection=!1);return}this.isTouching=i.type==="touchstart"||i.type==="touchmove";const o=t===0&&e===0;if(this.options.syncTouch&&r&&i.type==="touchstart"&&o&&!this.isStopped&&!this.isLocked){this.reset();return}const a=this.options.gestureOrientation==="vertical"&&e===0||this.options.gestureOrientation==="horizontal"&&t===0;if(o||a)return;let l=i.composedPath();l=l.slice(0,l.indexOf(this.rootElement));const u=this.options.prevent,c=Math.abs(t)>=Math.abs(e)?"horizontal":"vertical";if(l.find(m=>m instanceof HTMLElement&&(typeof u=="function"&&u?.(m)||m.hasAttribute?.("data-lenis-prevent")||c==="vertical"&&m.hasAttribute?.("data-lenis-prevent-vertical")||c==="horizontal"&&m.hasAttribute?.("data-lenis-prevent-horizontal")||r&&m.hasAttribute?.("data-lenis-prevent-touch")||s&&m.hasAttribute?.("data-lenis-prevent-wheel")||this.options.allowNestedScroll&&this.hasNestedScroll(m,{deltaX:t,deltaY:e}))))return;if(this.isStopped||this.isLocked){i.cancelable&&i.preventDefault();return}if(!(this.options.syncTouch&&r||this.options.smoothWheel&&s)){this.isScrolling="native",this.animate.stop(),i.lenisStopPropagation=!0;return}let f=e;this.options.gestureOrientation==="both"?f=Math.abs(e)>Math.abs(t)?e:t:this.options.gestureOrientation==="horizontal"&&(f=t),(!this.options.overscroll||this.options.infinite||this.options.wrapper!==window&&this.limit>0&&(this.animatedScroll>0&&this.animatedScroll<this.limit||this.animatedScroll===0&&e>0||this.animatedScroll===this.limit&&e<0))&&(i.lenisStopPropagation=!0),i.cancelable&&i.preventDefault();const d=r&&this.options.syncTouch,p=r&&i.type==="touchend";p&&(f=Math.sign(f)*Math.abs(this.velocity)**this.options.touchInertiaExponent),this.scrollTo(this.targetScroll+f,{programmatic:!1,...d?{lerp:p?this.options.syncTouchLerp:1}:{lerp:this.options.lerp,duration:this.options.duration,easing:this.options.easing}})};resize(){this.dimensions.resize(),this.animatedScroll=this.targetScroll=this.actualScroll,this.emit()}emit(){this.emitter.emit("scroll",this)}onNativeScroll=()=>{if(this._resetVelocityTimeout!==null&&(clearTimeout(this._resetVelocityTimeout),this._resetVelocityTimeout=null),this._preventNextNativeScrollEvent){this._preventNextNativeScrollEvent=!1;return}if(this.isScrolling===!1||this.isScrolling==="native"){const n=this.animatedScroll;this.animatedScroll=this.targetScroll=this.actualScroll,this.lastVelocity=this.velocity,this.velocity=this.animatedScroll-n,this.direction=Math.sign(this.animatedScroll-n),this.isStopped||(this.isScrolling="native"),this.emit(),this.velocity!==0&&(this._resetVelocityTimeout=setTimeout(()=>{this.lastVelocity=this.velocity,this.velocity=0,this.isScrolling=!1,this.emit()},400))}};reset(){this.isLocked=!1,this.isScrolling=!1,this.animatedScroll=this.targetScroll=this.actualScroll,this.lastVelocity=this.velocity=0,this.animate.stop()}start(){if(this.isStopped){if(this.options.autoToggle){this.rootElement.style.removeProperty("overflow");return}this.internalStart()}}internalStart(){this.isStopped&&(this.reset(),this.isStopped=!1,this.emit())}stop(){if(!this.isStopped){if(this.options.autoToggle){this.rootElement.style.setProperty("overflow","clip");return}this.internalStop()}}internalStop(){this.isStopped||(this.reset(),this.isStopped=!0,this.emit())}raf=n=>{const t=n-(this.time||n);this.time=n,this.animate.advance(t*.001),this.options.autoRaf&&(this._rafId=requestAnimationFrame(this.raf))};scrollTo(n,{offset:t=0,immediate:e=!1,lock:i=!1,programmatic:r=!0,lerp:s=r?this.options.lerp:void 0,duration:o=r?this.options.duration:void 0,easing:a=r?this.options.easing:void 0,onStart:l,onComplete:u,force:c=!1,userData:f}={}){if(this.prefersReducedMotion&&(r?e=!0:(s=1,o=void 0,a=void 0)),(this.isStopped||this.isLocked)&&!c)return;let d=n,p=t;if(typeof d=="string"&&["top","left","start","#"].includes(d))d=0;else if(typeof d=="string"&&["bottom","right","end"].includes(d))d=this.limit;else{let m=null;if(typeof d=="string"?(m=d.startsWith("#")?document.getElementById(d.slice(1)):document.querySelector(d),m||(d==="#top"?d=0:console.warn("Lenis: Target not found",d))):d instanceof Element&&(m=d),m){if(this.options.wrapper!==window){const x=this.rootElement.getBoundingClientRect();p-=this.isHorizontal?x.left:x.top}const h=m.getBoundingClientRect(),_=getComputedStyle(m),g=this.isHorizontal?Number.parseFloat(_.scrollMarginLeft):Number.parseFloat(_.scrollMarginTop),y=getComputedStyle(this.rootElement),b=this.isHorizontal?Number.parseFloat(y.scrollPaddingLeft):Number.parseFloat(y.scrollPaddingTop);d=(this.isHorizontal?h.left:h.top)+this.animatedScroll-(Number.isNaN(g)?0:g)-(Number.isNaN(b)?0:b)}}if(typeof d=="number"){if(d+=p,this.options.infinite){if(r){this.targetScroll=this.animatedScroll=this.scroll;const m=d-this.animatedScroll;m>this.limit/2?d-=this.limit:m<-this.limit/2&&(d+=this.limit)}}else d=nr(0,d,this.limit);if(d===this.targetScroll){l?.(this),u?.(this);return}if(this.userData=f??{},e){this.animatedScroll=this.targetScroll=d,this.setScroll(this.scroll),this.reset(),this.preventNextNativeScrollEvent(),this.emit(),u?.(this),this.userData={},requestAnimationFrame(()=>{this.dispatchScrollendEvent()});return}r||(this.targetScroll=d),typeof o=="number"&&typeof a!="function"?a=zi:typeof a=="function"&&typeof o!="number"&&(o=1),this.animate.fromTo(this.animatedScroll,d,{duration:o,easing:a,lerp:s,onStart:()=>{i&&(this.isLocked=!0),this.isScrolling="smooth",l?.(this)},onUpdate:(m,h)=>{this.isScrolling="smooth",this.lastVelocity=this.velocity,this.velocity=m-this.animatedScroll,this.direction=Math.sign(this.velocity),this.animatedScroll=m,this.setScroll(this.scroll),r&&(this.targetScroll=m),h||this.emit(),h&&(this.reset(),this.emit(),u?.(this),this.userData={},requestAnimationFrame(()=>{this.dispatchScrollendEvent()}),this.preventNextNativeScrollEvent())}})}}preventNextNativeScrollEvent(){this._preventNextNativeScrollEvent=!0,requestAnimationFrame(()=>{this._preventNextNativeScrollEvent=!1})}hasNestedScroll(n,{deltaX:t,deltaY:e}){const i=Date.now();n._lenis||(n._lenis={});const r=n._lenis;let s,o,a,l,u,c,f,d,p,m;if(i-(r.time??0)>2e3){r.time=Date.now();const T=window.getComputedStyle(n);if(r.computedStyle=T,s=["auto","overlay","scroll"].includes(T.overflowX),o=["auto","overlay","scroll"].includes(T.overflowY),u=["auto"].includes(T.overscrollBehaviorX),c=["auto"].includes(T.overscrollBehaviorY),r.hasOverflowX=s,r.hasOverflowY=o,!(s||o))return!1;f=n.scrollWidth,d=n.scrollHeight,p=n.clientWidth,m=n.clientHeight,a=f>p,l=d>m,r.isScrollableX=a,r.isScrollableY=l,r.scrollWidth=f,r.scrollHeight=d,r.clientWidth=p,r.clientHeight=m,r.hasOverscrollBehaviorX=u,r.hasOverscrollBehaviorY=c}else a=r.isScrollableX,l=r.isScrollableY,s=r.hasOverflowX,o=r.hasOverflowY,f=r.scrollWidth,d=r.scrollHeight,p=r.clientWidth,m=r.clientHeight,u=r.hasOverscrollBehaviorX,c=r.hasOverscrollBehaviorY;if(!(s&&a||o&&l))return!1;const h=Math.abs(t)>=Math.abs(e)?"horizontal":"vertical";let _,g,y,b,x,v;if(h==="horizontal")_=Math.round(n.scrollLeft),g=f-p,y=t,b=s,x=a,v=u;else if(h==="vertical")_=Math.round(n.scrollTop),g=d-m,y=e,b=o,x=l,v=c;else return!1;return!v&&(_>=g||_<=0)?!0:(y>0?_<g:_>0)&&b&&x}get rootElement(){return this.options.wrapper===window?document.documentElement:this.options.wrapper}get limit(){return this.options.naiveDimensions?this.isHorizontal?this.rootElement.scrollWidth-this.rootElement.clientWidth:this.rootElement.scrollHeight-this.rootElement.clientHeight:this.dimensions.limit[this.isHorizontal?"x":"y"]}get isHorizontal(){return this.options.orientation==="horizontal"}get actualScroll(){const n=this.options.wrapper;return this.isHorizontal?n.scrollX??n.scrollLeft:n.scrollY??n.scrollTop}get scroll(){return this.options.infinite?qs(this.animatedScroll,this.limit):this.animatedScroll}get progress(){return this.limit===0?1:this.scroll/this.limit}get isScrolling(){return this._isScrolling}set isScrolling(n){this._isScrolling!==n&&(this._isScrolling=n,this.updateClassName())}get isStopped(){return this._isStopped}set isStopped(n){this._isStopped!==n&&(this._isStopped=n,this.updateClassName())}get isLocked(){return this._isLocked}set isLocked(n){this._isLocked!==n&&(this._isLocked=n,this.updateClassName())}get isSmooth(){return this.isScrolling==="smooth"}get prefersReducedMotion(){return this.options.respectReducedMotion&&this.reducedMotionMediaQuery.matches}get className(){let n="lenis";return this.options.autoToggle&&(n+=" lenis-autoToggle"),this.isStopped&&(n+=" lenis-stopped"),this.isLocked&&(n+=" lenis-locked"),this.isScrolling&&(n+=" lenis-scrolling"),this.isScrolling==="smooth"&&(n+=" lenis-smooth"),n}updateClassName(){this.cleanUpClassName(),this.className.split(" ").forEach(n=>{this.rootElement.classList.add(n)})}cleanUpClassName(){for(const n of Array.from(this.rootElement.classList))(n==="lenis"||n.startsWith("lenis-"))&&this.rootElement.classList.remove(n)}};function $s(n={}){const t=n.instant??!1,e=new Ys({duration:n.duration??1.1,easing:n.easing??(r=>Math.min(1,1.001-Math.pow(2,-10*r))),smoothWheel:!t,syncTouch:!1,touchMultiplier:1.4,wheelMultiplier:1,autoRaf:!1});let i=0;return e.on("scroll",r=>{i=r.progress,n.onProgress?.(i)}),{lenis:e,progress:()=>i,scrollTo(r,s={}){e.scrollTo(Math.max(0,Math.min(1,r)),{immediate:s.instant??t,duration:t?0:void 0})},destroy(){e.destroy()}}}function gt(n){if(n===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return n}function ar(n,t){n.prototype=Object.create(t.prototype),n.prototype.constructor=n,n.__proto__=t}/*!
 * GSAP 3.15.1
 * https://gsap.com
 *
 * @license Copyright 2008-2026, GreenSock. All rights reserved.
 * Subject to the terms at https://gsap.com/standard-license
 * @author: Jack Doyle, jack@greensock.com
*/var nt={autoSleep:120,force3D:"auto",nullTargetWarn:1,units:{lineHeight:""}},de={duration:.5,overwrite:!1,delay:0},hi,H,D,ct=1e8,R=1/ct,Ze=Math.PI*2,Ks=Ze/4,Qs=0,lr=Math.sqrt,js=Math.cos,Zs=Math.sin,G=function(t){return typeof t=="string"},U=function(t){return typeof t=="function"},yt=function(t){return typeof t=="number"},fi=function(t){return typeof t>"u"},mt=function(t){return typeof t=="object"},Q=function(t){return t!==!1},di=function(){return typeof window<"u"},ke=function(t){return U(t)||G(t)},ur=typeof ArrayBuffer=="function"&&ArrayBuffer.isView||function(){},$=Array.isArray,Js=/random\([^)]+\)/g,tn=/,\s*/g,Ii=/(?:-?\.?\d|\.)+/gi,cr=/[-+=.]*\d+[.e\-+]*\d*[e\-+]*\d*/g,Xt=/[-+=.]*\d+[.e-]*\d*[a-z%]*/g,Ve=/[-+=.]*\d+\.?\d*(?:e-|e\+)?\d*/gi,hr=/[+-]=-?[.\d]+/,en=/[^,'"\[\]\s]+/gi,rn=/^[+\-=e\s\d]*\d+[.\d]*([a-z]*|%)\s*$/i,L,ft,Je,pi,ot={},Ce={},fr,dr=function(t){return(Ce=Qt(t,ot))&&tt},mi=function(t,e){return console.warn("Invalid property",t,"set to",e,"Missing plugin? gsap.registerPlugin()")},pe=function(t,e){return!e&&console.warn(t)},pr=function(t,e){return t&&(ot[t]=e)&&Ce&&(Ce[t]=e)||ot},me=function(){return 0},sn={suppressEvents:!0,isStart:!0,kill:!1},Me={suppressEvents:!0,kill:!1},nn={suppressEvents:!0},_i={},Et=[],ti={},mr,et={},We={},Ui=30,Re=[],gi="",vi=function(t){var e=t[0],i,r;if(mt(e)||U(e)||(t=[t]),!(i=(e._gsap||{}).harness)){for(r=Re.length;r--&&!Re[r].targetTest(e););i=Re[r]}for(r=t.length;r--;)t[r]&&(t[r]._gsap||(t[r]._gsap=new zr(t[r],i)))||t.splice(r,1);return t},zt=function(t){return t._gsap||vi(ht(t))[0]._gsap},_r=function(t,e,i){return(i=t[e])&&U(i)?t[e]():fi(i)&&t.getAttribute&&t.getAttribute(e)||i},j=function(t,e){return(t=t.split(",")).forEach(e)||t},q=function(t){return Math.round(t*1e5)/1e5||0},F=function(t){return Math.round(t*1e7)/1e7||0},Ht=function(t,e){var i=e.charAt(0),r=parseFloat(e.substr(2));return t=parseFloat(t),i==="+"?t+r:i==="-"?t-r:i==="*"?t*r:t/r},on=function(t,e){for(var i=e.length,r=0;t.indexOf(e[r])<0&&++r<i;);return r<i},Ae=function(){var t=Et.length,e=Et.slice(0),i,r;for(ti={},Et.length=0,i=0;i<t;i++)r=e[i],r&&r._lazy&&(r.render(r._lazy[0],r._lazy[1],!0)._lazy=0)},yi=function(t){return!!(t._initted||t._startAt||t.add)},gr=function(t,e,i,r){Et.length&&!H&&Ae(),t.render(e,i,!!(H&&e<0&&yi(t))),Et.length&&!H&&Ae()},vr=function(t){var e=parseFloat(t);return(e||e===0)&&(t+"").match(en).length<2?e:G(t)?t.trim():t},yr=function(t){return t},at=function(t,e){for(var i in e)i in t||(t[i]=e[i]);return t},an=function(t){return function(e,i){for(var r in i)r in e||r==="duration"&&t||r==="ease"||(e[r]=i[r])}},Qt=function(t,e){for(var i in e)t[i]=e[i];return t},Bi=function n(t,e){for(var i in e)i!=="__proto__"&&i!=="constructor"&&i!=="prototype"&&(t[i]=mt(e[i])?n(t[i]||(t[i]={}),e[i]):e[i]);return t},De=function(t,e){var i={},r;for(r in t)r in e||(i[r]=t[r]);return i},ue=function(t){var e=t.parent||L,i=t.keyframes?an($(t.keyframes)):at;if(Q(t.inherit))for(;e;)i(t,e.vars.defaults),e=e.parent||e._dp;return t},ln=function(t,e){for(var i=t.length,r=i===e.length;r&&i--&&t[i]===e[i];);return i<0},br=function(t,e,i,r,s){var o=t[r],a;if(s)for(a=e[s];o&&o[s]>a;)o=o._prev;return o?(e._next=o._next,o._next=e):(e._next=t[i],t[i]=e),e._next?e._next._prev=e:t[r]=e,e._prev=o,e.parent=e._dp=t,e},Ue=function(t,e,i,r){i===void 0&&(i="_first"),r===void 0&&(r="_last");var s=e._prev,o=e._next;s?s._next=o:t[i]===e&&(t[i]=o),o?o._prev=s:t[r]===e&&(t[r]=s),e._next=e._prev=e.parent=null},Mt=function(t,e){t.parent&&(!e||t.parent.autoRemoveChildren)&&t.parent.remove&&t.parent.remove(t),t._act=0},It=function(t,e){if(t&&(!e||e._end>t._dur||e._start<0))for(var i=t;i;)i._dirty=1,i=i.parent;return t},un=function(t){for(var e=t.parent;e&&e.parent;)e._dirty=1,e.totalDuration(),e=e.parent;return t},ei=function(t,e,i,r){return t._startAt&&(H?t._startAt.revert(Me):t.vars.immediateRender&&!t.vars.autoRevert||t._startAt.render(e,!0,r))},cn=function n(t){return!t||t._ts&&n(t.parent)},qi=function(t){return t._repeat?jt(t._tTime,t=t.duration()+t._rDelay)*t:0},jt=function(t,e){var i=Math.floor(t=F(t/e));return t&&i===t?i-1:i},Oe=function(t,e){return(t-e._start)*e._ts+(e._ts>=0?0:e._dirty?e.totalDuration():e._tDur)},Be=function(t){return t._end=F(t._start+(t._tDur/Math.abs(t._ts||t._rts||R)||0))},qe=function(t,e){var i=t._dp;return i&&i.smoothChildTiming&&t._ts&&(t._start=F(i._time-(t._ts>0?e/t._ts:((t._dirty?t.totalDuration():t._tDur)-e)/-t._ts)),Be(t),i._dirty||It(i,t)),t},xr=function(t,e){var i;if((e._time||!e._dur&&e._initted||e._start<t._time&&(e._dur||!e.add))&&(i=Oe(t.rawTime(),e),(!e._dur||we(0,e.totalDuration(),i)-e._tTime>R)&&e.render(i,!0)),It(t,e)._dp&&t._initted&&t._time>=t._dur&&t._ts){if(t._dur<t.duration())for(i=t;i._dp;)i.rawTime()>=0&&i.totalTime(i._tTime),i=i._dp;t._zTime=-R}},dt=function(t,e,i,r){return e.parent&&Mt(e),e._start=F((yt(i)?i:!i&&Fe(e)&&(!t._last||t._last._start>=t._time)?t._last?t._last._start:t._time:i||t!==L?ut(t,i,e):t._time)+e._delay),e._end=F(e._start+(e.totalDuration()/Math.abs(e.timeScale())||0)),br(t,e,"_first","_last",t._sort?"_start":0),Fe(e)||(t._recent=e),r||xr(t,e),t._ts<0&&qe(t,t._tTime),t},wr=function(t,e){return(ot.ScrollTrigger||mi("scrollTrigger",e))&&ot.ScrollTrigger.create(e,t)},Sr=function(t,e,i,r,s){if(xi(t,e,s),!t._initted)return 1;if(!i&&t._pt&&!H&&(t._dur&&t.vars.lazy!==!1||!t._dur&&t.vars.lazy)&&mr!==it.frame)return Et.push(t),t._lazy=[s,r],1},hn=function n(t){var e=t.parent;return e&&e._ts&&e._initted&&!e._lock&&(e.rawTime()<0||n(e))},Fe=function(t){var e=t.data;return e==="isFromStart"||e==="isStart"},fn=function(t,e,i,r){var s=t.ratio,o=e<0||!e&&(!t._start&&hn(t)&&!(!t._initted&&Fe(t))||(t._ts<0||t._dp._ts<0)&&!Fe(t))?0:1,a=t._rDelay,l=0,u,c,f;if(a&&t._repeat&&(l=we(0,t._tDur,e),c=jt(l,a),t._yoyo&&c&1&&(o=1-o),c!==jt(t._tTime,a)&&(s=1-o,t.vars.repeatRefresh&&t._initted&&t.invalidate())),o!==s||H||r||t._zTime===R||!e&&t._zTime){if(!t._initted&&Sr(t,e,r,i,l))return;for(f=t._zTime,t._zTime=e||(i?R:0),i||(i=e&&!f),t.ratio=o,t._from&&(o=1-o),t._time=0,t._tTime=l,u=t._pt;u;)u.r(o,u.d),u=u._next;e<0&&ei(t,e,i,!0),t._onUpdate&&!i&&rt(t,"onUpdate"),l&&t._repeat&&!i&&t.parent&&rt(t,"onRepeat"),(e>=t._tDur||e<0)&&t.ratio===o&&(o&&Mt(t,1),!i&&!H&&(rt(t,o?"onComplete":"onReverseComplete",!0),t._prom&&t._prom()))}else t._zTime||(t._zTime=e)},dn=function(t,e,i){var r;if(i>e)for(r=t._first;r&&r._start<=i;){if(r.data==="isPause"&&r._start>e)return r;r=r._next}else for(r=t._last;r&&r._start>=i;){if(r.data==="isPause"&&r._start<e)return r;r=r._prev}},Zt=function(t,e,i,r){var s=t._repeat,o=F(e)||0,a=t._tTime/t._tDur;return a&&!r&&(t._time*=o/t._dur),t._dur=o,t._tDur=s?s<0?1e10:F(o*(s+1)+t._rDelay*s):o,a>0&&!r&&qe(t,t._tTime=t._tDur*a),t.parent&&Be(t),i||It(t.parent,t),t},Vi=function(t){return t instanceof K?It(t):Zt(t,t._dur)},pn={_start:0,endTime:me,totalDuration:me},ut=function n(t,e,i){var r=t.labels,s=t._recent||pn,o=t.duration()>=ct?s.endTime(!1):t._dur,a,l,u;return G(e)&&(isNaN(e)||e in r)?(l=e.charAt(0),u=e.substr(-1)==="%",a=e.indexOf("="),l==="<"||l===">"?(a>=0&&(e=e.replace(/=/,"")),(l==="<"?s._start:s.endTime(s._repeat>=0))+(parseFloat(e.substr(1))||0)*(u?(a<0?s:i).totalDuration()/100:1)):a<0?(e in r||(r[e]=o),r[e]):(l=parseFloat(e.charAt(a-1)+e.substr(a+1)),u&&i&&(l=l/100*($(i)?i[0]:i).totalDuration()),a>1?n(t,e.substr(0,a-1),i)+l:o+l)):e==null?o:+e},ce=function(t,e,i){var r=yt(e[1]),s=(r?2:1)+(t<2?0:1),o=e[s],a,l;if(r&&(o.duration=e[1]),o.parent=i,t){for(a=o,l=i;l&&!("immediateRender"in a);)a=l.vars.defaults||{},l=Q(l.vars.inherit)&&l.parent;o.immediateRender=Q(a.immediateRender),t<2?o.runBackwards=1:o.startAt=e[s-1]}return new V(e[0],o,e[s+1])},Ct=function(t,e){return t||t===0?e(t):e},we=function(t,e,i){return i<t?t:i>e?e:i},Y=function(t,e){return!G(t)||!(e=rn.exec(t))?"":e[1]},mn=function(t,e,i){return Ct(i,function(r){return we(t,e,r)})},ii=[].slice,Tr=function(t,e){return t&&mt(t)&&"length"in t&&(!e&&!t.length||t.length-1 in t&&mt(t[0]))&&!t.nodeType&&t!==ft},_n=function(t,e,i){return i===void 0&&(i=[]),t.forEach(function(r){var s;return G(r)&&!e||Tr(r,1)?(s=i).push.apply(s,ht(r)):i.push(r)})||i},ht=function(t,e,i){return D&&!e&&D.selector?D.selector(t):G(t)&&!i&&(Je||!Jt())?ii.call((e||pi).querySelectorAll(t),0):$(t)?_n(t,i):Tr(t)?ii.call(t,0):t?[t]:[]},ri=function(t){return t=ht(t)[0]||pe("Invalid scope")||{},function(e){var i=t.current||t.nativeElement||t;return ht(e,i.querySelectorAll?i:i===t?pe("Invalid scope")||pi.createElement("div"):t)}},Er=function(t){return t.sort(function(){return .5-Math.random()})},kr=function(t){if(U(t))return t;var e=mt(t)?t:{each:t},i=Ut(e.ease),r=e.from||0,s=parseFloat(e.base)||0,o={},a=r>0&&r<1,l=isNaN(r)||a,u=e.axis,c=r,f=r;return G(r)?c=f={center:.5,edges:.5,end:1}[r]||0:!a&&l&&(c=r[0],f=r[1]),function(d,p,m){var h=(m||e).length,_=o[h],g,y,b,x,v,T,w,E,S;if(!_){if(S=e.grid==="auto"?0:(e.grid||[1,ct])[1],!S){for(w=-ct;w<(w=m[S++].getBoundingClientRect().left)&&S<h;);S<h&&S--}for(_=o[h]=[],g=l?Math.min(S,h)*c-.5:r%S,y=S===ct?0:l?h*f/S-.5:r/S|0,w=0,E=ct,T=0;T<h;T++)b=T%S-g,x=y-(T/S|0),_[T]=v=u?Math.abs(u==="y"?x:b):lr(b*b+x*x),v>w&&(w=v),v<E&&(E=v);r==="random"&&Er(_),_.max=w-E,_.min=E,_.v=h=(parseFloat(e.amount)||parseFloat(e.each)*(S>h?h-1:u?u==="y"?h/S:S:Math.max(S,h/S))||0)*(r==="edges"?-1:1),_.b=h<0?s-h:s,_.u=Y(e.amount||e.each)||0,i=i&&h<0?Pn(i):i}return h=(_[d]-_.min)/_.max||0,F(_.b+(i?i(h):h)*_.v)+_.u}},si=function(t){var e=Math.pow(10,((t+"").split(".")[1]||"").length);return function(i){var r=F(Math.round(parseFloat(i)/t)*t*e);return(r-r%1)/e+(yt(i)?0:Y(i))}},Mr=function(t,e){var i=$(t),r,s;return!i&&mt(t)&&(r=i=t.radius||ct,t.values?(t=ht(t.values),(s=!yt(t[0]))&&(r*=r)):t=si(t.increment)),Ct(e,i?U(t)?function(o){return s=t(o),Math.abs(s-o)<=r?s:o}:function(o){for(var a=parseFloat(s?o.x:o),l=parseFloat(s?o.y:0),u=ct,c=0,f=t.length,d,p;f--;)s?(d=t[f].x-a,p=t[f].y-l,d=d*d+p*p):d=Math.abs(t[f]-a),d<u&&(u=d,c=f);return c=!r||u<=r?t[c]:o,s||c===o||yt(o)?c:c+Y(o)}:si(t))},Rr=function(t,e,i,r){return Ct($(t)?!e:i===!0?!!(i=0):!r,function(){return $(t)?t[~~(Math.random()*t.length)]:(i=i||1e-5)&&(r=i<1?Math.pow(10,(i+"").length-2):1)&&Math.floor(Math.round((t-i/2+Math.random()*(e-t+i*.99))/i)*i*r)/r})},gn=function(){for(var t=arguments.length,e=new Array(t),i=0;i<t;i++)e[i]=arguments[i];return function(r){return e.reduce(function(s,o){return o(s)},r)}},vn=function(t,e){return function(i){return t(parseFloat(i))+(e||Y(i))}},yn=function(t,e,i){return Cr(t,e,0,1,i)},Pr=function(t,e,i){return Ct(i,function(r){return t[~~e(r)]})},bn=function n(t,e,i){var r=e-t;return $(t)?Pr(t,n(0,t.length),e):Ct(i,function(s){return(r+(s-t)%r)%r+t})},xn=function n(t,e,i){var r=e-t,s=r*2;return $(t)?Pr(t,n(0,t.length-1),e):Ct(i,function(o){return o=(s+(o-t)%s)%s||0,t+(o>r?s-o:o)})},_e=function(t){return t.replace(Js,function(e){var i=e.indexOf("[")+1,r=e.substring(i||7,i?e.indexOf("]"):e.length-1).split(tn);return Rr(i?r:+r[0],i?0:+r[1],+r[2]||1e-5)})},Cr=function(t,e,i,r,s){var o=e-t,a=r-i;return Ct(s,function(l){return i+((l-t)/o*a||0)})},wn=function n(t,e,i,r){var s=isNaN(t+e)?0:function(p){return(1-p)*t+p*e};if(!s){var o=G(t),a={},l,u,c,f,d;if(i===!0&&(r=1)&&(i=null),o)t={p:t},e={p:e};else if($(t)&&!$(e)){for(c=[],f=t.length,d=f-2,u=1;u<f;u++)c.push(n(t[u-1],t[u]));f--,s=function(m){m*=f;var h=Math.min(d,~~m);return c[h](m-h)},i=e}else r||(t=Qt($(t)?[]:{},t));if(!c){for(l in e)bi.call(a,t,l,"get",e[l]);s=function(m){return Ti(m,a)||(o?t.p:t)}}}return Ct(i,s)},Wi=function(t,e,i){var r=t.labels,s=ct,o,a,l;for(o in r)a=r[o]-e,a<0==!!i&&a&&s>(a=Math.abs(a))&&(l=o,s=a);return l},rt=function(t,e,i){var r=t.vars,s=r[e],o=D,a=t._ctx,l,u,c;if(s)return l=r[e+"Params"],u=r.callbackScope||t,i&&Et.length&&Ae(),a&&(D=a),c=l?s.apply(u,l):s.call(u),D=o,c},ae=function(t){return Mt(t),t.scrollTrigger&&t.scrollTrigger.kill(!!H),t.progress()<1&&rt(t,"onInterrupt"),t},Gt,Ar=[],Dr=function(t){if(t)if(t=!t.name&&t.default||t,di()||t.headless){var e=t.name,i=U(t),r=e&&!i&&t.init?function(){this._props=[]}:t,s={init:me,render:Ti,add:bi,kill:Un,modifier:In,rawVars:0},o={targetTest:0,get:0,getSetter:Si,aliases:{},register:0};if(Jt(),t!==r){if(et[e])return;at(r,at(De(t,s),o)),Qt(r.prototype,Qt(s,De(t,o))),et[r.prop=e]=r,t.targetTest&&(Re.push(r),_i[e]=1),e=(e==="css"?"CSS":e.charAt(0).toUpperCase()+e.substr(1))+"Plugin"}pr(e,r),t.register&&t.register(tt,r,Z)}else Ar.push(t)},P=255,le={aqua:[0,P,P],lime:[0,P,0],silver:[192,192,192],black:[0,0,0],maroon:[128,0,0],teal:[0,128,128],blue:[0,0,P],navy:[0,0,128],white:[P,P,P],olive:[128,128,0],yellow:[P,P,0],orange:[P,165,0],gray:[128,128,128],purple:[128,0,128],green:[0,128,0],red:[P,0,0],pink:[P,192,203],cyan:[0,P,P],transparent:[P,P,P,0]},Xe=function(t,e,i){return t+=t<0?1:t>1?-1:0,(t*6<1?e+(i-e)*t*6:t<.5?i:t*3<2?e+(i-e)*(2/3-t)*6:e)*P+.5|0},Or=function(t,e,i){var r=t?yt(t)?[t>>16,t>>8&P,t&P]:0:le.black,s,o,a,l,u,c,f,d,p,m;if(!r){if(t.substr(-1)===","&&(t=t.substr(0,t.length-1)),le[t])r=le[t];else if(t.charAt(0)==="#"){if(t.length<6&&(s=t.charAt(1),o=t.charAt(2),a=t.charAt(3),t="#"+s+s+o+o+a+a+(t.length===5?t.charAt(4)+t.charAt(4):"")),t.length===9)return r=parseInt(t.substr(1,6),16),[r>>16,r>>8&P,r&P,parseInt(t.substr(7),16)/255];t=parseInt(t.substr(1),16),r=[t>>16,t>>8&P,t&P]}else if(t.substr(0,3)==="hsl"){if(r=m=t.match(Ii),!e)l=+r[0]%360/360,u=+r[1]/100,c=+r[2]/100,o=c<=.5?c*(u+1):c+u-c*u,s=c*2-o,r.length>3&&(r[3]*=1),r[0]=Xe(l+1/3,s,o),r[1]=Xe(l,s,o),r[2]=Xe(l-1/3,s,o);else if(~t.indexOf("="))return r=t.match(cr),i&&r.length<4&&(r[3]=1),r}else r=t.match(Ii)||le.transparent;r=r.map(Number)}return e&&!m&&(s=r[0]/P,o=r[1]/P,a=r[2]/P,f=Math.max(s,o,a),d=Math.min(s,o,a),c=(f+d)/2,f===d?l=u=0:(p=f-d,u=c>.5?p/(2-f-d):p/(f+d),l=f===s?(o-a)/p+(o<a?6:0):f===o?(a-s)/p+2:(s-o)/p+4,l*=60),r[0]=~~(l+.5),r[1]=~~(u*100+.5),r[2]=~~(c*100+.5)),i&&r.length<4&&(r[3]=1),r},Fr=function(t){var e=[],i=[],r=-1;return t.split(kt).forEach(function(s){var o=s.match(Xt)||[];e.push.apply(e,o),i.push(r+=o.length+1)}),e.c=i,e},Xi=function(t,e,i){var r="",s=(t+r).match(kt),o=e?"hsla(":"rgba(",a=0,l,u,c,f;if(!s)return t;if(s=s.map(function(d){return(d=Or(d,e,1))&&o+(e?d[0]+","+d[1]+"%,"+d[2]+"%,"+d[3]:d.join(","))+")"}),i&&(c=Fr(t),l=i.c,l.join(r)!==c.c.join(r)))for(u=t.replace(kt,"1").split(Xt),f=u.length-1;a<f;a++)r+=u[a]+(~l.indexOf(a)?s.shift()||o+"0,0,0,0)":(c.length?c:s.length?s:i).shift());if(!u)for(u=t.split(kt),f=u.length-1;a<f;a++)r+=u[a]+s[a];return r+u[f]},kt=(function(){var n="(?:\\b(?:(?:rgb|rgba|hsl|hsla)\\(.+?\\))|\\B#(?:[0-9a-f]{3,4}){1,2}\\b",t;for(t in le)n+="|"+t+"\\b";return new RegExp(n+")","gi")})(),Sn=/hsl[a]?\(/,Lr=function(t){var e=t.join(" "),i;if(kt.lastIndex=0,kt.test(e))return i=Sn.test(e),t[1]=Xi(t[1],i),t[0]=Xi(t[0],i,Fr(t[1])),!0},ge,it=(function(){var n=Date.now,t=500,e=33,i=n(),r=i,s=1e3/240,o=s,a=[],l,u,c,f,d,p,m=function h(_){var g=n()-r,y=_===!0,b,x,v,T;if((g>t||g<0)&&(i+=g-e),r+=g,v=r-i,b=v-o,(b>0||y)&&(T=++f.frame,d=v-f.time*1e3,f.time=v=v/1e3,o+=b+(b>=s?0:s-b),x=1),y||(l=u(h)),x)for(p=0;p<a.length;p++)a[p](v,d,T,_)};return f={time:0,frame:0,tick:function(){m(!0)},deltaRatio:function(_){return d/(1e3/(_||60))},wake:function(){fr&&(!Je&&di()&&(ft=Je=window,pi=ft.document||{},ot.gsap=tt,(ft.gsapVersions||(ft.gsapVersions=[])).push(tt.version),dr(Ce||ft.GreenSockGlobals||!ft.gsap&&ft||{}),Ar.forEach(Dr)),c=typeof requestAnimationFrame<"u"&&requestAnimationFrame,l&&f.sleep(),u=c||function(_){return setTimeout(_,o-f.time*1e3+1|0)},ge=1,m(2))},sleep:function(){(c?cancelAnimationFrame:clearTimeout)(l),ge=0,u=me},lagSmoothing:function(_,g){t=_||1/0,e=Math.min(g||33,t)},fps:function(_){s=1e3/(_||240),o=f.time*1e3+s},add:function(_,g,y){var b=g?function(x,v,T,w){_(x,v,T,w),f.remove(b)}:_;return f.remove(_),a[y?"unshift":"push"](b),Jt(),b},remove:function(_,g){~(g=a.indexOf(_))&&a.splice(g,1)&&p>=g&&p--},_listeners:a},f})(),Jt=function(){return!ge&&it.wake()},M={},Tn=/^[\d.\-M][\d.\-,\s]/,En=/["']/g,kn=function(t){for(var e={},i=t.substr(1,t.length-3).split(":"),r=i[0],s=1,o=i.length,a,l,u;s<o;s++)l=i[s],a=s!==o-1?l.lastIndexOf(","):l.length,u=l.substr(0,a),e[r]=isNaN(u)?u.replace(En,"").trim():+u,r=l.substr(a+1).trim();return e},Mn=function(t){var e=t.indexOf("(")+1,i=t.indexOf(")"),r=t.indexOf("(",e);return t.substring(e,~r&&r<i?t.indexOf(")",i+1):i)},Rn=function(t){var e=(t+"").split("("),i=M[e[0]];return i&&e.length>1&&i.config?i.config.apply(null,~t.indexOf("{")?[kn(e[1])]:Mn(t).split(",").map(vr)):M._CE&&Tn.test(t)?M._CE("",t):i},Pn=function(t){return function(e){return 1-t(1-e)}},Ut=function(t,e){return t&&(U(t)?t:M[t]||Rn(t))||e},qt=function(t,e,i,r){i===void 0&&(i=function(l){return 1-e(1-l)}),r===void 0&&(r=function(l){return l<.5?e(l*2)/2:1-e((1-l)*2)/2});var s={easeIn:e,easeOut:i,easeInOut:r},o;return j(t,function(a){M[a]=ot[a]=s,M[o=a.toLowerCase()]=i;for(var l in s)M[o+(l==="easeIn"?".in":l==="easeOut"?".out":".inOut")]=M[a+"."+l]=s[l]}),s},Nr=function(t){return function(e){return e<.5?(1-t(1-e*2))/2:.5+t((e-.5)*2)/2}},Ge=function n(t,e,i){var r=e>=1?e:1,s=(i||(t?.3:.45))/(e<1?e:1),o=s/Ze*(Math.asin(1/r)||0),a=function(c){return c===1?1:r*Math.pow(2,-10*c)*Zs((c-o)*s)+1},l=t==="out"?a:t==="in"?function(u){return 1-a(1-u)}:Nr(a);return s=Ze/s,l.config=function(u,c){return n(t,u,c)},l},He=function n(t,e){e===void 0&&(e=1.70158);var i=function(o){return o?--o*o*((e+1)*o+e)+1:0},r=t==="out"?i:t==="in"?function(s){return 1-i(1-s)}:Nr(i);return r.config=function(s){return n(t,s)},r};j("Linear,Quad,Cubic,Quart,Quint,Strong",function(n,t){var e=t<5?t+1:t;qt(n+",Power"+(e-1),t?function(i){return Math.pow(i,e)}:function(i){return i},function(i){return 1-Math.pow(1-i,e)},function(i){return i<.5?Math.pow(i*2,e)/2:1-Math.pow((1-i)*2,e)/2})});M.Linear.easeNone=M.none=M.Linear.easeIn;qt("Elastic",Ge("in"),Ge("out"),Ge());(function(n,t){var e=1/t,i=2*e,r=2.5*e,s=function(a){return a<e?n*a*a:a<i?n*Math.pow(a-1.5/t,2)+.75:a<r?n*(a-=2.25/t)*a+.9375:n*Math.pow(a-2.625/t,2)+.984375};qt("Bounce",function(o){return 1-s(1-o)},s)})(7.5625,2.75);qt("Expo",function(n){return Math.pow(2,10*(n-1))*n+n*n*n*n*n*n*(1-n)});qt("Circ",function(n){return-(lr(1-n*n)-1)});qt("Sine",function(n){return n===1?1:-js(n*Ks)+1});qt("Back",He("in"),He("out"),He());M.SteppedEase=M.steps=ot.SteppedEase={config:function(t,e){t===void 0&&(t=1);var i=1/t,r=t+(e?0:1),s=e?1:0,o=1-R;return function(a){return((r*we(0,o,a)|0)+s)*i}}};de.ease=M["quad.out"];j("onComplete,onUpdate,onStart,onRepeat,onReverseComplete,onInterrupt",function(n){return gi+=n+","+n+"Params,"});var zr=function(t,e){this.id=Qs++,t._gsap=this,this.target=t,this.harness=e,this.get=e?e.get:_r,this.set=e?e.getSetter:Si},ve=(function(){function n(e){this.vars=e,this._delay=+e.delay||0,(this._repeat=e.repeat===1/0?-2:e.repeat||0)&&(this._rDelay=e.repeatDelay||0,this._yoyo=!!e.yoyo||!!e.yoyoEase),this._ts=1,Zt(this,+e.duration,1,1),this.data=e.data,D&&(this._ctx=D,D.data.push(this)),ge||it.wake()}var t=n.prototype;return t.delay=function(i){return i||i===0?(this.parent&&this.parent.smoothChildTiming&&this.startTime(this._start+i-this._delay),this._delay=i,this):this._delay},t.duration=function(i){return arguments.length?this.totalDuration(this._repeat>0?i+(i+this._rDelay)*this._repeat:i):this.totalDuration()&&this._dur},t.totalDuration=function(i){return arguments.length?(this._dirty=0,Zt(this,this._repeat<0?i:(i-this._repeat*this._rDelay)/(this._repeat+1))):this._tDur},t.totalTime=function(i,r){if(Jt(),!arguments.length)return this._tTime;var s=this._dp;if(s&&s.smoothChildTiming&&this._ts){for(qe(this,i),!s._dp||s.parent||xr(s,this);s&&s.parent;)s.parent._time!==s._start+(s._ts>=0?s._tTime/s._ts:(s.totalDuration()-s._tTime)/-s._ts)&&s.totalTime(s._tTime,!0),s=s.parent;!this.parent&&this._dp.autoRemoveChildren&&(this._ts>0&&i<this._tDur||this._ts<0&&i>0||!this._tDur&&!i)&&dt(this._dp,this,this._start-this._delay)}return(this._tTime!==i||!this._dur&&!r||this._initted&&Math.abs(this._zTime)===R||!this._initted&&this._dur&&i||!i&&!this._initted&&(this.add||this._ptLookup))&&(this._ts||(this._pTime=i),gr(this,i,r)),this},t.time=function(i,r){return arguments.length?this.totalTime(Math.min(this.totalDuration(),i+qi(this))%(this._dur+this._rDelay)||(i?this._dur:0),r):this._time},t.totalProgress=function(i,r){return arguments.length?this.totalTime(this.totalDuration()*i,r):this.totalDuration()?Math.min(1,this._tTime/this._tDur):this.rawTime()>=0&&this._initted?1:0},t.progress=function(i,r){return arguments.length?this.totalTime(this.duration()*(this._yoyo&&!(this.iteration()&1)?1-i:i)+qi(this),r):this.duration()?Math.min(1,this._time/this._dur):this.rawTime()>0?1:0},t.iteration=function(i,r){var s=this.duration()+this._rDelay;return arguments.length?this.totalTime(this._time+(i-1)*s,r):this._repeat?jt(this._tTime,s)+1:1},t.timeScale=function(i,r){if(!arguments.length)return this._rts===-R?0:this._rts;if(this._rts===i)return this;var s=this.parent&&this._ts?Oe(this.parent._time,this):this._tTime,o=this._rts<0;this._rts=+i||0,this._ts=this._ps||i===-R?0:this._rts;var a=this.totalDuration();return(o!==this._rts<0||s>0&&s<a)&&this.totalTime(we(-Math.abs(this._delay),a,s),r!==!1),Be(this),un(this)},t.paused=function(i){if(!arguments.length)return this._ps;if(this._ps!==i)if(this._ps=i,i)this._pTime=this._tTime||Math.max(-this._delay,this.rawTime()),this._ts=this._act=0;else{Jt(),this._ts=this._rts;var r=this.parent&&!this.parent.smoothChildTiming?this.rawTime():this._tTime||this._pTime,s=this.progress()===1&&Math.abs(this._zTime)!==R,o;if(s)for(this._tTime-=R,o=this._first;o;){if(!o._dur&&o._zTime<0&&o._ts&&o._start<=r+R){s=!1;break}o=o._next}this.totalTime(r,s)}return this},t.startTime=function(i){if(arguments.length){this._start=F(i);var r=this.parent||this._dp;return r&&(r._sort||!this.parent)&&dt(r,this,this._start-this._delay),this}return this._start},t.endTime=function(i){return this._start+(Q(i)?this.totalDuration():this.duration())/Math.abs(this._ts||1)},t.rawTime=function(i){var r=this.parent||this._dp;return r?i&&(!this._ts||this._repeat&&this._time&&this.totalProgress()<1)?this._tTime%(this._dur+this._rDelay):this._ts?Oe(r.rawTime(i),this):this._tTime:this._tTime},t.revert=function(i){i===void 0&&(i=nn);var r=H;return H=i,yi(this)&&(this.timeline&&this.timeline.revert(i),this.totalTime(-.01,i.suppressEvents)),this.data!=="nested"&&i.kill!==!1&&this.kill(),H=r,this},t.globalTime=function(i){for(var r=this,s=arguments.length?i:r.rawTime();r;)s=r._start+s/(Math.abs(r._ts)||1),r=r._dp;return!this.parent&&this._sat?this._sat.globalTime(i):s},t.repeat=function(i){return arguments.length?(this._repeat=i===1/0?-2:i,Vi(this)):this._repeat===-2?1/0:this._repeat},t.repeatDelay=function(i){if(arguments.length){var r=this._time;return this._rDelay=i,Vi(this),r?this.time(r):this}return this._rDelay},t.yoyo=function(i){return arguments.length?(this._yoyo=i,this):this._yoyo},t.seek=function(i,r){return this.totalTime(ut(this,i),Q(r))},t.restart=function(i,r){return this.play().totalTime(i?-this._delay:0,Q(r)),this._dur||(this._zTime=-R),this},t.play=function(i,r){return i!=null&&this.seek(i,r),this.reversed(!1).paused(!1)},t.reverse=function(i,r){return i!=null&&this.seek(i||this.totalDuration(),r),this.reversed(!0).paused(!1)},t.pause=function(i,r){return i!=null&&this.seek(i,r),this.paused(!0)},t.resume=function(){return this.paused(!1)},t.reversed=function(i){return arguments.length?(!!i!==this.reversed()&&this.timeScale(-this._rts||(i?-R:0)),this):this._rts<0},t.invalidate=function(){return this._initted=this._act=0,this._zTime=-R,this},t.isActive=function(){var i=this.parent||this._dp,r=this._start,s;return!!(!i||this._ts&&this._initted&&i.isActive()&&(s=i.rawTime(!0))>=r&&s<this.endTime(!0)-R)},t.eventCallback=function(i,r,s){var o=this.vars;return arguments.length>1?(r?(o[i]=r,s&&(o[i+"Params"]=s),i==="onUpdate"&&(this._onUpdate=r)):delete o[i],this):o[i]},t.then=function(i){var r=this,s=r._prom;return new Promise(function(o){var a=U(i)?i:yr,l=function(){var c=r.then;r.then=null,s&&s(),U(a)&&(a=a(r))&&(a.then||a===r)&&(r.then=c),o(a),r.then=c};r._initted&&r.totalProgress()===1&&r._ts>=0||!r._tTime&&r._ts<0?l():r._prom=l})},t.kill=function(){ae(this)},n})();at(ve.prototype,{_time:0,_start:0,_end:0,_tTime:0,_tDur:0,_dirty:0,_repeat:0,_yoyo:!1,parent:null,_initted:!1,_rDelay:0,_ts:1,_dp:0,ratio:0,_zTime:-R,_prom:0,_ps:!1,_rts:1});var K=(function(n){ar(t,n);function t(i,r){var s;return i===void 0&&(i={}),s=n.call(this,i)||this,s.labels={},s.smoothChildTiming=!!i.smoothChildTiming,s.autoRemoveChildren=!!i.autoRemoveChildren,s._sort=Q(i.sortChildren),L&&dt(i.parent||L,gt(s),r),i.reversed&&s.reverse(),i.paused&&s.paused(!0),i.scrollTrigger&&wr(gt(s),i.scrollTrigger),s}var e=t.prototype;return e.to=function(r,s,o){return ce(0,arguments,this),this},e.from=function(r,s,o){return ce(1,arguments,this),this},e.fromTo=function(r,s,o,a){return ce(2,arguments,this),this},e.set=function(r,s,o){return s.duration=0,s.parent=this,ue(s).repeatDelay||(s.repeat=0),s.immediateRender=!!s.immediateRender,new V(r,s,ut(this,o),1),this},e.call=function(r,s,o){return dt(this,V.delayedCall(0,r,s),o)},e.staggerTo=function(r,s,o,a,l,u,c){return o.duration=s,o.stagger=o.stagger||a,o.onComplete=u,o.onCompleteParams=c,o.parent=this,new V(r,o,ut(this,l)),this},e.staggerFrom=function(r,s,o,a,l,u,c){return o.runBackwards=1,ue(o).immediateRender=Q(o.immediateRender),this.staggerTo(r,s,o,a,l,u,c)},e.staggerFromTo=function(r,s,o,a,l,u,c,f){return a.startAt=o,ue(a).immediateRender=Q(a.immediateRender),this.staggerTo(r,s,a,l,u,c,f)},e.render=function(r,s,o){var a=this._time,l=this._dirty?this.totalDuration():this._tDur,u=this._dur,c=r<=0?0:F(r),f=this._zTime<0!=r<0&&(this._initted||!u),d,p,m,h,_,g,y,b,x,v,T,w;if(this!==L&&c>l&&r>=0&&(c=l),c!==this._tTime||o||f){if(a!==this._time&&u&&(c+=this._time-a,r+=this._time-a),d=c,x=this._start,b=this._ts,g=!b,f&&(u||(a=this._zTime),(r||!s)&&(this._zTime=r)),this._repeat){if(T=this._yoyo,_=u+this._rDelay,this._repeat<-1&&r<0)return this.totalTime(_*100+r,s,o);if(d=F(c%_),c===l?(h=this._repeat,d=u):(v=F(c/_),h=~~v,h&&h===v&&(d=u,h--),d>u&&(d=u)),v=jt(this._tTime,_),!a&&this._tTime&&v!==h&&this._tTime-v*_-this._dur<=0&&(v=h),T&&h&1&&(d=u-d,w=1),h!==v&&!this._lock){var E=T&&v&1,S=E===(T&&h&1);if(h<v&&(E=!E),a=E?0:c%u?u:c,this._lock=1,this.render(a||(w?0:F(h*_)),s,!u)._lock=0,this._tTime=c,!s&&this.parent&&rt(this,"onRepeat"),this.vars.repeatRefresh&&!w&&(this.invalidate()._lock=1,v=h),a&&a!==this._time||g!==!this._ts||this.vars.onRepeat&&!this.parent&&!this._act)return this;if(u=this._dur,l=this._tDur,S&&(this._lock=2,a=E?u:-1e-4,this.render(a,!0),this.vars.repeatRefresh&&!w&&this.invalidate()),this._lock=0,!this._ts&&!g)return this}}if(this._hasPause&&!this._forcing&&this._lock<2&&(y=dn(this,F(a),F(d)),y&&(c-=d-(d=y._start))),this._tTime=c,this._time=d,this._act=!!b,this._initted||(this._onUpdate=this.vars.onUpdate,this._initted=1,this._zTime=r,a=0),!a&&c&&u&&!s&&!v&&(rt(this,"onStart"),this._tTime!==c))return this;if(d>=a&&r>=0)for(p=this._first;p;){if(m=p._next,(p._act||d>=p._start)&&p._ts&&y!==p){if(p.parent!==this)return this.render(r,s,o);if(p.render(p._ts>0?(d-p._start)*p._ts:(p._dirty?p.totalDuration():p._tDur)+(d-p._start)*p._ts,s,o),d!==this._time||!this._ts&&!g){y=0,m&&(c+=this._zTime=-R);break}}p=m}else{p=this._last;for(var k=r<0?r:d;p;){if(m=p._prev,(p._act||k<=p._end)&&p._ts&&y!==p){if(p.parent!==this)return this.render(r,s,o);if(p.render(p._ts>0?(k-p._start)*p._ts:(p._dirty?p.totalDuration():p._tDur)+(k-p._start)*p._ts,s,o||H&&yi(p)),d!==this._time||!this._ts&&!g){y=0,m&&(c+=this._zTime=k?-R:R);break}}p=m}}if(y&&!s&&(this.pause(),y.render(d>=a?0:-R)._zTime=d>=a?1:-1,this._ts))return this._start=x,Be(this),this.render(r,s,o);this._onUpdate&&!s&&rt(this,"onUpdate",!0),(c===l&&this._tTime>=this.totalDuration()||!c&&a)&&(x===this._start||Math.abs(b)!==Math.abs(this._ts))&&(this._lock||((r||!u)&&(c===l&&this._ts>0||!c&&this._ts<0)&&Mt(this,1),!s&&!(r<0&&!a)&&(c||a||!l)&&(rt(this,c===l&&r>=0?"onComplete":"onReverseComplete",!0),this._prom&&!(c<l&&this.timeScale()>0)&&this._prom())))}return this},e.add=function(r,s){var o=this;if(yt(s)||(s=ut(this,s,r)),!(r instanceof ve)){if($(r))return r.forEach(function(a){return o.add(a,s)}),this;if(G(r))return this.addLabel(r,s);if(U(r))r=V.delayedCall(0,r);else return this}return this!==r?dt(this,r,s):this},e.getChildren=function(r,s,o,a){r===void 0&&(r=!0),s===void 0&&(s=!0),o===void 0&&(o=!0),a===void 0&&(a=-ct);for(var l=[],u=this._first;u;)u._start>=a&&(u instanceof V?s&&l.push(u):(o&&l.push(u),r&&l.push.apply(l,u.getChildren(!0,s,o)))),u=u._next;return l},e.getById=function(r){for(var s=this.getChildren(1,1,1),o=s.length;o--;)if(s[o].vars.id===r)return s[o]},e.remove=function(r){return G(r)?this.removeLabel(r):U(r)?this.killTweensOf(r):(r.parent===this&&Ue(this,r),r===this._recent&&(this._recent=this._last),It(this))},e.totalTime=function(r,s){return arguments.length?(this._forcing=1,!this._dp&&this._ts&&(this._start=F(it.time-(this._ts>0?r/this._ts:(this.totalDuration()-r)/-this._ts))),n.prototype.totalTime.call(this,r,s),this._forcing=0,this):this._tTime},e.addLabel=function(r,s){return this.labels[r]=ut(this,s),this},e.removeLabel=function(r){return delete this.labels[r],this},e.addPause=function(r,s,o){var a=V.delayedCall(0,s||me,o);return a.data="isPause",this._hasPause=1,dt(this,a,ut(this,r))},e.removePause=function(r){var s=this._first;for(r=ut(this,r);s;)s._start===r&&s.data==="isPause"&&Mt(s),s=s._next},e.killTweensOf=function(r,s,o){for(var a=this.getTweensOf(r,o),l=a.length;l--;)wt!==a[l]&&a[l].kill(r,s);return this},e.getTweensOf=function(r,s){for(var o=[],a=ht(r),l=this._first,u=yt(s),c;l;)l instanceof V?on(l._targets,a)&&(u?(!wt||l._initted&&l._ts)&&l.globalTime(0)<=s&&l.globalTime(l.totalDuration())>s:!s||l.isActive())&&o.push(l):(c=l.getTweensOf(a,s)).length&&o.push.apply(o,c),l=l._next;return o},e.tweenTo=function(r,s){s=s||{};var o=this,a=ut(o,r),l=s,u=l.startAt,c=l.onStart,f=l.onStartParams,d=l.immediateRender,p,m=V.to(o,at({ease:s.ease||"none",lazy:!1,immediateRender:!1,time:a,overwrite:"auto",duration:s.duration||Math.abs((a-(u&&"time"in u?u.time:o._time))/o.timeScale())||R,onStart:function(){if(o.pause(),!p){var _=s.duration||Math.abs((a-(u&&"time"in u?u.time:o._time))/o.timeScale());m._dur!==_&&Zt(m,_,0,1).render(m._time,!0,!0),p=1}c&&c.apply(m,f||[])}},s));return d?m.render(0):m},e.tweenFromTo=function(r,s,o){return this.tweenTo(s,at({startAt:{time:ut(this,r)}},o))},e.recent=function(){return this._recent},e.nextLabel=function(r){return r===void 0&&(r=this._time),Wi(this,ut(this,r))},e.previousLabel=function(r){return r===void 0&&(r=this._time),Wi(this,ut(this,r),1)},e.currentLabel=function(r){return arguments.length?this.seek(r,!0):this.previousLabel(this._time+R)},e.shiftChildren=function(r,s,o){o===void 0&&(o=0);var a=this._first,l=this.labels,u;for(r=F(r);a;)a._start>=o&&(a._start+=r,a._end+=r),a=a._next;if(s)for(u in l)l[u]>=o&&(l[u]+=r);return It(this)},e.invalidate=function(r){var s=this._first;for(this._lock=0;s;)s.invalidate(r),s=s._next;return n.prototype.invalidate.call(this,r)},e.clear=function(r){r===void 0&&(r=!0);for(var s=this._first,o;s;)o=s._next,this.remove(s),s=o;return this._dp&&(this._time=this._tTime=this._pTime=0),r&&(this.labels={}),It(this)},e.totalDuration=function(r){var s=0,o=this,a=o._last,l=ct,u,c,f;if(arguments.length)return o.timeScale((o._repeat<0?o.duration():o.totalDuration())/(o.reversed()?-r:r));if(o._dirty){for(f=o.parent;a;)u=a._prev,a._dirty&&a.totalDuration(),c=a._start,c>l&&o._sort&&a._ts&&!o._lock?(o._lock=1,dt(o,a,c-a._delay,1)._lock=0):l=c,c<0&&a._ts&&(s-=c,(!f&&!o._dp||f&&f.smoothChildTiming)&&(o._start+=F(c/o._ts),o._time-=c,o._tTime-=c),o.shiftChildren(-c,!1,-1/0),l=0),a._end>s&&a._ts&&(s=a._end),a=u;Zt(o,o===L&&o._time>s?o._time:s,1,1),o._dirty=0}return o._tDur},t.updateRoot=function(r){if(L._ts&&(gr(L,Oe(r,L)),mr=it.frame),it.frame>=Ui){Ui+=nt.autoSleep||120;var s=L._first;if((!s||!s._ts)&&nt.autoSleep&&it._listeners.length<2){for(;s&&!s._ts;)s=s._next;s||it.sleep()}}},t})(ve);at(K.prototype,{_lock:0,_hasPause:0,_forcing:0});var Cn=function(t,e,i,r,s,o,a){var l=new Z(this._pt,t,e,0,1,Vr,null,s),u=0,c=0,f,d,p,m,h,_,g,y;for(l.b=i,l.e=r,i+="",r+="",(g=~r.indexOf("random("))&&(r=_e(r)),o&&(y=[i,r],o(y,t,e),i=y[0],r=y[1]),d=i.match(Ve)||[];f=Ve.exec(r);)m=f[0],h=r.substring(u,f.index),p?p=(p+1)%5:h.substr(-5)==="rgba("&&(p=1),m!==d[c++]&&(_=parseFloat(d[c-1])||0,l._pt={_next:l._pt,p:h||c===1?h:",",s:_,c:m.charAt(1)==="="?Ht(_,m)-_:parseFloat(m)-_,m:p&&p<4?Math.round:0},u=Ve.lastIndex);return l.c=u<r.length?r.substring(u,r.length):"",l.fp=a,(hr.test(r)||g)&&(l.e=0),this._pt=l,l},bi=function(t,e,i,r,s,o,a,l,u,c){U(r)&&(r=r(s||0,t,o));var f=t[e],d=i!=="get"?i:U(f)?u?t[e.indexOf("set")||!U(t["get"+e.substr(3)])?e:"get"+e.substr(3)](u):t[e]():f,p=U(f)?u?Ln:Br:wi,m;if(G(r)&&(~r.indexOf("random(")&&(r=_e(r)),r.charAt(1)==="="&&(m=Ht(d,r)+(Y(d)||0),(m||m===0)&&(r=m))),!c||d!==r||ni)return!isNaN(d*r)&&r!==""?(m=new Z(this._pt,t,e,+d||0,r-(d||0),typeof f=="boolean"?zn:qr,0,p),u&&(m.fp=u),a&&m.modifier(a,this,t),this._pt=m):(!f&&!(e in t)&&mi(e,r),Cn.call(this,t,e,d,r,p,l||nt.stringFilter,u))},An=function(t,e,i,r,s){if(U(t)&&(t=he(t,s,e,i,r)),!mt(t)||t.style&&t.nodeType||$(t)||ur(t))return G(t)?he(t,s,e,i,r):t;var o={},a;for(a in t)o[a]=he(t[a],s,e,i,r);return o},Ir=function(t,e,i,r,s,o){var a,l,u,c;if(et[t]&&(a=new et[t]).init(s,a.rawVars?e[t]:An(e[t],r,s,o,i),i,r,o)!==!1&&(i._pt=l=new Z(i._pt,s,t,0,1,a.render,a,0,a.priority),i!==Gt))for(u=i._ptLookup[i._targets.indexOf(s)],c=a._props.length;c--;)u[a._props[c]]=l;return a},wt,ni,xi=function n(t,e,i){var r=t.vars,s=r.ease,o=r.startAt,a=r.immediateRender,l=r.lazy,u=r.onUpdate,c=r.runBackwards,f=r.yoyoEase,d=r.keyframes,p=r.autoRevert,m=t._dur,h=t._startAt,_=t._targets,g=t.parent,y=g&&g.data==="nested"?g.vars.targets:_,b=t._overwrite==="auto"&&!hi,x=t.timeline,v=r.easeReverse||f,T,w,E,S,k,O,z,A,I,X,W,B,lt;if(x&&(!d||!s)&&(s="none"),t._ease=Ut(s,de.ease),t._rEase=v&&(Ut(v)||t._ease),t._from=!x&&!!r.runBackwards,t._from&&(t.ratio=1),!x||d&&!r.stagger){if(A=_[0]?zt(_[0]).harness:0,B=A&&r[A.prop],T=De(r,_i),h&&(h._zTime<0&&h.progress(1),e<0&&c&&a&&!p?h.render(-1,!0):h.revert(c&&m?Me:sn),h._lazy=0),o){if(Mt(t._startAt=V.set(_,at({data:"isStart",overwrite:!1,parent:g,immediateRender:!0,lazy:!h&&Q(l),startAt:null,delay:0,onUpdate:u&&function(){return rt(t,"onUpdate")},stagger:0},o))),t._startAt._dp=0,t._startAt._sat=t,e<0&&(H||!a&&!p)&&t._startAt.revert(Me),a&&m&&e<=0&&i<=0){e&&(t._zTime=e);return}}else if(c&&m&&!h){if(e&&(a=!1),E=at({overwrite:!1,data:"isFromStart",lazy:a&&!h&&Q(l),immediateRender:a,stagger:0,parent:g},T),B&&(E[A.prop]=B),Mt(t._startAt=V.set(_,E)),t._startAt._dp=0,t._startAt._sat=t,e<0&&(H?t._startAt.revert(Me):t._startAt.render(-1,!0)),t._zTime=e,!a)n(t._startAt,R,R);else if(!e)return}for(t._pt=t._ptCache=0,l=m&&Q(l)||l&&!m,w=0;w<_.length;w++){if(k=_[w],z=k._gsap||vi(_)[w]._gsap,t._ptLookup[w]=X={},ti[z.id]&&Et.length&&Ae(),W=y===_?w:y.indexOf(k),A&&(I=new A).init(k,B||T,t,W,y)!==!1&&(t._pt=S=new Z(t._pt,k,I.name,0,1,I.render,I,0,I.priority),I._props.forEach(function(Vt){X[Vt]=S}),I.priority&&(O=1)),!A||B)for(E in T)et[E]&&(I=Ir(E,T,t,W,k,y))?I.priority&&(O=1):X[E]=S=bi.call(t,k,E,"get",T[E],W,y,0,r.stringFilter);t._op&&t._op[w]&&t.kill(k,t._op[w]),b&&t._pt&&(wt=t,L.killTweensOf(k,X,t.globalTime(e)),lt=!t.parent,wt=0),t._pt&&l&&(ti[z.id]=1)}O&&Wr(t),t._onInit&&t._onInit(t)}t._onUpdate=u,t._initted=(!t._op||t._pt)&&!lt,d&&e<=0&&x.render(ct,!0,!0)},Dn=function(t,e,i,r,s,o,a,l){var u=(t._pt&&t._ptCache||(t._ptCache={}))[e],c,f,d,p;if(!u)for(u=t._ptCache[e]=[],d=t._ptLookup,p=t._targets.length;p--;){if(c=d[p][e],c&&c.d&&c.d._pt)for(c=c.d._pt;c&&c.p!==e&&c.fp!==e;)c=c._next;if(!c)return ni=1,t.vars[e]="+=0",xi(t,a),ni=0,l?pe(e+" not eligible for reset. Try splitting into individual properties"):1;u.push(c)}for(p=u.length;p--;)f=u[p],c=f._pt||f,c.s=(r||r===0)&&!s?r:c.s+(r||0)+o*c.c,c.c=i-c.s,f.e&&(f.e=q(i)+Y(f.e)),f.b&&(f.b=c.s+Y(f.b))},On=function(t,e){var i=t[0]?zt(t[0]).harness:0,r=i&&i.aliases,s,o,a,l;if(!r)return e;s=Qt({},e);for(o in r)if(o in s)for(l=r[o].split(","),a=l.length;a--;)s[l[a]]=s[o];return s},Fn=function(t,e,i,r){var s=e.ease||r||"power1.inOut",o,a;if($(e))a=i[t]||(i[t]=[]),e.forEach(function(l,u){return a.push({t:u/(e.length-1)*100,v:l,e:s})});else for(o in e)a=i[o]||(i[o]=[]),o==="ease"||a.push({t:parseFloat(t),v:e[o],e:s})},he=function(t,e,i,r,s){return U(t)?t.call(e,i,r,s):G(t)&&~t.indexOf("random(")?_e(t):t},Le=gi+"repeat,repeatDelay,yoyo,repeatRefresh,yoyoEase,easeReverse,autoRevert",Ur={};j(Le+",id,stagger,delay,duration,paused,scrollTrigger",function(n){return Ur[n]=1});Le=Le.split(",");var V=(function(n){ar(t,n);function t(i,r,s,o){var a;typeof r=="number"&&(s.duration=r,r=s,s=null),a=n.call(this,o?r:ue(r))||this;var l=a.vars,u=l.duration,c=l.delay,f=l.immediateRender,d=l.stagger,p=l.overwrite,m=l.keyframes,h=l.defaults,_=l.scrollTrigger,g=r.parent||L,y=($(i)||ur(i)?yt(i[0]):"length"in r)?[i]:ht(i),b,x,v,T,w,E,S,k;if(a._targets=y.length?vi(y):pe("GSAP target "+i+" not found. https://gsap.com",!nt.nullTargetWarn)||[],a._ptLookup=[],a._overwrite=p,m||d||ke(u)||ke(c)){r=a.vars;var O=r.easeReverse||r.yoyoEase;if(b=a.timeline=new K({data:"nested",defaults:h||{},targets:g&&g.data==="nested"?g.vars.targets:y}),b.kill(),b.parent=b._dp=gt(a),b._start=0,d||ke(u)||ke(c)){if(T=y.length,S=d&&kr(d),mt(d))for(w in d)~Le.indexOf(w)&&(k||(k={}),k[w]=d[w]);for(x=0;x<T;x++)v=De(r,Ur),v.stagger=0,O&&(v.easeReverse=O),k&&Qt(v,k),E=y[x],v.duration=+he(u,gt(a),x,E,y),v.delay=(+he(c,gt(a),x,E,y)||0)-a._delay,!d&&T===1&&v.delay&&(a._delay=c=v.delay,a._start+=c,v.delay=0),b.to(E,v,S?S(x,E,y):0),b._ease=M.none;b.duration()?u=c=0:a.timeline=0}else if(m){ue(at(b.vars.defaults,{ease:"none"})),b._ease=Ut(m.ease||r.ease||"none");var z=0,A,I,X;if($(m))m.forEach(function(W){return b.to(y,W,">")}),b.duration();else{v={};for(w in m)w==="ease"||w==="easeEach"||Fn(w,m[w],v,m.easeEach);for(w in v)for(A=v[w].sort(function(W,B){return W.t-B.t}),z=0,x=0;x<A.length;x++)I=A[x],X={ease:I.e,duration:(I.t-(x?A[x-1].t:0))/100*u},X[w]=I.v,b.to(y,X,z),z+=X.duration;b.duration()<u&&b.to({},{duration:u-b.duration()})}}u||a.duration(u=b.duration())}else a.timeline=0;return p===!0&&!hi&&(wt=gt(a),L.killTweensOf(y),wt=0),dt(g,gt(a),s),r.reversed&&a.reverse(),r.paused&&a.paused(!0),(f||!u&&!m&&a._start===F(g._time)&&Q(f)&&cn(gt(a))&&g.data!=="nested")&&(a._tTime=-R,a.render(Math.max(0,-c)||0)),_&&wr(gt(a),_),a}var e=t.prototype;return e.render=function(r,s,o){var a=this._time,l=this._tDur,u=this._dur,c=r<0,f=r>l-R&&!c?l:r<R?0:r,d,p,m,h,_,g,y,b;if(!u)fn(this,r,s,o);else if(f!==this._tTime||!r||o||!this._initted&&this._tTime||this._startAt&&this._zTime<0!==c||this._lazy){if(d=f,b=this.timeline,this._repeat){if(h=u+this._rDelay,this._repeat<-1&&c)return this.totalTime(h*100+r,s,o);if(d=F(f%h),f===l?(m=this._repeat,d=u):(_=F(f/h),m=~~_,m&&m===_?(d=u,m--):d>u&&(d=u)),g=this._yoyo&&m&1,g&&(d=u-d),_=jt(this._tTime,h),d===a&&!o&&this._initted&&m===_)return this._tTime=f,this;m!==_&&this.vars.repeatRefresh&&!g&&!this._lock&&d!==h&&this._initted&&(this._lock=o=1,this.render(F(h*m),!0).invalidate()._lock=0)}if(!this._initted){if(Sr(this,c?r:d,o,s,f))return this._tTime=0,this;if(a!==this._time&&!(o&&this.vars.repeatRefresh&&m!==_))return this;if(u!==this._dur)return this.render(r,s,o)}if(this._rEase){var x=d<a;if(x!==this._inv){var v=x?a:u-a;this._inv=x,this._from&&(this.ratio=1-this.ratio),this._invRatio=this.ratio,this._invTime=a,this._invRecip=v?(x?-1:1)/v:0,this._invScale=x?-this.ratio:1-this.ratio,this._invEase=x?this._rEase:this._ease}this.ratio=y=this._invRatio+this._invScale*this._invEase((d-this._invTime)*this._invRecip)}else this.ratio=y=this._ease(d/u);if(this._from&&(this.ratio=y=1-y),this._tTime=f,this._time=d,!this._act&&this._ts&&(this._act=1,this._lazy=0),!a&&f&&!s&&!_&&(rt(this,"onStart"),this._tTime!==f))return this;for(p=this._pt;p;)p.r(y,p.d),p=p._next;b&&b.render(r<0?r:b._dur*b._ease(d/this._dur),s,o)||this._startAt&&(this._zTime=r),this._onUpdate&&!s&&(c&&ei(this,r,s,o),rt(this,"onUpdate")),this._repeat&&m!==_&&this.vars.onRepeat&&!s&&this.parent&&rt(this,"onRepeat"),(f===this._tDur||!f)&&this._tTime===f&&(c&&!this._onUpdate&&ei(this,r,!0,!0),(r||!u)&&(f===this._tDur&&this._ts>0||!f&&this._ts<0)&&Mt(this,1),!s&&!(c&&!a)&&(f||a||g)&&(rt(this,f===l?"onComplete":"onReverseComplete",!0),this._prom&&!(f<l&&this.timeScale()>0)&&this._prom()))}return this},e.targets=function(){return this._targets},e.invalidate=function(r){return(!r||!this.vars.runBackwards)&&(this._startAt=0),this._pt=this._op=this._onUpdate=this._lazy=this.ratio=0,this._ptLookup=[],this.timeline&&this.timeline.invalidate(r),n.prototype.invalidate.call(this,r)},e.resetTo=function(r,s,o,a,l){ge||it.wake(),this._ts||this.play();var u=Math.min(this._dur,(this._dp._time-this._start)*this._ts),c;return this._initted||xi(this,u),c=this._ease(u/this._dur),Dn(this,r,s,o,a,c,u,l)?this.resetTo(r,s,o,a,1):(qe(this,0),this.parent||br(this._dp,this,"_first","_last",this._dp._sort?"_start":0),this.render(0))},e.kill=function(r,s){if(s===void 0&&(s="all"),!r&&(!s||s==="all"))return this._lazy=this._pt=0,this.parent?ae(this):this.scrollTrigger&&this.scrollTrigger.kill(!!H),this;if(this.timeline){var o=this.timeline.totalDuration();return this.timeline.killTweensOf(r,s,wt&&wt.vars.overwrite!==!0)._first||ae(this),this.parent&&o!==this.timeline.totalDuration()&&Zt(this,this._dur*this.timeline._tDur/o,0,1),this}var a=this._targets,l=r?ht(r):a,u=this._ptLookup,c=this._pt,f,d,p,m,h,_,g;if((!s||s==="all")&&ln(a,l))return s==="all"&&(this._pt=0),ae(this);for(f=this._op=this._op||[],s!=="all"&&(G(s)&&(h={},j(s,function(y){return h[y]=1}),s=h),s=On(a,s)),g=a.length;g--;)if(~l.indexOf(a[g])){d=u[g],s==="all"?(f[g]=s,m=d,p={}):(p=f[g]=f[g]||{},m=s);for(h in m)_=d&&d[h],_&&((!("kill"in _.d)||_.d.kill(h)===!0)&&Ue(this,_,"_pt"),delete d[h]),p!=="all"&&(p[h]=1)}return this._initted&&!this._pt&&c&&ae(this),this},t.to=function(r,s){return new t(r,s,arguments[2])},t.from=function(r,s){return ce(1,arguments)},t.delayedCall=function(r,s,o,a){return new t(s,0,{immediateRender:!1,lazy:!1,overwrite:!1,delay:r,onComplete:s,onReverseComplete:s,onCompleteParams:o,onReverseCompleteParams:o,callbackScope:a})},t.fromTo=function(r,s,o){return ce(2,arguments)},t.set=function(r,s){return s.duration=0,s.repeatDelay||(s.repeat=0),new t(r,s)},t.killTweensOf=function(r,s,o){return L.killTweensOf(r,s,o)},t})(ve);at(V.prototype,{_targets:[],_lazy:0,_startAt:0,_op:0,_onInit:0});j("staggerTo,staggerFrom,staggerFromTo",function(n){V[n]=function(){var t=new K,e=ii.call(arguments,0);return e.splice(n==="staggerFromTo"?5:4,0,0),t[n].apply(t,e)}});var wi=function(t,e,i){return t[e]=i},Br=function(t,e,i){return t[e](i)},Ln=function(t,e,i,r){return t[e](r.fp,i)},Nn=function(t,e,i){return t.setAttribute(e,i)},Si=function(t,e){return U(t[e])?Br:fi(t[e])&&t.setAttribute?Nn:wi},qr=function(t,e){return e.set(e.t,e.p,Math.round((e.s+e.c*t)*1e6)/1e6,e)},zn=function(t,e){return e.set(e.t,e.p,!!(e.s+e.c*t),e)},Vr=function(t,e){var i=e._pt,r="";if(!t&&e.b)r=e.b;else if(t===1&&e.e)r=e.e;else{for(;i;)r=i.p+(i.m?i.m(i.s+i.c*t):Math.round((i.s+i.c*t)*1e4)/1e4)+r,i=i._next;r+=e.c}e.set(e.t,e.p,r,e)},Ti=function(t,e){for(var i=e._pt;i;)i.r(t,i.d),i=i._next},In=function(t,e,i,r){for(var s=this._pt,o;s;)o=s._next,s.p===r&&s.modifier(t,e,i),s=o},Un=function(t){for(var e=this._pt,i,r;e;)r=e._next,e.p===t&&!e.op||e.op===t?Ue(this,e,"_pt"):e.dep||(i=1),e=r;return!i},Bn=function(t,e,i,r){r.mSet(t,e,r.m.call(r.tween,i,r.mt),r)},Wr=function(t){for(var e=t._pt,i,r,s,o;e;){for(i=e._next,r=s;r&&r.pr>e.pr;)r=r._next;(e._prev=r?r._prev:o)?e._prev._next=e:s=e,(e._next=r)?r._prev=e:o=e,e=i}t._pt=s},Z=(function(){function n(e,i,r,s,o,a,l,u,c){this.t=i,this.s=s,this.c=o,this.p=r,this.r=a||qr,this.d=l||this,this.set=u||wi,this.pr=c||0,this._next=e,e&&(e._prev=this)}var t=n.prototype;return t.modifier=function(i,r,s){this.mSet=this.mSet||this.set,this.set=Bn,this.m=i,this.mt=s,this.tween=r},n})();j(gi+"parent,duration,ease,delay,overwrite,runBackwards,startAt,yoyo,immediateRender,repeat,repeatDelay,data,paused,reversed,lazy,callbackScope,stringFilter,id,yoyoEase,stagger,inherit,repeatRefresh,keyframes,autoRevert,scrollTrigger,easeReverse",function(n){return _i[n]=1});ot.TweenMax=ot.TweenLite=V;ot.TimelineLite=ot.TimelineMax=K;L=new K({sortChildren:!1,defaults:de,autoRemoveChildren:!0,id:"root",smoothChildTiming:!0});nt.stringFilter=Lr;var Bt=[],Pe={},qn=[],Gi=0,Vn=0,Ye=function(t){return(Pe[t]||qn).map(function(e){return e()})},ye=function(){var t=Date.now(),e=[];t-Gi>2&&(Ye("matchMediaInit"),Bt.forEach(function(i){var r=i.queries,s=i.conditions,o,a,l,u;for(a in r)o=ft.matchMedia(r[a]).matches,o&&(l=1),o!==s[a]&&(s[a]=o,u=1);u&&(i.revert(),l&&e.push(i))}),Ye("matchMediaRevert"),e.forEach(function(i){return i.onMatch(i,function(r){return i.add(null,r)})}),Gi=t,Ye("matchMedia"))},Xr=(function(){function n(e,i){this.selector=i&&ri(i),this.data=[],this._r=[],this.isReverted=!1,this.id=Vn++,e&&this.add(e)}var t=n.prototype;return t.add=function(i,r,s){U(i)&&(s=r,r=i,i=U);var o=this,a=function(){var u=D,c=o.selector,f;return u&&u!==o&&u.data.push(o),s&&(o.selector=ri(s)),D=o,f=r.apply(o,arguments),U(f)&&o._r.push(f),D=u,o.selector=c,o.isReverted=!1,f};return o.last=a,i===U?a(o,function(l){return o.add(null,l)}):i?o[i]=a:a},t.ignore=function(i){var r=D;D=null,i(this),D=r},t.getTweens=function(){var i=[];return this.data.forEach(function(r){return r instanceof n?i.push.apply(i,r.getTweens()):r instanceof V&&!(r.parent&&r.parent.data==="nested")&&i.push(r)}),i},t.clear=function(){this._r.length=this.data.length=0},t.kill=function(i,r){var s=this;if(i?(function(){for(var a=s.getTweens(),l=s.data.length,u;l--;)u=s.data[l],u.data==="isFlip"&&(u.revert(),u.getChildren(!0,!0,!1).forEach(function(c){return a.splice(a.indexOf(c),1)}));for(a.map(function(c){return{g:c._dur||c._delay||c._sat&&!c._sat.vars.immediateRender?c.globalTime(0):-1/0,t:c}}).sort(function(c,f){return f.g-c.g||-1/0}).forEach(function(c){return c.t.revert(i)}),l=s.data.length;l--;)u=s.data[l],u instanceof K?u.data!=="nested"&&(u.scrollTrigger&&u.scrollTrigger.revert(),u.kill()):!(u instanceof V)&&u.revert&&u.revert(i);s._r.forEach(function(c){return c(i,s)}),s.isReverted=!0})():this.data.forEach(function(a){return a.kill&&a.kill()}),this.clear(),r){for(var o=Bt.length;o--;)Bt[o].id===this.id&&Bt.splice(o,1);this._mqs&&this._mqs.forEach(function(a){return a.removeListener?a.removeListener(ye):a.removeEventListener("change",ye)}),this._mqs=null}},t.revert=function(i){this.kill(i||{})},n})(),Wn=(function(){function n(e){this.contexts=[],this.scope=e,D&&D.data.push(this)}var t=n.prototype;return t.add=function(i,r,s){mt(i)||(i={matches:i});var o=new Xr(0,s||this.scope),a=o.conditions={},l,u,c;D&&!o.selector&&(o.selector=D.selector),this.contexts.push(o),r=o.add("onMatch",r),o.queries=i;for(u in i)u==="all"?c=1:(l=ft.matchMedia(i[u]),l&&(Bt.indexOf(o)<0&&Bt.push(o),(a[u]=l.matches)&&(c=1),l.addListener?l.addListener(ye):l.addEventListener("change",ye),(o._mqs||(o._mqs=[])).push(l)));return c&&r(o,function(f){return o.add(null,f)}),this},t.revert=function(i){this.kill(i||{})},t.kill=function(i){this.contexts.forEach(function(r){return r.kill(i,!0)})},n})(),Ne={registerPlugin:function(){for(var t=arguments.length,e=new Array(t),i=0;i<t;i++)e[i]=arguments[i];e.forEach(function(r){return Dr(r)})},timeline:function(t){return new K(t)},getTweensOf:function(t,e){return L.getTweensOf(t,e)},getProperty:function(t,e,i,r){G(t)&&(t=ht(t)[0]);var s=zt(t||{}).get,o=i?yr:vr;return i==="native"&&(i=""),t&&(e?o((et[e]&&et[e].get||s)(t,e,i,r)):function(a,l,u){return o((et[a]&&et[a].get||s)(t,a,l,u))})},quickSetter:function(t,e,i){if(t=ht(t),t.length>1){var r=t.map(function(c){return tt.quickSetter(c,e,i)}),s=r.length;return function(c){for(var f=s;f--;)r[f](c)}}t=t[0]||{};var o=et[e],a=zt(t),l=a.harness&&(a.harness.aliases||{})[e]||e,u=o?function(c){var f=new o;Gt._pt=0,f.init(t,i?c+i:c,Gt,0,[t]),f.render(1,f),Gt._pt&&Ti(1,Gt)}:a.set(t,l);return o?u:function(c){return u(t,l,i?c+i:c,a,1)}},quickTo:function(t,e,i){var r,s=tt.to(t,at((r={},r[e]="+=0.1",r.paused=!0,r.stagger=0,r),i||{})),o=function(l,u,c){return s.resetTo(e,l,u,c)};return o.tween=s,o},isTweening:function(t){return L.getTweensOf(t,!0).length>0},defaults:function(t){return t&&t.ease&&(t.ease=Ut(t.ease,de.ease)),Bi(de,t||{})},config:function(t){return Bi(nt,t||{})},registerEffect:function(t){var e=t.name,i=t.effect,r=t.plugins,s=t.defaults,o=t.extendTimeline;(r||"").split(",").forEach(function(a){return a&&!et[a]&&!ot[a]&&pe(e+" effect requires "+a+" plugin.")}),We[e]=function(a,l,u){return i(ht(a),at(l||{},s),u)},o&&(K.prototype[e]=function(a,l,u){return this.add(We[e](a,mt(l)?l:(u=l)&&{},this),u)})},registerEase:function(t,e){M[t]=Ut(e)},parseEase:function(t,e){return arguments.length?Ut(t,e):M},getById:function(t){return L.getById(t)},exportRoot:function(t,e){t===void 0&&(t={});var i=new K(t),r,s;for(i.smoothChildTiming=Q(t.smoothChildTiming),L.remove(i),i._dp=0,i._time=i._tTime=L._time,r=L._first;r;)s=r._next,(e||!(!r._dur&&r instanceof V&&r.vars.onComplete===r._targets[0]))&&dt(i,r,r._start-r._delay),r=s;return dt(L,i,0),i},context:function(t,e){return t?new Xr(t,e):D},matchMedia:function(t){return new Wn(t)},matchMediaRefresh:function(){return Bt.forEach(function(t){var e=t.conditions,i,r;for(r in e)e[r]&&(e[r]=!1,i=1);i&&t.revert()})||ye()},addEventListener:function(t,e){var i=Pe[t]||(Pe[t]=[]);~i.indexOf(e)||i.push(e)},removeEventListener:function(t,e){var i=Pe[t],r=i&&i.indexOf(e);r>=0&&i.splice(r,1)},utils:{wrap:bn,wrapYoyo:xn,distribute:kr,random:Rr,snap:Mr,normalize:yn,getUnit:Y,clamp:mn,splitColor:Or,toArray:ht,selector:ri,mapRange:Cr,pipe:gn,unitize:vn,interpolate:wn,shuffle:Er},install:dr,effects:We,ticker:it,updateRoot:K.updateRoot,plugins:et,globalTimeline:L,core:{PropTween:Z,globals:pr,Tween:V,Timeline:K,Animation:ve,getCache:zt,_removeLinkedListItem:Ue,reverting:function(){return H},context:function(t){return t&&D&&(D.data.push(t),t._ctx=D),D},suppressOverwrites:function(t){return hi=t}}};j("to,from,fromTo,delayedCall,set,killTweensOf",function(n){return Ne[n]=V[n]});it.add(K.updateRoot);Gt=Ne.to({},{duration:0});var Xn=function(t,e){for(var i=t._pt;i&&i.p!==e&&i.op!==e&&i.fp!==e;)i=i._next;return i},Gn=function(t,e){var i=t._targets,r,s,o;for(r in e)for(s=i.length;s--;)o=t._ptLookup[s][r],o&&(o=o.d)&&(o._pt&&(o=Xn(o,r)),o&&o.modifier&&o.modifier(e[r],t,i[s],r))},$e=function(t,e){return{name:t,headless:1,rawVars:1,init:function(r,s,o){o._onInit=function(a){var l,u;if(G(s)&&(l={},j(s,function(c){return l[c]=1}),s=l),e){l={};for(u in s)l[u]=e(s[u]);s=l}Gn(a,s)}}}},tt=Ne.registerPlugin({name:"attr",init:function(t,e,i,r,s){var o,a,l;this.tween=i;for(o in e)l=t.getAttribute(o)||"",a=this.add(t,"setAttribute",(l||0)+"",e[o],r,s,0,0,o),a.op=o,a.b=l,this._props.push(o)},render:function(t,e){for(var i=e._pt;i;)H?i.set(i.t,i.p,i.b,i):i.r(t,i.d),i=i._next}},{name:"endArray",headless:1,init:function(t,e){for(var i=e.length;i--;)this.add(t,i,t[i]||0,e[i],0,0,0,0,0,1)}},$e("roundProps",si),$e("modifiers"),$e("snap",Mr))||Ne;V.version=K.version=tt.version="3.15.1";fr=1;di()&&Jt();M.Power0;M.Power1;M.Power2;M.Power3;M.Power4;M.Linear;M.Quad;M.Cubic;M.Quart;M.Quint;M.Strong;M.Elastic;M.Back;M.SteppedEase;M.Bounce;M.Sine;M.Expo;M.Circ;/*!
 * CSSPlugin 3.15.1
 * https://gsap.com
 *
 * Copyright 2008-2026, GreenSock. All rights reserved.
 * Subject to the terms at https://gsap.com/standard-license
 * @author: Jack Doyle, jack@greensock.com
*/var Hi,St,Yt,Ei,Nt,Yi,ki,Hn=function(){return typeof window<"u"},bt={},Lt=180/Math.PI,$t=Math.PI/180,Wt=Math.atan2,$i=1e8,Mi=/([A-Z])/g,Yn=/(left|right|width|margin|padding|x)/i,$n=/[\s,\(]\S/,pt={autoAlpha:"opacity,visibility",scale:"scaleX,scaleY",alpha:"opacity"},oi=function(t,e){return e.set(e.t,e.p,Math.round((e.s+e.c*t)*1e4)/1e4+e.u,e)},Kn=function(t,e){return e.set(e.t,e.p,t===1?e.e:Math.round((e.s+e.c*t)*1e4)/1e4+e.u,e)},Qn=function(t,e){return e.set(e.t,e.p,t?Math.round((e.s+e.c*t)*1e4)/1e4+e.u:e.b,e)},jn=function(t,e){return e.set(e.t,e.p,t===1?e.e:t?Math.round((e.s+e.c*t)*1e4)/1e4+e.u:e.b,e)},Zn=function(t,e){var i=e.s+e.c*t;e.set(e.t,e.p,~~(i+(i<0?-.5:.5))+e.u,e)},Gr=function(t,e){return e.set(e.t,e.p,t?e.e:e.b,e)},Hr=function(t,e){return e.set(e.t,e.p,t!==1?e.b:e.e,e)},Jn=function(t,e,i){return t.style[e]=i},to=function(t,e,i){return t.style.setProperty(e,i)},eo=function(t,e,i){return t._gsap[e]=i},io=function(t,e,i){return t._gsap.scaleX=t._gsap.scaleY=i},ro=function(t,e,i,r,s){var o=t._gsap;o.scaleX=o.scaleY=i,o.renderTransform(s,o)},so=function(t,e,i,r,s){var o=t._gsap;o[e]=i,o.renderTransform(s,o)},N="transform",J=N+"Origin",no=function n(t,e){var i=this,r=this.target,s=r.style,o=r._gsap;if(t in bt&&s){if(this.tfm=this.tfm||{},t!=="transform")t=pt[t]||t,~t.indexOf(",")?t.split(",").forEach(function(a){return i.tfm[a]=vt(r,a)}):this.tfm[t]=o.x?o[t]:vt(r,t),t===J&&(this.tfm.zOrigin=o.zOrigin);else return pt.transform.split(",").forEach(function(a){return n.call(i,a,e)});if(this.props.indexOf(N)>=0)return;o.svg&&(this.svgo=r.getAttribute("data-svg-origin"),this.props.push(J,e,"")),t=N}(s||e)&&this.props.push(t,e,s[t])},Yr=function(t){t.translate&&(t.removeProperty("translate"),t.removeProperty("scale"),t.removeProperty("rotate"))},oo=function(){var t=this.props,e=this.target,i=e.style,r=e._gsap,s,o;for(s=0;s<t.length;s+=3)t[s+1]?t[s+1]===2?e[t[s]](t[s+2]):e[t[s]]=t[s+2]:t[s+2]?i[t[s]]=t[s+2]:i.removeProperty(t[s].substr(0,2)==="--"?t[s]:t[s].replace(Mi,"-$1").toLowerCase());if(this.tfm){for(o in this.tfm)r[o]=this.tfm[o];r.svg&&(r.renderTransform(),e.setAttribute("data-svg-origin",this.svgo||"")),s=ki(),(!s||!s.isStart)&&!i[N]&&(Yr(i),r.zOrigin&&i[J]&&(i[J]+=" "+r.zOrigin+"px",r.zOrigin=0,r.renderTransform()),r.uncache=1)}},$r=function(t,e){var i={target:t,props:[],revert:oo,save:no};return t._gsap||tt.core.getCache(t),e&&t.style&&t.nodeType&&e.split(",").forEach(function(r){return i.save(r)}),i},Kr,ai=function(t,e){var i=St.createElementNS?St.createElementNS((e||"http://www.w3.org/1999/xhtml").replace(/^https/,"http"),t):St.createElement(t);return i&&i.style?i:St.createElement(t)},st=function n(t,e,i){var r=getComputedStyle(t);return r[e]||r.getPropertyValue(e.replace(Mi,"-$1").toLowerCase())||r.getPropertyValue(e)||!i&&n(t,te(e)||e,1)||""},Ki="O,Moz,ms,Ms,Webkit".split(","),te=function(t,e,i){var r=e||Nt,s=r.style,o=5;if(t in s&&!i)return t;for(t=t.charAt(0).toUpperCase()+t.substr(1);o--&&!(Ki[o]+t in s););return o<0?null:(o===3?"ms":o>=0?Ki[o]:"")+t},li=function(){Hn()&&window.document&&(Hi=window,St=Hi.document,Yt=St.documentElement,Nt=ai("div")||{style:{}},ai("div"),N=te(N),J=N+"Origin",Nt.style.cssText="border-width:0;line-height:0;position:absolute;padding:0",Kr=!!te("perspective"),ki=tt.core.reverting,Ei=1)},Qi=function(t){var e=t.ownerSVGElement,i=ai("svg",e&&e.getAttribute("xmlns")||"http://www.w3.org/2000/svg"),r=t.cloneNode(!0),s;r.style.display="block",i.appendChild(r),Yt.appendChild(i);try{s=r.getBBox()}catch{}return i.removeChild(r),Yt.removeChild(i),s},ji=function(t,e){for(var i=e.length;i--;)if(t.hasAttribute(e[i]))return t.getAttribute(e[i])},Qr=function(t){var e,i;try{e=t.getBBox()}catch{e=Qi(t),i=1}return e&&(e.width||e.height)||i||(e=Qi(t)),e&&!e.width&&!e.x&&!e.y?{x:+ji(t,["x","cx","x1"])||0,y:+ji(t,["y","cy","y1"])||0,width:0,height:0}:e},jr=function(t){return!!(t.getCTM&&(!t.parentNode||t.ownerSVGElement)&&Qr(t))},Rt=function(t,e){if(e){var i=t.style,r;e in bt&&e!==J&&(e=N),i.removeProperty?(r=e.substr(0,2),(r==="ms"||e.substr(0,6)==="webkit")&&(e="-"+e),i.removeProperty(r==="--"?e:e.replace(Mi,"-$1").toLowerCase())):i.removeAttribute(e)}},Tt=function(t,e,i,r,s,o){var a=new Z(t._pt,e,i,0,1,o?Hr:Gr);return t._pt=a,a.b=r,a.e=s,t._props.push(i),a},Zi={deg:1,rad:1,turn:1},ao={grid:1,flex:1},Pt=function n(t,e,i,r){var s=parseFloat(i)||0,o=(i+"").trim().substr((s+"").length)||"px",a=Nt.style,l=Yn.test(e),u=t.tagName.toLowerCase()==="svg",c=(u?"client":"offset")+(l?"Width":"Height"),f=100,d=r==="px",p=r==="%",m,h,_,g;if(r===o||!s||Zi[r]||Zi[o])return s;if(o!=="px"&&!d&&(s=n(t,e,i,"px")),g=t.getCTM&&jr(t),(p||o==="%")&&(bt[e]||~e.indexOf("adius")))return m=g?t.getBBox()[l?"width":"height"]:t[c],q(p?s/m*f:s/100*m);if(a[l?"width":"height"]=f+(d?o:r),h=r!=="rem"&&~e.indexOf("adius")||r==="em"&&t.appendChild&&!u?t:t.parentNode,g&&(h=(t.ownerSVGElement||{}).parentNode),(!h||h===St||!h.appendChild)&&(h=St.body),_=h._gsap,_&&p&&_.width&&l&&_.time===it.time&&!_.uncache)return q(s/_.width*f);if(p&&(e==="height"||e==="width")){var y=t.style[e];t.style[e]=f+r,m=t[c],y?t.style[e]=y:Rt(t,e)}else(p||o==="%")&&!ao[st(h,"display")]&&(a.position=st(t,"position")),h===t&&(a.position="static"),h.appendChild(Nt),m=Nt[c],h.removeChild(Nt),a.position="absolute";return l&&p&&(_=zt(h),_.time=it.time,_.width=h[c]),q(d?m*s/f:m&&s?f/m*s:0)},vt=function(t,e,i,r){var s;return Ei||li(),e in pt&&e!=="transform"&&(e=pt[e],~e.indexOf(",")&&(e=e.split(",")[0])),bt[e]&&e!=="transform"?(s=xe(t,r),s=e!=="transformOrigin"?s[e]:s.svg?s.origin:Ie(st(t,J))+" "+s.zOrigin+"px"):(s=t.style[e],(!s||s==="auto"||r||~(s+"").indexOf("calc("))&&(s=ze[e]&&ze[e](t,e,i)||st(t,e)||_r(t,e)||(e==="opacity"?1:0))),i&&!~(s+"").trim().indexOf(" ")?Pt(t,e,s,i)+i:s},lo=function(t,e,i,r){if(!i||i==="none"){var s=te(e,t,1),o=s&&st(t,s,1);o&&o!==i?(e=s,i=o):e==="borderColor"&&(i=st(t,"borderTopColor"))}var a=new Z(this._pt,t.style,e,0,1,Vr),l=0,u=0,c,f,d,p,m,h,_,g,y,b,x,v;if(a.b=i,a.e=r,i+="",r+="",r.substring(0,6)==="var(--"&&(r=st(t,r.substring(4,r.indexOf(")")))),r==="auto"&&(h=t.style[e],t.style[e]=r,r=st(t,e)||r,h?t.style[e]=h:Rt(t,e)),c=[i,r],Lr(c),i=c[0],r=c[1],d=i.match(Xt)||[],v=r.match(Xt)||[],v.length){for(;f=Xt.exec(r);)_=f[0],y=r.substring(l,f.index),m?m=(m+1)%5:(y.substr(-5)==="rgba("||y.substr(-5)==="hsla(")&&(m=1),_!==(h=d[u++]||"")&&(p=parseFloat(h)||0,x=h.substr((p+"").length),_.charAt(1)==="="&&(_=Ht(p,_)+x),g=parseFloat(_),b=_.substr((g+"").length),l=Xt.lastIndex-b.length,b||(b=b||nt.units[e]||x,l===r.length&&(r+=b,a.e+=b)),x!==b&&(p=Pt(t,e,h,b)||0),a._pt={_next:a._pt,p:y||u===1?y:",",s:p,c:g-p,m:m&&m<4||e==="zIndex"?Math.round:0});a.c=l<r.length?r.substring(l,r.length):""}else a.r=e==="display"&&r==="none"?Hr:Gr;return hr.test(r)&&(a.e=0),this._pt=a,a},Ji={top:"0%",bottom:"100%",left:"0%",right:"100%",center:"50%"},uo=function(t){var e=t.split(" "),i=e[0],r=e[1]||"50%";return(i==="top"||i==="bottom"||r==="left"||r==="right")&&(t=i,i=r,r=t),e[0]=Ji[i]||i,e[1]=Ji[r]||r,e.join(" ")},co=function(t,e){if(e.tween&&e.tween._time===e.tween._dur){var i=e.t,r=i.style,s=e.u,o=i._gsap,a,l,u;if(s==="all"||s===!0)r.cssText="",l=1;else for(s=s.split(","),u=s.length;--u>-1;)a=s[u],bt[a]&&(l=1,a=a==="transformOrigin"?J:N),Rt(i,a);l&&(Rt(i,N),o&&(o.svg&&i.removeAttribute("transform"),r.scale=r.rotate=r.translate="none",xe(i,1),o.uncache=1,Yr(r)))}},ze={clearProps:function(t,e,i,r,s){if(s.data!=="isFromStart"){var o=t._pt=new Z(t._pt,e,i,0,0,co);return o.u=r,o.pr=-10,o.tween=s,t._props.push(i),1}}},be=[1,0,0,1,0,0],Zr={},Jr=function(t){return t==="matrix(1, 0, 0, 1, 0, 0)"||t==="none"||!t},tr=function(t){var e=st(t,N);return Jr(e)?be:e.substr(7).match(cr).map(q)},Ri=function(t,e){var i=t._gsap||zt(t),r=t.style,s=tr(t),o,a,l,u;return i.svg&&t.getAttribute("transform")?(l=t.transform.baseVal.consolidate().matrix,s=[l.a,l.b,l.c,l.d,l.e,l.f],s.join(",")==="1,0,0,1,0,0"?be:s):(s===be&&!t.offsetParent&&t!==Yt&&!i.svg&&(l=r.display,r.display="block",o=t.parentNode,(!o||!t.offsetParent&&!t.getBoundingClientRect().width)&&(u=1,a=t.nextElementSibling,Yt.appendChild(t)),s=tr(t),l?r.display=l:Rt(t,"display"),u&&(a?o.insertBefore(t,a):o?o.appendChild(t):Yt.removeChild(t))),e&&s.length>6?[s[0],s[1],s[4],s[5],s[12],s[13]]:s)},ui=function(t,e,i,r,s,o){var a=t._gsap,l=s||Ri(t,!0),u=a.xOrigin||0,c=a.yOrigin||0,f=a.xOffset||0,d=a.yOffset||0,p=l[0],m=l[1],h=l[2],_=l[3],g=l[4],y=l[5],b=e.split(" "),x=parseFloat(b[0])||0,v=parseFloat(b[1])||0,T,w,E,S;i?l!==be&&(w=p*_-m*h)&&(E=x*(_/w)+v*(-h/w)+(h*y-_*g)/w,S=x*(-m/w)+v*(p/w)-(p*y-m*g)/w,x=E,v=S):(T=Qr(t),x=T.x+(~b[0].indexOf("%")?x/100*T.width:x),v=T.y+(~(b[1]||b[0]).indexOf("%")?v/100*T.height:v)),r||r!==!1&&a.smooth?(g=x-u,y=v-c,a.xOffset=f+(g*p+y*h)-g,a.yOffset=d+(g*m+y*_)-y):a.xOffset=a.yOffset=0,a.xOrigin=x,a.yOrigin=v,a.smooth=!!r,a.origin=e,a.originIsAbsolute=!!i,t.style[J]="0px 0px",o&&(Tt(o,a,"xOrigin",u,x),Tt(o,a,"yOrigin",c,v),Tt(o,a,"xOffset",f,a.xOffset),Tt(o,a,"yOffset",d,a.yOffset)),t.setAttribute("data-svg-origin",x+" "+v)},xe=function(t,e){var i=t._gsap||new zr(t);if("x"in i&&!e&&!i.uncache)return i;var r=t.style,s=i.scaleX<0,o="px",a="deg",l=getComputedStyle(t),u=st(t,J)||"0",c,f,d,p,m,h,_,g,y,b,x,v,T,w,E,S,k,O,z,A,I,X,W,B,lt,Vt,ie,re,At,Ci,_t,Dt;return c=f=d=h=_=g=y=b=x=0,p=m=1,i.svg=!!(t.getCTM&&jr(t)),l.translate&&((l.translate!=="none"||l.scale!=="none"||l.rotate!=="none")&&(r[N]=(l.translate!=="none"?"translate3d("+(l.translate+" 0 0").split(" ").slice(0,3).join(", ")+") ":"")+(l.rotate!=="none"?"rotate("+l.rotate+") ":"")+(l.scale!=="none"?"scale("+l.scale.split(" ").join(",")+") ":"")+(l[N]!=="none"?l[N]:"")),r.scale=r.rotate=r.translate="none"),w=Ri(t,i.svg),i.svg&&(i.uncache?(lt=t.getBBox(),u=i.xOrigin-lt.x+"px "+(i.yOrigin-lt.y)+"px",B=""):B=!e&&t.getAttribute("data-svg-origin"),ui(t,B||u,!!B||i.originIsAbsolute,i.smooth!==!1,w)),v=i.xOrigin||0,T=i.yOrigin||0,w!==be&&(O=w[0],z=w[1],A=w[2],I=w[3],c=X=w[4],f=W=w[5],w.length===6?(p=Math.sqrt(O*O+z*z),m=Math.sqrt(I*I+A*A),h=O||z?Wt(z,O)*Lt:0,y=A||I?Wt(A,I)*Lt+h:0,y&&(m*=Math.abs(Math.cos(y*$t))),i.svg&&(c-=v-(v*O+T*A),f-=T-(v*z+T*I))):(Dt=w[6],Ci=w[7],ie=w[8],re=w[9],At=w[10],_t=w[11],c=w[12],f=w[13],d=w[14],E=Wt(Dt,At),_=E*Lt,E&&(S=Math.cos(-E),k=Math.sin(-E),B=X*S+ie*k,lt=W*S+re*k,Vt=Dt*S+At*k,ie=X*-k+ie*S,re=W*-k+re*S,At=Dt*-k+At*S,_t=Ci*-k+_t*S,X=B,W=lt,Dt=Vt),E=Wt(-A,At),g=E*Lt,E&&(S=Math.cos(-E),k=Math.sin(-E),B=O*S-ie*k,lt=z*S-re*k,Vt=A*S-At*k,_t=I*k+_t*S,O=B,z=lt,A=Vt),E=Wt(z,O),h=E*Lt,E&&(S=Math.cos(E),k=Math.sin(E),B=O*S+z*k,lt=X*S+W*k,z=z*S-O*k,W=W*S-X*k,O=B,X=lt),_&&Math.abs(_)+Math.abs(h)>359.9&&(_=h=0,g=180-g),p=q(Math.sqrt(O*O+z*z+A*A)),m=q(Math.sqrt(W*W+Dt*Dt)),E=Wt(X,W),y=Math.abs(E)>2e-4?E*Lt:0,x=_t?1/(_t<0?-_t:_t):0),i.svg&&(B=t.getAttribute("transform"),i.forceCSS=t.setAttribute("transform","")||!Jr(st(t,N)),B&&t.setAttribute("transform",B))),Math.abs(y)>90&&Math.abs(y)<270&&(s?(p*=-1,y+=h<=0?180:-180,h+=h<=0?180:-180):(m*=-1,y+=y<=0?180:-180)),e=e||i.uncache,i.x=c-((i.xPercent=c&&(!e&&i.xPercent||(Math.round(t.offsetWidth/2)===Math.round(-c)?-50:0)))?t.offsetWidth*i.xPercent/100:0)+o,i.y=f-((i.yPercent=f&&(!e&&i.yPercent||(Math.round(t.offsetHeight/2)===Math.round(-f)?-50:0)))?t.offsetHeight*i.yPercent/100:0)+o,i.z=d+o,i.scaleX=q(p),i.scaleY=q(m),i.rotation=q(h)+a,i.rotationX=q(_)+a,i.rotationY=q(g)+a,i.skewX=y+a,i.skewY=b+a,i.transformPerspective=x+o,(i.zOrigin=parseFloat(u.split(" ")[2])||!e&&i.zOrigin||0)&&(r[J]=Ie(u)),i.xOffset=i.yOffset=0,i.force3D=nt.force3D,i.renderTransform=i.svg?fo:Kr?ts:ho,i.uncache=0,i},Ie=function(t){return(t=t.split(" "))[0]+" "+t[1]},Ke=function(t,e,i){var r=Y(e);return q(parseFloat(e)+parseFloat(Pt(t,"x",i+"px",r)))+r},ho=function(t,e){e.z="0px",e.rotationY=e.rotationX="0deg",e.force3D=0,ts(t,e)},Ot="0deg",se="0px",Ft=") ",ts=function(t,e){var i=e||this,r=i.xPercent,s=i.yPercent,o=i.x,a=i.y,l=i.z,u=i.rotation,c=i.rotationY,f=i.rotationX,d=i.skewX,p=i.skewY,m=i.scaleX,h=i.scaleY,_=i.transformPerspective,g=i.force3D,y=i.target,b=i.zOrigin,x="",v=g==="auto"&&t&&t!==1||g===!0;if(b&&(f!==Ot||c!==Ot)){var T=parseFloat(c)*$t,w=Math.sin(T),E=Math.cos(T),S;T=parseFloat(f)*$t,S=Math.cos(T),o=Ke(y,o,w*S*-b),a=Ke(y,a,-Math.sin(T)*-b),l=Ke(y,l,E*S*-b+b)}_!==se&&(x+="perspective("+_+Ft),(r||s)&&(x+="translate("+r+"%, "+s+"%) "),(v||o!==se||a!==se||l!==se)&&(x+=l!==se||v?"translate3d("+o+", "+a+", "+l+") ":"translate("+o+", "+a+Ft),u!==Ot&&(x+="rotate("+u+Ft),c!==Ot&&(x+="rotateY("+c+Ft),f!==Ot&&(x+="rotateX("+f+Ft),(d!==Ot||p!==Ot)&&(x+="skew("+d+", "+p+Ft),(m!==1||h!==1)&&(x+="scale("+m+", "+h+Ft),y.style[N]=x||"translate(0, 0)"},fo=function(t,e){var i=e||this,r=i.xPercent,s=i.yPercent,o=i.x,a=i.y,l=i.rotation,u=i.skewX,c=i.skewY,f=i.scaleX,d=i.scaleY,p=i.target,m=i.xOrigin,h=i.yOrigin,_=i.xOffset,g=i.yOffset,y=i.forceCSS,b=parseFloat(o),x=parseFloat(a),v,T,w,E,S;l=parseFloat(l),u=parseFloat(u),c=parseFloat(c),c&&(c=parseFloat(c),u+=c,l+=c),l||u?(l*=$t,u*=$t,v=Math.cos(l)*f,T=Math.sin(l)*f,w=Math.sin(l-u)*-d,E=Math.cos(l-u)*d,u&&(c*=$t,S=Math.tan(u-c),S=Math.sqrt(1+S*S),w*=S,E*=S,c&&(S=Math.tan(c),S=Math.sqrt(1+S*S),v*=S,T*=S)),v=q(v),T=q(T),w=q(w),E=q(E)):(v=f,E=d,T=w=0),(b&&!~(o+"").indexOf("px")||x&&!~(a+"").indexOf("px"))&&(b=Pt(p,"x",o,"px"),x=Pt(p,"y",a,"px")),(m||h||_||g)&&(b=q(b+m-(m*v+h*w)+_),x=q(x+h-(m*T+h*E)+g)),(r||s)&&(S=p.getBBox(),b=q(b+r/100*S.width),x=q(x+s/100*S.height)),S="matrix("+v+","+T+","+w+","+E+","+b+","+x+")",p.setAttribute("transform",S),y&&(p.style[N]=S)},po=function(t,e,i,r,s){var o=360,a=G(s),l=parseFloat(s)*(a&&~s.indexOf("rad")?Lt:1),u=l-r,c=r+u+"deg",f,d;return a&&(f=s.split("_")[1],f==="short"&&(u%=o,u!==u%(o/2)&&(u+=u<0?o:-o)),f==="cw"&&u<0?u=(u+o*$i)%o-~~(u/o)*o:f==="ccw"&&u>0&&(u=(u-o*$i)%o-~~(u/o)*o)),t._pt=d=new Z(t._pt,e,i,r,u,Kn),d.e=c,d.u="deg",t._props.push(i),d},er=function(t,e){for(var i in e)t[i]=e[i];return t},mo=function(t,e,i){var r=er({},i._gsap),s="perspective,force3D,transformOrigin,svgOrigin",o=i.style,a,l,u,c,f,d,p,m;r.svg?(u=i.getAttribute("transform"),i.setAttribute("transform",""),o[N]=e,a=xe(i,1),Rt(i,N),i.setAttribute("transform",u)):(u=getComputedStyle(i)[N],o[N]=e,a=xe(i,1),o[N]=u);for(l in bt)u=r[l],c=a[l],u!==c&&s.indexOf(l)<0&&(p=Y(u),m=Y(c),f=p!==m?Pt(i,l,u,m):parseFloat(u),d=parseFloat(c),t._pt=new Z(t._pt,a,l,f,d-f,oi),t._pt.u=m||0,t._props.push(l));er(a,r)};j("padding,margin,Width,Radius",function(n,t){var e="Top",i="Right",r="Bottom",s="Left",o=(t<3?[e,i,r,s]:[e+s,e+i,r+i,r+s]).map(function(a){return t<2?n+a:"border"+a+n});ze[t>1?"border"+n:n]=function(a,l,u,c,f){var d,p;if(arguments.length<4)return d=o.map(function(m){return vt(a,m,u)}),p=d.join(" "),p.split(d[0]).length===5?d[0]:p;d=(c+"").split(" "),p={},o.forEach(function(m,h){return p[m]=d[h]=d[h]||d[(h-1)/2|0]}),a.init(l,p,f)}});var es={name:"css",register:li,targetTest:function(t){return t.style&&t.nodeType},init:function(t,e,i,r,s){var o=this._props,a=t.style,l=i.vars.startAt,u,c,f,d,p,m,h,_,g,y,b,x,v,T,w,E,S;Ei||li(),this.styles=this.styles||$r(t),E=this.styles.props,this.tween=i;for(h in e)if(h!=="autoRound"&&(c=e[h],!(et[h]&&Ir(h,e,i,r,t,s)))){if(p=typeof c,m=ze[h],p==="function"&&(c=c.call(i,r,t,s),p=typeof c),p==="string"&&~c.indexOf("random(")&&(c=_e(c)),m)m(this,t,h,c,i)&&(w=1);else if(h.substr(0,2)==="--")u=(getComputedStyle(t).getPropertyValue(h)+"").trim(),c+="",kt.lastIndex=0,kt.test(u)||(_=Y(u),g=Y(c),g?_!==g&&(u=Pt(t,h,u,g)+g):_&&(c+=_)),this.add(a,"setProperty",u,c,r,s,0,0,h),o.push(h),E.push(h,0,a[h]);else if(p!=="undefined"){if(l&&h in l?(u=typeof l[h]=="function"?l[h].call(i,r,t,s):l[h],G(u)&&~u.indexOf("random(")&&(u=_e(u)),Y(u+"")||u==="auto"||(u+=nt.units[h]||Y(vt(t,h))||""),(u+"").charAt(1)==="="&&(u=vt(t,h))):u=vt(t,h),d=parseFloat(u),y=p==="string"&&c.charAt(1)==="="&&c.substr(0,2),y&&(c=c.substr(2)),f=parseFloat(c),h in pt&&(h==="autoAlpha"&&(d===1&&vt(t,"visibility")==="hidden"&&f&&(d=0),E.push("visibility",0,a.visibility),Tt(this,a,"visibility",d?"inherit":"hidden",f?"inherit":"hidden",!f)),h!=="scale"&&h!=="transform"&&(h=pt[h],~h.indexOf(",")&&(h=h.split(",")[0]))),b=h in bt,b){if(this.styles.save(h),S=c,p==="string"&&c.substring(0,6)==="var(--"){if(c=st(t,c.substring(4,c.indexOf(")"))),c.substring(0,5)==="calc("){var k=t.style.perspective;t.style.perspective=c,c=st(t,"perspective"),k?t.style.perspective=k:Rt(t,"perspective")}f=parseFloat(c)}if(x||(v=t._gsap,v.renderTransform&&!e.parseTransform||xe(t,e.parseTransform),T=e.smoothOrigin!==!1&&v.smooth,x=this._pt=new Z(this._pt,a,N,0,1,v.renderTransform,v,0,-1),x.dep=1),h==="scale")this._pt=new Z(this._pt,v,"scaleY",v.scaleY,(y?Ht(v.scaleY,y+f):f)-v.scaleY||0,oi),this._pt.u=0,o.push("scaleY",h),h+="X";else if(h==="transformOrigin"){E.push(J,0,a[J]),c=uo(c),v.svg?ui(t,c,0,T,0,this):(g=parseFloat(c.split(" ")[2])||0,g!==v.zOrigin&&Tt(this,v,"zOrigin",v.zOrigin,g),Tt(this,a,h,Ie(u),Ie(c)));continue}else if(h==="svgOrigin"){ui(t,c,1,T,0,this);continue}else if(h in Zr){po(this,v,h,d,y?Ht(d,y+c):c);continue}else if(h==="smoothOrigin"){Tt(this,v,"smooth",v.smooth,c);continue}else if(h==="force3D"){v[h]=c;continue}else if(h==="transform"){mo(this,c,t);continue}}else h in a||(h=te(h)||h);if(b||(f||f===0)&&(d||d===0)&&!$n.test(c)&&h in a)_=(u+"").substr((d+"").length),f||(f=0),g=Y(c)||(h in nt.units?nt.units[h]:_),_!==g&&(d=Pt(t,h,u,g)),this._pt=new Z(this._pt,b?v:a,h,d,(y?Ht(d,y+f):f)-d,!b&&(g==="px"||h==="zIndex")&&e.autoRound!==!1?Zn:oi),this._pt.u=g||0,b&&S!==c?(this._pt.b=u,this._pt.e=S,this._pt.r=jn):_!==g&&g!=="%"&&(this._pt.b=u,this._pt.r=Qn);else if(h in a)lo.call(this,t,h,u,y?y+c:c);else if(h in t)this.add(t,h,u||t[h],y?y+c:c,r,s);else if(h!=="parseTransform"){mi(h,c);continue}b||(h in a?E.push(h,0,a[h]):typeof t[h]=="function"?E.push(h,2,t[h]()):E.push(h,1,u||t[h])),o.push(h)}}w&&Wr(this)},render:function(t,e){if(e.tween._time||!ki())for(var i=e._pt;i;)i.r(t,i.d),i=i._next;else e.styles.revert()},get:vt,aliases:pt,getSetter:function(t,e,i){var r=pt[e];return r&&r.indexOf(",")<0&&(e=r),e in bt&&e!==J&&(t._gsap.x||vt(t,"x"))?i&&Yi===i?e==="scale"?io:eo:(Yi=i||{})&&(e==="scale"?ro:so):t.style&&!fi(t.style[e])?Jn:~e.indexOf("-")?to:Si(t,e)},core:{_removeProperty:Rt,_getMatrix:Ri}};tt.utils.checkPrefix=te;tt.core.getStyleSaver=$r;(function(n,t,e,i){var r=j(n+","+t+","+e,function(s){bt[s]=1});j(t,function(s){nt.units[s]="deg",Zr[s]=1}),pt[r[13]]=n+","+t,j(i,function(s){var o=s.split(":");pt[o[1]]=r[o[0]]})})("x,y,z,scale,scaleX,scaleY,xPercent,yPercent","rotation,rotationX,rotationY,skewX,skewY","transform,transformOrigin,svgOrigin,force3D,smoothOrigin,transformPerspective","0:translateX,1:translateY,2:translateZ,8:rotate,8:rotationZ,8:rotateZ,9:rotateX,10:rotateY");j("x,y,z,top,right,bottom,left,width,height,fontSize,padding,margin,perspective",function(n){nt.units[n]="px"});tt.registerPlugin(es);var ci=tt.registerPlugin(es)||tt;ci.core.Tween;function _o(n){const t=n.chapters.slice().sort((o,a)=>o.at-a.at),e=new Map;let i=-1;return(()=>{for(const o of t){const a=document.getElementById(o.id);if(!a)continue;o.width,ci.set(a,{autoAlpha:0,y:26});const l=ci.timeline({paused:!0}).fromTo(a,{autoAlpha:0,y:26},{autoAlpha:1,y:0,duration:.32,ease:"power2.out"}).to(a,{autoAlpha:1,duration:.36}).to(a,{autoAlpha:0,y:-22,duration:.32,ease:"power2.in"});e.set(o.id,l)}})(),{get active(){return i},update:()=>{const o=n.progress();for(const l of t){const u=e.get(l.id);if(!u)continue;const c=l.width??.16,f=l.at-c,d=l.at+c,p=(o-f)/Math.max(d-f,1e-6);u.progress(Math.max(0,Math.min(1,p)))}let a=0;for(let l=0;l<t.length;l++)t[l].at<=o+1e-6&&(a=l);a!==i&&(i=a,n.onChapter?.(t[i],i))},destroy(){for(const o of e.values())o.kill();e.clear()}}}function is(n){const i=(400-n)/396.8;return i<0?0:i>1?1:i}function go(n){const t=n.store,e=n.volume??.5;let i=null,r=null,s=null,o=null,a=null,l=null,u=!1,c=0,f=!1;const d=typeof window<"u"&&(typeof AudioContext<"u"||typeof window.webkitAudioContext<"u"),p=()=>{if(i)return;const g=typeof AudioContext<"u"?AudioContext:window.webkitAudioContext;i=new g,r=i.createGain(),r.gain.value=0,r.connect(i.destination),s=i.createBiquadFilter(),s.type="lowpass",s.frequency.value=220,s.Q.value=6,o=i.createGain(),o.gain.value=.09,o.connect(s),s.connect(r);const y=i.createOscillator();y.type="sawtooth",y.frequency.value=48,y.connect(o);const b=i.createOscillator();b.type="sine",b.frequency.value=72.3;const x=i.createGain();x.gain.value=.6,b.connect(x),x.connect(o);const T=i.createBuffer(1,Math.floor(i.sampleRate*2),i.sampleRate),w=T.getChannelData(0);let E=0;for(let k=0;k<w.length;k++){const O=Math.random()*2-1;E=.98*E+.02*O,w[k]=E*3.5}const S=i.createBufferSource();S.buffer=T,S.loop=!0,l=i.createBiquadFilter(),l.type="bandpass",l.frequency.value=420,l.Q.value=.8,a=i.createGain(),a.gain.value=.02,S.connect(l),l.connect(a),a.connect(r),y.start(),b.start(),S.start()},m=()=>{if(!i||!s||!l||!o||!a)return;const g=is(t.state.radius),y=i.currentTime;s.frequency.setTargetAtTime(220-175*g,y,.35),l.frequency.setTargetAtTime(420-300*g,y,.35),a.gain.setTargetAtTime(.02+.05*g,y,.5),o.gain.setTargetAtTime(.09+.05*g,y,.5)},h=()=>{f||(u&&m(),c=requestAnimationFrame(h))},_=async g=>{if(!f&&d&&g!==u)if(g){if(p(),!i||!r)return;if(i.state==="suspended")try{await i.resume()}catch{}r.gain.cancelScheduledValues(i.currentTime),r.gain.setTargetAtTime(e,i.currentTime,.4),u=!0,m(),c||(c=requestAnimationFrame(h))}else{if(!i||!r)return;r.gain.cancelScheduledValues(i.currentTime),r.gain.setTargetAtTime(0,i.currentTime,.25),u=!1}};return{isEnabled:()=>u,setEnabled:_,toggle:async()=>(await _(!u),u),dispose:()=>{f=!0,cancelAnimationFrame(c),c=0,i&&(i.close().catch(()=>{}),i=null),r=null,s=null,o=null,a=null,l=null,u=!1}}}function vo(n=document){return Array.from(n.querySelectorAll("[data-pull]"))}function yo(n){n.classList.add("pik-pull"),n.style.whiteSpace="pre-wrap";const t=[],e=r=>{const s=Array.from(r.childNodes);for(const o of s)if(o.nodeType===Node.TEXT_NODE){const a=o.textContent??"";if(!a)continue;const l=document.createDocumentFragment();for(const u of a){if(u===" "){l.append(document.createTextNode(" "));continue}const c=document.createElement("span");c.className="pik-pull__char",c.textContent=u,l.append(c),t.push({element:c,text:u,offsetX:0,offsetY:0,width:0,height:0})}r.replaceChild(l,o)}else if(o.nodeType===Node.ELEMENT_NODE){const a=o;if(a.hasAttribute("data-no-split"))continue;e(a)}};e(n);const i=n.getBoundingClientRect();for(const r of t){const s=r.element.getBoundingClientRect();r.offsetX=s.left-i.left,r.offsetY=s.top-i.top,r.width=s.width,r.height=s.height}return{characters:t,element:n}}function bo(n){const t=n.store,e=n.root??document,i=n.influenceRadius??420,r=vo(e).map(c=>({element:c,characters:yo(c).characters})),s=r.reduce((c,f)=>c+f.characters.length,0);let o=new Map;const a=()=>{o=new Map;for(const c of r)o.set(c.element,c.element.getBoundingClientRect())},l=()=>{const c=t.state;if(c.reducedMotion){if(r.length===0)return;for(const m of r)for(const h of m.characters)h.element.style.transform="",h.element.style.opacity="";return}const f=is(c.radius),d=c.blackHoleScreenCenter,p=window.innerWidth||1;for(const m of r){let h=o.get(m.element);h||(h=m.element.getBoundingClientRect(),o.set(m.element,h));for(const _ of m.characters){const g=h.left+_.offsetX+_.width/2,y=h.top+_.offsetY+_.height/2,b=d.x-g,x=d.y-y,v=Math.hypot(b,x),T=Math.exp(-v/(i*(.35+.65*(p/1920))));if(T<.002){_.element.style.transform="",_.element.style.opacity="";continue}const w=1+f*2.8*T,E=1+f*.55*T,S=f*.42*T;_.element.style.transformOrigin=b>=0?"0% 50%":"100% 50%",_.element.style.transform=`translate3d(${(b*S).toFixed(2)}px, ${(x*S).toFixed(2)}px, 0) scale(${w.toFixed(4)}, ${E.toFixed(4)})`,_.element.style.opacity=String(Math.max(0,1-f*.82*T))}}},u=()=>a();return window.addEventListener("resize",u),{characterCount:s,update:l,dispose(){window.removeEventListener("resize",u);for(const c of r)for(const f of c.characters)f.element.style.transform="",f.element.style.opacity=""}}}function xo(){return[{label:"Metric",value:"Kerr (Boyer–Lindquist), a/M = 0.999"},{label:"Integration",value:"null geodesics in Carter time, per pixel"},{label:"Arithmetic",value:"double-single (≈48-bit) in GLSL ES 3.00"},{label:"Disk",value:"Novikov–Thorne flux, relativistic blackbody"},{label:"Type",value:"Segoe UI Variable Display / Selawik"},{label:"Assets",value:"none — no images, no fonts, no CDN"}]}function wo(n){const t=n.store,e=n.root??document.body,i=n.revealAt??.93,r=n.lines??xo(),s=document.createElement("footer");s.className="pik-colophon",s.dataset.state="hidden";const o=document.createElement("p");o.className="pik-colophon__heading",o.textContent="COLOPHON",s.append(o);const a=document.createElement("dl");a.className="pik-colophon__list";for(const p of r){const m=document.createElement("div");m.className="pik-colophon__row";const h=document.createElement("dt");h.className="pik-colophon__label",h.textContent=p.label;const _=document.createElement("dd");if(_.className="pik-colophon__value",p.href){const g=document.createElement("a");g.className="pik-colophon__link",g.href=p.href,g.textContent=p.value,_.append(g)}else _.textContent=p.value;m.append(h,_),a.append(m)}s.append(a),e.append(s);let l=0,u=!1,c=!1;const f=()=>{const p=t.state.progress>=i;p!==c&&(c=p,s.dataset.state=c?"visible":"hidden")},d=()=>{u||(f(),l=requestAnimationFrame(d))};return l=requestAnimationFrame(d),f(),{element:s,update:f,dispose:()=>{u=!0,cancelAnimationFrame(l),s.remove()}}}function ee(n,t){if(!Number.isFinite(n))return"--";const e=Math.max(0,Math.min(12,Math.trunc(t)));let i=n.toFixed(e);return i.indexOf(".")>=0&&(i=i.replace(/0+$/,"").replace(/\.$/,"")),i==="-0"?"0":i}function So(n){return ee(n,2)}function To(n){return ee(n/2,2)}function Eo(n){return ee(n,4)}function ko(n){return ee(n,2)}function Mo(n){return ee(n,3)}function Ro(n){return Number.isFinite(n)?String(Math.max(0,Math.trunc(n))).padStart(2,"0"):"--"}function Po(){return[{key:"radius",label:"r",unit:"M",read:n=>n.hud.radiusM,format:So},{key:"schwarzschild",label:"r",unit:"rₛ",read:n=>n.hud.radiusSchwarzschild,format:To},{key:"dilation",label:"dτ/dt",unit:"static",read:n=>n.hud.timeDilation,format:Eo},{key:"inclination",label:"θ",unit:"°",read:n=>n.hud.inclinationDeg,format:ko},{key:"spin",label:"a*",unit:"",read:n=>n.hud.spin,format:Mo}]}function Co(n){const t=n.store,e=n.root??document.body,i=n.rows??Po(),r=n.smoothing??6,s=document.createElement("div");s.className="pik-hud",s.setAttribute("role","group"),s.setAttribute("aria-label","Telemetry"),s.dataset.state="visible";const o=i.map(d=>{const p=document.createElement("div");p.className=`pik-hud__row pik-hud__row--${d.key}`;const m=document.createElement("span");m.className="pik-hud__label",m.textContent=d.label;const h=document.createElement("span");h.className="pik-hud__value",h.textContent="--";const _=document.createElement("span");_.className="pik-hud__unit",_.textContent=d.unit??"",p.append(m,h,_),s.append(p);const g=d.read(t.state);return{spec:d,valueEl:h,current:g,target:g,lastText:""}});e.append(s);let a=0,l=0,u=!1;const c=d=>{const p=t.state,m=p.reducedMotion;for(const h of o){const _=h.spec.read(p);if(h.target=_,m||r<=0)h.current=_;else{const y=1-Math.exp(-r*Math.min(d,.1));h.current+=(_-h.current)*y,Math.abs(_-h.current)<1e-9&&(h.current=_)}const g=(h.spec.format??(y=>ee(y,2)))(h.current);g!==h.lastText&&(h.valueEl.textContent=g,h.lastText=g)}},f=d=>{if(u)return;const p=l===0?1/60:(d-l)/1e3;l=d,c(p),a=requestAnimationFrame(f)};return a=requestAnimationFrame(f),{element:s,update:()=>c(0),dispose:()=>{u=!0,cancelAnimationFrame(a),s.remove()}}}function Ao(n){const t=n.store,e=n.root??document.body,i=n.doc??document,r=n.chapters.slice().sort((h,_)=>h.at-_.at),s=document.createElement("nav");s.className="pik-nav",s.setAttribute("aria-label","Chapters");const o=document.createElement("ol");o.className="pik-nav__list";const a=document.createElement("span");a.className="pik-nav__rule",a.setAttribute("aria-hidden","true");const l=document.createElement("span");l.className="pik-nav__rule-fill",a.append(l);const u=[];r.forEach((h,_)=>{const g=document.createElement("li");g.className="pik-nav__item",g.dataset.chapter=h.id;const y=document.createElement("a");y.className="pik-nav__link",y.href=`#${h.id}`,y.dataset.chapter=h.id;const b=document.createElement("span");b.className="pik-nav__ordinal",b.textContent=Ro(_+1);const x=document.createElement("span");x.className="pik-nav__label",x.textContent=h.label,y.append(b,x),y.addEventListener("click",v=>{v.preventDefault();const T=i.getElementById(h.id),w=t.state.reducedMotion;T&&T.scrollIntoView({behavior:w?"auto":"smooth",block:"start"}),typeof history<"u"&&history.replaceState&&history.replaceState(null,"",`#${h.id}`),n.onSelect?.(h)}),g.append(y),o.append(g),u.push(y)}),s.append(a,o),e.append(s);let c=-1,f=0,d=!1;const p=()=>{const h=t.state.progress;let _=0;for(let g=0;g<r.length;g++)r[g].at<=h+1e-6&&(_=g);_!==c&&(c>=0&&u[c]?.removeAttribute("data-active"),u[_]?.setAttribute("data-active",""),c=_),s.style.setProperty("--pik-progress",h.toFixed(4))},m=()=>{d||(p(),f=requestAnimationFrame(m))};return f=requestAnimationFrame(m),p(),{element:s,update:p,dispose:()=>{d=!0,cancelAnimationFrame(f),s.remove()}}}function Do(n={}){const t=n.root??document.body,e=n.minimumMs??600,i=n.reducedMotion??!1,r=document.createElement("div");r.className="pik-preload",r.setAttribute("role","status"),r.setAttribute("aria-live","polite"),r.dataset.state="loading";const s=document.createElement("span");s.className="pik-preload__label",s.textContent=n.label??"INTEGRATING THE METRIC";const o=document.createElement("span");o.className="pik-preload__value",o.textContent="0%",r.append(s,o),t.append(r);let a=!1,l=!1;return{element:r,setProgress:f=>{const d=f<0?0:f>1?1:f,p=`${Math.round(d*100)}%`;o.textContent!==p&&(o.textContent=p),r.style.setProperty("--pik-preload-progress",d.toFixed(3))},setLabel:f=>{s.textContent!==f&&(s.textContent=f)},finish:()=>{if(l)return Promise.resolve();l=!0;const f=i?0:Math.max(0,e);return new Promise(d=>{window.setTimeout(()=>{if(a){d();return}if(r.dataset.state="done",i){r.remove(),d();return}let p=!1;const m=()=>{p||(p=!0,r.remove(),d())};r.addEventListener("transitionend",m,{once:!0}),window.setTimeout(m,900)},f)})},dispose:()=>{a=!0,r.remove()}}}const Se=window.matchMedia("(prefers-reduced-motion: reduce)"),C=new cs,Kt=Do({root:document.body,label:"INTEGRATING THE METRIC",minimumMs:700,reducedMotion:Se.matches}),Oo=Co({store:C,root:document.body}),rs=Array.from(document.querySelectorAll("[data-chapter-label]")).map((n,t)=>({id:n.id,label:n.dataset.chapterLabel??`Chapter ${t+1}`,at:Number(n.dataset.chapterAt??t/5)})),Fo=Ao({store:C,root:document.body,chapters:rs}),Lo=wo({store:C,root:document.body}),ss=go({store:C}),Qe=document.querySelector("[data-audio-toggle]");Qe?.addEventListener("click",()=>{ss.toggle().then(n=>{Qe.textContent=n?"SOUND OFF":"SOUND ON",Qe.setAttribute("aria-pressed",String(n))})});const No=Is(),Pi=$s({instant:Se.matches,onProgress:n=>C.setProgress(n)}),ns=_o({progress:()=>C.state.progress,chapters:rs.map(n=>({id:n.id,at:n.at,width:.13}))}),os=bo({store:C,root:document.body}),ir=document.querySelector("[data-scroll-cue]");if(ir){const n=C.subscribe(t=>{ir.dataset.hidden=String(t.progress>.02)});window.addEventListener("pagehide",n,{once:!0})}const rr=document.querySelector("[data-canvas]"),je=Number(new URLSearchParams(location.search).get("quality")),fe=Os({fov:.62,qualityScale:Number.isFinite(je)&&je>0?je:1,maxSteps:512,stepScale:.02,escapeRadius:400,onReady:({caps:n})=>{Kt.setLabel("METRIC RESOLVED"),Kt.setProgress(1)},onQualityChange:n=>C.setQualityScale(n)});rr?fe.init(rr).then(()=>Kt.finish()).catch(n=>{Kt.setLabel("WEBGL2 UNAVAILABLE"),console.error(n),document.body.dataset.renderer="unavailable"}):Kt.setLabel("NO CANVAS");performance.now();const as=n=>{Pi.lenis.raf(n);const t=No.sample(C.state.progress);C.setCamera(t.radius,t.inclination),C.setTime(n/1e3),fe.setState({radius:C.state.radius,inclination:C.state.inclination,spin:C.state.spin,time:C.state.time}),fe.render();const e=fe.getScreenCenter();C.setScreenCenter(e.x,e.y),ns.update(),os.update(),C.bumpFrame(),C.flush(),requestAnimationFrame(as)};requestAnimationFrame(as);const zo=()=>{C.setReducedMotion(Se.matches)};Se.addEventListener("change",zo);C.setReducedMotion(Se.matches);const Io={store:C,scrollTo:n=>Pi.scrollTo(n,{instant:!0}),getDiagnostics:()=>({progress:C.state.progress,radius:C.state.radius,inclination:C.state.inclination,qualityScale:C.state.qualityScale,frames:C.state.frames})};window.__pik=Io;window.addEventListener("pagehide",()=>{Pi.destroy(),ns.destroy(),os.dispose(),Oo.dispose(),Fo.dispose(),Lo.dispose(),ss.dispose(),Kt.dispose(),fe.dispose()});
