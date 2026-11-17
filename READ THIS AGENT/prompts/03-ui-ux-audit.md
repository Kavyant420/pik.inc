---
to: deepai
model: deepai-chat
system: |
  You are a senior product designer who designs interfaces that have to work
  with a photograph behind them. You are specific about spacing, type size
  and focus behaviour. You never suggest a box, a card, a panel or a
  background fill behind text. You answer in markdown, in at most 800 words,
  with concrete CSS-scale numbers (px, rem, em, %) rather than adjectives.
---

# UI/UX audit of the interface over a moving black hole

Read `READ THIS AGENT/BRIEF.md` for the design rules and the physics.

## What exists

A fixed full-screen WebGL2 canvas behind a scrolling column of prose. The
prose is pulled into the shadow as the camera falls.

Four overlays, all text on black, all plain text with an animated underline
and a soft `text-shadow` glow:

* **HUD** — bottom left. Five rows in a monospaced face at ~0.66–0.78 rem:
  `r` in M, `r` in `rₛ`, `dτ/dt` for the static observer, the inclination
  in degrees, and the spin `a*`. The values are smoothed exponentially.
* **Nav** — right edge, vertically centred. A list of chapter names in
  small caps with a one-pixel progress rule beside them. The active chapter
  has a full-width underline.
* **Preload veil** — a centred label and a percentage, fading out.
* **Colophon** — bottom, credits, fading in at 93 % scroll.

Type is `"Segoe UI Variable Display", "Segoe UI", Selawik, system-ui,
-apple-system, Helvetica, Arial, sans-serif` at weight 200–300, `#F5EDE4`.

## The questions

1. **The HUD.** Five rows of numbers in the corner of a photograph is a
   cockpit. Is that the right register for this page, and if not, what
   would you cut? On a 360 px phone, which rows survive?

2. **Legibility over the disk.** The prose crosses the blown-out
   approaching edge of the disk for roughly a second per beat. Without a
   panel behind it, what is the minimum treatment? Options I can implement
   in pure CSS: a `text-shadow` stack of two or three shadows at different
   radii and opacities; a `mix-blend-mode`; a per-glyph opacity ramp; a
   scroll-linked `--local-contrast` custom property. Which, and what
   numbers?

3. **Focus.** There are no outlines anywhere (the design rules forbid
   them), so keyboard focus is signalled by the underline plus the glow. Is
   that enough for WCAG 2.4.7, and what would you add for a focus-visible
   state that is obviously not a box?

4. **The nav.** The chapter list is on the right and the text column on
   the left, but on a wide screen the nav floats in the middle of the
   image. Is a fixed overlay the right pattern at all, or should the
   chapter markers live in the flow of the prose?

5. **Reduced motion.** Under `prefers-reduced-motion` the spaghettification
   is switched off, the camera moves in steps, and the HUD stops
   smoothing. What is still too much motion, and what should be added for
   people who want *less* but not *none*?

6. **One thing I have not asked about** that you would raise anyway.
