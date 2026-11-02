# serve-index — findings detail (files, lines, issues)

Library: serve-index 1.9.2 (master @ `fc0c0abd890e79c3f16b0ea9cf49551b3ee66ecb`)
Verdict: **confirmed patching — 1 transitive transient finding** (depd). Own code clean.

## Finding F-001 — transient `Error.prepareStackTrace`/`stackTraceLimit` swap (http-errors@1.8.1 → depd@1.1.2, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 17 | `var createError = require('http-errors')` — the chain that reaches depd at `require('serve-index')` |
| `node_modules/http-errors/index.js` | 15 | `require('depd')('http-errors')` — factory fire |
| `node_modules/http-errors/index.js` | 286 | `deprecate.function(...)` — wrapfunction fire |
| `node_modules/depd/index.js` | 11 | forces the compat lazy getter — third fire |
| `node_modules/depd/index.js` | 365–383 | `getStack()`: global writes + synchronous restores (**no try/finally**) |
| `node_modules/depd/lib/compat/index.js` | 21–43 | lazy `callSiteToString` probe — additional swap site |

**Observed at runtime (both passes):** exactly 3 swap/restore cycles (6 writes) at bare `require('serve-index')`; full restoration; empty permanent-core-diff list. Re-fires on any depd deprecation log process-wide (serve-index's own `createError(4xx)` calls never trigger one).

Core baseline: `$NODEJS_SOURCE/lib/internal/errors.js:136-170`. Upstream: dougwilson/nodejs-depd#32/#36 — this exact swap breaks `--enable-source-maps` stack traces during the window.

## serve-index's own writes (not patches)

| File | Line(s) | Write | Classification |
|---|---|---|---|
| `index.js` | 114, 124, … | `next(createError(400))`, `err.status` | library-created Error objects |
| `index.js` | various | `res.statusCode`, `res.setHeader`, `res.end` | documented instance API |
| `index.js` | — | `fs.stat/readdir/createReadStream`, Buffer reads | documented calls |

## Adjudicated boundary case — debug@2.6.9 `DEBUG_FD` path (supporting context, NOT a confirmed patch)

| File | Line(s) | What happens |
|---|---|---|
| `node_modules/debug/src/node.js` | 61–75, 167–226 | when env `DEBUG_FD` names an fd other than 1/2: builds a tty/net/fs stream and writes `stream.readable = false`, `stream.read = null` (:204–205), `_type`/`fd` metadata, `_handle.unref()`; reads deprecated `process.binding('tty_wrap')` (:169) |

**Why not confirmed:** every write lands on a stream **debug itself creates and owns** for its own logging (not core-handed shared state); env-gated, never active by default; the FILE branch throws on modern Node (`fs.SyncWriteStream` removed). Identical code was classified "rejected" in the compression and morgan audits — series consistency controls. Tracked here because pass A proposed it as an optional finding. Forward-compat note: `process.binding` removal would break this env-gated path.

## Rejected candidates

| Site | Why rejected |
|---|---|
| `batch/index.js:51` `Batch.prototype.__proto__ = EventEmitter.prototype` | batch's own prototype; `EventEmitter.prototype` unchanged; constructor-less inheritance safe (core lazy `_events` init) |
| http-errors setprototypeof/defineProperty | own Error instances; setprototypeof@1.2.0 = native re-export |
| parseurl `req._parsedUrl`/`_parsedOriginalUrl` + `new url.Url()` | metadata cache keys (absent from core) + documented legacy export |
| debug `process.env.DEBUG` write | own config namespace |
| accepts/negotiator | own wrappers; `req.headers` reads only |
| mime-types/statuses load-time maps | own exports |
| loader hooks / Buffer-global / install scripts | zero hits tree-wide |

## Node.js-change risk

1. **depd transient swap** — 3× per require; restore not exception-safe; documented upstream to interfere with `--enable-source-maps`.
2. **`process.binding('tty_wrap')`** — removal breaks debug's env-gated `DEBUG_FD` path only.
3. Everything else relies on stable documented API.
