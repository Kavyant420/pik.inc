# READ THIS AGENT

> **This folder is the mailbox between the pik build and DeepAI.**
> Every file here is a plain `.md` file on purpose: it can be read by a
> human, diffed, committed and pasted straight into a chat window.

## What this is

`pik` is being built by several agents in parallel. DeepAI is one of the
reviewers: it is asked the questions that need a second pair of eyes —
physics, optics, typography, interaction — and its answers come back as
markdown, which is then folded into the code.

The folder is deliberately dumb. There is no database, no service, no
state machine. A `.md` file in `inbox/` is a message *to* DeepAI; the reply
lands in `outbox/` as another `.md` file. `tools/deepai-bridge.mjs` moves
the bytes.

## The map

| File | What it is |
| --- | --- |
| `README.md` | You are here. |
| `PROTOCOL.md` | The rules: file names, front matter, lifecycle. **Read this one.** |
| `BRIEF.md` | The standing context pack. Send it with every request. |
| `STATUS.md` | What exists, what is in flight, what is blocked. |
| `DECISIONS.md` | The decision log — what was chosen, why, and by whom. |
| `QUESTIONS.md` | The open questions, indexed by id (`Q-07`). |
| `prompts/` | Ready-to-send requests. Copy one into `inbox/` and edit it. |
| `inbox/` | Messages waiting to be sent to DeepAI. |
| `outbox/` | Replies from DeepAI. One file per reply. |

## Sending a message

```bash
# copy a prompt into the queue and edit it
cp "READ THIS AGENT/prompts/03-ui-ux-audit.md" "READ THIS AGENT/inbox/2026-11-16-ui-ux-audit.md"

# look at what would be sent
node tools/deepai-bridge.mjs send "READ THIS AGENT/inbox/2026-11-16-ui-ux-audit.md" --dry-run

# send it
node tools/deepai-bridge.mjs send "READ THIS AGENT/inbox/2026-11-16-ui-ux-audit.md"

# or send everything in the queue that has no reply yet
node tools/deepai-bridge.mjs send-all
```

The bridge needs an API key:

```bash
export DEEPAI_API_KEY="..."          # never commit this
# or put it in a .env file next to package.json (it is git-ignored)
```

Optional environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEEPAI_API_KEY` | — | The key. Without it the bridge refuses to send. |
| `DEEPAI_BASE_URL` | `https://api.deepai.org/chat/completions` | The endpoint. |
| `DEEPAI_MODEL` | `deepai-chat` | The model id. |
| `DEEPAI_TIMEOUT` | `180` | Seconds before the request is abandoned. |

If there is no key, or the endpoint does not answer, the bridge prints the
composed message and stops. You can then paste it into DeepAI's chat window
by hand and save the answer into `outbox/` — the protocol does not change.

## What DeepAI is *not*

DeepAI does not write into `src/`. It replies with markdown; a human (or an
agent) decides what of it is true and edits the code accordingly. Anything
DeepAI says that contradicts `docs/architecture.md` is a *proposal*, not a
decision — see `PROTOCOL.md` §4.
