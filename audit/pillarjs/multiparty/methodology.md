# multiparty — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/multiparty (default branch `master`, HEAD `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d`, version 4.3.1) into the package worktree (`multiparty/upstream/multiparty`); installed runtime deps with `npm install --ignore-scripts --omit=dev` (9 packages resolved; versions in report.md).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:11` (http-errors import), `:167-168` (private reads), `:547-559` (PassThrough metadata), `http-errors/index.js:15` (depd), `safe-buffer/index.js:12-13` (modern branch), plus the already-verified depd `getStack()` lines; merged into final report.

## Scope

- In scope: `index.js` plus all 9 resolved runtime dependencies' runtime files (each entrypoint checked individually before exclusion).
- Out of scope: tests, examples, docs, devDependencies, browser-field variants (unreachable under Node), legacy fallback branches (safe-buffer pre-`Buffer.alloc`, setprototypeof ES5) — excluded after reachability verification.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups across the full runtime scope plus supplemental core-assignment and expando sweeps. Groups 5 (loader interception) and 6 (bindings/internals) returned **zero hits** in both passes.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/streams/writable.js:23-24,193,324,410` and `transform.js:162` — documented subclassing contract for Form/LimitStream
- `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:485-511`, `lib/internal/errors.js:136-170` — `Error.prepareStackTrace` baseline (F-001)
- Readable-state internals along the `index.js:167-168` private-read (classification: read-only usage, not patch)

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `pass-a/repro-core-mutation-check.js` + `repro-output.txt`. Pass B: `pass-b/repro/repro.js` + `repro/results.json`.
- Real multipart/form-data POST (text field + 25-byte file) served through `http.createServer` + `form.parse(req)`; file contents verified round-trip.
- Accessor trap on `Error.prepareStackTrace`: exactly 2 set events, both during require (swap to `prepareObjectStackTrace`, faithful restore of core `ErrorPrepareStackTrace`); none during parsing. Sentinel `stackTraceLimit=3`: observed 3 at swap, 10 inside the window, 3 restored — transient raise proven.
- Zero identity/descriptor/key diffs (after require AND after exercise): stream Writable/Readable/Duplex/Transform/PassThrough prototypes + ctors, `fs.WriteStream`/`createWriteStream`/`unlink`, `http.IncomingMessage.prototype`, `EventEmitter.prototype`, Buffer + statics + prototype, StringDecoder, Object/Array/String/Function prototype keys, `Object.assign/setPrototypeOf/defineProperty`, `Module._load/_resolveFilename/_extensions`, builtin `require.cache` entries, `process.binding`/`nextTick`, global keys.
- Methodology note: trapping `Error.stackTraceLimit` directly is infeasible — V8 requires data-property semantics (an accessor disables capture and crashes depd on `obj.stack === undefined`).

## Reconciliation outcome

- Verdicts identical: **confirmed patching** (transitive transient via http-errors@2.0.0 -> depd@2.0.0; own code clean).
- Disagreements: **none**. Granularity difference only (pass A: 1 finding/2 writes + 31-entry fine-grained ledger; pass B: 2 findings + 21-entry ledger) — merged as a single site-level finding (F-001), consistent with the cookies/send convention.
- Both passes independently classified: stream subclassing as documented extension; `req._readableState`/`req._decoder` as private **reads**; PassThrough expandos as library-instance metadata; safe-buffer as pure re-export.
- Orchestrator spot-check matched all claims.

## Limitations

- Base64/`part`-event/error-cleanup paths statically read, not runtime-exercised (no candidate writes in them).
- F-001 exception-leak path statically reasoned, not fault-injected.
- Node baseline is main; repro on v24.19.0 — relevant baselines stable across both.
- Verdict pinned to the exact dep pins in multiparty's package.json (no semver drift risk until multiparty updates).
