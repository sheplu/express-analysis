# method-override — findings detail (files, lines, issues)

Library: method-override 3.0.0 (master @ `4df570e14dddc88b9464808f4cab3b2a73fc6dc8`)
Verdict: **confirmed patching — 1 direct instance override** (the package's core feature).

## Finding F-001 — `req.method` overwrite (every overridden request)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 61 | `req.originalMethod = req.originalMethod || req.method` — wire verb saved into a library-owned key |
| `index.js` | 64–66 | allowed-methods guard (default: original method must be POST) |
| `index.js` | 74 | `supports(method)` — written verb must be in `http.METHODS` |
| `index.js` | 75 | **`req.method = method.toUpperCase()`** — value replacement of the core-assigned own data property on the live IncomingMessage |

Node.js core baseline:

| File | Line(s) | Relevance |
|---|---|---|
| `$NODEJS_SOURCE/lib/internal/http/incoming.js` | 96 | constructor initializes `method` |
| `$NODEJS_SOURCE/lib/internal/http/common.js` | 118 | `parserOnHeadersComplete` assigns the wire verb (from `internalBinding('http_parser')`) |
| `$NODEJS_SOURCE/doc/api/http.md` | 2987 | "The request method as a string. **Read only.**" — the documented contract the overwrite violates |
| `$NODEJS_SOURCE/lib/http.js` | 264 | `http.METHODS` (exported copy) — read by the `methods` dep and the `supports()` guard |

**Classification:** instance/application override of core-assigned state. Mechanically writable (plain own data property — verified at runtime), but documented read-only; both blind passes independently reached the same classification and recorded the same counterfactual (if docs sanctioned mutation → no confirmed patching).

**Issue / Node.js-change risk:**
1. If Node.js enforces the read-only contract (getter-only accessor, frozen instances, or private-field dispatch), `method-override` **breaks outright** — this package is the canonical ecosystem dependency on `method` staying writable.
2. Core or userland code caching the verb before the middleware runs will diverge from downstream consumers after the override — inherent to the package's design.

## Rejected candidates

| Site | Why rejected |
|---|---|
| `index.js:61` `req.originalMethod` | library-owned metadata addition (not a core member) |
| parseurl `req._parsedUrl`/`_parsedOriginalUrl` caches | library cache keys (same as serve-favicon/express-session audits) |
| vary `res.getHeader`/`setHeader('Vary')` | documented API |
| `methods` package (`methods/index.js:22,30`) | read-only `http.METHODS.map(...)` |
| debug@3.1.0 `exports.enable(load())` env round-trip (`debug/src/node.js:149,151`) | documented-mutable env state; idempotent at load |
| debug browser entry | never loaded under Node |
| loader hooks / bindings / prototypes / globals | zero hits (9 runtime files, 1,247 lines read in full) |

## Runtime corroboration (both passes, Node v24.19.0)

Descriptor inspection: `method` confirmed own writable/enumerable/configurable data property; POST→DELETE flip observed on a live request; prototypes, constructors, and `http.METHODS` unchanged after require + request handling.
