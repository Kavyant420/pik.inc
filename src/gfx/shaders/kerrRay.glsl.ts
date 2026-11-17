/**
 * The Kerr ray marcher — the heart of the renderer.
 *
 * WHAT IT DOES
 * ------------
 * For every pixel the shader:
 *
 *  1. builds a ray direction in the camera's *local orthonormal triad* (the
 *     static observer's tetrad at the camera radius),
 *  2. converts it into the conserved quantities of the null geodesic
 *     (E, L, Q),
 *  3. integrates the geodesic in **Carter time** σ (dσ = dλ/Σ), where the
 *     radial and polar motions decouple,
 *  4. and finally asks three questions: did the ray fall through the
 *     horizon (shadow), did it cross the equatorial plane inside the disk
 *     (disk emission), or did it escape (star field)?
 *
 * THE INTEGRATOR
 * --------------
 * The radial and polar motions are integrated in their **energy form**:
 *
 *     dr/dσ = ±√R(r)          du/dσ = ±√W(u)
 *
 * not in the second-order form d²r/dσ² = ½R'(r). That is a deliberate
 * choice, and it is the one that makes the renderer *correct*:
 *
 *  · In the energy form the conserved quantity R(r) is the velocity by
 *    construction, so the ray cannot gain or lose energy — the shadow's
 *    edge, which is a caustic in the impact parameter, stays exactly where
 *    the critical curve says it is.
 *  · In the second-order form the velocity is integrated separately and
 *    picks up a systematic error: with a step of h ≈ k/r the local error
 *    per step is ½·R'(r)·h², which for R ~ r⁴ is a *relative* 2·E·k ≈ 5 %
 *    of the step. Integrated over a fall that is a large energy loss: the
 *    ray turns around at a spurious "turning point" well above the hole
 *    and the shadow ends up in the wrong place.
 *  · The price of the energy form is that √R is not Lipschitz at the
 *    turning points, so the sign of the velocity has to be flipped there
 *    by hand. The shader does that by detecting that the step overshot
 *    the root of R (or W) and bisecting for it — five extra evaluations,
 *    and only on the steps that actually turn around.
 *
 * The step is h ≈ k/r, which keeps the *relative* radial step constant at
 * about k: the number of steps needed to fall from r = 400 M to the
 * photon sphere is then ~ln(400/r)/k regardless of the starting radius.
 * With k = 0.02 the crossing radius of the equatorial plane agrees with
 * the 64-bit reference integrator to about 1 %, and the ray that falls
 * into the hole needs ~170 steps.
 *
 * DOUBLE-SINGLE ARITHMETIC
 * ------------------------
 * The radial potential is evaluated with the df64 chunk (double-single,
 * ~48 significand bits). R(r) → 0 exactly at the turning points and along
 * the shadow's critical curve, and in float32 the residual would be
 * swamped by rounding long before the ray reaches the critical impact
 * parameters: the photon ring would break into a staircase of quantised
 * steps. The polar potential W(u) is well conditioned (no cancellation) and
 * stays in float32.
 *
 * See df64.glsl.ts for the arithmetic itself and docs/architecture.md §5 for
 * the invariants the renderer must never break.
 */

import { DF64_GLSL } from './df64.glsl';
import { COMMON_GLSL } from './common.glsl';
import { STARFIELD_GLSL } from './starfield.glsl';
import { DISK_GLSL } from './disk.glsl';

/** The geodesic pass fragment shader body (no #version, no precision). */
export const KERR_RAY_FRAGMENT = /* glsl */ `
uniform vec2  uResolution;   /* drawing buffer size, pixels             */
uniform float uTime;         /* seconds since the renderer started      */
uniform float uSpin;          /* a/M                                  */
uniform float uRadius;        /* camera radius r, in M                */
uniform float uTheta;         /* camera polar angle, in radians       */
uniform float uRoll;          /* camera roll about the line of sight  */
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
vec3 cameraDirection(vec2 ndc, float tanHalfFov, float roll) {
  float x = ndc.x * 2.0 * tanHalfFov;
  float y = ndc.y * 2.0 * tanHalfFov;
  /* Forward = -x (toward the hole), up = -y, right = +x (screen). Apply roll
   * about the forward axis so the frame-dragging precession twists the view. */
  float cr = cos(roll);
  float sr = sin(roll);
  vec3 d = normalize(vec3(-1.0, -y, x));
  vec3 up = vec3(0.0, -1.0, 0.0);
  vec3 right = vec3(0.0, 0.0, 1.0);
  /* Rotate up/right about forward by roll. */
  vec3 rUp = up * cr + right * sr;
  vec3 rRight = up * (-sr) + right * cr;
  return normalize(d.x * vec3(-1.0, 0.0, 0.0) + d.y * rUp + d.z * rRight);
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

  /* Relativistic aberration (the "headlight" effect). The camera is falling
   * inward at a significant fraction of c, so the incoming starlight is
   * aberrated toward the direction of motion (-e_r, toward the hole). The
   * closer to the hole, the stronger the concentration - the sky seems to
   * swirl into the shadow as the camera dives. */
  float infall = sqrt(2.0 / max(r, 2.0));           /* radial plunge speed, 0..1 */
  infall = clamp(infall, 0.0, 0.95);
  vec3 forward = normalize(vec3(-1.0, 0.0, 0.0));   /* toward the hole in the triad */
  /* Relativistic aberration: cos(theta') = (cos(theta) - v) / (1 - v*cos(theta)) */
  float mu = dot(sky, forward);
  float muAber = (mu - infall) / max(1.0 - infall * mu, 1e-6);
  /* Rebuild the direction with the aberrated polar angle, keeping azimuth. */
  float st = sqrt(max(1.0 - muAber * muAber, 0.0));
  vec3 perp = normalize(sky - forward * mu);
  sky = forward * muAber + perp * st;

  return starfield(sky, uStarBrightness, uTime);
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
`;

/**
 * The complete fragment source for the geodesic pass, ready for the
 * program builder: the double-single chunk, the shared helpers, the star
 * field, the disk model and the marcher itself.
 */
export const KERR_RAY_FRAGMENT_SOURCE =
  DF64_GLSL + COMMON_GLSL + STARFIELD_GLSL + DISK_GLSL + KERR_RAY_FRAGMENT;
