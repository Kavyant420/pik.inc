# PIKX serverless API

Vercel's root directory for this project is `PIK Inc/`, so every `.js` file in
this folder is deployed as a serverless function at `/api/<name>`.

> **Do not put test files or scratch scripts in this directory.** Any `.js` here
> becomes a public HTTP endpoint. Tests live in `/tests` at the repository root,
> which is outside the Vercel root and therefore never deployed.

## `GET /api/search?q=<query>&n=<count>`

Returns real web search results as JSON so the PIKX results tab can render them
in-page instead of navigating the user to another site.

```jsonc
{
  "query": "onion routing",
  "count": 5,
  "sources": ["duckduckgo", "wikipedia"],  // which upstreams actually answered
  "results": [
    { "title": "Onion routing", "url": "https://…", "snippet": "…",
      "host": "en.wikipedia.org", "thumb": "https://…|null", "source": "wikipedia" }
  ],
  "degraded": false,   // true  => nothing at all came back
  "partial":  true,    // true  => some results, but an upstream failed
  "error":    "upstream HTTP 202"   // null when everything succeeded
}
```

Status is `200` when at least one result was found and `502` when none were.
`degraded` / `partial` / `error` exist so the UI can be honest about a failed
upstream rather than presenting it as "0 results".

### Why a server-side function is required

| Source | Reachable from browser JS? | Why |
|---|---|---|
| `html.duckduckgo.com/html/` | **No** | Sends no `Access-Control-Allow-Origin`; also 403s non-browser User-Agents |
| `en.wikipedia.org/w/api.php` | **No** (from this app) | Wikimedia 403s browser-like UAs from datacenter IPs and requires a descriptive UA per its robot policy. `User-Agent` is a *forbidden header name* in browsers, so client-side JS cannot comply |
| `api.duckduckgo.com/` (Instant Answer) | **Yes** | Sends `Access-Control-Allow-Origin: *` — but only answers *entity* queries. Verified: returns an abstract for "glassmorphism" and "onion routing", and **nothing at all** for "tor browser" or "nodejs fetch". It is a knowledge panel, not web search |

The Instant Answer API is still used directly by the client (`js/px-search.js`)
because it is instant and needs no function invocation; this endpoint is what
supplies the actual result list.

### Upstream behaviour worth knowing

- **DDG returns HTTP 202 with an anti-bot challenge page** (`anomaly.js?…&cc=botnet`)
  when it throttles an egress IP. 202 is a 2xx status, so a naive `res.ok` check
  accepts it and the caller silently reports zero results. The code requires
  `status === 200` *and* the presence of result markup, then retries.
  Expect this to fire often on Vercel's shared datacenter ranges — Wikipedia is
  what keeps the endpoint useful when it does.
- Responses are cached at the edge for 5 minutes (`s-maxage=300`). Search
  results are not user-specific, so this is safe and it cuts upstream pressure
  substantially.
- No API keys, no query logging, no user tracking.

## Verifying model and endpoint claims

`js/config.js` used to list several model ids that did not exist, which broke
the default engine for every visitor. Re-run these before trusting any id:

```bash
# Does an OpenRouter model id actually exist?
curl -s https://openrouter.ai/api/v1/models \
  | jq -r '.data[].id' | grep -F 'nvidia/nemotron-3.5-lightning:free'

# What does Pollinations really serve?
curl -s https://text.pollinations.ai/models | jq

# Is a given Pollinations model accepted? (404 == fabricated id)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://text.pollinations.ai/openai \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai-fast","messages":[{"role":"user","content":"hi"}]}'

# Does DeepInfra really accept a keyless call? (it does not — expect 401)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://api.deepinfra.com/v1/openai/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-ai/DeepSeek-V3","messages":[{"role":"user","content":"hi"}]}'
```

## Tests

```bash
node tests/search.test.js     # offline, deterministic, zero dependencies
```

The parser tests pin captured fixtures for both the DDG SERP layout and the 202
challenge page, so an upstream markup change fails in CI rather than shipping an
empty results tab.
