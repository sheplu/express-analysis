# Node.js patch audit: resolve-path (pass B, blind)

- Verdict: confirmed patching (transient, transitive; fully restored synchronously; no permanent mutation remains)
- Status: complete
- Input: issue sheplu/express-analysis#27 — `resolve-path` (https://github.com/pillarjs/resolve-path)
- Library: resolve-path@1.4.0, `$PACKAGE_ROOT` = clone of pillarjs/resolve-path, default branch `master` @ `4b98ecfd39a342fbf8b909844a9ec13fe2fa8cc5`, plain npm artifact layout, no local changes. Runtime deps installed with `npm install --ignore-scripts --omit=dev`: http-errors@1.6.3, path-is-absolute@1.0.1, depd@1.1.2, setprototypeof@1.1.0, statuses@1.5.0, inherits@2.0.3 (nested at node_modules/http-errors/node_modules/inherits).
- Node.js baseline: `$NODEJS_SOURCE` main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, read-only, no local changes.
- Reproduction runtime: Node v24.19.0 (`node repro/repro.js "$PACKAGE_ROOT"`).
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` plus every resolved runtime dependency entrypoint and its reachable helpers at the resolved versions above. Tests, examples, docs, devDependencies, and browser-field files excluded (browser files inspected once to confirm they are not loaded by Node).
- Coverage: source — complete for the runtime file set (12 files, all read in full); upstream — depd issue tracker corroboration retrieved; runtime — repro executed with before/after snapshots and an accessor trap on `Error.prepareStackTrace`. Limitation: `Error.stackTraceLimit` cannot be accessor-trapped (V8 reads it via a data-property fast path; the trap disables stack capture), so its transient value was observed indirectly at each `prepareStackTrace` set event.

## Patching verdict

Patching is demonstrated, but it is entirely transient and transitive. The
dependency depd@1.1.2 (reached as resolve-path -> http-errors@1.6.3 -> depd)
writes to two shared core/intrinsic globals — `Error.prepareStackTrace` and
`Error.stackTraceLimit` — and restores the saved originals in the same
synchronous frame. Two distinct library sites perform this swap (F-001, F-002).
On the repro runtime (Node v24.19.0) the swap replaces Node core's own
startup-installed `Error.prepareStackTrace` (`ErrorPrepareStackTrace`,
installed from `$NODEJS_SOURCE/lib/internal/errors.js`), so during each window
Node's default/source-map-aware stack formatting is displaced process-wide.

Counts:
- Shared core mutations: 2 confirmed sites (F-001, F-002), both transient with
  synchronous save/restore, both transitive via http-errors -> depd. Three
  swap windows execute unconditionally at `require('resolve-path')` time;
  additional windows occur only if a deprecation is actually logged (not
  triggered by resolve-path's own API usage).
- Instance/application overrides counted as patches: 0. http-errors mutates
  only Error instances it creates itself (C-006) and its own constructors'
  prototypes (C-007) — ordinary, library-owned construction, not core patching.
- Permanent mutations of any core surface: 0 (verified by snapshot diff).
- Core module interception / core source rewrites: 0 (zero hits, groups 5-6).
- Unresolved candidates: 0. 14 candidates rejected with reasons (ledger).

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` and `Error.stackTraceLimit` transiently replaced by depd `getStack()`

