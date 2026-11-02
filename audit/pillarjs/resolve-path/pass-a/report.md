# Node.js patch audit: resolve-path

- Verdict: confirmed patching (transient, fully restored shared-global mutations only; no permanent patch)
- Status: complete
- Input: issue sheplu/express-analysis#27 — `resolve-path` (pillarjs/resolve-path), PASS A of a two-pass blind audit
- Library: resolve-path@1.4.0, git `master` @ `4b98ecfd39a342fbf8b909844a9ec13fe2fa8cc5`, source checkout with runtime deps installed via `npm install --ignore-scripts --omit=dev`; resolved tree: http-errors@1.6.3, path-is-absolute@1.0.1, depd@1.1.2, setprototypeof@1.1.0, statuses@1.5.0, inherits@2.0.3 (nested under http-errors)
- Node.js baseline: `$NODEJS_SOURCE` main @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (read-only, targeted files only)
- Reproduction runtime: Node v24.19.0 (probe scripts beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` plus every resolved runtime dependency's entrypoint and all helpers reachable from them; tests/examples/docs/devDependencies excluded; browser-only files scanned but marked not loaded under Node
- Coverage: source — complete (every shipped runtime `.js` in the resolved tree read in full); upstream — depd issue tracker corroboration for both findings; runtime — identity and spy probes run on v24.19.0

## Patching verdict

Patching is demonstrated, with an important qualifier: the only confirmed
mutations are **transient** writes to two shared global properties of the
`Error` constructor — `Error.prepareStackTrace` and `Error.stackTraceLimit` —
performed by the transitive dependency depd@1.1.2 and **synchronously restored**
within the same function call before any user code can run. They execute
unconditionally at `require('resolve-path')` time (three swap/restore pairs:
depd init, depd lazy `callSiteToString` init, depd `wrapfunction` during
http-errors' `"I'mateapot"` deprecation wrapper) and again whenever a depd
deprecation message is actually logged.

Counts:
- Shared core mutations: 2 confirmed (F-001, F-002), both transitive
  (resolve-path -> http-errors@1.6.3 -> depd@1.1.2), both transient/restored,
  zero permanent.
- Instance/application overrides of core-backed objects: 0. (http-errors'
  `setPrototypeOf`/`defineProperty` calls target only error instances it
  creates itself; see supporting context.)
- Core module interception / core source rewrites: 0 (zero hits on loader,
  binding, and internals patterns).
- Unresolved candidates: 0. Excluded branches: browser-only entries
  (`depd/lib/browser`, `inherits_browser.js`) never load under Node;
  setprototypeof/`path-is-absolute` fallback branches are dead on modern Node
  but mutate nothing shared even if taken.

After import completes and during all normal resolve-path calls (success, 400,
403 paths), every inspected core identity is bit-for-bit unchanged (dynamic
diff: empty).

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` — transient reassignment to depd's `prepareObjectStackTrace`

- Category: shared core mutation (transient; saved and synchronously restored)
- Library site(s):
  - `node_modules/depd/index.js:368-379` (`getStack`): https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/index.js#L365-L383
  - `node_modules/depd/lib/compat/index.js:24-39` (lazy `callSiteToString` initializer): https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/lib/compat/index.js#L21-L43
- Origin: transitive — resolve-path@1.4.0 -> http-errors@1.6.3 -> depd@1.1.2
- Core baseline: `$NODEJS_SOURCE/lib/internal/errors.js:136-162` @ `d44625a4b80` — Node's `prepareStackTraceCallback` explicitly consults the global `Error.prepareStackTrace` ("Polyfill of V8's Error.prepareStackTrace API") and, when it is a function, delegates all stack formatting to it; default behavior is `defaultPrepareStackTrace` (plain-text frames, source-map aware pipeline).
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (a function returning the raw V8 CallSite array), after saving the prior value; restored to the saved value a few statements later in the same synchronous frame.
- Execution chain: `require('resolve-path')` (`index.js:15`) -> `require('http-errors')` -> `http-errors/index.js:15` `depd('http-errors')` -> `depd/index.js:110` `getStack()` -> write at `index.js:370`, restore at `index.js:379`. Second chain: `depd/index.js:11` property read `require('./lib/compat').callSiteToString` fires the lazy getter -> write at `lib/compat/index.js:30`, restore at `:39`. Third chain: `http-errors/index.js:247` `deprecate.function(exports.ImATeapot, ...)` -> `wrapfunction` -> `getStack()` (`depd/index.js:404`). Post-import chain: any depd log emission (`depd/index.js:183`).
- Activation: unconditional on import of resolve-path; no guards (not even `process.noDeprecation` prevents the import-time swaps); production code path.
- Scope and restoration: process-wide — the global `Error` constructor shared by all main-context stack formatting; restored synchronously within each call, no await/IO inside the window; after import the original value is back (verified by identity).
- Resulting behavior: during each window, any `error.stack` materialization anywhere in the process would be formatted by depd's callback (returning a CallSite array instead of a string) instead of Node's default/source-map-aware formatter. Practically the window contains only depd's own `Error.captureStackTrace(obj)`; the lasting effect is nil, but the mechanism is exactly how Node core reads the property (`lib/internal/errors.js:149-157`), and historically it conflicted with `--enable-source-maps` (upstream #36).
- Evidence: static — code at the sites above; dynamic — `node probe-transient-writes.js "$PACKAGE_ROOT"` on v24.19.0 logs exactly 3 `set -> prepareObjectStackTrace` / `set -> ErrorPrepareStackTrace` (restore) pairs during require, 0 writes during success/400/403 calls, final identity `=== original` true. Clean probe (`probe-identities.js`) shows empty before/after diff.
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed — maintainer-acknowledged design); #36 "Incompatible with --enable-source-maps node 12 option" (closed) — both describe this exact mechanism; present unchanged in audited v1.1.2.

