# jshttp monkeypatching audit — Recap

Umbrella issue: [sheplu/express-analysis#59](https://github.com/sheplu/express-analysis/issues/59)

23 jshttp-org libraries audited using a double-blind protocol (two independent passes + reconciliation per library). Node.js baseline: commit `d44625a4b80`.

## Results at a glance

- **19 clean** — no confirmed patching of any kind
- **4 confirmed patching** — 2 direct (on-headers, on-finished), 2 transitive via `depd` (http-errors, http-assert)

---

## Libraries with confirmed patching

### on-headers v1.1.0

| Field | Detail |
|-------|--------|
| Issue | [#47](https://github.com/sheplu/express-analysis/issues/47) |
| Commit | `691b687` |
| Runtime deps | 0 |
| Finding | **F-001 — per-instance `res.writeHead` override** |
| Category | Per-instance method shadow (own-property on individual ServerResponse) |
| Sites | `index.js:71` (assignment), `index.js:30-52` (wrapper factory `createWriteHead`) |
| Core target | `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423-523`) |
| What happens | `res.writeHead` is replaced with a closure that pre-processes header args, fires a registered listener once, then delegates to the original via `prevWriteHead.apply(this, args)` |
| Scope | Per-instance only — prototype never touched. Scoped to HTTP request lifecycle (short-lived). Multiple calls create a wrapper chain. |
| Active? | **Yes — every call to `onHeaders(res, listener)`** |
| Risk | Moderate — any Node.js change to `writeHead` signature or semantics could break the wrapper |

### on-finished v2.4.2

| Field | Detail |
|-------|--------|
| Issue | [#40](https://github.com/sheplu/express-analysis/issues/40) |
| Commit | `9a73f9c` |
| Runtime deps | ee-first (clean) |
| Finding 1 | **F-001 — per-instance `res.assignSocket` override (DORMANT)** |
| Sites | `index.js:189-199` (function `patchAssignSocket`) |
| Core target | `ServerResponse.prototype.assignSocket` (`$NODEJS_SOURCE/lib/internal/http/server.js:312-321`) |
| Gate | `msg.socket === undefined` — **never true on modern Node.js** (socket getter returns `null`, not `undefined`). Source comments label this "node.js 0.8 patch." |
| Active? | **No — dead code since ~Node 1.0** |
| Risk | None on modern Node.js |
| Finding 2 | **F-002 — `msg.__onFinished` expando property (ACTIVE)** |
| Sites | `index.js:147` (write), `index.js:164` (cleanup) |
| Core target | N/A — `__onFinished` does not exist in Node.js core |
| What happens | Adds a `__onFinished` property to individual `msg` objects as a callback aggregator. Self-cleaning (set to `null` after listener fires). |
| Active? | **Yes — every call to `onFinished(msg, listener)`** |
| Risk | Low — naming collision only; not overriding any core property |

### http-errors v2.0.1

| Field | Detail |
|-------|--------|
| Issue | [#52](https://github.com/sheplu/express-analysis/issues/52) |
| Commit | `814207e` |
| Runtime deps | depd, inherits, setprototypeof, statuses, toidentifier |
| Finding | **F-001 — transient `Error.prepareStackTrace` + `Error.stackTraceLimit` swap (via depd@2.0.0)** |
| Category | Transient swap of shared V8 globals |
| Origin | Transitive: http-errors → depd@2.0.0 |
| Sites | `depd/index.js:385-386` (write), `:395-396` (restore) |
| What happens | `depd` saves both properties, replaces them briefly to capture raw CallSite arrays, then restores synchronously. No user code can interleave in single-threaded Node.js. |
| Activation | Once at `require('http-errors')` time (guaranteed); again on deprecation triggers (conditional) |
| Active? | **Yes — at require time** |
| Risk | Low — transient and synchronous, but any V8 change to `prepareStackTrace` semantics could affect depd |

### http-assert v1.5.0

| Field | Detail |
|-------|--------|
| Issue | [#41](https://github.com/sheplu/express-analysis/issues/41) |
| Commit | `3ae22e1` |
| Runtime deps | http-errors, deep-equal |
| Finding | **F-001 + F-002 — same depd mechanism as http-errors** |
| Origin | Transitive: http-assert → http-errors@~1.8.0 → depd@~1.1.2 |
| Activation | 3 transient swaps at require time; again on deprecation triggers |
| Active? | **Yes — at require time** |
| Risk | Same as http-errors (low — transient and synchronous) |

> **Root cause note:** http-errors and http-assert share the same root cause — the `depd` library's `getStack()` function. Fixing depd would resolve both.

---

## Clean libraries (19)

| # | Library | Version | Commit | Runtime deps | Summary |
|---|---------|---------|--------|--------------|---------|
| 1 | fresh | v2.0.0 | `ee73673` | 0 | Pure HTTP freshness check; zero imports |
| 2 | forwarded | v0.2.0 | `b3097d8` | 0 | Pure X-Forwarded-For parser; zero imports |
| 3 | content-type | v3.1.1 | `5d8c14e` | 0 | Content-Type parser/serializer; zero imports |
| 4 | methods | v1.1.2 | `f89e491` | 0 | Reads `http.METHODS` (read-only); zero deps |
| 5 | range-parser | v1.2.1 | `f4bf173` | 0 | Pure Range header parser; zero imports |
| 6 | media-typer | v2.0.0 | `102bab1` | 0 | RFC 6838 media type parser (ESM/TS); zero imports |
| 7 | basic-auth | v3.0.0 | `301fe41` | 0 | Basic Auth parser; `Buffer.from()` read-only |
| 8 | etag | v1.8.1 | `5df2cfd` | 0 | ETag generator; `crypto.createHash` read-only |
| 9 | vary | v1.1.2 | `1220b9c` | 0 | Vary header utility; zero imports |
| 10 | statuses | v2.0.2 | `770a97d` | 0 | HTTP status code map from local JSON |
| 11 | mime-db | v1.54.0 | `ba120a7` | 0 | Pure data — re-export of JSON MIME database |
| 12 | compressible | v2.0.18 | `9a7ea07` | mime-db | MIME compressibility lookup via mime-db |
| 13 | cookie | v2.0.1 | `51c4854` | 0 | Cookie parser/serializer (ESM); zero imports |
| 14 | negotiator | v1.1.0 | `14b0a7b` | content-type | Content negotiation; own-constructor prototypes only |
| 15 | mime-types | v3.0.2 | `3a1187e` | mime-db | MIME lookup; `path.extname` read-only |
| 16 | accepts | v2.0.0 | `19db02a` | negotiator, mime-types | Content negotiation wrapper; all deps clean |
| 17 | type-is | v3.0.0 | `74fc347` | content-type | Content-type matching (ESM); zero core imports |
| 18 | proxy-addr | v2.0.8 | `a11ad82` | forwarded, ipaddr.js | Client IP resolution; own-constructor prototypes only |
| 19 | content-disposition | v3.0.0 | `1a542fe` | 0 | Content-Disposition parser (ESM); zero imports |

---

## Methodology

Each library was audited using the `audit-nodejs-dependency` skill protocol:

1. **Clone** upstream source into worktree, install production deps (`--ignore-scripts --omit=dev`)
2. **Pass A** — independent full audit: 6 regex search groups, candidate ledger, tracing to actual writes
3. **Pass B** — second independent audit without referencing Pass A
4. **Reconciliation** — compare both passes, adjudicate any disagreements, produce final verdict

Search patterns used (from the skill):
- Core imports (`require`, `import`, `from`, `node:`)
- Globals/builtins (`Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits`)
- Prototype/property mutations (`.prototype`, `__proto__`, `setPrototypeOf`, `defineProperty`, `Object.assign`)
- Patching keywords (`monkeypatch`, `patch`, `wrap`, `shim`, `polyfill`, `override`)
- Module system hooks (`require.cache`, `require.extensions`, `Module._load`, etc.)
- Node internals (`process.binding`, `internalBinding`, `_http_`, `internal/`)

All reports use `$PACKAGE_ROOT` and `$NODEJS_SOURCE` aliases — no absolute machine paths.
