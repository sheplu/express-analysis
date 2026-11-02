# cookies — findings detail (files, lines, issues)

Library: cookies 0.9.2 (master @ `6e35de1524bb55d5deac3edcf67c2ac374d658d0`)
Verdict: **confirmed patching** — 1 confirmed patch site (2 property writes), transitive via depd@2.0.0, transient.

## F-001 — depd transient `Error.prepareStackTrace` + `Error.stackTraceLimit` swap

| Item | Detail |
|---|---|
| Patch site | `node_modules/depd/index.js:386` (`Error.prepareStackTrace = prepareObjectStackTrace`), `:387` (`Error.stackTraceLimit = Math.max(10, limit)`); saves `:382,:384`; restores `:395-396` |
| Trigger chain | `require('cookies')` -> `index.js:10` `require('depd')('cookies')` (factory -> `getStack()`) and `index.js:252` `deprecate.property(Cookie.prototype, 'maxage', ...)` -> `getStack()`; afterwards once per deprecation log site |
| Core objects mutated | global `Error` constructor — `prepareStackTrace` (core bootstrap installs the default at `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:504-511`, impl `lib/internal/errors.js:168`, user hook honored at `errors.js:149-151`) and `stackTraceLimit` (V8 capture depth) |
| Scope | process-wide while held; restored synchronously in the same tick (no async gap) |
| Persistence | transient; **not exception-guarded** — a throw inside the window would leak the swap (static reasoning) |
| Observable effects | during each window: stacks captured anywhere in the process format as depd's callsite array instead of core's string formatter; capture depth forced to ≥ 10; documented real-world interference with `--enable-source-maps` (depd#36/#39) |
| Runtime proof | Node v24.19.0 — pass A instrumented accessor: 4 writes at require + 2 during a deprecated call, full restoration; pass B sentinel `stackTraceLimit=3` observed as 10 inside captures, restored after; all other surfaces unchanged |

## cookies own-code core interactions (all verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 10 | `require('depd')('cookies')` | imports the patching dependency (see F-001) |
| `index.js` | 12 | `require('http')` | import for prototype **read** only |
| `index.js` | 167-168 | `var setHeader = res.set ? http.OutgoingMessage.prototype.setHeader : res.setHeader; setHeader.call(res, 'Set-Cookie', headers)` | defensive **borrow** of the core prototype method (bypasses framework-patched `res.set`); read + call, no write; baseline `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813` never reassigned |
| `index.js` | 244-252 | `Object.defineProperty(Cookie.prototype, 'maxage', ...)`, `deprecate.property(...)` | library-owned prototype only |
| `index.js` | 299-300 | `req.cookies = res.cookies = new Cookies(req, res, {keys})` | instance expando metadata (middleware contract) |

## Dependency analysis

| Dependency | Key site | Finding |
|---|---|---|
| `depd@2.0.0` | `index.js:381-398` `getStack()` | **F-001** — the only patching code in scope |
| | `index.js` wrapfunction/wrapproperty | descriptor machinery applied only to library-owned objects here |
| | `lib/browser/index.js` | write-free no-op; unreachable under Node resolution |
| `keygrip@1.1.0` | whole file | own-export writes + `crypto.createHmac` calls only |
| `tsscmp@1.0.6` | `lib/index.js` | crypto consumer; deprecated `crypto.pseudoRandomBytes` fallback (call-only; API-usage note, not a patch) |

## Negative sweeps (both passes, zero hits in runtime scope)

- Module-loading interception: `require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks`
- Internals: `process.binding`, `internalBinding`, `'internal/...'`, `'_http_...'`
- Mutation primitives against core: `setPrototypeOf`, `__proto__` writes, `defineProperty/ies` on core objects, `Reflect.*` writes
- No install scripts, no native code, no bundled entrypoints

## Node.js-change risk

1. **`Error.prepareStackTrace` contract (F-001)** — depd assumes the property is a writable data property on `Error` and that V8/Node honors userland reassignment (`$NODEJS_SOURCE/lib/internal/errors.js:149-151`). If Node froze the property, changed it to an accessor, or altered callsite-array semantics, depd's stack capture (and thus `require('cookies')`) would misbehave. Also interacts with `--enable-source-maps` (upstream #36/#39) — any core change in how source-map translation hooks into `prepareStackTrace` re-exposes that conflict.
2. **`Error.stackTraceLimit` writability** — same exposure class; V8 requires it to be a data property for capture to work at all.
3. **`OutgoingMessage.prototype.setHeader` borrow (`index.js:167-168`)** — in-contract, but cookies calls the prototype method with a possibly framework-wrapped `this`; if Node made `setHeader` depend on internal slots set only via its own constructor path or made the prototype method non-generic, the borrow would break before ordinary consumers notice.
