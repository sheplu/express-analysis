# Node.js monkeypatch audits — expressjs org (umbrella issue #57)

Does each library patch or monkeypatch Node.js core (rewrite/override runtime behavior)? One audit per package from sheplu/express-analysis issues #1–#19, to track which libraries future Node.js changes could break.

**Protocol per library:** clone the GitHub default branch (commit pinned) → install runtime deps (`--ignore-scripts --omit=dev`) → **two fully independent blind audits** (`pass-a/`, `pass-b/`) following the `audit-nodejs-dependency` skill against Node.js source at `$NODEJS_SOURCE` (main @ `d44625a4b80`) → orchestrator reconciliation with direct source re-verification of every finding → final `report.md` (skill template), `findings.md` (files/lines/issues), `methodology.md` (searches + reconciliation). Scope: production/runtime code only; tests excluded. Runtime reproductions on Node v24.19.0.

## Verdict index

| # | Package (issue) | Version @ commit | Verdict | One-line summary |
|---|---|---|---|---|
| 1 | [express](express/report.md) (#1) | 5.3.0 @ 1c6f1b0 | **confirmed — instance overrides** | per-request `Object.setPrototypeOf(req/res, …)` rewiring (additive, no core name shadowed); + transitive depd transient Error swap |
| 2 | [cors](cors/report.md) (#2) | 2.8.6 @ 5317ebe | **no confirmed patching** | imports no core module at all; documented res API only |
| 3 | [express-generator](express-generator/report.md) (#3) | 4.16.1 @ a1f3841 | **confirmed — loader registry (transitive)** | pinned ejs@2.6.2 writes `require.extensions['.ejs']` (shared CJS registry) at every CLI start |
| 4 | [compression](compression/report.md) (#4) | 1.8.2 @ 0f97074 | **confirmed — instance overrides** | `res.write`/`end`/`on` own-property shadows + on-headers `writeHead` wrap; destroy's zlib-internals writes legacy-gated (dormant) |
| 5 | [body-parser](body-parser/report.md) (#5) | 2.4.0 @ 151a0d9 | **confirmed — transient (transitive)** | depd `Error.prepareStackTrace` swap at require (via http-errors); own code clean |
| 6 | [basic-auth-connect](basic-auth-connect/report.md) (#6) | 1.1.0 @ 856183e | **no confirmed patching** | expando req metadata + documented res API (note: deprecated `new Buffer()` call) |
| 7 | [multer](multer/report.md) (#7) | 2.5.0 @ 2c380d0 | **no confirmed patching** | documented stream subclassing; busboy *calls* undocumented `Buffer.prototype.*Slice` (private-API read, tracked) |
| 8 | [serve-favicon](serve-favicon/report.md) (#8) | 2.5.1 @ 1d9a8e7 | **no confirmed patching** | parseurl `req._parsedUrl` = library cache; safe-buffer = pure re-export |
| 9 | [response-time](response-time/report.md) (#9) | 2.3.4 @ 3bd2651 | **confirmed — transitive** | on-headers `res.writeHead` instance wrap per response + depd transient Error swap at require |
| 10 | [morgan](morgan/report.md) (#10) | 1.12.1 @ b1272e7 | **confirmed — transitive** | on-headers `writeHead` wrap + depd swap (×2 at require); dormant on-finished `assignSocket` wrap tracked |
| 11 | [cookie-parser](cookie-parser/report.md) (#11) | 1.4.7 @ 1f2a3a2 | **no confirmed patching** | additive req.cookies/signedCookies/secret; pure deps |
| 12 | [express-session](express-session/report.md) (#12) | 1.19.0 @ 8947e16 | **confirmed — incl. direct** | **direct `res.end` instance wrap** + on-headers `writeHead` wrap + depd swap; uses core-private `_implicitHeader`/`_header` |
| 13 | [cookie-session](cookie-session/report.md) (#13) | 2.1.1 @ 75f53bb | **confirmed — transitive** | on-headers `writeHead` wrap + depd swap ×2 at require (via cookies); cookies calls `OutgoingMessage.prototype.setHeader` directly |
| 14 | [errorhandler](errorhandler/report.md) (#14) | 1.5.2 @ 1922d04 | **no confirmed patching** | documented res API; one private-API **read** (`res._header`) |
| 15 | [method-override](method-override/report.md) (#15) | 3.0.0 @ 4df570e | **confirmed — direct** | rewrites `req.method` — a core-assigned, documented-**read-only** property (the package's purpose) |
| 16 | [connect-timeout](connect-timeout/report.md) (#16) | 1.9.1 @ 7377def | **confirmed — transitive** | on-headers `writeHead` wrap + depd@1.x swap (×3 cycles at require); dormant on-finished@2.3.0 `assignSocket` wrap |
| 17 | [vhost](vhost/report.md) (#17) | 3.0.2 @ f41a9ec | **no confirmed patching** | zero requires, zero deps; only `req.vhost` metadata |
| 18 | [serve-index](serve-index/report.md) (#18) | 1.9.2 @ fc0c0ab | **confirmed — transient (transitive)** | depd@1.x Error swap ×3 at require (via http-errors@1.8.1); own code clean |
| 19 | [serve-static](serve-static/report.md) (#19) | 2.2.1 @ 6e3606f | **confirmed — transient (transitive)** | depd Error swap at require (via send→http-errors); otherwise the cleanest large tree (no method wrapping, no private core access) |

**Totals:** 12 confirmed patching (2 with direct patches: express-session, method-override; express's setPrototypeOf is also direct) · 7 no confirmed patching · 0 inconclusive.

## Cross-cutting mechanisms (what Node.js changes would break these libraries)

1. **on-headers instance `res.writeHead` wrap** (compression, response-time, morgan, express-session, cookie-session, connect-timeout): depends on core dispatching `_implicitHeader` via `this.writeHead` (`lib/internal/http/server.js:419-421`). If core ever calls the prototype method directly or caches it, header hooks silently stop firing.
2. **depd transient `Error.prepareStackTrace`/`stackTraceLimit` swap** (9 trees; fires at require): restore lacks try/finally; a V8/Node change deferring or caching `prepareStackTrace` reads would expose the window (known to interfere with `--enable-source-maps`, nodejs-depd#32/#36).
3. **Dormant on-finished `assignSocket` wrap** (compression, morgan, connect-timeout, serve-static trees): unreachable solely because `OutgoingMessage` initializes its socket slot to `null` (`lib/internal/http/outgoing.js:187`). A change to `undefined` would awaken an instance patch on live responses in four major middleware.
4. **`res.end` instance wrap + end-contract drift** (express-session direct; compression similar): duplicate-call semantics, return values, and the `end(…, callback)` are altered on wrapped responses.
5. **Core-private member usage**: express-session **calls** `res._implicitHeader` and reads `res._header` (breaks hard on rename); errorhandler reads `res._header` (degrades); busboy (multer) calls undocumented `Buffer.prototype.latin1Slice`/`utf8Slice`/`ucs2Slice`/`base64Slice` (breaks multipart parsing if removed).
6. **`req.method` writability** (method-override): documented read-only; enforcing that documentation breaks the package by design.
7. **`require.extensions` liveness** (express-generator via pinned ejs@2.6.2): removal/freeze of the deprecated registry affects CLI startup; `module._compile` private signature used inside the handler.
8. **Prototype-identity assumptions** (express): per-request `[[Prototype]]` swap on req/res conflicts with any future core caching/freezing of instance prototypes; express bypasses the documented `createServer({IncomingMessage, ServerResponse})` extension point.

## Files

- `RECAP.md` — **one-page recap: which packages have confirmed monkeypatching vs clean**, score card, ranked watch items.
- `STATUS.md` — per-library completion tracker (19/19 complete).
- `<package>/report.md` — final reconciled audit (verdict first, skill template).
- `<package>/findings.md` — exact files/lines/issues tables.
- `<package>/methodology.md` — scope, searches, Node.js files consulted, reconciliation notes (including every A/B divergence and its adjudication).
- `<package>/pass-a/`, `<package>/pass-b/` — the two independent blind audit outputs (reports, candidate ledgers, search logs, reproduction scripts), kept as double-check evidence.
