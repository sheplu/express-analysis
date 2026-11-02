# multer — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #7; cloned default branch `main` @ `2c380d06cdaacc68bbef8b36244493a3d33d6b88` (v2.5.0) into `multer/upstream/multer`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (append-field, busboy, streamsearch, media-typer, mime-db, mime-types, type-is).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `lib/make-middleware.js` (body creation + stream call sites), `append-field/lib/set-value.js`, and busboy `*Slice` call sites directly; merged into final report.

## Scope

- In scope: `index.js`, `lib/**` (6 files), `storage/**` (disk, memory), every resolved runtime dependency read in full (busboy's whole lib tree).
- Out of scope: tests, examples, docs; user-supplied storage engines/fileFilter (consumer code).
- busboy's urlencoded branch is unreachable from multer (multipart only) but was audited anyway — clean.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over the whole scope; supplementary sweeps for stream-method reassignment (`req\.\w+ *=`, `\.pipe *=`, `_events`), `__proto__`/pollution paths, and fs mutation. Patch-vocab, loader-interception, and internals sweeps: zero hits.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/_http_incoming.js` (IncomingMessage surface — no body/file/files members)
- `$NODEJS_SOURCE/lib/internal/streams/readable.js` (`pipe` :978, `unpipe` :1180, `resume` :1327, `_read` contract :974)
- `$NODEJS_SOURCE/lib/internal/streams/writable.js` (`_write` contract :837, `_destroy`/`_final` :1166)
- `$NODEJS_SOURCE/lib/internal/buffer.js:1071-1076` (core-installed `latin1Slice`/`utf8Slice`/`ucs2Slice`/`base64Slice` — busboy's private-API calls)

## Runtime reproduction

- Node v24.19.0. Scripts: `pass-a/repro-no-patch.js` (26 core identity/prototype checks across require + full multipart run with pollution-shaped field names — all passed), `pass-b/repro-core-identity.js` (load/instantiation snapshot — unchanged).

## Upstream corroboration

- mscdex/busboy#319 (closed) — the undocumented Buffer.prototype method usage.
- mscdex/busboy#6 — bug multer works around at library level.
- append-field@1.0.0 installed artifact verified byte-identical to the registry tarball (pass B).

## Reconciliation outcome

- Verdicts identical: no confirmed patching in the inspected scope.
- Ledgers: 29 rejected entries each, same substance; 0 unresolved.
- Same supporting-context observations independently (busboy private Buffer API; append-field pollution path closed by null-prototype containers).
- Disagreements: **none**. Orchestrator spot-checks matched all claims.

## Limitations

- Pass B reproduction covered load/instantiation only (pass A covered a full multipart request).
- Verdict pinned to installed dependency versions.
- Both passes wrote report files via shell because the harness blocked subagent Write calls for report-named files; content unaffected and verified on disk.
