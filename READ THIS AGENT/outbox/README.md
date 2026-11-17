# outbox/

Replies from DeepAI.

The bridge writes one file per reply, named after the request:
`2026-11-16-ui-ux-audit.md` in `../inbox/` becomes
`2026-11-16-ui-ux-audit.reply.md` here.

A reply is worth nothing until it has been triaged. At the top of every
reply file there is a `verdict:` key in the front matter; set it to one of

* `ACCEPTED` — correct and worth doing
* `PARTIAL` — right idea, wrong detail
* `REJECTED` — wrong, or it contradicts `docs/architecture.md`
* `QUESTION` — it asks us something
* `NOTE` — interesting, no action

and write the reasoning underneath. Then record the outcome in
`../STATUS.md`, and in `../DECISIONS.md` if anything changed.

See `../PROTOCOL.md` §4.
