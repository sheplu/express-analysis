# Pass B search log — router@2.2.0 patch audit

Scope of every search below ("scoped runtime files"), unless stated otherwise:

- `$PACKAGE_ROOT/index.js`
- `$PACKAGE_ROOT/lib/layer.js`, `lib/param.js`, `lib/route.js`, `lib/symbols.js`, `lib/tracing.js`
- Resolved runtime dependency entrypoints/shipped runtime files (via `--no-ignore` since they sit in node_modules):
  - `node_modules/debug/src/index.js`, `src/node.js`, `src/common.js`, `src/browser.js` (browser file scanned for completeness; not loaded on Node)
  - `node_modules/depd/index.js` (+ `lib/browser/index.js`, browser-only)
  - `node_modules/is-promise/index.js` (+ `index.mjs`)
  - `node_modules/ms/index.js`
  - `node_modules/parseurl/index.js`
  - `node_modules/path-to-regexp/dist/index.js`

Out of scope: `test/`, `scripts/`, `eslint.config.js`, `index.d.ts`, `lib/route.d.ts`, devDependencies.

## Scope discovery

| Command | Result |
| --- | --- |
| `ls $PACKAGE_ROOT`, `cat package.json` | main `index.js`; files shipped: `lib/`, `index.js`; runtime deps: debug, depd, is-promise, parseurl, path-to-regexp |
| `ls lib/ node_modules/` | lib has layer.js, param.js, route.js, symbols.js, tracing.js (param/symbols/tracing added by tracing commit 098ea78, present at audited head); node_modules: debug, depd, is-promise, ms, parseurl, path-to-regexp |
| per-dep `package.json` main/exports/browser | debug@4.4.3 → src/index.js → src/node.js + src/common.js on Node; depd@2.0.0 → index.js; is-promise@4.0.0 → index.js (CJS); ms@2.1.3 → index.js; parseurl@1.3.3 → index.js; path-to-regexp@8.4.2 → dist/index.js |

## Six candidate pattern groups (skill-mandated)

All run as `rg -n --no-ignore <pattern> <scoped runtime files>` from `$PACKAGE_ROOT`.

### G1 `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

HITS. Full core-import inventory:
- router: `node:http` (METHODS only — index.js:19, lib/route.js:17), `node:diagnostics_channel` (lib/tracing.js:8). All reads/channel creation.
- debug/src/node.js: `tty`, `util`, optional `supports-color` (not installed; try/catch fallback taken).
- depd/index.js:11: `require('path').relative` — read only.
- parseurl/index.js:15: `require('url')` — uses `url.parse`, `url.Url` (legacy documented API) — read/construct only.
- is-promise, ms, path-to-regexp dist: no core imports.

### G2 `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

HITS, all traced:
- index.js:750 `Buffer.byteLength(allow)` — read-only core API call.
- debug/src/node.js: `process.env` reads (124,136,221), `process.stderr` writes via documented stream API (194,260-equivalent), `process.env.DEBUG =` / `delete process.env.DEBUG` in `save()` (205,209) — see candidates C-010.
- depd/index.js: `process.cwd()` (23), `process.noDeprecation`/`traceDeprecation`/`env` reads (154-175), `process.emit('deprecation')` (251), `process.stderr.write` (260) — documented API usage, no mutation of process object itself.
- path-to-regexp dist/index.js:39 `class PathError extends TypeError` — ordinary inheritance from a global, no mutation; local function named `process` (257) is a false positive.
- debug/src/browser.js `window`/`process` sniffing — browser-only branch, not loaded on Node (verified src/index.js branch).

### G3 `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

HITS, all traced:
- index.js:29-30, lib/route.js:24-25: `Array.prototype.slice/flat` — READS of shared prototypes, never written.
- index.js:65 `Object.setPrototypeOf(router, this)` — call on the library-created `router` function; does not replace `Object.setPrototypeOf` (identity verified in repro).
- index.js:81 `Router.prototype = function () {}` and all `Router.prototype.*` / `Route.prototype.*` / `Layer.prototype.*` definitions — library-owned constructors.
- index.js:577,581,607 `Object.assign` — calls on library-owned param objects.
- depd/index.js:62,485 `Object.defineProperty(obj, prop, ...)` — only inside `convertDataDescriptorToAccessor`/`wrapproperty`, unreachable in this scope (C-008); 496-521 on freshly created library-owned error (C-009).
- debug/src/common.js:122 `Object.defineProperty(debug, 'enabled', ...)` — on library-created debug function instances.
- path-to-regexp dist/index.js:2 `Object.defineProperty(exports, "__esModule", ...)` — own exports.

