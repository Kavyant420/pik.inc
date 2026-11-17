import { DF64_GLSL } from './df64.glsl';
import { COMMON_GLSL } from './common.glsl';
import { STARFIELD_GLSL } from './starfield.glsl';
import { DISK_GLSL } from './disk.glsl';

export const KERR_RAY_FRAGMENT = /* glsl */ `
uniform vec2  uResolution;
uniform float uTime;
uniform float uSpin;
uniform float uRadius;
uniform float uTheta;
uniform float uRoll;
uniform float uFov;
uniform int   uMaxSteps;
uniform float uStepScale;
uniform float uEscapeRadius;
uniform float uStarBrightness;
uniform int   uSupersample;

out vec4 fragColor;

float gE;
float gL;
float gQ;
float gC;
float gBetaF;
vec2  gE2;
vec2  gBeta;
vec2  gTwoC;
vec2  gA2Q;

float kSigma(float r, float ct) {
  float a2 = uSpin * uSpin;
  return r * r + a2 * ct * ct;
}

float kDelta(float r) {
  float a2 = uSpin * uSpin;
  return r * r - 2.0 * r + a2;
}

float kMetricA(float r, float ct) {
  float a2 = uSpin * uSpin;
  float s = r * r + a2;
  float st2 = 1.0 - ct * ct;
  return s * s - a2 * kDelta(r) * st2;
}

float kHorizon() {
  float a2 = uSpin * uSpin;
  return 1.0 + sqrt(max(0.0, 1.0 - a2));
}

void conservedFromDirection(float r, float ct, vec3 d, out float E, out float L, out float Q) {
  float a = uSpin;
  float a2 = a * a;
  float st2 = max(1.0 - ct * ct, 1e-8);
  float S = r * r + a2 * ct * ct;
  float D = r * r - 2.0 * r + a2;
  float gtt = -(1.0 - 2.0 * r / S);
  float gtp = -2.0 * a * r * st2 / S;
  float gpp = st2 * (r * r + a2 + 2.0 * a2 * r * st2 / S);
  float alpha = inversesqrt(-gtt);
  float ut = alpha;
  float c = -gtp / (gtt * ut);
  float invNorm = inversesqrt(max(gpp - gtp * gtp / gtt, 1e-30));
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

vec2 dsRadialPotential(float r) {
  vec2 rr = dsFromFloat(r);
  vec2 r2 = dsMulFull(rr, rr);
  vec2 r4 = dsMulFull(r2, r2);
  vec2 t = dsAddFull(dsMulFull(gE2, r4), dsMulFull(gBeta, r2));
  return dsAddFull(t, dsSubFull(dsMulFull(gTwoC, rr), gA2Q));
}

float radialDerivative(float r) {
  return 4.0 * gE * gE * r * r * r + 2.0 * gBetaF * r + 2.0 * gC;
}

float radialPotential(float r) {
  vec2 v = dsRadialPotential(r);
  return v.x + v.y;
}

float polarPotential(float u) {
  float a2E2 = uSpin * uSpin * gE * gE;
  float u2 = u * u;
  return -a2E2 * u2 * u2 + (a2E2 - gQ - gL * gL) * u2 + gQ;
}

float polarDerivative(float u) {
  float a2E2 = uSpin * uSpin * gE * gE;
  return -4.0 * a2E2 * u * u * u + 2.0 * (a2E2 - gQ - gL * gL) * u;
}

float phiDot(float r, float ct) {
  float D = kDelta(r);
  float st2 = max(1.0 - ct * ct, 1e-6);
  float a = uSpin;
  return (2.0 * a * r * gE) / D + (gL * (D - a * a * st2)) / (D * st2);
}

vec3 cameraDirection(vec2 ndc, float tanHalfFov, float roll) {
  float x = ndc.x * 2.0 * tanHalfFov;
  float y = ndc.y * 2.0 * tanHalfFov;
  float cr = cos(roll);
  float sr = sin(roll);
  vec3 d = normalize(vec3(-1.0, -y, x));
  vec3 up = vec3(0.0, -1.0, 0.0);
  vec3 right = vec3(0.0, 0.0, 1.0);
  vec3 rUp = up * cr + right * sr;
  vec3 rRight = up * (-sr) + right * cr;
  return normalize(d.x * vec3(-1.0, 0.0, 0.0) + d.y * rUp + d.z * rRight);
}

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
  float pr = vr / S;
  float pth = -vu / (st * S);
  float pph = phiDot(r, ct) / S;
  float eLoc = max(gE * alpha, 1e-12);
  float dr = pr * sqrt(S / D) / eLoc;
  float dth = pth * sqrt(S) / eLoc;
  float dph = (gE * gtp / gtt + gL * invNorm) / eLoc;
  return vec3(dr, dth, dph);
}

vec3 localToWorld(vec3 d, float ct, float phi) {
  float st = sqrt(max(1.0 - ct * ct, 0.0));
  float cp = cos(phi);
  float sp = sin(phi);
  vec3 er = vec3(st * cp, st * sp, ct);
  vec3 eth = vec3(ct * cp, ct * sp, -st);
  vec3 ephi = vec3(-sp, cp, 0.0);
  return normalize(d.x * er + d.y * eth + d.z * ephi);
}

float secondaryImageWeight(float r, float a, float b) {
  float rPh = 2.0 * (1.0 + cos((2.0 / 3.0) * acos(clamp(-a, -1.0, 1.0))));
  float x = abs(b) / (3.0 * sqrt(3.0));
  float n = pow(max(x - 1.0, 0.0), 0.5);
  return exp(-n * 2.0) * 0.35;
}

vec3 traceRay(vec2 ndc) {
  float a = uSpin;
  float r = uRadius;
  float ct = cos(uTheta);
  float tanHalf = tan(uFov * 0.5);
  vec3 d = cameraDirection(ndc, tanHalf, uRoll);
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
  float sR = (d.x >= 0.0) ? 1.0 : -1.0;
  float sU = -(d.y >= 0.0 ? 1.0 : -1.0);
  float Rcur = radialPotential(r);
  float Wcur = polarPotential(u);
  float uPrev = u;
  float rPrev = r;
  float phiPrev = phi;
  bool captured = false;
  bool diskHit = false;
  vec3 diskColor = vec3(0.0);
  int orbitCount = 0;
  for (int i = 0; i < uMaxSteps; i++) {
    float h = clamp(uStepScale / max(r, 1.0), 2.0e-5, 0.25);
    float vr = sR * sqrt(max(Rcur, 0.0));
    float rNext = r + vr * h;
    float Rnext = radialPotential(rNext);
    if (Rnext < 0.0) {
      float lo = min(r, rNext);
      float hi = max(r, rNext);
      for (int k = 0; k < 8; k++) {
        float mid = 0.5 * (lo + hi);
        if (radialPotential(mid) < 0.0) lo = mid; else hi = mid;
      }
      r = hi;
      sR = -sR;
      float acc = 0.5 * radialDerivative(r);
      r += sign(acc) * 0.5 * abs(acc) * h * h;
      Rcur = radialPotential(r);
    } else {
      r = rNext;
      Rcur = Rnext;
    }
    float vu = sU * sqrt(max(Wcur, 0.0));
    float uNext = u + vu * h;
    float Wnext = polarPotential(uNext);
    if (Wnext < 0.0) {
      float lo = min(u, uNext);
      float hi = max(u, uNext);
      for (int k = 0; k < 8; k++) {
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
    if (abs(phi - phiPrev) > 6.0) orbitCount++;
    phiPrev = phi;
    if (uPrev != 0.0 && sign(uPrev) != sign(u)) {
      float f = uPrev / (uPrev - u);
      float rc = rPrev + f * (r - rPrev);
      float pc = phiPrev + f * (phi - phiPrev);
      if (rc >= uDiskInner && rc <= uDiskOuter) {
        float g = diskRedshift(rc, a, E, -L);
        diskColor = diskEmission(rc, pc, g, a, uTime);
        diskHit = true;
        break;
      }
    }
    uPrev = u;
    rPrev = r;
    if (r <= rHorizon * (1.0 + 1e-7)) {
      captured = true;
      break;
    }
    if (r > uEscapeRadius && sR > 0.0) break;
    if (abs(u) > 1.0 + 1e-6) break;
  }
  if (captured) {
    float rimGlow = secondaryImageWeight(r, a, length(ndc));
    return vec3(0.0, 0.0, 0.0) + vec3(rimGlow * 0.05);
  }
  if (diskHit) return diskColor;
  float vrEnd = sR * sqrt(max(radialPotential(r), 0.0));
  float vuEnd = sU * sqrt(max(polarPotential(u), 0.0));
  vec3 local = localDirection(r, u, vrEnd, vuEnd);
  vec3 sky = localToWorld(local, u, phi);
  float infall = sqrt(2.0 / max(r, 2.0));
  infall = clamp(infall, 0.0, 0.95);
  vec3 forward = normalize(vec3(-1.0, 0.0, 0.0));
  float mu = dot(sky, forward);
  float muAber = (mu - infall) / max(1.0 - infall * mu, 1e-6);
  float st = sqrt(max(1.0 - muAber * muAber, 0.0));
  vec3 perp = normalize(sky - forward * mu);
  sky = forward * muAber + perp * st;
  vec3 stars = starfield(sky, uStarBrightness, uTime);
  float lensing = 1.0 + 0.5 * exp(-length(ndc) * 3.0);
  return stars * lensing;
}

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
`;

export const KERR_RAY_FRAGMENT_SOURCE =
  DF64_GLSL + COMMON_GLSL + STARFIELD_GLSL + DISK_GLSL + KERR_RAY_FRAGMENT;