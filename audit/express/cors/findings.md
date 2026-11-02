# cors — findings detail (files, lines, issues)

Library: cors 2.8.6 (master @ `5317ebe670db2aaebc1d496eb5d33493deefb3ed`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches.

## Why cors cannot monkeypatch core

`lib/index.js:5-6` — the package's only imports are `object-assign` and `vary`. No Node.js core module is ever required, so there is no handle through which core could be rewritten; the only core-backed objects it touches are the `req`/`res` instances handed to the middleware.

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `lib/index.js` | 153, 179 | `res.setHeader(header.key, header.value)` / `res.setHeader('Content-Length', '0')` | documented API call; `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813` never reassigned |
| `lib/index.js` | 178 | `res.statusCode = options.optionsSuccessStatus` | documented settable instance property (prototype default at `$NODEJS_SOURCE/lib/internal/http/server.js:285`); only core-backed write in scope |
| `lib/index.js` | 180 | `res.end()` | call only (`outgoing.js:1289`) |
| `node_modules/vary/index.js` | 134–148 | duck-type check then `res.getHeader('Vary')` / `res.setHeader('Vary', val)` | header API consumption on the passed instance |

## Dependency analysis

| Dependency | Key site | Finding |
|---|---|---|
| `object-assign@4.1.1` | `index.js:9-11` | read-only saved references to `Object.getOwnPropertySymbols`, `Object.prototype.hasOwnProperty`, `propertyIsEnumerable` |
| | `index.js:65` | **ponyfill**: `module.exports = shouldUseNative() ? Object.assign : function(...)` — exports, never installs onto `Object` or any global |
| | fallback branch | mutates only the caller-provided target object (always a fresh `{}` in cors); dead code on modern Node |
| `vary@1.1.2` | whole file | own-export writes + header calls only |

## Negative sweeps (both passes, zero hits)

- Module-loading interception: `require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks`
- Internals: `process.binding`, `internalBinding`, `'internal/...'`, `'_http_...'`
- Mutation primitives against core: `setPrototypeOf`, `__proto__`, `defineProperty/ies`, `Reflect.*`, `delete` on core objects
- Globals: no `global`/`globalThis`/`process`/`Buffer` usage at all
- No install scripts, no bundled or native code

## Node.js-change risk

None identified. cors depends only on the stable documented response API surface (`statusCode`, `setHeader`, `getHeader`, `end`). The only conceivable exposure is if Node.js ever made `statusCode` non-writable or changed `Vary` header get/set semantics — both would be breaking documented API, not internals.
