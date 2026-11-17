export const STARFIELD_GLSL = /* glsl */ `
vec3 starLayer(vec3 dir, float density, float sharp, float seed, float time, float infall) {
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
  float drift = time * 0.05 * seed;
  uv = uv + vec2(drift * 0.1, drift * 0.05);
  vec3 p = vec3(uv * density, face * 37.0 + seed);
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 h = hash33(id + seed);
  vec2 offset = (h.xy - 0.5) * 0.72;
  float d = length(f.xy - offset);
  float mag = pow(hash13(id + 19.7 + seed), 9.0);
  float streaking = infall * 0.5;
  vec2 streakDir = normalize(f.xy - offset);
  float streakFalloff = exp(-d * d * sharp * (1.0 + streaking * 4.0));
  float streakLength = 1.0 + streaking * 8.0;
  float along = dot(f.xy - offset, streakDir);
  float streak = exp(-along * along * 0.5 * streakLength) * (1.0 + streaking * 2.0);
  float s = mag * (streakFalloff + streak * 0.3);
  float twinkle = 0.85 + 0.30 * sin(time * 1.3 + hash13(id + 7.1 + seed) * 6.28 + infall * 3.0);
  s *= twinkle;
  float t = hash13(id + 41.3 + seed);
  vec3 hot   = vec3(0.72, 0.84, 1.00);
  vec3 cool  = vec3(1.00, 0.80, 0.62);
  vec3 white = vec3(1.00, 0.94, 0.88);
  vec3 tint = mix(cool, white, smoothstep(0.30, 0.70, t));
  tint = mix(white, hot, smoothstep(0.60, 1.0, t));
  tint = mix(vec3(1.0), tint, 0.75);
  return tint * s;
}

vec3 starfield(vec3 dir, float brightness, float time) {
  float infall = 0.0;
  vec3 c = vec3(0.0);
  c += starLayer(dir,  22.0, 240.0,  0.0, time, infall) * 1.60;
  c += starLayer(dir,  58.0, 900.0, 11.0, time, infall) * 0.55;
  c += starLayer(dir, 150.0, 2600.0, 23.0, time, infall) * 0.16;
  return c * brightness;
}
`;