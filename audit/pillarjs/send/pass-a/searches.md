# Search log — pass A audit of send@1.2.1

Scope of every search unless noted: `$PACKAGE_ROOT/index.js` (only shipped runtime
file per `files` in package.json) plus every resolved runtime dependency's JS files
under `$PACKAGE_ROOT/node_modules/<dep>/` (flat tree, no nested node_modules),
excluding `setprototypeof/test/` (tests out of scope). Browser-only variants
(`debug/src/browser.js`, `depd/lib/browser/index.js`, `inherits/inherits_browser.js`)
were included in searches even though they are not loaded under Node.

Tool: `rg -n --no-ignore` from `$PACKAGE_ROOT`.

## File inventory (pre-search)

- `find node_modules/<dep> -name '*.js' -not -path '*/node_modules/*'` per dep — 25 runtime JS files total across 17 deps; `find . -mindepth 2 -name node_modules -type d` → zero hits (flat tree).
- Entrypoint check per dep via `package.json` `main`/`exports`/`browser` — versions matched the stated resolved tree exactly (debug@4.4.3, depd@2.0.0, ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, etag@1.8.1, fresh@2.0.0, http-errors@2.0.1, inherits@2.0.4, mime-db@1.54.0, mime-types@3.0.2, ms@2.1.3, on-finished@2.4.2, range-parser@1.3.0, setprototypeof@1.2.0, statuses@2.0.2, toidentifier@1.0.1).

## Skill pattern group 1 — module imports

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`
Result: HITS. Only core modules imported anywhere in scope: `fs`, `path`, `stream`,
`util`, `crypto`, `tty`, `async_hooks` (try/catch in on-finished). Plus intra-tree
package requires. `debug/src/node.js:32` optionally requires `supports-color`
(not installed → catch branch). No `node:` specifiers, no dynamic `import()`,
no `_http_*`/`internal/` requires. All hits recorded; none loads a module in a
way that could rewrite core.

## Skill pattern group 2 — globals / Buffer / process / inherits / extends

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`
Result: HITS.
- `index.js:155` `util.inherits(SendStream, Stream)` → ledger C-001.
- `index.js:186,388` `Buffer.byteLength` (read-only use).
- `debug/src/node.js:124-221` process.env reads, `process.env.DEBUG` write/delete (→ C-018), `process.stderr.write`.
- `depd/index.js:23,154-260` process.cwd/noDeprecation/traceDeprecation reads, `process.emit('deprecation')`, `process.stderr.write`.
- `http-errors/index.js:117,160,229` `inherits(...)` → C-012.
- `etag/index.js` Buffer reads; `on-finished/index.js:34` process.nextTick fallback.
- No `class ... extends` of core constructors anywhere in scope.

## Skill pattern group 3 — prototype / descriptor mutation primitives

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`
Result: HITS.
- `index.js:165-736` `SendStream.prototype.*` definitions (library-owned) → C-002/C-003.
- `debug/src/common.js:122` defineProperty on library `debug` fn → C-019.
- `depd/index.js:62,485,496-535` defineProperty on caller-passed obj (wrapproperty, not invoked in scope) and on library-created DeprecationError → C-010/C-011.
- `http-errors/index.js:139,208` `setPrototypeOf(err, …)` on library-created Error instances → C-013; `:142-155,211-224,249` defineProperty on same/own fn → C-014; `:163-165,232-234` own prototype data props → C-015.
- `setprototypeof/index.js:3,6,12` export of native `Object.setPrototypeOf` with legacy fallbacks → C-016.
- `inherits/inherits_browser.js` (not loaded in Node) ctor.prototype rewires → C-024.
- `etag/index.js:29`, `statuses/index.js:96,109` `Object.prototype.toString/hasOwnProperty` reads only.
- Zero `Reflect.*` hits, zero `Object.assign` hits.

## Skill pattern group 4 — patch/wrap/shim/polyfill keywords (case-insensitive)

Pattern: `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`
Result: HITS.
- `on-finished/index.js:129,181,188` "node.js 0.8 patch" / `patchAssignSocket` → C-005 (key candidate).
- `on-finished/index.js:215-220` `wrap()` AsyncResource.bind backport → C-007 area (no mutation).
- `depd/index.js:436,469,477` wrapproperty comments → C-010.
- `depd/lib/browser/index.js:57`, `inherits/inherits_browser.js:17` browser-only → C-024.

## Skill pattern group 5 — module loader interception

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`
Result: ZERO HITS across entire scope.

## Skill pattern group 6 — internal bindings / private core paths

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`
Result: ZERO HITS across entire scope.

## Supplementary searches

- Assignments onto core module objects: `\b(fs|http|https|stream|net|tty|util|crypto|path|events|os|zlib|Stream|Buffer|EventEmitter)\s*\.\s*[A-Za-z_$][\w$]*\s*=[^=]` → ZERO HITS.
- Deletions on core/global objects: `delete\s+(process|fs|http|stream|util|Error|Object|require)` → 1 HIT: `debug/src/node.js:209` `delete process.env.DEBUG` → C-018.
- `Error.prepareStackTrace|Error.stackTraceLimit|captureStackTrace` (manual follow-up while reading depd/http-errors): hits in `depd/index.js:382-396` (→ C-008/F-001) and `http-errors/index.js:89,134,205` (`Error.captureStackTrace` read-only call, no hook write).

## Node.js baseline verification (targeted, $NODEJS_SOURCE @ d44625a4b80)

- `lib/util.js:344-363` — `inherits()` implementation: defines `super_` on ctor and `ObjectSetPrototypeOf(ctor.prototype, superCtor.prototype)`; superCtor untouched.
- `lib/internal/http/outgoing.js:130-201` — `OutgoingMessage` constructor; line 187 `this[kSocket] = null;`; line 304 `socket` prototype accessor returning `this[kSocket]`. Hence `res.socket` is `null`, never `undefined`, before socket assignment.
- `lib/internal/http/server.js:312` — `ServerResponse.prototype.assignSocket` exists (the function on-finished would wrap on Node 0.8).
- `lib/internal/errors.js:91-145` — Node honors user-set `Error.prepareStackTrace` (V8 stack trace API); confirms it is a live, shared global hook.
- No recursive scans of the Node tree were performed; only the files above were opened.

## Upstream corroboration

- `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` → dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed); dougwilson/nodejs-depd#36 "Incopatibile with --enable-source-maps node 12 option" (closed).
- `gh search issues --repo jshttp/on-finished "assignSocket"` → only jshttp/on-finished#10 (early-trigger, tangential). The 0.8 patch is documented by the code comment itself.

## Dynamic verification

- `node repro-check.js "$PACKAGE_ROOT"` (script beside this file), Node 24.19.0. Results in report.md F-001 evidence and C-005 rejection evidence; all sampled core identities (fs.createReadStream, fs.stat, Stream.prototype.pipe, ServerResponse.prototype.{setHeader,end,assignSocket}, EventEmitter.prototype.{on,emit}, Error.prototype own props, Object.setPrototypeOf) unchanged after `require('send')` and after serving real 200/404 responses.
