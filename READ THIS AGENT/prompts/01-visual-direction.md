---
to: deepai
model: deepai-chat
system: |
  You are a director of photography and a typographer. You are precise,
  concrete and allergic to filler. You never suggest boxes, cards, panels,
  gradients or neon. You answer in markdown, in at most 700 words, and you
  end with the three changes you would make first.
---

# Visual direction for a scroll-driven Kerr black hole

Read `READ THIS AGENT/BRIEF.md` for the physics and the design rules.
This is about *the picture*, not the code.

## The shot

The page is one continuous camera move. The reader scrolls; the camera
falls from r = 400 M to r = 3.2 M along a spiral, starting 4.9° above the
equatorial plane of a Kerr hole with a = 0.999. A relativistic accretion
disk sits in that plane, its inner edge at the ISCO (1.24 M), its outer edge
at 22 M. There is no other object in the scene — no nebula, no galaxy, no
dust. Just stars, the disk, and the shadow.

The HTML text is pulled into the shadow as the camera falls.

## What I need

1. **The colour script.** The disk is a relativistic blackbody seen through
   the `g⁴` beaming factor: the approaching edge is blue-white and
   dazzling, the receding edge is deep orange and almost gone. The rest of
   the frame is black with white stars. The text is `#F5EDE4`. Does that
   palette hold together, or does the warm white of the type fight the
   orange of the receding disk? What single accent — if any — would you
   introduce, and where?

2. **The rhythm.** The scroll is the timeline. Five narrative beats, each
   one a screen or two of prose. The camera must not move at a constant
   rate or the whole thing reads as a screensaver. Where should the
   deceleration happen, and where should the reader be denied a view of the
   shadow — the one thing they came for?

3. **The last two seconds.** At r = 3.2 M the shadow fills most of the
   frame and the disk is a bright band across it. What is the *last thing*
   the reader should see, and should the frame go to black, or should the
   text be the only thing left?

4. **Type on a photograph.** Light weights and tight tracking are set. The
   prose sits over the brightest part of the image for about a second per
   beat. What is the minimum treatment that keeps a paragraph of `#F5EDE4`
   at 300 weight legible over a moving, blown-out white disk edge — with no
   panel behind it and no shadow big enough to look like a smudge?

## Constraints (hard)

* No boxes, no panels, no cards, no pills, no glass, no fills behind text.
* The background is pure `#000000`. No gradient, no lifted vignette.
* No third-party assets: no images, no webfonts, no CDN.
* Warm white `#F5EDE4` on black, WCAG AA.
