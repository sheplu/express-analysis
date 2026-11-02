# Node.js patch audit: send

- Verdict: **confirmed patching** — one transient, transitively-applied shared-global mutation (`Error.prepareStackTrace` / `Error.stackTraceLimit` by depd); zero permanent mutations and zero reachable instance overrides of core objects.
- Status: complete
- Input: issue sheplu/express-analysis#23 — `send` (streaming static file server), https://github.com/pillarjs/send
- Library: send@1.2.1, `$PACKAGE_ROOT` = clone of pillarjs/send default branch `master` @ 092f3fc77f0e796519ac328c543c11cced8f2244; shipped runtime file: `index.js` (per package.json `files`); runtime deps installed with `npm install --ignore-scripts --omit=dev`. sha256(index.js) = 17d2352806284e6ff6880542c54e9086cc471ea8b69c4ff44eabe21bce978db7.
- Node.js baseline: `$NODEJS_SOURCE` = nodejs/node main @ d44625a4b80c672215b469906ce583ce7eeeebaf (read-only; targeted files only).
- Reproduction runtime: Node 24.19.0 (`node repro-check.js "$PACKAGE_ROOT"`, script beside this report).
- Scope: production/runtime only — `$PACKAGE_ROOT/index.js` and all 17 resolved runtime dependencies at their installed versions (debug@4.4.3, depd@2.0.0, ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, etag@1.8.1, fresh@2.0.0, http-errors@2.0.1, inherits@2.0.4, mime-db@1.54.0, mime-types@3.0.2, ms@2.1.3, on-finished@2.4.2, range-parser@1.3.0, setprototypeof@1.2.0, statuses@2.0.2, toidentifier@1.0.1). Tests, examples, docs, devDependencies excluded. Browser-only variants scanned but marked not-loaded under Node.
- Coverage: source — complete (every dependency entrypoint and every runtime JS file in the flat tree read or pattern-scanned; six skill pattern groups plus two supplementary searches, see searches.md). Upstream — partial-targeted (issue searches for the two notable patch targets). Runtime — reproduction executed (load-time instrumentation + live 200/404 requests + core-identity snapshot comparison).

## Patching verdict