- Category: shared core mutation (transient, save/restore; global `Error` intrinsic)
- Library site(s): depd@1.1.2 `node_modules/depd/index.js:365-383` (write :370-371, restore :379-380); https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/index.js#L365-L383
- Origin: transitive — resolve-path@1.4.0 -> http-errors@1.6.3 (`node_modules/http-errors/index.js:15`) -> depd@1.1.2
- Core baseline: `Error.prepareStackTrace` is the documented V8 stack-trace API hook; on modern Node it is installed by core at startup and consumed via `$NODEJS_SOURCE/lib/internal/errors.js:136-166` (`prepareStackTraceCallback` dispatches to a user/core-assigned `Error.prepareStackTrace`). `Error.stackTraceLimit` is the V8 frame-count control; Node core itself uses the identical transient save/restore pattern (`lib/internal/errors.js:181-188`, `416-419`). Default observed on Node v24.19.0: `prepareStackTrace = function ErrorPrepareStackTrace`, `stackTraceLimit = 10`.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (returns the raw CallSite array) and `Error.stackTraceLimit = Math.max(10, limit)`; after `Error.captureStackTrace(obj)` and one `obj.stack` read, both are reassigned to the saved originals.
- Execution chain: `require('resolve-path')` -> `require('http-errors')` -> index.js:15 `require('depd')('http-errors')` -> depd index.js:110 `getStack()`; and index.js:247 `deprecate.function(exports.ImATeapot, …)` -> depd `wrapfunction` index.js:404 `getStack()`; at runtime, any deprecation `log()` -> index.js:183 `getStack()`.
- Activation: unconditional at import of resolve-path (two windows from this site during module load); no environment guards; production code path.
- Scope and restoration: process-wide (the global `Error` constructor) during a purely synchronous window; both properties restored to the exact prior values before `getStack()` returns; no async code can interleave. Repro confirmed identical identity and descriptor before/after.
- Resulting behavior: inside each window, any stack formatted anywhere in the process would receive the CallSite array instead of a string and be truncated/expanded to the swapped limit; in practice only depd's own capture runs. Known real-world effect of the displaced hook: Node's source-map-aware `prepareStackTrace` is bypassed for anything formatted in the window (upstream #36/#39), and the bare writes throw under `node --frozen-intrinsics` (upstream #53), which independently confirms these are writes to shared intrinsics.
- Evidence: static — code at the cited lines; runtime — `repro/repro.js` accessor trap logged swap pairs 2 and 3 during require (`prepareObjectStackTrace` -> `ErrorPrepareStackTrace` restore), zero swaps while exercising resolvePath success/403/400/400, and final values/descriptors identical to the baseline (`repro/repro-output.txt`).
- Upstream: dougwilson/nodejs-depd#32 ("Why is this library overwriting Error type?", closed — maintainer behavior as designed), #36/#39 (source-map conflicts, closed), #53 (`--frozen-intrinsics` incompatibility, open). Pattern unchanged at v1.1.2 (latest 1.x).

### F-002: `Error.prepareStackTrace` and `Error.stackTraceLimit = 2` transiently replaced by depd compat feature detection

- Category: shared core mutation (transient, save/restore; global `Error` intrinsic)
- Library site(s): depd@1.1.2 `node_modules/depd/lib/compat/index.js:21-43` (write :30-31, restore :39-40); https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/lib/compat/index.js#L21-L43
- Origin: transitive — resolve-path@1.4.0 -> http-errors@1.6.3 -> depd@1.1.2 (depd index.js:11 property access fires the `lazyProperty` getter at depd module load)
- Core baseline: same as F-001.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace`; `Error.stackTraceLimit = 2`; capture one stack to detect whether CallSite objects have `toString` (selects the modern path on current Node); restore both saved values.
- Execution chain: `require('resolve-path')` -> `require('http-errors')` -> `require('depd')` -> depd index.js:11 `require('./lib/compat').callSiteToString` -> lazy getter -> swap/restore. Runs exactly once per process (the lazy getter redefines itself as a value property, lib/compat/index.js:57).
- Activation: unconditional at import; one window; production code path.
- Scope and restoration: process-wide during the synchronous window; `Error.stackTraceLimit` observed at 2 inside the window (logged at the restore event of swap pair 1) and restored to 10 afterward.
- Resulting behavior: as F-001; additionally any error formatted inside this window would have its stack truncated to 2 frames (none is in practice).
- Evidence: static — cited lines; runtime — first trap swap pair in `repro/repro-output.txt` ("Error.stackTraceLimit at this moment = 2" on the restore event); descriptors and values fully restored.
- Upstream: same depd issue set as F-001.

## Candidate ledger and unresolved questions

Full ledger with reasons: `candidates.md` (16 candidates: C-001/C-002 confirmed -> F-001/F-002; 14 rejected; 0 unresolved). Summary:

| ID | Site and core target | Status | Reason (short) |
| --- | --- | --- | --- |
| C-001 | depd index.js:365-383, Error.prepareStackTrace/stackTraceLimit | confirmed -> F-001 | transient swap, reachable at import |
| C-002 | depd lib/compat/index.js:21-43, same globals | confirmed -> F-002 | transient swap, fires at depd load |
| C-003 | depd index.js:397-417 eval wrapper | rejected as patch | wraps http-errors' own export, not core |
| C-004 | depd wrapproperty/convertDataDescriptorToAccessor | rejected as patch | unreachable: no `deprecate.property` caller in chain |
| C-005 | setprototypeof@1.1.0 export selection | rejected as patch | re-exports native `Object.setPrototypeOf`; fallbacks unreachable |
| C-006 | http-errors instance setPrototypeOf/defineProperty | rejected as patch | mutates library-created Error instances only |
| C-007 | http-errors inherits()/prototype writes | rejected as patch | util.inherits (`$NODEJS_SOURCE/lib/util.js:344`) mutates subclass only |
| C-008 | inherits@2.0.3 re-export of util.inherits | rejected as patch | read-only re-export |
| C-009 | statuses@1.5.0 export maps | rejected as patch | own exports only |
| C-010 | path-is-absolute@1.0.1 ponyfill | rejected as patch | never installs onto `path`; identity verified |
| C-011 | depd lazyProperty defineProperty | rejected as patch | on depd's own module.exports |
| C-012 | resolve-path index.js | rejected as patch | reads path functions; no writes |
| C-013 | Error.captureStackTrace invocations | rejected as patch | API use, not replacement |
| C-014 | depd DeprecationError defineProperties | rejected as patch | own instance; unreachable from this consumer's calls |
| C-015 | browser-field files (depd, inherits) | rejected as patch | not loaded by Node resolution |
| C-016 | depd compat eventListenerCount detection | rejected as patch | read-only read of EventEmitter.listenerCount |

## Supporting context

- `Error.prepareStackTrace` is a documented, intentionally user-assignable V8
  API (and Node core assigns it itself at startup, `$NODEJS_SOURCE/lib/internal/errors.js`),
  so the depd pattern is a sanctioned use of an extension point; it is still a
  write to a shared intrinsic and is reported as such per the audit taxonomy.
  Node core uses the identical transient `stackTraceLimit` save/restore pattern
  internally (lib/internal/errors.js:181-188, 416-419).
- depd@1.1.2 `wrapfunction` builds the deprecation wrapper with `eval`
  (index.js:410) and this executes at import time in this chain (http-errors
  index.js:247 wraps the `"I'mateapot"` alias). The eval'd code is a local
  function expression wrapping a library export — no core object involved —
  but it makes the chain incompatible with
  `--disallow-code-generation-from-strings` (depd#41) and, together with the
  Error writes, with `--frozen-intrinsics` (depd#53). depd 2.x removed the
  eval; the resolved 1.1.2 retains it.
- setprototypeof@1.1.0 on modern Node is a by-reference re-export of the native
  `Object.setPrototypeOf` (repro: identity equal); its `__proto__`-assignment
  and mixin fallbacks are dead code on supported runtimes.
- path-is-absolute@1.0.1 is a pure ponyfill: resolve-path calls its exported
  `.posix`/`.win32` directly and `path.isAbsolute` is never touched (repro:
  identity unchanged).
- http-errors@1.6.3 error construction (create plain `Error`, then
  `setPrototypeOf(err, ClientError.prototype)` + own-property defineProperty)
  is instance-level work on objects the library creates and throws; the thrown
  400/403 objects observed in the repro carry library prototypes while
  `Error.prototype`'s key set is unchanged.
- No install scripts in any of the seven packages (`--ignore-scripts` was used
  regardless); no loader hooks, no `require.cache`/`Module._*` access, no
  `process.binding`/internals access anywhere in scope.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime file set (12 files) | `rg -n --no-ignore <skill groups 1-6 + extras>` (full log in `searches.md`) | Groups 5-6 zero hits; all other hits resolved in ledger; file SHA-1s recorded below |
| `$NODEJS_SOURCE/lib/util.js:344` | `rg -n "function inherits" lib/util.js` + read | inherits mutates subclass only; baseline for C-007 |
| `$NODEJS_SOURCE/lib/internal/errors.js:136-166,181-188,248,416-419` | `rg -n "prepareStackTrace|stackTraceLimit" lib/internal/errors.js` + read | prepareStackTrace is a supported assignable hook; core uses same transient limit pattern; V8 reads stackTraceLimit as data property (explains trap limitation) |
| `$NODEJS_SOURCE/lib/events.js:218` | `rg -n "listenerCount" lib/events.js` | static exists; depd compat read is read-only |
| `$NODEJS_SOURCE/lib/path.js` | `rg -n "isAbsolute" lib/path.js` | implementation present; nothing in scope writes to it |
| depd upstream | https://github.com/dougwilson/nodejs-depd/issues/32, /36, /39, /53, /20, /41, /44 | corroborate F-001/F-002 mechanism and effects; eval removal only in 2.x (not resolved here) |
| Runtime reproduction | `node repro/repro.js "$PACKAGE_ROOT"` on Node v24.19.0 | 3 transient swap pairs during require, 0 during exercise, full restoration, no diffs in any other snapshot dimension (`repro/repro-output.txt`) |

Provenance hashes (SHA-1, relative to `$PACKAGE_ROOT`):
`index.js` c06f43ac74d7154f6410f79c0f0243815365dafb;
`node_modules/http-errors/index.js` 65203bd13238ede3d602fadb15c0d0c011820624;
`node_modules/depd/index.js` 254217e10cbaafd7ac3a208f234b6f923d734f6a;
`node_modules/depd/lib/compat/index.js` 32c54611e9a868be5d78712a441da5d2ef83af6b;
`node_modules/path-is-absolute/index.js` 6de38a82f68960de2bd07fd9114541f02bee2f62;
`node_modules/setprototypeof/index.js` 687c656e8cf82220e1837242f6d5bc44a344120f;
`node_modules/statuses/index.js` 7cf04d58a9aebb7fe14b2991b63327f0754e40cc;
`node_modules/http-errors/node_modules/inherits/inherits.js` 491caba7b70590f6dcbe37d7edccd9f89ac1b9fd.

## Coverage and limitations

- Entry points covered: resolve-path `index.js` (sole export, `files` whitelist
  confirms it is the only shipped runtime file); dependency entrypoints
  http-errors `index.js`, depd `index.js` + `lib/compat/*` (all three files),
  path-is-absolute `index.js`, statuses `index.js` (+ `codes.json`, data only),
  setprototypeof `index.js`, nested inherits `inherits.js` (+ unreachable
  `inherits_browser.js`). Browser-field files inspected and excluded as
  not-loaded-by-Node. depd `lib/browser/index.js` excluded on the same basis.
- Node.js files read (targeted, read-only): `lib/util.js` (inherits),
  `lib/internal/errors.js` (prepareStackTrace machinery), `lib/events.js`
  (listenerCount), `lib/path.js` (isAbsolute) at `d44625a4b80`.
- Branches not executed: setprototypeof fallbacks (would apply only on
  pre-`Object.setPrototypeOf` runtimes, Node 0.8-0.10, out of practical scope;
  the fallback mutates only the passed object regardless) and inherits browser
  fallback (unreachable under Node resolution); depd `wrapproperty` and
  `DeprecationError` paths (unreachable from this consumer; statically shown to
  touch only passed/own objects); depd deprecation `log()` runtime windows
  (would re-run the F-001 swap per logged deprecation — same mechanism,
  demonstrated at import).
- Repro limitation: `Error.stackTraceLimit` transient values were observed via
  the `prepareStackTrace` set events rather than a direct accessor (V8
  data-property fast path; first attempt with an accessor disabled stack
  capture and crashed depd's detection — itself evidence that these writes sit
  on a V8-read intrinsic). A tested branch cannot prove universal absence, but
  all code in scope was read in full.
- What would change the verdict: nothing within this scope suggests any
  permanent or broader mutation; a consumer calling `deprecate.property` with a
  core object (not done here) would create a new, different patch candidate.

## Changes since the previous audit

First audit (pass B, blind; no prior pass-b report existed).
