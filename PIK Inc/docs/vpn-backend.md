# PIK VPN · Backend & Device-Wide Routing

> Referenced from `js/vpn.js` and `js/proxy.js`. This document explains what the
> browser control center can honestly do, and how to go further with a real
> device-wide backend.

## 1. What runs today (browser layer)

Everything in `products/pik-vpn.html` ships as a static front-end:

| Module | File | Role |
|---|---|---|
| PIKProxy (ProxyCore) | `js/proxy.js` | Pulls live public-proxy lists (ProxyScrape + GitHub proxy-list feeds), probes real round-trip times, detects your true public IP over JSONP, verifies the exit IP seen by the internet through remote gateway echos. |
| PIKAnonymity | `js/anonymity.js` | Three-hop circuit builder over the curated relay fleet, SHA-256 hashed activity log, rotating alias identity. |
| PIKVPN | `js/vpn.js` | Control-center UI: connect/disconnect, exit picker, route rotation, guards (kill switch / DNS leak guard / auto-rotate), live transport panel. |
| Styles | `css/49-vpn.css` | Dial, stats, server rows, transport panel, option rows. |

### Hard browser limits (stated honestly in the UI)

* A normal web page **cannot redirect OS or other apps' traffic**. Browsers only
  honor the system/PAC proxy setting; `fetch()` cannot pick an arbitrary
  per-request upstream proxy.
* "Routing through server X" from a page therefore means either
  (a) the user's browser proxy settings point at X, or
  (b) an HTTPS request whose **remote server** performs the fetch
  (proxy-frontend pattern — used for the exit-IP verification).
* The page-scoped guarantees are: measured latencies, verified real vs. exit
  IP, hashed local-only activity records, and a kill-switch flag that gates
  every PIK app's network call while connected.

For device-wide routing you need one of the backends below.

## 2. Device-wide options

### Option A — System proxy (zero install)

Point the OS/browser proxy at any fleet entry (`host:port`, HTTP/HTTPS, elite
anonymity as filtered by the feed query):

```
Settings → Network → Proxy → Manual
  HTTP/HTTPS proxy: <exit host>   Port: <exit port>
```

The control center's measured latency then *is* your routed latency, and the
"Tunnel exit seen by internet" row confirms masking end-to-end.

### Option B — WireGuard profile generator (recommended)

Run a small gateway per relay region and hand users a `.conf` profile. The
control center already persists everything needed to build one:

```js
// pik.vpn.state  (localStorage)
{ connected, exitName, killSwitch, dnsLeakGuard, autoRotate, since, bytesUp, bytesDown }
```

Example generator (server-side, pseudocode):

```bash
PRIV=$(wg genkey)
PUB=$(echo "$PRIV" | wg pubkey)
cat > pik-vpn.conf <<EOF
[Interface]
PrivateKey = $PRIV
Address = 10.66.0.42/32
DNS = 10.66.0.1                     # dnsLeakGuard -> resolver only via tunnel
Table = auto

[Peer]
PublicKey = <gateway-pubkey>
AllowedIPs = 0.0.0.0/0, ::/0       # killSwitch -> default-deny outside tunnel
Endpoint = <exit-host>:51820
PersistentKeepalive = 25
EOF
```

* `killSwitch` maps to `AllowedIPs = 0.0.0.0/0` + firewall default-deny: traffic
  never leaves unencrypted if the tunnel drops.
* `dnsLeakGuard` maps to a tunnel-only DNS resolver.
* `autoRotate` maps to re-issuing profiles on a schedule (the browser layer
  already rebuilds entry/middle hops periodically).

### Option C — TUN device / full client (PIKOS layer)

A PIKOS system service opens a TUN interface, applies the WireGuard profile,
and enforces the same three guard flags kernel-side. This is the roadmap item
"PIK VPN relays — free 24/7 public relay network, three-hop by default".

## 3. Kill-switch contract (app-level enforcement)

While `connected === true && killSwitch === true`, PIKVPN dispatches
`pik:vpn-guard` before any PIK app makes a network call. Apps must await the
page's guard promise (see `js/main.js`):

```js
document.addEventListener("pik:vpn-guard", (e) => {
  e.detail.check().then(allowed => {
    if (!allowed) return blockAndWarn(); // tunnel down -> hold traffic
  });
});
```

If the tunnel handshake fails or the session goes stale (>60 s without a tick),
the state machine disconnects automatically and logs `vpn-disconnect ·
kill-switch`.

## 4. Data handling

* All state lives in `localStorage` under `pik.vpn.state`, `pik.anon.route`,
  `pik.anon.identity`, `pik.anon.activity` — nothing is uploaded.
* Activity records are hashed locally (SHA-256) and attributed to the public
  relay, not to the user.
* One-action purge: Settings → Danger zone (`PIKAnonymity.clearAll()`).
* External calls made by the page: proxy-list feeds (ProxyScrape, GitHub raw),
  IP echo (`api.ipify.org`), probe targets (Cloudflare trace, example.com),
  gateway echos for exit verification. No cookies, no analytics.