Patching was demonstrated: exactly **one confirmed patch**, a **transient shared
core-global mutation** applied **transitively** (send → http-errors@2.0.1 →
depd@2.0.0). depd's `getStack()` assigns `Error.prepareStackTrace` and raises
`Error.stackTraceLimit` on the global `Error` constructor, then synchronously
restores both. It runs unconditionally during `require('send')` and again on any
emitted deprecation log. No permanent shared mutation, no core prototype write,
no reachable core-backed instance override, no module-loader interception, and
no core source rewrite was found anywhere in the inspected scope. One latent
instance-override patch exists in on-finished (`patchAssignSocket`) but is
demonstrably unreachable on any Node able to run send (guard is true only on
Node 0.8). 0 unresolved candidates remain; 24 candidates were rejected (ledger
below and candidates.md).

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` and `Error.stackTraceLimit` transiently replaced by depd `getStack()`

- Category: shared core mutation (global `Error` constructor hook) — transient, save-and-restore
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:381-399` (write at :386-387, restore at :395-396); https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399
- Origin: transitive — send@1.2.1 → http-errors@2.0.1 (`index.js:15` `require('depd')('http-errors')`) → depd@2.0.0
- Core baseline: `Error.prepareStackTrace` is the V8 stack-trace-API hook honored by Node for every `error.stack` materialization ($NODEJS_SOURCE lib/internal/errors.js:91-145, `prepareStackTraceCallback`; https://v8.dev/docs/stack-trace-api). Default: undefined (Node's internal formatter used); `Error.stackTraceLimit` default 10.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (returns the raw `CallSite[]` instead of a formatted string) and `Error.stackTraceLimit = Math.max(10, limit)`; after `Error.captureStackTrace(obj)` and reading `obj.stack`, both originals are written back.
- Execution chain: `require('send')` → `$PACKAGE_ROOT/index.js:15` `require('http-errors')` → `node_modules/http-errors/index.js:15` `require('depd')('http-errors')` → `depd()` `node_modules/depd/index.js:108` `getStack()`. Secondary chain at runtime: `deprecate(message)` → `log()` `depd/index.js:199` `getStack()` (only when a deprecation fires; send's own code paths never fire one — it only creates 4xx/5xx errors).
- Activation: unconditional at module load of send (no env guard; `NO_DEPRECATION` does not skip the load-time call because it happens inside `depd()` itself). Production code path.
- Scope and restoration: process-wide global, affected for a synchronous window with no user code in between; fully restored (save/restore of both values). No permanent change remains after load — verified.
- Resulting behavior: during the window, any stack capture resolves to a raw CallSite array and the effective stack limit is >= 10. Practical risks are interference cases: a pre-existing application/tooling `prepareStackTrace` (e.g. source-map rewriting) is bypassed for depd's own capture and must survive a foreign write/restore cycle; a non-writable or accessor-protected `Error.prepareStackTrace` (e.g. frozen-intrinsics-style hardening) can throw or misbehave.
- Evidence: static — code at depd/index.js:381-399 with unconditional call at :108; dynamic — repro-check.js on Node 24.19.0 instrumented `Error.prepareStackTrace` with an accessor and observed exactly 2 writes during `require('send')` (`["prepareObjectStackTrace","undefined"]`), with both `prepareStackTrace` and `stackTraceLimit` restored after load and still unchanged after serving live requests.
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed — maintainer explains the capture technique); dougwilson/nodejs-depd#36 "Incopatibile with --enable-source-maps node 12 option" (closed) — real-world interference reports for exactly this write. Behavior present and unchanged in installed depd@2.0.0.

No other confirmed patches. In particular, no shared prototype of `http`, `fs`,
`stream`, or `events` is written anywhere in scope, and no reachable core-backed
instance method is replaced.

## Candidate ledger and unresolved questions

Full ledger with reasons: candidates.md (same folder). Summary:

| ID | Site and core target | Status | Evidence / reason |
| --- | --- | --- | --- |
| C-001 | index.js:155 `util.inherits(SendStream, Stream)` | rejected | mutates only SendStream ($NODEJS_SOURCE lib/util.js:344-363) |
| C-002 | index.js:403 `SendStream.prototype.pipe` shadowing Stream's | rejected | library-owned subclass prototype |
| C-003 | index.js res/req usage (setHeader, statusCode, end, ...) | rejected | documented public APIs, no replacement |
| C-004 | index.js:675-705 fs.createReadStream / stream.destroy | rejected | documented APIs on library-created instance |
| C-005 | on-finished/index.js:189-199 `patchAssignSocket` (res.assignSocket instance override) | rejected (unreachable latent patch) | guard `msg.socket === undefined` false on all Node >= 0.10: ctor sets `kSocket = null` ($NODEJS_SOURCE lib/internal/http/outgoing.js:187, accessor :304); send requires Node >= 18; repro confirms no own property added |
| C-006 | on-finished/index.js:147 `msg.__onFinished` expando | rejected | instance metadata, not a patch (skill rule) |
| C-007 | on-finished listeners + AsyncResource bind backport | rejected | supported APIs |
| C-008 | depd/index.js:381-399 Error.prepareStackTrace/stackTraceLimit | **confirmed → F-001** | see above |
| C-009/C-010 | depd wrapfunction/wrapproperty | rejected | not invoked in scope; caller-owned targets |
| C-011 | depd DeprecationError defineProperty | rejected | library-created instance |
| C-012 | http-errors inherits(HttpError, Error) | rejected | subclassing; Error.prototype untouched (repro) |
| C-013 | http-errors setPrototypeOf(err, ...) | rejected | library-created Error instance |
| C-014/C-015 | http-errors defineProperty / prototype data props | rejected | library-owned objects |
| C-016 | setprototypeof fallback (`__proto__`/mixin) | rejected | native builtin exported unchanged; fallbacks dead on Node >= 0.12 |
| C-017 | inherits re-export of util.inherits | rejected | read-only re-export |
| C-018 | debug save(): `process.env.DEBUG` write/delete at import | rejected | documented mutable process state, idempotent at load (repro: env presence unchanged) |
| C-019-C-021 | debug own-object defineProperty / util.deprecate / optional supports-color | rejected | library-owned; dep not installed |
| C-022 | etag `fs.Stats` instanceof | rejected | read-only |
| C-023 | ee-first on/removeListener | rejected | supported EventEmitter API |
| C-024 | browser-only variants (debug, depd, inherits) | rejected | not loaded under Node |
| C-025 | pure deps' module-load side effects (statuses, mime-*, ms, fresh, range-parser, encodeurl, escape-html, toidentifier) | rejected | module-local data only; zero hits in mutation searches |

Unresolved: none.

## Supporting context

- **debug env write (C-018):** at import, debug@4.4.3 runs `createDebug.enable(createDebug.load())` (`debug/src/common.js`, setup tail), which calls `save()` (`debug/src/node.js:203-210`) and writes back or deletes `process.env.DEBUG`. This mutates core-backed process state but through its documented read-write interface and is value-idempotent at load; if an application later calls `debug.enable(...)`, the env of subsequently spawned child processes is affected. Not a core API patch.
- **on-finished latent patch (C-005):** `patchAssignSocket` is genuine instance-patching code (wraps and replaces `res.assignSocket` as an own property) retained for Node 0.8, where `res.socket` was `undefined` before assignment and the `'socket'` event was unreliable. Dead on every Node version that can load send (engines >= 18); kept here so a pass-B comparison can reconcile it explicitly.
- **on-finished instance metadata (C-006):** `msg.__onFinished` expando on the ServerResponse instance — metadata, not behavior replacement.
- **http-errors Error subclassing (C-012/C-013):** `inherits(HttpError, Error)` plus per-instance `setPrototypeOf(new Error(msg), SubClass.prototype)` is ES5-style subclassing of `Error`; the shared `Error.prototype` is never written (verified statically and by own-property snapshot in repro).
- **setprototypeof (C-016):** on modern Node it simply re-exports the native `Object.setPrototypeOf`; the `__proto__`-assignment and property-mixin branches are legacy fallbacks acting only on caller-passed (library-created) objects.
- send itself (`index.js`) touches req/res exclusively through documented APIs (headers, statusCode, end, events) and manages its fs.ReadStream via documented `pipe`/`destroy`/error-event handling; no private `_http_*` or `internal/` access anywhere in scope.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js` + 17 deps' runtime JS (25 files) | six skill pattern groups + 2 supplementary `rg -n --no-ignore` searches (searches.md) | groups 5 and 6 zero-hit; all other hits resolved in ledger |
| `$PACKAGE_ROOT/node_modules/*` versions | `node -e "require('<dep>/package.json')"` per dep | resolved tree matches task provenance exactly; flat tree, no nested node_modules |
| `$NODEJS_SOURCE/lib/util.js:344-363` | targeted read | `inherits` writes only to ctor — rejects C-001/C-012/C-017 |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js:130-201,280-315` | targeted read | `this[kSocket] = null` (:187) + `socket` accessor (:304) — rejects C-005 reachability |
| `$NODEJS_SOURCE/lib/internal/http/server.js:312` | targeted grep | `ServerResponse.prototype.assignSocket` exists (the would-be wrap target) |
| `$NODEJS_SOURCE/lib/internal/errors.js:91-145` | targeted read | Node honors user `Error.prepareStackTrace` — core baseline for F-001 |
| dougwilson/nodejs-depd | `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` | #32 (closed) and #36 (closed) corroborate F-001's target and real-world interference |
| jshttp/on-finished | `gh search issues --repo jshttp/on-finished "assignSocket"` | only tangential #10; 0.8 patch documented by in-code comment |
| Runtime reproduction | `node repro-check.js "$PACKAGE_ROOT"` (Node 24.19.0) | 2 transient prepareStackTrace writes at load, full restoration; no assignSocket override; all sampled core identities unchanged after live 200/404 requests |
| Provenance hashes (sha256) | `shasum -a 256` | index.js 17d2352806284e6ff6880542c54e9086cc471ea8b69c4ff44eabe21bce978db7; depd/index.js 4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91; on-finished/index.js ecd342e4d92b4f4df3e1af6a1ee4028ced17421702e0ec93fe2dd5afff3a4807; http-errors/index.js 33bda88afcd1a83566eb4ebb305f852b701e19aad5e1d92cb3a11161d35c50f0; debug/src/node.js d7b26d7c92f8ea7794b77ce11f3c11cd18c9084df7c357e3c7025344fa28aac6; debug/src/common.js dbe83d2bb5837f3c4d7fe537b8004c585987270eceed5b06b8e078deb0ae214a; setprototypeof/index.js 3e3495ca7ae72a7f0ca459f47dd3d97ae3a48fa4b1a669a31672be778cc97a5f; inherits/inherits.js bb380f32bef5feb18678f0f45f88073fed5d7a0069a309132cb2080cd553d5c7; ee-first/index.js 29d3cccddc7148f48715bfc94eb6f7b9f9132a5ecb704b9d4b713de87e7603dd |

## Coverage and limitations

- Entry points: send's single shipped runtime file `index.js`; every resolved runtime dependency's `main` entry and all helper files it loads under Node were inspected (25 runtime JS files). `mime-db` is a JSON data export. Browser-only variants were scanned and excluded as not loaded (guards/`browser` field).
- Node.js files verified at `$NODEJS_SOURCE` main @ d44625a4b80 only (not at every release in send's support range). The C-005 rejection relies on `OutgoingMessage` initializing `socket` to `null`, which has held since long before Node 18 (send's engine floor); an exotic runtime where `res.socket === undefined` while `assignSocket` is a function would activate the latent instance patch — no supported Node release in range does.
- Reproduction ran on Node 24.19.0 only; the tested branches cover the load path, a 200 streaming response, and a 404 error response. Untested in-process branches (range/304/412/HEAD, SendStream 'error'-listener path) use the same documented APIs already inspected statically; a tested branch cannot prove universal absence.
- Upstream corroboration was targeted (two issue searches on the observed patch targets), not an archive sweep.
- `depd.wrapfunction`/`wrapproperty` (capable of descriptor rewrites on arbitrary objects) are exported but proven uncalled within this scope; a different consumer of depd could activate them — out of scope here.
- What would change the verdict: nothing found suggests additional patches; removing F-001 would require depd to drop the `Error.prepareStackTrace` capture (no such change exists in depd@2.0.0).

## Changes since the previous audit

First audit (pass A, blind). No previous report existed in this pass's folder.