### G4 `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (case-insensitive)

HITS, all benign:
- index.js:180,776 `wrap(done, ...)` — wraps the router's own continuation callback (OPTIONS responder), not a core function.
- lib/tracing.js:75 comment; depd/index.js:436,469,477 `wrapfunction`/`wrapproperty` (unreachable here, C-008); depd/lib/browser/index.js:57 browser-only.
- No monkeypatch/shim/polyfill/override hits anywhere in scope.

### G5 `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

ZERO HITS across all scoped runtime files.

### G6 `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

ZERO HITS across all scoped runtime files.

## Targeted follow-ups

| Command | Scope | Result |
| --- | --- | --- |
| `grep -n "res\.statusCode\s*=" index.js lib/*.js` | router runtime | zero hits — router never writes `res.statusCode` (OPTIONS responder uses `setHeader`/`end` only) |
| read `depd/index.js` getStack (381-399) | depd | confirms swap/restore of `Error.prepareStackTrace` + `Error.stackTraceLimit`; `depd(namespace)` (103-109) calls `getStack()` at factory-creation time |
| read `debug/src/common.js` enable() (162-182) + setup tail (287) | debug | `createDebug.enable(createDebug.load())` runs at require time → `save()` writes `process.env.DEBUG` back to its pre-existing value (or deletes an absent key) — no-op round trip at load |
| `grep -nE 'process\.|global|require|prototype\s*=|defineProperty|Symbol\.' path-to-regexp/dist/index.js` | path-to-regexp@8.4.2 shipped dist | only `Object.defineProperty(exports, "__esModule")`; no core interaction in the 8.4.2 dist |
| read `parseurl/index.js` fully | parseurl | writes `req._parsedUrl` cache expando + `parsed._raw`; constructs legacy `url.Url` instances (library-owned); no prototype/global writes |

## Node.js core baseline verification ($NODEJS_SOURCE @ d44625a4b80, targeted files only)

| Query | File | Result |
| --- | --- | --- |
| `grep -n "this.url" lib/internal/http/incoming.js` (followed re-export from lib/_http_incoming.js) | incoming.js:95 | `this.url = ''` — `url` is a core-defined own data property of IncomingMessage |
| `grep -n "\.url = " lib/internal/http/common.js` | common.js:105 | `incoming.url = url` — parser populates the request target |
| `grep -n "function setHeader" lib/internal/http/outgoing.js` | outgoing.js:813 | `OutgoingMessage.prototype.setHeader` — router calls it, never replaces it |
| `grep -n "baseUrl\|originalUrl\|params\|_parsedUrl\|\.next\b\|\.route\b" lib/internal/http/incoming.js` | — | zero hits — these names are pure library expandos, not core properties |
| `grep -n "prepareStackTrace" lib/internal/errors.js` | errors.js:136-170 | Node reads a user-assigned `globalThis.Error.prepareStackTrace` (149-150) and defines the default `ErrorPrepareStackTrace` (168) |
| `grep -n "prepareStackTrace" lib/internal/bootstrap/realm.js` | realm.js:503-505 | Node bootstrap installs `Error.prepareStackTrace` as a data property on the global Error — the exact value depd swaps out/in (repro saw `from: function:ErrorPrepareStackTrace`) |
| `grep -n "stackTraceLimit" lib/internal/errors.js` | errors.js:181-188, 248-254 | Node core itself uses the identical save/raise/restore pattern on `Error.stackTraceLimit` internally |
| `grep -rn "ErrorPrepareStackTrace" lib/` | repl.js, errors.js, bootstrap/realm.js | confirms the default-prepareStackTrace identity observed in the repro is Node's own |

No recursive scan of the Node tree was performed; only the files above were opened.

## Upstream corroboration (bounded)

| Query | Result |
| --- | --- |
| `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` | depd#32 "Why is this library overwriting Error type?" (closed; maintainer acknowledges the getStack swap technique); depd#36 "Incompatible with --enable-source-maps node 12 option" (closed; real-world interference between the swap window and Node source-map stack decoration); depd#28, #50 related CallSite breakage reports |
| `gh search issues --repo pillarjs/router "prepareStackTrace OR stackTraceLimit OR depd"` | no relevant hits returned |
