# Open questions

> `Q-<nn> — the question, then who it is blocking.`
> A question that nobody is blocked on is a note; a question that blocks a
> gate is a question.

## Q-01 — Where does the disk's inner edge go on screen?

*Asked of: DeepAI (prompt 01) · Blocks: the camera choreography*

The disk's inner edge is the ISCO at 1.24 M for a = 0.999, which is behind
the shadow. The first thing a reader can actually see is the disk at
~2.3 M, where the photon orbit's shadow starts to open up.

Should the camera's final plunge end *above* the disk plane (θ ≈ 1.50 rad,
as now) so the reader sees the disk wrap over the top of the shadow, or
should the last beat duck *under* the plane so the underside of the disk
fills the frame? The second is the Interstellar shot and it is much more
dramatic, but it loses the "disk seen from slightly above" reading that the
whole narrative depends on.

## Q-02 — Does the text pull read as *being eaten* or as *being glitched*?

*Asked of: DeepAI (prompt 03) · Blocks: the text-pull system (agent 4)*

The spaghettification stretches the letters into the shadow. At high scroll
speeds the interpolation can look like a rendering fault rather than
gravity. Is there a legibility floor — a maximum stretch factor, a minimum
opacity, a hard cut-off — that keeps the effect legible as gravity while
still reading as the hole pulling the page in?

## Q-03 — What is the exposure policy for the disk's approaching side?

*Asked of: DeepAI (prompt 02) · Blocks: the tone mapper*

The `g⁴` beaming puts the approaching edge of the disk several hundred
times brighter than the receding edge. With ACES and a single exposure the
receding side disappears into black — which is physically right and
dramatically gorgeous, but it means the reader sees roughly half the disk.

Options: (a) accept it, (b) add a mild local adaptation that lifts the
receding side at the cost of the contrast, (c) lower the beaming exponent
to `g³` (which is what the *specific* intensity obeys) and accept a
physically weaker but more legible image. (c) is a physics compromise and
would have to be a conscious one.

## Q-04 — Should the HUD show the Schwarzschild radius at all?

*Asked of: DeepAI (prompt 03) · Blocks: the HUD layout*

The HUD quotes `r` in M, `r` in `rₛ`, `dτ/dt`, the inclination and the
spin. The Schwarzschild radius is a derived number that a non-expert reader
cannot interpret. Is the row worth its place, or should the space go to
something the reader can feel — the free-fall proper time, or the number of
photons that have fallen in?

## Q-05 — Which GPU is the floor?

*Asked of: DeepAI (prompt 05) · Blocks: the quality governor*

The governor currently drops the resolution scale in 0.15 steps when the
average frame time exceeds 34 ms and recovers it when it falls below 19 ms.
On an integrated GPU the ray march at 1.0 scale is hopeless and at 0.25 it
is still slow. Should the governor be allowed to reduce the *step budget*
(it currently may not — that would change the physics), or should the
pre-rendered fallback (agent 6) be the answer for weak hardware?

## Q-06 — Is the sky's azimuthal frame right?

*Asked of: DeepAI (prompt 02) · Blocks: the star field*

The tracer accumulates the Boyer–Lindquist azimuth `φ` and uses it as the
sky's azimuth. The asymptotic frame's azimuth differs from the BL azimuth by
the frame-dragging twist, which is ~10⁻⁸ rad at the escape radius and
negligible — but only at the escape radius. Near the photon ring the twist
is larger, and that is exactly where the star field is most compressed.

Is the residual error visible, and does it matter?
