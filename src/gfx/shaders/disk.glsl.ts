export const DISK_GLSL = /* glsl */ `
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskPeakK;
uniform float uDiskScale;

float ntFluxShape(float r, float a) {
  float ri = max(r, 1.0);
  float s  = sqrt(ri);
  float w  = 1.0 - 3.0 / ri + 2.0 * a / (ri * s);
  w = max(w, 2.0e-3);
  float num = 1.0 + (1.0 - a) / (ri * s);
  float shape = num / (ri * ri * ri * w);
  float rPh = 2.0 * (1.0 + cos((2.0 / 3.0) * acos(clamp(-a, -1.0, 1.0))));
  float escape = max(1.0 - sqrt(rPh / ri), 0.0);
  return shape * escape;
}

float innerEdgeRim(float r, float a, float inner) {
  float ri = max(r, 1.0);
  float width = 0.35 * inner;
  float center = inner + 0.18 * inner;
  float fall = exp(-abs(ri - center) / width);
  return 0.55 + 1.60 * fall;
}

float diskHotSpot(float r, float phi, float time) {
  float angle = phi - time * 0.15;
  float spot1 = exp(-(angle * angle) * 4.0) * exp(-(r - 4.0) * (r - 4.0) * 0.5);
  float spot2 = exp(-((angle + 2.1) * (angle + 2.1)) * 3.0) * exp(-(r - 6.0) * (r - 6.0) * 0.3);
  float spot3 = exp(-((angle - 2.1) * (angle - 2.1)) * 3.0) * exp(-(r - 5.0) * (r - 5.0) * 0.4);
  float flare = sin(time * 0.5 + r * 0.7) * 0.5 + 0.5;
  return (spot1 + spot2 + spot3) * (1.0 + flare * 0.5) * 2.0;
}

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

float diskOmega(float r, float a) {
  return 1.0 / (pow(max(r, 1.0), 1.5) + a);
}

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

vec3 diskEmission(float r, float phi, float g, float a, float time) {
  float shape = ntFluxShape(r, a);
  float shapeIn = ntFluxShape(uDiskInner, a);
  float T = uDiskPeakK * pow(max(shape / max(shapeIn, 1e-12), 1e-9), 0.25);
  T *= g;
  vec3 tint = blackbodyRgb(T);
  float om = diskOmega(r, a);
  float shear = phi - om * time;
  float turb = fbm3(vec3(r * 0.30, shear * 0.85, time * 0.04), 6);
  float fil  = ridged3(vec3(r * 0.75, shear * 1.70, time * 0.07), 5);
  float profile = 0.45 + 1.15 * turb * (0.55 + 0.85 * fil);
  float rim = innerEdgeRim(r, a, uDiskInner);
  profile *= rim;
  float hotspot = diskHotSpot(r, phi, time);
  profile += hotspot;
  float g2 = g * g;
  float intensity = shape * g2 * g2 * profile * uDiskScale;
  return tint * intensity;
}
`;