### F-002: `Error.stackTraceLimit` — transient reassignment (raise to >=10 / lower to 2)

- Category: shared core mutation (transient; saved and synchronously restored)
- Library site(s):
  - `node_modules/depd/index.js:366,371,380`: `Error.stackTraceLimit = Math.max(10, limit)` then restore
  - `node_modules/depd/lib/compat/index.js:22,31,40`: `Error.stackTraceLimit = 2` then restore
  - Pinned links as in F-001.
- Origin: transitive — resolve-path@1.4.0 -> http-errors@1.6.3 -> depd@1.1.2
- Core baseline: `Error.stackTraceLimit` is the V8-owned data property on the global `Error` constructor (default 10) that V8 reads at stack-capture time; Node core and user code share the single value. (V8 reads it as a data property — an accessor there breaks `Error.captureStackTrace`, observed during probe construction.)
- Exact mutation: data-property write on the global `Error` constructor; same save/restore discipline and same three import-time sites/windows as F-001.
- Execution chain / Activation: identical to F-001 (same functions, adjacent lines); unconditional at import, plus every emitted deprecation log afterwards.
- Scope and restoration: process-wide value; restored synchronously; verified value `10 (original 10)` after import and calls.
- Resulting behavior: within each window, stack captures anywhere in the process would be truncated to 2 frames (compat site) or raised to >=10 (getStack site). Lasting effect nil; window contains only depd's own capture.
- Evidence: static — sites above; dynamic — restoration verified by value in both probes (accessor spy not possible for this property; limitation noted in `probe-transient-writes.js`).
- Upstream: same depd design discussion as F-001 (dougwilson/nodejs-depd#32); unchanged in v1.1.2.

No other patches were confirmed. resolve-path's own `index.js` performs zero
mutations (pure reads of `path` functions and `process.cwd()`); http-errors,
statuses, path-is-absolute, setprototypeof, and inherits write only to objects
they own (details below and in the ledger).

## Candidate ledger and unresolved questions

Full ledger with reasons: `candidates.md` (same folder). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | depd/index.js:370-380, `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001, F-002 | save/reassign/restore in `getStack`; runs at import + on log |
| C-002 | depd/lib/compat/index.js:30-40, same targets | confirmed -> F-001, F-002 | same swap in lazy `callSiteToString` init at import |
| C-003 | depd/index.js:410 `eval` wrapper | rejected as patch | wraps http-errors' own ImATeapot ctor; nothing core replaced |
| C-004 | depd wrapproperty defineProperty | rejected (not activated) | no caller in this chain |
| C-005 | http-errors inherits(..., Error) | rejected as patch | util.inherits mutates only library ctors ($NODEJS_SOURCE/lib/util.js:344-363) |
| C-006/7 | http-errors setPrototypeOf/defineProperty on `err` | rejected as patch | instances created by http-errors itself |
| C-008 | ClientError/ServerError.prototype writes | rejected as patch | library-owned prototypes |
| C-009/10 | setprototypeof export/fallbacks | rejected as patch | export === native `Object.setPrototypeOf` (verified); fallbacks mutate passed object only |
| C-011 | path-is-absolute | rejected as patch | ponyfill; never imports/touches `path` (verified statically + identity-stable dynamically) |
| C-012 | statuses property population | rejected as patch | writes to its own export only |
| C-013 | nested inherits@2.0.3 | rejected as patch | re-exports util.inherits unchanged |
| C-014–C-020 | remaining depd/browser/captureStackTrace/process.emit sites | rejected as patch | own-object writes, dead branches, or pure API usage |

Unresolved: none.

## Supporting context

- **eval at import (depd)**: `depd/index.js:410` `wrapfunction` builds the
  deprecation wrapper via `eval`, executed once at import because
  http-errors@1.6.3 wraps its legacy `"I'mateapot"` export
  (`http-errors/index.js:247-248`). The generated function wraps a
  library-owned constructor — not a core patch — but the import of
  resolve-path fails outright under `--disallow-code-generation-from-strings`
  and `--frozen-intrinsics` would also reject F-001/F-002's writes (upstream
  dougwilson/nodejs-depd#41 open, #44 closed, #53 open).
- **V8 stack-trace API usage**: `Error.captureStackTrace` calls in depd and
  http-errors are reads/invocations of a V8-provided API on objects the
  libraries own; no shared state is written.
- **Instance prototype surgery (http-errors)**: `ClientError`/`ServerError`
  create `new Error(msg)` and immediately `setPrototypeOf(err, <own proto>)` +
  redefine `message`/`name` (`http-errors/index.js:134-162,181-209`). All
  targets are objects the library just created; `Error.prototype` own-key set
  verified unchanged.
- **Ponyfills, not polyfills**: path-is-absolute exports its own functions and
  never references the `path` module; setprototypeof@1.1.0 resolves to the
  native `Object.setPrototypeOf` on modern Node and installs nothing onto
  `Object`; depd's `eventListenerCount` compat takes the native
  `EventEmitter.listenerCount` branch (`$NODEJS_SOURCE/lib/events.js:218`).
- **`process.emit('deprecation', err)`** (`depd/index.js:235`): emits a
  library-defined event; no listener installed, no core method overridden.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree | `find node_modules -name '*.js' -not -path '*/test/*'`; all 12 files + `index.js` read in full | complete runtime file inventory; no bundled/dist variants |
| Six candidate pattern groups + eval/stack sweep | `rg -n --no-ignore <group> <runtime files>` (full log in `searches.md`) | G5 (loader interception) and G6 (internals/bindings) zero-hit; all other hits traced in ledger |
| `$NODEJS_SOURCE/lib/internal/errors.js:86-166` | targeted read @ `d44625a4b80` | core consults global `Error.prepareStackTrace` -> F-001 is a real behavioral swap during its window |
| `$NODEJS_SOURCE/lib/util.js:344-363` | targeted read | `util.inherits` mutates only the passed ctor -> C-005 rejected |
| `$NODEJS_SOURCE/lib/events.js:218` | targeted grep `listenerCount` | native static exists -> depd compat ponyfill branch dead |
| `$NODEJS_SOURCE/lib/path.js` | targeted grep `isAbsolute` | native implementation present; path-is-absolute installs nothing |
| Reproduction | `node probe-identities.js "$PACKAGE_ROOT"` (v24.19.0) | empty before/after identity diff across import + success/400/403 calls; `setprototypeof === Object.setPrototypeOf`; `path.isAbsolute` stable; nested inherits === util.inherits |
| Reproduction | `node probe-transient-writes.js "$PACKAGE_ROOT"` (v24.19.0) | 3 transient `prepareStackTrace` swap/restore pairs during require; 0 during calls; full restoration |
| Upstream depd | https://github.com/dougwilson/nodejs-depd/issues/32 (closed), /36 (closed), /41 (open), /44 (closed), /53 (open) | corroborate Error-property swapping and eval concerns for exactly this code |
| Manifests | package.json of target + 6 deps | no lifecycle scripts; install was `--ignore-scripts` regardless |

File hashes (SHA-256, relative to `$PACKAGE_ROOT`):

```
21291b41cefd4e72a266eaac0bc17669548df8c328535b5c8b7191bc6b82ad9d  index.js
244dbbca14b8aa9c9b6be04912283ab704b92f11dcb9b23beb2ba81402fecc99  node_modules/depd/index.js
76baf83317ac81045cefb9fcc8ec0d8e47dd0cfcbadd592f480349412e161861  node_modules/depd/lib/compat/index.js
702ab02dc767bd351fca5f9faa659327f22f4cfd2684e0a33b23447838f5773b  node_modules/depd/lib/compat/callsite-tostring.js
5dc8bef6d7641158ccd485fece7fcf46566fe95b42e40a48ded7ea43366f0968  node_modules/depd/lib/compat/event-listener-count.js
10b4d4a4e9d14e9e6a5ab7ced64405ef90e6bec94d479a8e223cbba88828ad79  node_modules/depd/lib/browser/index.js
ddbc667ac4552a98c35705903989470feb9e0269d3db4823b04beef432777684  node_modules/http-errors/index.js
7af9a5f76c00f72bed44b83824a8acd67febcfd3d34fd293c20c35aa7e6657f6  node_modules/http-errors/node_modules/inherits/inherits.js
34a98a1fcd39e12adbc98cc2d6dc3d99bb5a5a83ce8e57050826e9e539b4ecb0  node_modules/http-errors/node_modules/inherits/inherits_browser.js
4eb1119c3eeccc4d8e8841b77d062abaf4572b332801f5b16175bc3311b5d8f1  node_modules/path-is-absolute/index.js
a6f0cb10a8015d386fb71416031b55fa0df423a69da629f4a07aadb4763acb12  node_modules/setprototypeof/index.js
4f8b0e8e9e9cff773ba540daf8a065d9b19b2ee1d108acc0172614f81b11ef0b  node_modules/statuses/index.js
bedb2a387444b2ceff09e8a8c4fc97bf6b046e5984a3a229ea57de1dd299d409  node_modules/statuses/codes.json
```

## Coverage and limitations

- Entry points: `resolve-path/index.js` (sole export, `files: [index.js]`);
  dependency entrypoints depd/index.js, http-errors/index.js,
  path-is-absolute/index.js, setprototypeof/index.js, statuses/index.js,
  nested inherits/inherits.js — all read in full, all helpers followed at the
  resolved versions listed in metadata. statuses `codes.json` is data only.
- Branches not executed on modern Node (statically shown to mutate nothing
  shared regardless): setprototypeof `__proto__`/mixin fallbacks; depd compat
  `callsite-tostring.js` and `event-listener-count.js` ponyfills;
  `inherits_browser.js`; `depd/lib/browser/`.
- Reproduction covers Node v24.19.0 only; the transient windows are
  synchronous JS with no await/IO, so the restoration argument is static and
  version-independent; worker threads have their own JS globals, so no
  cross-thread exposure exists.
- `Error.stackTraceLimit` writes could not be accessor-spied (V8 reads it as a
  data property; an accessor breaks `Error.captureStackTrace`) — proven
  statically, restoration verified by value.
- Node baseline is `main @ d44625a4b80`, not a release tag; the consulted
  mechanisms (`prepareStackTraceCallback` reading `Error.prepareStackTrace`,
  `util.inherits`) are long-stable, but line numbers are pinned to that
  commit.
- BLIND PASS A: no other audit material was read; nothing outside the pass-a
  folder was written; audited sources unmodified.
- What would change the verdict: a consumer path invoking
  `deprecate.property`/`wrapproperty` against a core object (none exists in
  this tree), or evidence that a depd window can interleave with foreign stack
  captures (it cannot in synchronous single-threaded execution).

## Changes since the previous audit

First audit (PASS A of the blind two-pass protocol); no prior report existed
in this folder.
