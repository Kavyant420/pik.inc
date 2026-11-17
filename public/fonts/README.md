# Fonts

Selawik is licensed under the **SIL Open Font License 1.1** and is served
from this repository — never from a CDN.

Drop the two files here before deploying:

| File | Weights |
| --- | --- |
| `selawik-light.woff2` | 200–300 (the weights the prose uses) |
| `selawik-regular.woff2` | 400 (the HUD and the numerals) |

Both are subsets of the Selawik family published by Microsoft under the
SIL OFL 1.1, which permits self-hosting and redistribution.

If the files are absent the `@font-face` rules in `src/styles/fonts.css`
resolve to nothing and the stack falls through to
`"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system,
Helvetica, Arial, sans-serif`. The page still works; it just does not look
identical on every machine.

The font is deliberately *not* in the repository: binary assets do not
belong in the source tree, and the licence file must travel with the
binaries.
