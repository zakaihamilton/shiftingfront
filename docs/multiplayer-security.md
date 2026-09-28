# Multiplayer deployment security

The multiplayer API is stateless and does not provide an in-process rate-limit fallback. In Vercel production, room creation, room join, handshake validation, and peer-credential refresh call Vercel's `@vercel/firewall` SDK before parsing the body or contacting Peerovo. Each route fails closed with `503` if its rule is missing or the Firewall check fails, and returns `429` when the limit is reached. This follows HostPresent's shared-edge approach without Redis or per-instance counters.

On non-Vercel deployments, requests whose host is `localhost`, `127.0.0.1`, or `[::1]` skip the edge check so multiplayer works when a production build is served locally. Requests to other hosts still require the shared external limiter and fail closed when it is not configured.

Suggested Vercel Firewall rules for Preview and Production:

| Route | Limit | Window |
| --- | ---: | ---: |
| `POST /api/multiplayer/rooms` (`shiftingfront-multiplayer-room-create`) | 10 requests per IP | 10 minutes |
| `POST /api/multiplayer/rooms/join` (`shiftingfront-multiplayer-room-join`) | 20 requests per IP | 1 minute |
| `POST /api/multiplayer/handshake` (`shiftingfront-multiplayer-handshake`) | 60 requests per IP | 1 minute |
| `POST /api/multiplayer/peer-credentials` (`shiftingfront-multiplayer-peer-credentials`) | 120 requests per IP | 1 minute |

Configure all four `@vercel/firewall` custom rules in Preview and Production, then verify them with `APP_URL=https://your-deployment.example ./scripts/verify-multiplayer-firewall.sh`. The script exceeds each route's configured threshold using invalid payloads; those requests cannot mint Peerovo credentials. For other production hosts, configure equivalent shared edge rules for every listed route and set `MULTIPLAYER_EDGE_RATE_LIMIT_CONFIGURED=true`; multiplayer routes return `503` by default on non-Vercel production deployments. Do not add an instance-local limiter: serverless instances do not share counters.

The six-letter code is a bearer credential. Keep it out of URLs, analytics, and request-body logs. ShiftingFront's join route accepts it in a JSON POST body. PeerJS requires its short-lived Peerovo token in the signaling WebSocket query string; Peerovo and its reverse proxy must redact that token from access logs. Peerovo ticket and ICE requests use authorization headers.

Peerovo must enforce its own project ticket, ICE, and signaling limits. Configure the ShiftingFront project's allowed browser origins for ICE requests. Keep the Peerovo project API key, Peerovo signing key, TURN secret, and `MULTIPLAYER_ROOM_SIGNING_SECRET` in server-side environment variables only.

Because the API intentionally stores no live room state, any syntactically valid code can be resolved into a guest credential. The guest only reaches a live room if its host is listening on the code-derived Peerovo peer ID. The host validates each signed guest grant, assigns up to three stable seats, and rejects new peers after the roster is full or locked at Start. Closing the host ends discovery for that room; no server-side room record needs cleanup.
