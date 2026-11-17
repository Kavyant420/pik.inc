# Protocol

The rules for the `READ THIS AGENT` folder. They are short on purpose: the
folder is a mailbox, not a bureaucracy.

## 1. File naming

```
YYYY-MM-DD-<slug>.md          a message or a reply
Q-<nn>-<slug>.md              a question, in QUESTIONS.md
D-<nn>-<slug>.md              a decision, in DECISIONS.md
```

`slug` is lowercase, hyphenated, and describes the *subject*, not the
thread: `2026-11-16-kerr-render-fidelity.md`, never `msg-3.md`.

## 2. Front matter

Every message in `inbox/` starts with a small YAML block. Only four keys are
recognised:

```markdown
---
to: deepai
model: deepai-chat
system: |
  One optional paragraph of standing instructions for this request.
reply-to: 2026-11-16-kerr-render-fidelity
---

# The actual request

Markdown, as long as it needs to be.
```

* `to` — always `deepai` today. It exists so a future reader can route by
  recipient.
* `model` — optional; overrides `DEEPAI_MODEL`.
* `system` — optional; the system prompt for this one request. Keep it
  short. The standing context lives in `BRIEF.md`, which is referenced, not
  pasted.
* `reply-to` — optional; set on the reply so threads can be reconstructed.

The body is the message. The bridge sends the body verbatim as the user
message.

## 3. Lifecycle

```
prompts/   ->  inbox/   ->  outbox/   ->  (a human or an agent acts)
   ready      queued       answered
```

1. A prompt is copied from `prompts/` into `inbox/` and given a date.
2. The bridge sends it and writes the answer to `outbox/` with the same
   stem plus `.reply.md`, and a front-matter block recording the model and
   the time.
3. The answer is *triaged* — see §4 — and the outcome is appended to
   `STATUS.md` and, if it changed anything, to `DECISIONS.md`.

A reply that has not been triaged is worth nothing. Triaging is the step
that turns a conversation into work.

## 4. Triaging a reply

Every reply gets exactly one verdict, written at the top of the reply file:

| Verdict | Meaning | Next step |
| --- | --- | --- |
| `ACCEPTED` | Correct and worth doing. | Do it; file a decision. |
| `PARTIAL` | Right idea, wrong detail. | Do the corrected version; file a decision. |
| `REJECTED` | Wrong, or it contradicts the architecture. | Do nothing; say why in the reply file. |
| `QUESTION` | It asks us something. | Answer it in `QUESTIONS.md`. |
| `NOTE` | Interesting, no action. | Nothing. |

Rules of thumb:

* **Physics is not negotiable.** If a reply claims a different Kerr metric,
  a different conserved-quantity convention or a different sign for the
  redshift, the reply is `REJECTED` with the reference quoted. The physics
  in `src/physics/kerr/` is validated by `tests/kerr.test.ts` and against
  `src/physics/kerr/reference.ts`, an independent 64-bit integrator.
* **The design rules are not negotiable either.** "No boxes", pure black
  background, warm white text — those come from `docs/architecture.md` §6
  and a reply that ignores them is answering a different brief.
* **Style opinions are welcome.** Typography rhythm, pacing, the shape of a
  sentence: that is exactly what DeepAI is good at.

## 5. Etiquette

* One request, one subject. Do not bundle three questions into one thread.
* Say what you already know. "Does X hold?" gets a better answer than
  "What is X?" — and a shorter one.
* Include the numbers. If the answer depends on a number (an orbit radius,
  a step count, a contrast ratio), put the number in the request.
* Do not ask DeepAI to write the code. Ask it what the code should do. The
  agents write the code; DeepAI is the reviewer.

## 6. Where the answers end up

| Verdict | Recorded in |
| --- | --- |
| `ACCEPTED` / `PARTIAL` | `DECISIONS.md` (new entry) and `STATUS.md` |
| `REJECTED` | `STATUS.md` only, with the reason |
| `QUESTION` | `QUESTIONS.md` (new entry, with the id) |
| `NOTE` | nowhere — the reply file is the record |
