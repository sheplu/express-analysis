# RECAP — Node.js monkeypatching across the 19 expressjs-org packages (issue #57)

Final one-page summary. Full evidence per package in `audit/express/<package>/` (report.md, findings.md, methodology.md, plus both blind-audit passes).

**Consistency pass result:** all 19 audits complete; for every package the two independent blind audits (pass-a, pass-b) and the reconciled final report **agree on the verdict direction**; 0 unresolved candidates anywhere; all reports commit-pinned and free of machine paths.

---

## 🔴 Confirmed monkeypatching — 12 packages

### Direct patches (the package's own code patches core-backed objects)

| Package | What it patches | Where |
|---|---|---|
| **express** (5.3.0) | replaces the `[[Prototype]]` of every live core req/res (`Object.setPrototypeOf`) — additive, core prototypes untouched | `lib/application.js:169-170` |
| **express-session** (1.19.0) | replaces `res.end` on every handled response (session commit); also calls core-private `res._implicitHeader` / reads `_header` | `index.js:269` |
| **method-override** (3.0.0) | rewrites `req.method` — a core-assigned, documented-**read-only** property (the package's purpose) | `index.js:75` |
| **compression** (1.8.2) | replaces `res.write`, `res.end`, `res.on` on every handled response | `index.js:101/115/142` |

### Transitive patches only (via runtime dependencies the package activates)

| Package | Mechanism(s) activated |
|---|---|
| **express-generator** (4.16.1) | pinned ejs@2.6.2 writes `require.extensions['.ejs']` — shared CJS loader registry, process-wide, every CLI run |
| **body-parser** (2.4.0) | depd transient `Error.prepareStackTrace`/`stackTraceLimit` swap at require |
| **response-time** (2.3.4) | on-headers `res.writeHead` instance wrap (per response) + depd swap at require |
| **morgan** (1.12.1) | on-headers `writeHead` wrap + depd swap (×2 at require) |
| **cookie-session** (2.1.1) | on-headers `writeHead` wrap + depd swap (×2 at require, via cookies) |
| **connect-timeout** (1.9.1) | on-headers `writeHead` wrap + depd@1.x swap (×3 at require); dormant on-finished `assignSocket` wrap |
| **serve-index** (1.9.2) | depd@1.x swap (×3 at require, via http-errors@1.8.1) |
| **serve-static** (2.2.1) | depd swap at require (via send → http-errors) — otherwise the cleanest large tree (no method wrapping at all) |

Note: compression, response-time, morgan, express-session, cookie-session, connect-timeout all also carry the on-headers `res.writeHead` instance wrap; express, body-parser, response-time, morgan, express-session, cookie-session, connect-timeout, serve-index, serve-static all carry the depd transient global swap. These are **instance/transient** patches — none of the 19 packages permanently mutates a shared core prototype, a core module object, or module loading (the single shared-registry write is express-generator's ejs `.ejs` handler, which is additive).

---

## 🟢 Clean — no confirmed patching — 7 packages

| Package | Why it's clean |
|---|---|
| **cors** (2.8.6) | imports no Node core module at all; only documented res API calls on passed instances |
| **basic-auth-connect** (1.1.0) | expando `req.user`/`req.remoteUser` metadata + documented res API (note: deprecated `new Buffer()` call — modernization candidate, not a patch) |
| **multer** (2.5.0) | documented stream subclassing throughout; busboy *calls* undocumented `Buffer.prototype.*Slice` (private-API read worth tracking, no mutation) |
| **serve-favicon** (2.5.1) | documented res/fs API; `req._parsedUrl` is a parseurl library cache key; safe-buffer is a pure re-export |
| **cookie-parser** (1.4.7) | additive `req.cookies`/`signedCookies`/`secret` metadata (null-prototype containers); pure deps |
| **errorhandler** (1.5.2) | documented res API; single private-API **read** of `res._header` (degrades gracefully, no write) |
| **vhost** (3.0.2) | zero `require` statements, zero dependencies — cannot touch core by construction; only `req.vhost` metadata |

---

## Score card

- **12 / 19** confirmed patching → 4 with direct patches (express, express-session, method-override, compression), 8 transitive-only.
- **7 / 19** clean.
- **0** inconclusive, **0** unresolved candidates.
- **0** permanent shared-core mutations anywhere (all confirmed patches are per-instance or transient save/restore, plus one additive loader-registry entry).

## Top Node.js-change watch items (ranked by blast radius)

1. `_implicitHeader` dispatching via `this.writeHead` — 6 packages' header hooks depend on it.
2. depd's `Error.prepareStackTrace` swap — 9 trees, fires at require, restore not exception-safe.
3. `OutgoingMessage` socket slot staying `null` (not `undefined`) — keeps a dormant on-finished `assignSocket` patch asleep in 4 trees.
4. `req.method` staying writable — method-override breaks by design if the documented read-only contract is enforced.
5. `require.extensions`/`module._compile` liveness — express-generator CLI startup (pinned ejs 2.6.2).
6. Private members: `res._header`/`res._implicitHeader` (express-session hard, errorhandler soft), `Buffer.prototype.*Slice` (busboy/multer).
