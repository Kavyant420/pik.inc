/* ==========================================================================
   blackhole-gl.js — General-Relativistic 3D Black Hole Geodesic Ray-Marcher
   & Scroll-Driven Tidal Spaghettification Engine (WebGL2 -> WebGL1 -> 2D)
   Zero external dependencies · Strict CSP ('self') compliant.
   ========================================================================== */
(function () {
  "use strict";

  if (window.PIKBlackHole) return;

  const STORAGE_MODE_KEY = "pik.bh.mode";

  /* ------------------------------------------------------------------------
     Shared GLSL Relativistic Geodesic Fragment Core
     Compatible with BOTH GLSL ES 3.00 (WebGL2) and GLSL ES 1.00 (WebGL1):
     - Constant loop bounds only
     - Explicit float literals everywhere
     - Guarded denominators, sqrt, pow, normalize, and atan
     ------------------------------------------------------------------------ */
  const GLSL_CORE = [
    "uniform vec2 u_res;",
    "uniform float u_time;",
    "uniform vec3 u_camPos;",
    "uniform vec3 u_camRight;",
    "uniform vec3 u_camUp;",
    "uniform vec3 u_camFwd;",
    "uniform vec2 u_lensOffset;",
    "uniform float u_fovScale;",
    "uniform float u_spin;",
    "uniform float u_mono;",
    "uniform int u_quality;",
    "",
    "const float PI = 3.14159265359;",
    "const float TAU = 6.28318530718;",
    "const float B_CRIT = 2.59807621135;",
    "",
    "vec3 safeNorm(vec3 v) {",
    "  return v * inversesqrt(max(dot(v, v), 1e-8));",
    "}",
    "",
    "float hash12(vec2 p) {",
    "  vec3 p3 = fract(vec3(p.xyx) * 0.1031);",
    "  p3 += dot(p3, p3.yzx + 33.33);",
    "  return fract((p3.x + p3.y) * p3.z);",
    "}",
    "",
    "vec2 hash22(vec2 p) {",
    "  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));",
    "  p3 += dot(p3, p3.yzx + 33.33);",
    "  return fract((p3.xx + p3.yz) * p3.zy);",
    "}",
    "",
    "float hash13(vec3 p3) {",
    "  p3 = fract(p3 * 0.1031);",
    "  p3 += dot(p3, p3.zyx + 31.32);",
    "  return fract((p3.x + p3.y) * p3.z);",
    "}",
    "",
    "float noise2(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  float a = hash12(i);",
    "  float b = hash12(i + vec2(1.0, 0.0));",
    "  float c = hash12(i + vec2(0.0, 1.0));",
    "  float d = hash12(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",
    "",
    "float noise3(vec3 x) {",
    "  vec3 i = floor(x);",
    "  vec3 f = fract(x);",
    "  vec3 u = f * f * (3.0 - 2.0 * f);",
    "  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));",
    "  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));",
    "  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));",
    "  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));",
    "  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));",
    "  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));",
    "  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));",
    "  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));",
    "  float nx00 = mix(n000, n100, u.x);",
    "  float nx10 = mix(n010, n110, u.x);",
    "  float nx01 = mix(n001, n101, u.x);",
    "  float nx11 = mix(n011, n111, u.x);",
    "  float nxy0 = mix(nx00, nx10, u.y);",
    "  float nxy1 = mix(nx01, nx11, u.y);",
    "  return mix(nxy0, nxy1, u.z);",
    "}",
    "",
    "float fbm2(vec2 p) {",
    "  float sum = 0.0;",
    "  float amp = 0.5;",
    "  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);",
    "  for (int i = 0; i < 5; i++) {",
    "    sum += amp * noise2(p);",
    "    p = rot * p * 2.03 + vec2(17.1, 31.7);",
    "    amp *= 0.5;",
    "  }",
    "  return sum;",
    "}",
    "",
    "float fbm3(vec3 p) {",
    "  float sum = 0.0;",
    "  float amp = 0.5;",
    "  for (int i = 0; i < 4; i++) {",
    "    sum += amp * noise3(p);",
    "    p = p * 2.04 + vec3(13.7, 29.3, 7.9);",
    "    amp *= 0.5;",
    "  }",
    "  return sum;",
    "}",
    "",
    "/* Planckian relativistic blackbody palette with smooth Monochrome blend */",
    "vec3 relativisticSpectrum(float tempShift, float monoMix) {",
    "  float t = clamp(tempShift, 0.15, 2.8);",
    "  vec3 deepRed   = vec3(0.82, 0.16, 0.04);",
    "  vec3 warmAmber = vec3(1.00, 0.54, 0.16);",
    "  vec3 solarGold = vec3(1.00, 0.86, 0.64);",
    "  vec3 platinum  = vec3(0.98, 0.99, 1.00);",
    "  vec3 blueWhite = vec3(0.86, 0.94, 1.08);",
    "  vec3 spec;",
    "  if (t < 0.72) {",
    "    spec = mix(deepRed, warmAmber, smoothstep(0.18, 0.72, t));",
    "  } else if (t < 1.15) {",
    "    spec = mix(warmAmber, solarGold, smoothstep(0.72, 1.15, t));",
    "  } else if (t < 1.65) {",
    "    spec = mix(solarGold, platinum, smoothstep(1.15, 1.65, t));",
    "  } else {",
    "    spec = mix(platinum, blueWhite, smoothstep(1.65, 2.55, t));",
    "  }",
    "  float lum = dot(spec, vec3(0.299, 0.587, 0.114));",
    "  vec3 silver = vec3(lum) * mix(vec3(0.94, 0.95, 0.98), vec3(1.02, 1.02, 1.03), smoothstep(0.7, 1.8, t));",
    "  return mix(spec, silver, monoMix);",
    "}",
    "",
    "/* Keplerian sheared MHD plasma disk + relativistic Doppler beaming g^4 */",
    "vec4 evaluateDisk(vec3 hitPos, vec3 hitVel, float r, int order, float time, float monoMix) {",
    "  float rIn = 2.25;",
    "  float rOut = 16.5;",
    "  if (r <= rIn || r >= rOut) return vec4(0.0);",
    "",
    "  /* Novikov-Thorne / Page-Thorne radial emissivity & temperature profile */",
    "  float innerRamp = smoothstep(rIn, rIn + 0.72, r);",
    "  float outerFade = 1.0 - smoothstep(8.2, rOut, r);",
    "  float ntFlux = pow(max(rIn / r, 1e-4), 1.68) * pow(max(1.0 - sqrt(rIn / r), 1e-4), 0.42);",
    "  float radialProfile = innerRamp * outerFade * clamp(ntFlux * 4.6, 0.0, 1.85);",
    "",
    "  /* True Keplerian differential angular velocity omega ~ r^(-1.5) */",
    "  float omega = 1.85 / (pow(max(r, 1.5), 1.5) + u_spin);",
    "  float phi = atan(hitPos.z, hitPos.x + 1e-7);",
    "  float logR = log(max(r, 1.01)) * 3.8;",
    "",
    "  /* Periodic multi-arm MHD spiral waves (never wind up over long sessions) */",
    "  float phase1 = phi + omega * time - logR * 1.15;",
    "  float phase2 = phi * 2.0 + omega * time * 2.0 - logR * 1.9;",
    "  float phase3 = phi * 4.0 + omega * time * 4.0 - logR * 2.7;",
    "  float spiralArms = 0.55 + 0.24 * sin(phase1) + 0.16 * cos(phase2 + 1.1) + 0.10 * sin(phase3);",
    "",
    "  /* Dual-phase crossfaded Keplerian FBM turbulence for fibrous plasma lanes */",
    "  float cycle = time * 0.09;",
    "  float f0 = fract(cycle);",
    "  float f1 = fract(cycle + 0.5);",
    "  float blend = 0.5 - 0.5 * cos(TAU * f0);",
    "  float shear0 = phi + omega * (f0 * 11.0);",
    "  float shear1 = phi + omega * (f1 * 11.0);",
    "  vec2 uv0 = vec2(cos(shear0), sin(shear0)) * (r * 0.58) + vec2(logR * 1.4, r * 0.22);",
    "  vec2 uv1 = vec2(cos(shear1), sin(shear1)) * (r * 0.58) + vec2(logR * 1.4 + 9.3, r * 0.22 + 4.7);",
    "  float turb = mix(fbm2(uv0 * 2.1), fbm2(uv1 * 2.1), blend);",
    "  float fine = mix(fbm2(uv0 * 5.2 + 13.0), fbm2(uv1 * 5.2 + 13.0), blend);",
    "",
    "  /* Concentric magnetic flux rings sheared by plasma turbulence */",
    "  float rings = 0.5 + 0.5 * sin(r * 5.4 + turb * 5.2 - time * 0.45);",
    "  float density = radialProfile * spiralArms * mix(0.38, 1.38, turb) * mix(0.72, 1.25, fine) * mix(0.78, 1.18, rings);",
    "",
    "  /* Prograde relativistic orbital tangent: left limb approaches observer */",
    "  vec3 orbDir = safeNorm(vec3(-hitPos.z, 0.0, hitPos.x));",
    "  float beta = clamp(sqrt(0.5 / max(r - 1.0, 0.35)), 0.0, 0.66);",
    "  float gravFactor = sqrt(max(1.0 - 1.5 / max(r, 1.54), 0.08));",
    "  /* Photon moves from disk to camera along (-hitVel), so denom = 1 - beta * dot(orbDir, -hitVel) = 1 + beta * dot(orbDir, hitVel) */",
    "  float dopplerDenom = max(1.0 + beta * dot(orbDir, hitVel), 0.28);",
    "  float gFactor = clamp(gravFactor / dopplerDenom, 0.22, 2.25);",
    "  float beaming = pow(max(gFactor, 0.1), 3.45);",
    "",
    "  /* Higher-order photon-ring crossings (n >= 1) focus into crisp incandescent rings */",
    "  float orderBoost = (order == 0) ? 1.0 : ((order == 1) ? 1.32 : 0.95);",
    "  float localTemp = (0.68 + 0.72 * pow(max(rIn / r, 1e-4), 0.55) + 0.25 * fine) * gFactor;",
    "  vec3 col = relativisticSpectrum(localTemp, monoMix) * density * beaming * orderBoost * 1.42;",
    "  float alpha = clamp(density * (0.68 + 0.25 * innerRamp), 0.0, 0.93);",
    "  return vec4(col, alpha);",
    "}",
    "",
    "/* Cube-sphere starfield layer: 4-tap neighbor check, zero polar distortion */",
    "vec3 starLayer(vec2 uv, float face, float scale, float densityThresh, float monoMix) {",
    "  vec2 gv = uv * scale;",
    "  vec2 id = floor(gv);",
    "  vec2 f = fract(gv);",
    "  vec3 acc = vec3(0.0);",
    "  for (int dy = -1; dy <= 1; dy++) {",
    "    for (int dx = -1; dx <= 1; dx++) {",
    "      vec2 offs = vec2(float(dx), float(dy));",
    "      vec2 cell = id + offs;",
    "      vec2 seed = cell + vec2(face * 137.0, face * 293.0);",
    "      float rnd = hash12(seed);",
    "      if (rnd > densityThresh) {",
    "        vec2 jitter = hash22(seed + 19.19) * 0.76 + 0.12;",
    "        vec2 diff = offs + jitter - f;",
    "        float d2 = dot(diff, diff);",
    "        float mag = fract(rnd * 97.31);",
    "        float radius = mix(0.035, 0.11, mag * mag);",
    "        float core = exp(-d2 / max(radius * radius, 1e-5));",
    "        float halo = 0.22 * exp(-d2 / max(radius * radius * 9.0, 1e-4)) * step(0.75, mag);",
    "        float starTemp = mix(0.65, 2.1, fract(rnd * 43.17));",
    "        vec3 starCol = mix(relativisticSpectrum(starTemp, monoMix), vec3(1.0), 0.45);",
    "        acc += starCol * (core + halo) * (0.35 + 1.45 * mag * mag);",
    "      }",
    "    }",
    "  }",
    "  return acc;",
    "}",
    "",
    "/* Gravitationally lensed deep-space starfield & Milky Way dust band */",
    "vec3 sampleCosmos(vec3 dir, float b, float monoMix) {",
    "  vec3 ad = abs(dir);",
    "  vec2 cubeUV;",
    "  float face;",
    "  if (ad.x >= ad.y && ad.x >= ad.z) {",
    "    cubeUV = dir.yz / max(ad.x, 1e-5);",
    "    face = (dir.x >= 0.0) ? 0.0 : 1.0;",
    "  } else if (ad.y >= ad.x && ad.y >= ad.z) {",
    "    cubeUV = dir.xz / max(ad.y, 1e-5);",
    "    face = (dir.y >= 0.0) ? 2.0 : 3.0;",
    "  } else {",
    "    cubeUV = dir.xy / max(ad.z, 1e-5);",
    "    face = (dir.z >= 0.0) ? 4.0 : 5.0;",
    "  }",
    "",
    "  vec3 stars = vec3(0.0);",
    "  stars += starLayer(cubeUV, face, 26.0, 0.945, monoMix) * 0.95;",
    "  stars += starLayer(cubeUV, face, 58.0, 0.935, monoMix) * 0.55;",
    "  if (u_quality > 0) {",
    "    stars += starLayer(cubeUV, face, 112.0, 0.925, monoMix) * 0.28;",
    "  }",
    "",
    "  /* Einstein strong-lensing magnification near the shadow edge */",
    "  float einsteinBoost = 1.0 + 1.35 * exp(-max(b - B_CRIT, 0.0) * 1.85);",
    "  stars *= einsteinBoost;",
    "",
    "  /* Silver Milky Way dust lane & dark interstellar rift warped by lensing */",
    "  vec3 galNormal = safeNorm(vec3(0.32, 0.88, -0.35));",
    "  float galPlane = abs(dot(dir, galNormal));",
    "  float cloud = fbm3(dir * 3.4 + vec3(2.1, -1.4, 5.2));",
    "  float rift = fbm3(dir * 7.8 + vec3(9.4, 3.1, -4.0));",
    "  float band = exp(-galPlane * 5.2) * smoothstep(0.32, 0.82, cloud);",
    "  float dustLane = exp(-galPlane * 17.0) * smoothstep(0.42, 0.78, rift);",
    "  vec3 nebulaTint = mix(vec3(0.68, 0.73, 0.84), vec3(0.76, 0.77, 0.80), monoMix);",
    "  vec3 milkyWay = nebulaTint * band * (1.0 - 0.72 * dustLane) * 0.13 * einsteinBoost;",
    "",
    "  return stars + milkyWay;",
    "}",
    "",
    "vec3 acesTonemap(vec3 x) {",
    "  float a = 2.51;",
    "  float b = 0.03;",
    "  float c = 2.43;",
    "  float d = 0.59;",
    "  float e = 0.14;",
    "  return clamp((x * (a * x + b)) / max(x * (c * x + d) + e, vec3(1e-5)), 0.0, 1.0);",
    "}",
    "",
    "vec4 renderBlackHole(vec2 uv) {",
    "  float aspect = u_res.x / max(u_res.y, 1.0);",
    "  vec2 ndc = uv * 2.0 - 1.0;",
    "  vec2 screen = vec2(ndc.x * aspect, ndc.y) - u_lensOffset;",
    "  vec3 rayDir = safeNorm(u_camFwd + (screen.x * u_camRight + screen.y * u_camUp) * u_fovScale);",
    "",
    "  /* Exact local Schwarzschild tetrad initialization at finite camera radius r0 */",
    "  vec3 pos = u_camPos;",
    "  float r0 = max(length(pos), 1.15);",
    "  vec3 rHat0 = pos / r0;",
    "  float dr0 = dot(rayDir, rHat0);",
    "  vec3 dPerp = rayDir - dr0 * rHat0;",
    "  float lapse = sqrt(max(1.0 - 1.0 / r0, 0.06));",
    "  vec3 vel = dr0 * rHat0 + dPerp / lapse;",
    "",
    "  vec3 angMom = cross(pos, vel);",
    "  float h2 = dot(angMom, angMom);",
    "  float bImpact = sqrt(max(h2, 0.0));",
    "",
    "  vec3 accumCol = vec3(0.0);",
    "  float transmittance = 1.0;",
    "  float minR = r0;",
    "  int captured = 0;",
    "  int crossings = 0;",
    "",
    "  /* Symplectic Velocity Verlet curved-spacetime null geodesic integration */",
    "  for (int i = 0; i < 120; i++) {",
    "    if (u_quality == 0 && i >= 76) break;",
    "    float r2 = max(dot(pos, pos), 1e-4);",
    "    float r = sqrt(r2);",
    "    minR = min(minR, r);",
    "",
    "    /* Inside the photon sphere (r < 1.44 r_s) with inward radial velocity, capture is guaranteed */",
    "    if (r <= 1.02 || (r < 1.44 && dot(pos, vel) < 0.0)) {",
    "      captured = 1;",
    "      break;",
    "    }",
    "    if (r > 34.0 && dot(pos, vel) > 0.0) {",
    "      break;",
    "    }",
    "",
    "    float dt = clamp(0.082 * max(r - 0.92, 0.24) + 0.020 * r2, 0.042, 2.25);",
    "    if (r < 17.0 && abs(pos.y) < 0.75) {",
    "      dt = min(dt, 0.20 + 0.042 * r);",
    "    }",
    "",
    "    float invR5 = 1.0 / max(r2 * r2 * r, 1e-4);",
    "    vec3 fd = (u_spin / max(r2 * r2, 1e-3)) * cross(vec3(0.0, 1.0, 0.0), vel);",
    "    vec3 acc = -1.5 * h2 * invR5 * pos + fd;",
    "    vec3 nextPos = pos + vel * dt + 0.5 * acc * (dt * dt);",
    "",
    "    float nr2 = max(dot(nextPos, nextPos), 1e-4);",
    "    float nr = sqrt(nr2);",
    "    minR = min(minR, nr);",
    "",
    "    float nInvR5 = 1.0 / max(nr2 * nr2 * nr, 1e-4);",
    "    vec3 velPred = vel + acc * dt;",
    "    vec3 nFd = (u_spin / max(nr2 * nr2, 1e-3)) * cross(vec3(0.0, 1.0, 0.0), velPred);",
    "    vec3 nextAcc = -1.5 * h2 * nInvR5 * nextPos + nFd;",
    "    vec3 nextVel = vel + 0.5 * (acc + nextAcc) * dt;",
    "",
    "    /* Equatorial accretion disk crossing (primary + lensed arches + photon sub-rings) */",
    "    if ((pos.y >= 0.0 && nextPos.y < 0.0) || (pos.y <= 0.0 && nextPos.y > 0.0)) {",
    "      float denom = max(abs(pos.y - nextPos.y), 1e-6);",
    "      float frac = clamp(abs(pos.y) / denom, 0.0, 1.0);",
    "      vec3 hitPos = mix(pos, nextPos, frac);",
    "      vec3 hitVel = safeNorm(mix(vel, nextVel, frac));",
    "      float diskR = length(hitPos.xz);",
    "      if (diskR > 2.25 && diskR < 16.5 && nr > 1.02) {",
    "        vec4 diskSample = evaluateDisk(hitPos, hitVel, diskR, crossings, u_time, u_mono);",
    "        accumCol += transmittance * diskSample.rgb;",
    "        transmittance *= (1.0 - diskSample.a);",
    "        crossings += 1;",
    "        if (transmittance < 0.015) {",
    "          pos = nextPos;",
    "          vel = nextVel;",
    "          break;",
    "        }",
    "      }",
    "    }",
    "",
    "    /* Optically thin volumetric relativistic corona haze around inner torus */",
    "    if (r > 1.55 && r < 11.5) {",
    "      float scaleH = 0.09 + 0.055 * max(r - 2.0, 0.0);",
    "      float vDist = abs(pos.y) / scaleH;",
    "      if (vDist < 2.6) {",
    "        vec3 orbC = safeNorm(vec3(-pos.z, 0.0, pos.x));",
    "        float betaC = clamp(sqrt(0.5 / max(r - 1.0, 0.4)), 0.0, 0.62);",
    "        float gC = clamp(sqrt(max(1.0 - 1.5 / max(r, 1.55), 0.08)) / max(1.0 + betaC * dot(orbC, safeNorm(vel)), 0.32), 0.25, 2.1);",
    "        float corona = exp(-vDist * vDist) * exp(-max(r - 2.3, 0.0) * 0.48) * smoothstep(1.55, 2.35, r);",
    "        vec3 coronaCol = relativisticSpectrum(1.25 * gC, u_mono) * corona * pow(gC, 2.8) * dt * 0.085;",
    "        accumCol += transmittance * coronaCol;",
    "      }",
    "    }",
    "",
    "    if (nr <= 1.02 || (nr < 1.44 && dot(nextPos, nextVel) < 0.0)) {",
    "      captured = 1;",
    "      pos = nextPos;",
    "      vel = nextVel;",
    "      break;",
    "    }",
    "",
    "    pos = nextPos;",
    "    vel = nextVel;",
    "  }",
    "  if (captured == 0 && length(pos) < 2.1) {",
    "    captured = 1;",
    "  }",
    "",
    "  /* Critical Photon Sphere Caustic (r = 1.5 r_s, b = 2.598 r_s) + Airy Bloom */",
    "  float dopplerAsym = clamp(1.0 - 0.36 * (screen.x / max(length(screen) + 0.15, 0.15)), 0.55, 1.48);",
    "  if (captured == 0) {",
    "    float graze = max(minR - 1.5, 0.0);",
    "    float primaryRing = exp(-graze * 19.0) * smoothstep(2.35, 1.50, minR);",
    "    float subRing = exp(-abs(minR - 1.535) * 58.0);",
    "    vec3 ringTint = relativisticSpectrum(1.75 * dopplerAsym, u_mono);",
    "    accumCol += transmittance * ringTint * (primaryRing * 1.15 + subRing * 0.95) * dopplerAsym;",
    "",
    "    /* Deflected exit ray samples gravitationally lensed deep-space cosmos */",
    "    if (transmittance > 0.01) {",
    "      vec3 exitDir = safeNorm(vel);",
    "      accumCol += transmittance * sampleCosmos(exitDir, bImpact, u_mono);",
    "    }",
    "  } else {",
    "    /* Subtle razor-thin horizon edge diffraction skim right outside r <= r_s */",
    "    float edgeSkim = exp(-max(B_CRIT - bImpact, 0.0) * 26.0) * step(B_CRIT - 0.16, bImpact);",
    "    accumCol += transmittance * relativisticSpectrum(1.65 * dopplerAsym, u_mono) * edgeSkim * 0.42;",
    "  }",
    "",
    "  /* Subtle physical Airy/cinematic lens bloom around critical photon sphere */",
    "  float airyGlow = exp(-abs(bImpact - B_CRIT) * 1.45) * 0.055 * dopplerAsym;",
    "  accumCol += relativisticSpectrum(1.35, u_mono) * airyGlow;",
    "",
    "  /* ACES Filmic tonemapping + gamma + sub-LSB dither against 8-bit space banding */",
    "  vec3 mapped = acesTonemap(accumCol * 1.08);",
    "  mapped = pow(max(mapped, vec3(0.0)), vec3(1.0 / 2.2));",
    "  float dither = (hash12(uv * u_res + fract(u_time) * 91.7) - 0.5) / 255.0;",
    "  mapped = clamp(mapped + dither, 0.0, 1.0);",
    "  return vec4(mapped, 1.0);",
    "}"
  ].join("\n");

  const VERT_GL2 = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 a_pos;",
    "out vec2 v_uv;",
    "void main() {",
    "  v_uv = a_pos * 0.5 + 0.5;",
    "  gl_Position = vec4(a_pos, 0.0, 1.0);",
    "}"
  ].join("\n");

  const FRAG_GL2 = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 v_uv;",
    "out vec4 outColor;",
    GLSL_CORE,
    "void main() {",
    "  outColor = renderBlackHole(v_uv);",
    "}"
  ].join("\n");

  const VERT_GL1 = [
    "precision highp float;",
    "attribute vec2 a_pos;",
    "varying vec2 v_uv;",
    "void main() {",
    "  v_uv = a_pos * 0.5 + 0.5;",
    "  gl_Position = vec4(a_pos, 0.0, 1.0);",
    "}"
  ].join("\n");

  const FRAG_GL1 = [
    "precision highp float;",
    "varying vec2 v_uv;",
    GLSL_CORE,
    "void main() {",
    "  gl_FragColor = renderBlackHole(v_uv);",
    "}"
  ].join("\n");

  /* ------------------------------------------------------------------------
     Utility Helpers
     ------------------------------------------------------------------------ */
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function isLitePerf() {
    return document.documentElement.getAttribute("data-perf") === "lite";
  }

  function readStoredMode() {
    const attr = document.documentElement.getAttribute("data-bh-mode");
    if (attr === "mono" || attr === "spectrum") return attr;
    try {
      const saved = localStorage.getItem(STORAGE_MODE_KEY);
      if (saved === "mono" || saved === "spectrum") return saved;
    } catch (_) {
      /* localStorage unavailable in strict sandbox */
    }
    return "spectrum";
  }

  function writeStoredMode(mode) {
    document.documentElement.setAttribute("data-bh-mode", mode);
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode);
    } catch (_) {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------------------
     Vector Math for Camera Orthonormal Basis
     ------------------------------------------------------------------------ */
  function normalize3(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function cross3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function rotateAroundAxis(v, axis, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const k = axis;
    const dotKV = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const kCrossV = cross3(k, v);
    return [
      v[0] * c + kCrossV[0] * s + k[0] * dotKV * (1 - c),
      v[1] * c + kCrossV[1] * s + k[1] * dotKV * (1 - c),
      v[2] * c + kCrossV[2] * s + k[2] * dotKV * (1 - c)
    ];
  }

  /* ------------------------------------------------------------------------
     Engine State
     ------------------------------------------------------------------------ */
  let canvas = null;
  let gl = null;
  let isWebGL2 = false;
  let program = null;
  let vbo = null;
  let uniforms = {};
  let aPosLoc = -1;

  let ctx2d = null;
  let stars2d = [];

  let rafId = 0;
  let running = false;
  let contextLost = false;
  let startClock = performance.now();
  let lastFrameMs = 0;
  let simTime = 0;

  /* Adaptive 60fps Resolution Governor (0.60x - 1.00x) */
  const coarseDevice = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  let resScale = coarseDevice ? 0.74 : 0.90;
  let frameAccumMs = 0;
  let frameSamples = 0;
  let lastScaleAdjustMs = 0;

  /* Scroll & Pointer Camera State */
  let rawScrollProgress = 0;
  let dampedScroll = 0;
  let rawScrollY = 0;
  let dampedScrollY = 0;
  let ptrTargetX = 0;
  let ptrTargetY = 0;
  let ptrX = 0;
  let ptrY = 0;

  /* Mode blend: 0.0 = NASA Relativistic Spectrum, 1.0 = Monochrome Singularity */
  let targetMono = 0;
  let currentMono = 0;

  /* Current Singularity Projection in CSS Viewport Coordinates */
  let singScreenX = 0;
  let singScreenY = 0;
  let singShadowPx = 60;
  let currentCamR = 26.0;
  let currentInclinationDeg = 11.5;

  /* Spaghettifying Word Registry */
  let words = [];
  let wordsMeasured = false;

  /* Telemetry DOM Cache */
  let hudEls = null;

  /* ------------------------------------------------------------------------
     WebGL2 / WebGL1 Initialization + Context Recovery + 2D Fallback
     ------------------------------------------------------------------------ */
  function compileShader(glCtx, type, source) {
    const sh = glCtx.createShader(type);
    if (!sh) return null;
    glCtx.shaderSource(sh, source);
    glCtx.compileShader(sh);
    if (!glCtx.getShaderParameter(sh, glCtx.COMPILE_STATUS)) {
      glCtx.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function createProgram(glCtx, vertSrc, fragSrc) {
    const vs = compileShader(glCtx, glCtx.VERTEX_SHADER, vertSrc);
    const fs = compileShader(glCtx, glCtx.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) {
      if (vs) glCtx.deleteShader(vs);
      if (fs) glCtx.deleteShader(fs);
      return null;
    }
    const prog = glCtx.createProgram();
    glCtx.attachShader(prog, vs);
    glCtx.attachShader(prog, fs);
    glCtx.linkProgram(prog);
    glCtx.deleteShader(vs);
    glCtx.deleteShader(fs);
    if (!glCtx.getProgramParameter(prog, glCtx.LINK_STATUS)) {
      glCtx.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  function setupGLResources() {
    if (!gl) return false;
    program = isWebGL2
      ? createProgram(gl, VERT_GL2, FRAG_GL2)
      : createProgram(gl, VERT_GL1, FRAG_GL1);

    if (!program && isWebGL2) {
      program = createProgram(gl, VERT_GL1, FRAG_GL1);
    }
    if (!program) return false;

    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    /* Single fullscreen triangle: zero diagonal quad-seam overshading */
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1.0, -1.0, 3.0, -1.0, -1.0, 3.0]),
      gl.STATIC_DRAW
    );

    aPosLoc = gl.getAttribLocation(program, "a_pos");
    uniforms = {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      camPos: gl.getUniformLocation(program, "u_camPos"),
      camRight: gl.getUniformLocation(program, "u_camRight"),
      camUp: gl.getUniformLocation(program, "u_camUp"),
      camFwd: gl.getUniformLocation(program, "u_camFwd"),
      lensOffset: gl.getUniformLocation(program, "u_lensOffset"),
      fovScale: gl.getUniformLocation(program, "u_fovScale"),
      spin: gl.getUniformLocation(program, "u_spin"),
      mono: gl.getUniformLocation(program, "u_mono"),
      quality: gl.getUniformLocation(program, "u_quality")
    };

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    return true;
  }

  function initFallback2D() {
    ctx2d = canvas.getContext("2d", { alpha: false });
    if (!ctx2d) return false;
    stars2d = [];
    for (let i = 0; i < 180; i++) {
      stars2d.push({
        u: Math.random() * 2 - 1,
        v: Math.random() * 2 - 1,
        r: Math.random() * 1.4 + 0.35,
        lum: Math.random() * 0.75 + 0.25
      });
    }
    return true;
  }

  function mountCanvas() {
    canvas = document.getElementById("pik-blackhole-canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "pik-blackhole-canvas";
      canvas.className = "bh-canvas";
      canvas.setAttribute("aria-hidden", "true");
      document.body.insertBefore(canvas, document.body.firstChild);
    } else {
      canvas.classList.add("bh-canvas");
      canvas.setAttribute("aria-hidden", "true");
    }

    const glAttribs = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false
    };

    try {
      gl = canvas.getContext("webgl2", glAttribs);
      if (gl) isWebGL2 = true;
    } catch (_) {
      gl = null;
    }

    if (!gl) {
      try {
        gl = canvas.getContext("webgl", glAttribs) || canvas.getContext("experimental-webgl", glAttribs);
        isWebGL2 = false;
      } catch (_) {
        gl = null;
      }
    }

    if (gl && setupGLResources()) {
      canvas.addEventListener("webglcontextlost", function (ev) {
        ev.preventDefault();
        contextLost = true;
        stopLoop();
      });
      canvas.addEventListener("webglcontextrestored", function () {
        contextLost = false;
        if (setupGLResources()) {
          resizeCanvas();
          startLoop();
        }
      });
      document.documentElement.classList.add("has-blackhole-gl");
      return true;
    }

    gl = null;
    if (initFallback2D()) {
      document.documentElement.classList.add("has-blackhole-gl");
      return true;
    }
    return false;
  }

  function resizeCanvas() {
    if (!canvas) return;
    const vw = Math.max(window.innerWidth || 1, 1);
    const vh = Math.max(window.innerHeight || 1, 1);
    const dprCap = isLitePerf() ? 1.15 : 1.75;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const effectiveScale = isLitePerf() ? Math.min(resScale, 0.70) : resScale;
    const targetW = Math.max(1, Math.round(vw * dpr * effectiveScale));
    const targetH = Math.max(1, Math.round(vh * dpr * effectiveScale));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      if (gl && !contextLost) {
        gl.viewport(0, 0, targetW, targetH);
      } else if (ctx2d) {
        ctx2d.setTransform(targetW / vw, 0, 0, targetH / vh, 0, 0);
      }
    }
  }

  /* ------------------------------------------------------------------------
     Canvas2D Relativistic Fallback Renderer (when WebGL is disabled)
     ------------------------------------------------------------------------ */
  function renderFallback2D() {
    if (!ctx2d) return;
    const vw = Math.max(window.innerWidth || 1, 1);
    const vh = Math.max(window.innerHeight || 1, 1);
    ctx2d.fillStyle = "#000000";
    ctx2d.fillRect(0, 0, vw, vh);

    const cx = singScreenX;
    const cy = singScreenY;
    const rSh = Math.max(singShadowPx, 18);
    const mono = currentMono > 0.5;

    /* Einstein-deflected background stars */
    for (let i = 0; i < stars2d.length; i++) {
      const s = stars2d[i];
      const sx = (s.u * 0.5 + 0.5) * vw;
      const sy = (s.v * 0.5 + 0.5) * vh;
      const dx = sx - cx;
      const dy = sy - cy;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < rSh * 1.02) continue;
      const deflect = (rSh * rSh * 0.85) / Math.max(dist, rSh);
      const lx = cx + (dx / dist) * (dist + deflect * 0.35);
      const ly = cy + (dy / dist) * (dist + deflect * 0.35);
      ctx2d.fillStyle = "rgba(255,255,255," + (s.lum * 0.7).toFixed(2) + ")";
      ctx2d.beginPath();
      ctx2d.arc(lx, ly, s.r, 0, Math.PI * 2);
      ctx2d.fill();
    }

    /* Upper and lower gravitationally lensed arches */
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.rotate(-0.18);

    const archGrad = ctx2d.createRadialGradient(0, 0, rSh * 0.95, 0, 0, rSh * 2.55);
    archGrad.addColorStop(0, "rgba(255,255,255,0.92)");
    archGrad.addColorStop(0.22, mono ? "rgba(212,212,216,0.55)" : "rgba(255,205,138,0.58)");
    archGrad.addColorStop(0.65, mono ? "rgba(120,120,130,0.12)" : "rgba(215,105,40,0.14)");
    archGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx2d.fillStyle = archGrad;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, rSh * 2.55, 0, Math.PI * 2);
    ctx2d.fill();

    /* Event horizon shadow */
    ctx2d.fillStyle = "#000000";
    ctx2d.beginPath();
    ctx2d.arc(0, 0, rSh, 0, Math.PI * 2);
    ctx2d.fill();

    /* Critical photon ring */
    ctx2d.strokeStyle = mono ? "rgba(255,255,255,0.92)" : "rgba(255,244,224,0.95)";
    ctx2d.lineWidth = Math.max(1.5, rSh * 0.032);
    ctx2d.beginPath();
    ctx2d.arc(0, 0, rSh * 1.02, 0, Math.PI * 2);
    ctx2d.stroke();

    /* Foreground Keplerian accretion disk with Doppler bright left limb */
    ctx2d.scale(1, 0.24);
    const diskGrad = ctx2d.createLinearGradient(-rSh * 4.2, 0, rSh * 4.2, 0);
    diskGrad.addColorStop(0, "rgba(255,255,255,0)");
    diskGrad.addColorStop(0.26, mono ? "rgba(255,255,255,0.95)" : "rgba(248,250,255,0.96)");
    diskGrad.addColorStop(0.5, mono ? "rgba(210,210,216,0.62)" : "rgba(255,204,132,0.68)");
    diskGrad.addColorStop(0.78, mono ? "rgba(120,120,128,0.28)" : "rgba(204,88,32,0.34)");
    diskGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx2d.strokeStyle = diskGrad;
    ctx2d.lineWidth = rSh * 0.85;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, rSh * 2.5, 0.06, Math.PI - 0.06);
    ctx2d.stroke();
    ctx2d.restore();
  }

  /* ------------------------------------------------------------------------
     Scroll-Driven Tidal Spaghettification Typography Engine
     ------------------------------------------------------------------------ */
  const SKIP_TAGS = {
    A: 1,
    BUTTON: 1,
    INPUT: 1,
    SELECT: 1,
    TEXTAREA: 1,
    SCRIPT: 1,
    STYLE: 1,
    SVG: 1,
    CODE: 1,
    PRE: 1
  };

  function hasInteractiveAncestor(node, rootStop) {
    let cur = node;
    while (cur && cur !== rootStop && cur !== document.body) {
      if (cur.nodeType === 1) {
        if (SKIP_TAGS[cur.tagName]) return true;
        if (
          cur.classList.contains("btn") ||
          cur.classList.contains("bh-word") ||
          cur.hasAttribute("data-no-gravity") ||
          cur.closest(".site-header, .site-footer, .bh-topnav-wrap, .bh-hud, .bh-outro")
        ) {
          return true;
        }
      }
      cur = cur.parentNode;
    }
    return false;
  }

  function isFlexOrGridBox(el) {
    if (!el || el.nodeType !== 1) return false;
    const disp = window.getComputedStyle(el).display || "";
    return disp.indexOf("flex") !== -1 || disp.indexOf("grid") !== -1;
  }

  function registerWordSpan(span, indexSeed) {
    const hash = Math.sin(indexSeed * 12.9898 + 78.233) * 43758.5453;
    const frac = hash - Math.floor(hash);
    words.push({
      el: span,
      docX: 0,
      docY: 0,
      seed: frac,
      t: 0,
      active: false
    });
  }

  function tokenizeElement(targetEl) {
    if (!targetEl || targetEl.getAttribute("data-bh-tokenized") === "1") return;
    if (hasInteractiveAncestor(targetEl, document.body)) return;

    targetEl.setAttribute("data-bh-tokenized", "1");

    /* Preserve [data-count] live counter elements without mutating their child textNode */
    if (targetEl.hasAttribute("data-count")) {
      targetEl.classList.add("bh-word");
      registerWordSpan(targetEl, words.length + 1);
      return;
    }

    const walker = document.createTreeWalker(targetEl, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) {
      if (!current.nodeValue || !/\S/.test(current.nodeValue)) continue;
      if (hasInteractiveAncestor(current.parentNode, targetEl)) continue;
      textNodes.push(current);
    }

    for (let i = 0; i < textNodes.length; i++) {
      const textNode = textNodes[i];
      const parent = textNode.parentNode;
      if (!parent) continue;

      const parts = textNode.nodeValue.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      /* Wrap inside .bh-text-run when parent is inline-flex/grid so flex gap never expands spaces */
      const host = isFlexOrGridBox(parent) ? document.createElement("span") : frag;
      if (host !== frag) {
        host.className = "bh-text-run";
      }

      for (let p = 0; p < parts.length; p++) {
        const token = parts[p];
        if (!token) continue;
        if (/^\s+$/.test(token)) {
          host.appendChild(document.createTextNode(token));
        } else {
          const span = document.createElement("span");
          span.className = "bh-word";
          span.textContent = token;
          host.appendChild(span);
          registerWordSpan(span, words.length + 1);
        }
      }

      if (host !== frag) {
        frag.appendChild(host);
      }
      parent.replaceChild(frag, textNode);
    }
  }

  function discoverGravityTargets() {
    const selectors = [
      "[data-gravity-text]",
      ".page h1",
      ".page h2",
      ".page .u-eyebrow",
      ".page .u-lede",
      ".page .p-badge",
      ".page .counter-value",
      ".page .stat-cap"
    ];
    const nodes = document.querySelectorAll(selectors.join(", "));
    for (let i = 0; i < nodes.length; i++) {
      tokenizeElement(nodes[i]);
    }
    measureWordPositions();
  }

  /* Transform-immune layout offset walk: zero interference from .reveal or .bh-word transforms */
  function measureWordPositions() {
    if (!words.length) return;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const el = w.el;
      let ox = 0;
      let oy = 0;
      let cur = el;
      while (cur && cur.nodeType === 1) {
        ox += cur.offsetLeft || 0;
        oy += cur.offsetTop || 0;
        cur = cur.offsetParent;
      }
      w.docX = ox + (el.offsetWidth || 0) * 0.5;
      w.docY = oy + (el.offsetHeight || 0) * 0.5;
    }
    wordsMeasured = true;
  }

  function resetAllWords() {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.active || w.t > 0) {
        w.t = 0;
        w.active = false;
        w.el.classList.remove("is-capturing");
        w.el.style.transform = "";
        w.el.style.opacity = "";
        w.el.style.filter = "";
      }
    }
  }

  function updateSpaghettification(dt, vh, reduced) {
    if (!wordsMeasured || !words.length) return;
    if (reduced) {
      resetAllWords();
      return;
    }

    const scrollY = dampedScrollY;
    /* Keep hero 100% crisp at rest (scrollY == 0); unlock tidal capture smoothly as user scrolls */
    const heroGate = smoothstep(10, 95, scrollY);
    const captureZoneTop = vh * 0.37;
    const captureSpan = Math.max(vh * 0.44, 240);
    const damp = 1 - Math.exp(-dt * 11.5);
    const cx = singScreenX;
    const cy = singScreenY;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const restX = w.docX;
      const restY = w.docY - scrollY;

      /* Quick cull for words far below the capture horizon and already at rest */
      if (restY > captureZoneTop + 80 && w.t < 0.0015 && w.docY >= vh * 0.72) {
        if (w.active) {
          w.active = false;
          w.t = 0;
          w.el.classList.remove("is-capturing");
          w.el.style.transform = "";
          w.el.style.opacity = "";
          w.el.style.filter = "";
        }
        continue;
      }

      let targetT = 0;
      if (w.docY < vh * 0.72) {
        /* Above-the-fold hero words: pristine at scrollY=0, spaghettify smoothly on scroll */
        const startPx = 18 + w.seed * 46 + Math.max(0, w.docY - vh * 0.18) * 0.32;
        targetT = clamp((scrollY - startPx) / (vh * 0.45), 0, 1) * heroGate;
      } else {
        /* Below-the-fold words: 100% readable in lower/mid viewport, captured entering upper zone */
        const wordTriggerY = captureZoneTop - (w.seed - 0.5) * 38;
        targetT = clamp((wordTriggerY - restY) / captureSpan, 0, 1) * heroGate;
      }

      w.t += (targetT - w.t) * damp;

      if (w.t < 0.0012 && targetT === 0) {
        if (w.active) {
          w.t = 0;
          w.active = false;
          w.el.classList.remove("is-capturing");
          w.el.style.transform = "";
          w.el.style.opacity = "";
          w.el.style.filter = "";
        }
        continue;
      }

      if (!w.active) {
        w.active = true;
        w.el.classList.add("is-capturing");
      }

      const t = clamp(w.t, 0, 1);
      const rx0 = restX - cx;
      const ry0 = restY - cy;
      const r0 = Math.hypot(rx0, ry0) || 1;
      const theta0 = Math.atan2(ry0, rx0);

      /* Relativistic infalling spiral geodesic with Kerr frame-dragging swirl */
      const easeInfall = t * t * (0.62 + 0.38 * t);
      const swirlAngle = -(1.95 * t * t + 0.55 * t * (0.65 + 0.7 * w.seed));
      const theta = theta0 + swirlAngle;
      const photonRingHold = singShadowPx * 0.55 * Math.sin(Math.PI * t) * 0.32;
      const rNow = r0 * (1 - easeInfall) + photonRingHold * (1 - t);

      /* Inclined orbital compression as matter joins the tilted accretion flow */
      const diskFlatten = 1 - 0.42 * smoothstep(0.25, 0.92, t);
      const orbitX = Math.cos(theta) * rNow;
      const orbitY = Math.sin(theta) * rNow * diskFlatten;
      const tiltRad = -0.17;
      const cosT = Math.cos(tiltRad);
      const sinT = Math.sin(tiltRad);
      const curX = cx + orbitX * cosT - orbitY * sinT;
      const curY = cy + orbitX * sinT + orbitY * cosT;

      const dx = curX - restX;
      const dy = curY - restY;

      /* Radial tidal stretching toward (cx, cy) + tangential spaghettification squeeze.
         Fold radial axis into [-PI/2, PI/2] so words never flip upside-down on entry. */
      let radialAxis = Math.atan2(cy - curY, cx - curX);
      if (radialAxis > Math.PI * 0.5) radialAxis -= Math.PI;
      if (radialAxis < -Math.PI * 0.5) radialAxis += Math.PI;

      const alignWeight = smoothstep(0.04, 0.42, t);
      const rotRad = radialAxis * alignWeight - 0.38 * t * t;
      const stretchRadial = 1 + 4.35 * Math.pow(t, 1.62);
      const compressTangential = Math.max(0.18, 1 - 0.82 * Math.pow(t, 1.32));

      /* Gravitational redshift fade & photon-sphere blur right across the horizon */
      const opacity = t < 0.52 ? 1 : Math.max(0, 1 - Math.pow((t - 0.52) / 0.48, 1.55));
      const blurPx = t > 0.60 ? (t - 0.60) * 8.5 : 0;

      w.el.style.transform =
        "translate3d(" +
        dx.toFixed(2) +
        "px," +
        dy.toFixed(2) +
        "px,0) rotate(" +
        rotRad.toFixed(3) +
        "rad) scale(" +
        stretchRadial.toFixed(3) +
        "," +
        compressTangential.toFixed(3) +
        ")";
      w.el.style.opacity = opacity.toFixed(3);
      w.el.style.filter = blurPx > 0.08 ? "blur(" + blurPx.toFixed(2) + "px)" : "";
    }
  }

  /* ------------------------------------------------------------------------
     Telemetry HUD & Interactive Controls (blackhole.html + global mode API)
     ------------------------------------------------------------------------ */
  function cacheHudElements() {
    hudEls = {
      dist: document.querySelector("[data-bh-dist]"),
      dilation: document.querySelector("[data-bh-dilation]"),
      redshift: document.querySelector("[data-bh-redshift]"),
      shear: document.querySelector("[data-bh-shear]"),
      inclination: document.querySelector("[data-bh-inclination]"),
      regime: document.querySelector("[data-bh-regime]"),
      scrollFill: document.querySelector(".bh-scroll-fill"),
      modeBtns: document.querySelectorAll("[data-bh-toggle-mode]"),
      modeLabels: document.querySelectorAll("[data-bh-mode-label]"),
      plungeBtns: document.querySelectorAll("[data-bh-plunge]"),
      plungeLabels: document.querySelectorAll("[data-bh-plunge-label]"),
      milestoneBtns: document.querySelectorAll("[data-bh-jump]")
    };
  }

  function syncModeUI(mode) {
    targetMono = mode === "mono" ? 1.0 : 0.0;
    if (!hudEls) return;
    const isMono = mode === "mono";
    hudEls.modeBtns.forEach(function (btn) {
      btn.setAttribute("aria-pressed", isMono ? "true" : "false");
    });
    hudEls.modeLabels.forEach(function (lbl) {
      lbl.textContent = isMono ? "Monochrome" : "NASA Spectrum";
    });
  }

  function setMode(mode) {
    const clean = mode === "mono" ? "mono" : "spectrum";
    writeStoredMode(clean);
    syncModeUI(clean);
  }

  function toggleMode() {
    const next = targetMono > 0.5 ? "spectrum" : "mono";
    setMode(next);
    return next;
  }

  function bindControls() {
    cacheHudElements();
    const initialMode = readStoredMode();
    writeStoredMode(initialMode);
    currentMono = initialMode === "mono" ? 1.0 : 0.0;
    syncModeUI(initialMode);

    document.addEventListener("click", function (ev) {
      const modeBtn = ev.target.closest("[data-bh-toggle-mode]");
      if (modeBtn) {
        ev.preventDefault();
        toggleMode();
        return;
      }

      const plungeBtn = ev.target.closest("[data-bh-plunge]");
      if (plungeBtn) {
        ev.preventDefault();
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight
        );
        const atHorizon = rawScrollProgress > 0.86;
        window.scrollTo({
          top: atHorizon ? 0 : maxScroll,
          behavior: prefersReducedMotion() ? "auto" : "smooth"
        });
        return;
      }

      const jumpBtn = ev.target.closest("[data-bh-jump]");
      if (jumpBtn) {
        ev.preventDefault();
        const targetId = jumpBtn.getAttribute("data-bh-jump");
        if (targetId === "horizon") {
          const maxS = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo({ top: maxS, behavior: prefersReducedMotion() ? "auto" : "smooth" });
          return;
        }
        const sec = targetId ? document.getElementById(targetId) : null;
        if (sec) {
          sec.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
        }
      }
    });

    /* React if external code mutates html[data-bh-mode] or html[data-perf] */
    if ("MutationObserver" in window) {
      const mo = new MutationObserver(function (mutations) {
        for (let i = 0; i < mutations.length; i++) {
          const attr = mutations[i].attributeName;
          if (attr === "data-bh-mode") {
            const m = document.documentElement.getAttribute("data-bh-mode");
            if (m === "mono" || m === "spectrum") syncModeUI(m);
          } else if (attr === "data-perf") {
            resizeCanvas();
          }
        }
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bh-mode", "data-perf"] });
    }
  }

  function updateTelemetryHUD() {
    if (!hudEls) return;
    const p = clamp(dampedScroll, 0, 1);

    if (hudEls.scrollFill) {
      hudEls.scrollFill.style.transform = "scaleX(" + p.toFixed(4) + ")";
    }

    if (hudEls.plungeLabels && hudEls.plungeLabels.length) {
      const nearEnd = p > 0.86;
      hudEls.plungeLabels.forEach(function (el) {
        el.textContent = nearEnd ? "Return to Orbit" : "Plunge to Horizon";
      });
    }

    if (!hudEls.dist) return;

    /* Telemetry proper radial probe approaches 1.02 r_s at maximum horizon plunge */
    const probeR = 1.02 + 24.98 * Math.pow(1 - p, 1.92);
    const metricFactor = Math.max(1 - 1 / probeR, 0.004);
    const timeDilation = Math.sqrt(metricFactor);
    const redshift = 1 / timeDilation - 1;
    const tidalShear = Math.pow(1 / probeR, 3) * 14.2;

    hudEls.dist.textContent = probeR.toFixed(2) + " r_s";
    if (hudEls.dilation) hudEls.dilation.textContent = timeDilation.toFixed(3) + " c";
    if (hudEls.redshift) {
      hudEls.redshift.textContent = redshift > 9.99 ? "+" + redshift.toFixed(1) : "+" + redshift.toFixed(3);
    }
    if (hudEls.shear) {
      hudEls.shear.textContent =
        tidalShear >= 10 ? tidalShear.toFixed(1) + " E0" : tidalShear.toFixed(3) + " E0";
    }
    if (hudEls.inclination) {
      hudEls.inclination.textContent = currentInclinationDeg.toFixed(1) + "°";
    }

    if (hudEls.regime) {
      let label = "Far-Field Orbit";
      if (probeR <= 1.55) label = "Event Horizon Rim";
      else if (probeR <= 3.3) label = "Photon Sphere";
      else if (probeR <= 7.5) label = "ISCO Accretion";
      else if (probeR <= 15.5) label = "Einstein Lensing";
      hudEls.regime.textContent = label;
    }

    if (hudEls.milestoneBtns && hudEls.milestoneBtns.length) {
      let activeIdx = 0;
      if (p >= 0.80) activeIdx = 4;
      else if (p >= 0.58) activeIdx = 3;
      else if (p >= 0.36) activeIdx = 2;
      else if (p >= 0.16) activeIdx = 1;
      hudEls.milestoneBtns.forEach(function (btn, idx) {
        btn.classList.toggle("is-active", idx === activeIdx);
      });
    }
  }

  /* ------------------------------------------------------------------------
     Camera Plunge Trajectory & Main Render Loop
     ------------------------------------------------------------------------ */
  function readScrollState() {
    const scrollEl = document.scrollingElement || document.documentElement;
    rawScrollY = window.scrollY || scrollEl.scrollTop || 0;
    const maxScroll = Math.max(1, scrollEl.scrollHeight - window.innerHeight);
    rawScrollProgress = clamp(rawScrollY / maxScroll, 0, 1);
  }

  function updateAdaptiveResolution(dtMs, nowMs) {
    frameAccumMs += dtMs;
    frameSamples++;
    if (frameSamples < 24) return;

    const avgMs = frameAccumMs / frameSamples;
    frameAccumMs = 0;
    frameSamples = 0;

    if (nowMs - lastScaleAdjustMs < 1400) return;

    if (avgMs > 20.5 && resScale > 0.60) {
      resScale = Math.max(0.60, +(resScale - 0.08).toFixed(2));
      lastScaleAdjustMs = nowMs;
      resizeCanvas();
    } else if (avgMs < 13.0 && resScale < 1.0 && !isLitePerf() && !coarseDevice) {
      resScale = Math.min(1.0, +(resScale + 0.04).toFixed(2));
      lastScaleAdjustMs = nowMs;
      resizeCanvas();
    }
  }

  function renderFrame(nowMs) {
    if (!running) return;
    rafId = requestAnimationFrame(renderFrame);

    if (!lastFrameMs) lastFrameMs = nowMs;
    const rawDtMs = nowMs - lastFrameMs;
    lastFrameMs = nowMs;
    const dtMs = clamp(rawDtMs, 1, 64);
    const dt = dtMs * 0.001;

    updateAdaptiveResolution(dtMs, nowMs);
    readScrollState();

    const reduced = prefersReducedMotion();
    const scrollSmooth = reduced ? 1 : 1 - Math.exp(-dt * 8.5);
    dampedScroll += (rawScrollProgress - dampedScroll) * scrollSmooth;
    dampedScrollY += (rawScrollY - dampedScrollY) * (reduced ? 1 : 1 - Math.exp(-dt * 14.0));

    const ptrSmooth = 1 - Math.exp(-dt * 5.0);
    ptrX += (ptrTargetX - ptrX) * ptrSmooth;
    ptrY += (ptrTargetY - ptrY) * ptrSmooth;

    currentMono += (targetMono - currentMono) * (1 - Math.exp(-dt * 7.5));
    simTime += reduced ? dt * 0.18 : dt;

    const vw = Math.max(window.innerWidth || 1, 1);
    const vh = Math.max(window.innerHeight || 1, 1);
    const aspect = vw / vh;
    const p = clamp(dampedScroll, 0, 1);
    const isDedicatedPage = document.body && document.body.getAttribute("data-page") === "blackhole";

    /* Radial plunge: 26 r_s far-field -> 2.75 r_s (home) / 2.35 r_s (singularity page) */
    const minCamR = isDedicatedPage ? 2.35 : 2.75;
    currentCamR = minCamR + (26.0 - minCamR) * Math.pow(1 - p, 1.78);

    /* Inclination above accretion plane + subtle pointer parallax & orbital azimuth */
    const baseInclDeg = 12.2 - 5.4 * smoothstep(0.0, 0.92, p) + (reduced ? 0 : ptrY * -3.2);
    currentInclinationDeg = clamp(baseInclDeg, 3.8, 22.0);
    const inclRad = (currentInclinationDeg * Math.PI) / 180;
    const azimRad = -0.35 + p * (isDedicatedPage ? 1.85 : 1.35) + simTime * 0.032 + (reduced ? 0 : ptrX * 0.16);

    const cosInc = Math.cos(inclRad);
    const camPos = [
      currentCamR * cosInc * Math.sin(azimRad),
      currentCamR * Math.sin(inclRad),
      currentCamR * cosInc * Math.cos(azimRad)
    ];

    const camFwd = normalize3([-camPos[0], -camPos[1], -camPos[2]]);
    let camRight = normalize3(cross3(camFwd, [0, 1, 0]));
    let camUp = normalize3(cross3(camRight, camFwd));

    /* Cinematic Gargantua roll angle that levels slightly approaching the horizon */
    const rollRad = (-11.5 * (1 - 0.55 * p) + (reduced ? 0 : ptrX * 2.2)) * (Math.PI / 180);
    camRight = rotateAroundAxis(camRight, camFwd, rollRad);
    camUp = rotateAroundAxis(camUp, camFwd, rollRad);

    /* Subtle hero framing on wide screens: offset right behind hero stage at top, glide to center on scroll */
    const wideHeroOffset =
      !isDedicatedPage && vw >= 920 ? 0.28 * aspect * (1 - smoothstep(0.0, 0.34, p)) : 0;
    const lensOffsetX = wideHeroOffset + (reduced ? 0 : ptrX * 0.035);
    const lensOffsetY = !isDedicatedPage ? 0.04 * (1 - p) : 0.02 * (1 - p);

    const fovScale = 0.56 + 0.10 * smoothstep(0.35, 1.0, p);

    /* Exact projected screen-space coordinates of the singularity (0,0,0) */
    singScreenX = vw * (0.5 + 0.5 * (lensOffsetX / aspect));
    singScreenY = vh * (0.5 - 0.5 * lensOffsetY);

    /* Apparent shadow pixel radius from exact Schwarzschild angular shadow formula */
    const lapse = Math.sqrt(Math.max(1 - 1 / currentCamR, 0.06));
    const sinShadow = clamp((2.598076 * lapse) / currentCamR, 0.02, 0.96);
    const tanShadow = sinShadow / Math.sqrt(Math.max(1 - sinShadow * sinShadow, 0.05));
    singShadowPx = (tanShadow / fovScale) * (vh * 0.5);

    if (gl && !contextLost && program) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uniforms.res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, simTime);
      gl.uniform3f(uniforms.camPos, camPos[0], camPos[1], camPos[2]);
      gl.uniform3f(uniforms.camRight, camRight[0], camRight[1], camRight[2]);
      gl.uniform3f(uniforms.camUp, camUp[0], camUp[1], camUp[2]);
      gl.uniform3f(uniforms.camFwd, camFwd[0], camFwd[1], camFwd[2]);
      gl.uniform2f(uniforms.lensOffset, lensOffsetX, lensOffsetY);
      gl.uniform1f(uniforms.fovScale, fovScale);
      gl.uniform1f(uniforms.spin, 0.28);
      gl.uniform1f(uniforms.mono, currentMono);
      gl.uniform1i(uniforms.quality, isLitePerf() || resScale < 0.68 ? 0 : 1);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (ctx2d) {
      renderFallback2D();
    }

    updateSpaghettification(dt, vh, reduced);
    updateTelemetryHUD();
  }

  function startLoop() {
    if (running || contextLost || document.hidden) return;
    running = true;
    lastFrameMs = 0;
    rafId = requestAnimationFrame(renderFrame);
  }

  function stopLoop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  /* ------------------------------------------------------------------------
     Bootstrapping & Event Listeners
     ------------------------------------------------------------------------ */
  function init() {
    if (!mountCanvas()) return;

    /* Pause legacy 2D particle canvas on index.html if running to save CPU/GPU */
    if (window.PIK3D && typeof window.PIK3D.stop === "function") {
      try {
        window.PIK3D.stop(true);
      } catch (_) {
        /* ignore */
      }
    }

    bindControls();
    resizeCanvas();
    readScrollState();
    dampedScroll = rawScrollProgress;
    dampedScrollY = rawScrollY;

    discoverGravityTargets();
    /* Re-measure once fonts/chrome finish settling */
    setTimeout(measureWordPositions, 260);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measureWordPositions).catch(function () {});
    }

    let resizeTimer = 0;
    window.addEventListener(
      "resize",
      function () {
        resizeCanvas();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(measureWordPositions, 90);
      },
      { passive: true }
    );

    window.addEventListener(
      "pointermove",
      function (ev) {
        const w = Math.max(window.innerWidth || 1, 1);
        const h = Math.max(window.innerHeight || 1, 1);
        ptrTargetX = (ev.clientX / w - 0.5) * 2;
        ptrTargetY = (ev.clientY / h - 0.5) * 2;
      },
      { passive: true }
    );

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    });

    document.addEventListener("pik:perftier", function () {
      resizeCanvas();
    });

    startLoop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.PIKBlackHole = {
    start: startLoop,
    stop: stopLoop,
    setMode: setMode,
    toggleMode: toggleMode,
    refreshTargets: function () {
      discoverGravityTargets();
    },
    getState: function () {
      return {
        webgl2: isWebGL2,
        webgl: !!gl,
        radiusRs: currentCamR,
        inclinationDeg: currentInclinationDeg,
        scrollProgress: dampedScroll,
        mode: targetMono > 0.5 ? "mono" : "spectrum",
        resolutionScale: resScale,
        uptimeSec: (performance.now() - startClock) * 0.001
      };
    }
  };
})();
