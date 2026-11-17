# inbox/

Messages waiting to be sent to DeepAI.

Copy a prompt out of `../prompts/`, rename it `YYYY-MM-DD-<slug>.md` and
edit it. The front matter needs at least a `to:` key; everything else is
optional — see `../PROTOCOL.md` §2.

```bash
cp "../prompts/03-ui-ux-audit.md" "2026-11-16-ui-ux-audit.md"
node ../../tools/deepai-bridge.mjs send "2026-11-16-ui-ux-audit.md"
```

A file in this folder that already has a reply in `../outbox/` is not sent
again by `send-all`.

The folder is empty on purpose: nothing has been sent yet, because nobody
has committed an API key.
