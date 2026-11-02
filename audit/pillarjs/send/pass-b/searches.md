# Pass B search log — send@1.2.1 (blind pass)

Scope searched: `$PACKAGE_ROOT/index.js` plus every resolved runtime dependency's
shipped JS under `$PACKAGE_ROOT/node_modules/` (debug@4.4.3, depd@2.0.0,
ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, etag@1.8.1, fresh@2.0.0,
http-errors@2.0.1, inherits@2.0.4, mime-db@1.54.0, mime-types@3.0.2, ms@2.1.3,
on-finished@2.4.2, range-parser@1.3.0, setprototypeof@1.2.0, statuses@2.0.2,
toidentifier@1.0.1). Excluded: `.git`, `test/`, `scripts/`, `*.md`, `*.json`,
`*.d.ts` (tests/docs/devDeps out of scope). All searches run with
`rg -n --no-ignore` plus the exclusion globs above.

File inventory command:
`find . -name '*.js' -not -path './test/*' -not -path './scripts/*' -not -path './node_modules/*/test/*' -not -path './.git/*'`
→ 24 runtime JS files (listed in report Coverage section).

## Skill pattern group 1 — module imports

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

- `index.js`: hits lines 15–29 — core: fs, path, stream, util; deps: http-errors,
  debug, encodeurl, escape-html, etag, fresh, mime-types, ms, on-finished,
  range-parser, statuses. No dynamic import, no `node:` specifiers.
- deps: depd/index.js:11 (path.relative), on-finished/index.js:24 (ee-first),
  on-finished tryRequireAsyncHooks (async_hooks), http-errors/index.js:15-19
  (depd, setprototypeof, statuses, inherits, toidentifier),
  mime-types/index.js:15-17 (mime-db, path.extname, ./mimeScore),
  inherits/inherits.js:2 (util), etag/index.js:21-22 (crypto, fs.Stats),
  statuses/index.js:15 (./codes.json), debug/src/node.js:5-6,32 (tty, util,
  optional supports-color — not installed, try/catch), mime-db/index.js
  (./db.json). No loader manipulation; all static requires.

## Skill pattern group 2 — globals/Buffer/process/extends/inherits

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

- Hits: index.js:155 (`util.inherits(SendStream, Stream)`), index.js:186,388
  (Buffer.byteLength — read-only); depd reads process.cwd/noDeprecation/env/
  traceDeprecation, emits process 'deprecation', writes process.stderr;
  on-finished:34 process.nextTick fallback; debug/src/node.js reads process.env,
  tty.isatty, writes process.stderr, and save() writes `process.env.DEBUG`
  (node.js:205-209); debug/src/index.js:6 process.type detection;
  http-errors:117,160,229 inherits() on library constructors; etag Buffer reads.
- No `class ... extends` of core constructors anywhere; no globalThis/global
  property writes.

## Skill pattern group 3 — prototype/defineProperty/setPrototypeOf/Object.assign

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

- index.js:165-736: all `SendStream.prototype.*` definitions (library-owned ctor).
- setprototypeof/index.js:3,6,12: export selection + polyfill branches.
- statuses/index.js:96,109 and etag/index.js:29: `Object.prototype.hasOwnProperty`
  / `Object.prototype.toString` read-only references.
- debug/src/common.js:122: defineProperty on library-owned `debug` function.
- depd/index.js:62,485,496-535: defineProperty on caller-supplied objects
  (wrapproperty/convertDataDescriptorToAccessor — unreached in this tree) and on
  library-created DeprecationError instances.
- inherits/inherits_browser.js:6,22-24: browser-only fallback (not loaded in Node).
- http-errors/index.js:139,208 (setPrototypeOf on library-created err), 142-155,
  211-224 (defineProperty on library-created err), 163-165,232-234 (own ctor
  prototype data props), 249 (defineProperty 'name' on library ctor).
- Zero hits for `Object.assign`, `Reflect.*`, `__proto__` outside
  setprototypeof's polyfill branch.

## Skill pattern group 4 — patch/wrap/shim/polyfill/override keywords (case-insensitive)

Pattern: `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

- on-finished/index.js:129,181,188-199: "node.js 0.8 patch" — `patchAssignSocket`
  (key candidate C-003).
- on-finished/index.js:215-235: `wrap()` — AsyncResource binding of the
  user callback (no core mutation).
- depd/index.js:436,469,477 + depd/lib/browser/index.js:57: property wrap helpers.
- inherits/inherits_browser.js:17: comment only.
- No hits in send/index.js or the remaining deps.

## Skill pattern group 5 — module loading hooks

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

- Zero hits across the entire runtime scope.

## Skill pattern group 6 — bindings/internal modules

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

- Zero hits across the entire runtime scope.

## Supplemental searches

1. Assignments to properties of core/global objects:
   `\b(fs|http|net|stream|Stream|util|events|path|crypto|tty|os|process|Buffer|Error|Object|Array|String|Function|global|globalThis)\.[A-Za-z_$]+\s*=[^=]`
   - Hits: depd/index.js:386-387 and 395-396 only —
     `Error.prepareStackTrace = ...` / `Error.stackTraceLimit = ...`
     (set + restore). Confirmed candidate C-001/C-002. No other runtime file
     assigns to a core module/global object property.
2. `\bdelete\s` — debug/src/node.js:209 (`delete process.env.DEBUG`),
   depd/index.js:59-60 (descriptor fields on a local object). No deletes on core
   prototypes/modules.
3. Entry selection checks: debug main `src/index.js` chooses `./node.js` under
   Node (process.type guard); depd main is `index.js` (lib/browser only via
   browser field); inherits main is `inherits.js` (util.inherits re-export).
   Browser variants are unreachable at Node runtime.

## Node core baseline lookups ($NODEJS_SOURCE, main @ d44625a4b80, read-only)

- `lib/internal/http/outgoing.js`: line 187 `this[kSocket] = null;` in the
  OutgoingMessage constructor; lines 304-316 `socket` prototype accessor
  returning `this[kSocket]`. → `res.socket` is `null`, never `undefined`, for
  http responses (C-003 reachability).
- `lib/internal/http/server.js`: line 312 `ServerResponse.prototype.assignSocket`
  (core method the dormant wrapper would shadow per-instance).
- `lib/internal/http/incoming.js`: line 77 `this.socket = socket;`.
- `lib/util.js`: `inherits()` — `ObjectDefineProperty(ctor, 'super_', ...)` +
  `ObjectSetPrototypeOf(ctor.prototype, superCtor.prototype)`; superCtor is
  never mutated (C-006/C-014 rejection).
- `lib/internal/errors.js`: lines ~85-160 — `defaultPrepareStackTrace` and
  `prepareStackTraceCallback`, which dispatches to a user-set
  `Error.prepareStackTrace` when it is a function (core baseline for F-001).

## Upstream corroboration queries

- `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` →
  issue #32 "Why is this library overwriting Error type?" (closed), issue #36
  "Incompatible with --enable-source-maps node 12 option" (closed), issue #50
  "callSite.getFileName is not a function" (open). All concern the
  getStack()/prepareStackTrace swap.
- `gh search issues --repo jshttp/on-finished "assignSocket"` → no issue about
  the 0.8 patch; only #10 (unrelated early-trigger issue).
