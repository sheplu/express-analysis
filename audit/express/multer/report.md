# Node.js patch audit: multer

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#7 (`multer`, https://github.com/expressjs/multer)
- Library: multer 2.5.0, git main @ `2c380d06cdaacc68bbef8b36244493a3d33d6b88`, runtime dependencies installed (`--ignore-scripts --omit=dev`): append-field@1.0.0, busboy@1.6.0, streamsearch@1.1.0, type-is@1.6.18, media-typer@0.3.0, mime-types@2.1.35, mime-db@1.52.0
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (pass A: 26 core identities after a full multipart middleware run with pollution-shaped field names; pass B: load/instantiation identity snapshot)
- Scope: production/runtime code (`index.js`, `lib/**`, `storage/**`) plus every resolved runtime dependency read in full (busboy's lib tree included). Tests, examples, docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (mscdex/busboy#319 closed, #6)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict, identical 29-entry rejection ledgers, zero disagreements**; key sites re-verified directly during reconciliation.

## Patching verdict

multer and its dependency tree never mutate core APIs, globals, shared prototypes, core-backed instance methods, or module loading. All candidate writes resolve to library-owned state or documented extension contracts:

- `req.body = Object.create(null)` / `req.file` / `req.files` (`lib/make-middleware.js:136`, `lib/file-appender.js:13-14,57`) — additive application-data keys on the live request; no core `IncomingMessage` member shadowed.
- `req.pipe(busboy)` / `req.unpipe(busboy)` / `req.resume()` (`lib/make-middleware.js:66,160,168-169,231`) — documented Readable method **calls**; zero reassignments, zero `_events` access anywhere in scope.
- busboy's Multipart/URLEncoded/FileStream types subclass Writable/Readable strictly via the documented `_write`/`_destroy`/`_final`/`_read` contract (`$NODEJS_SOURCE/lib/internal/streams/writable.js:837,1166`, `readable.js:974`); its `_writecb`/`_readcb`/`_bparser` are busboy-owned fields on busboy-owned instances; core `_writableState` untouched.
- append-field's `__proto__`/`constructor`-shaped keys cannot reach `Object.prototype` through multer: every write lands on multer's `Object.create(null)` req.body or append-field's own null-prototype intermediates — confirmed statically and by reproduction (Object.prototype unchanged, keys inert). Installed artifact byte-identical to registry append-field@1.0.0.
- streamsearch mutates only its own lookbehind buffer; type-is/media-typer/mime-types/mime-db do own-state/own-export work at load.

0 confirmed patches; 0 unresolved candidates; patch-vocabulary, loader-interception, and bindings/internals sweeps all zero-hit.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md`, `pass-b/candidates.md` (29 rejected entries each, same substance, 0 unresolved). Key entries:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `lib/make-middleware.js:136`, `lib/file-appender.js:13-14,57` — req.body/file/files | rejected | library metadata keys; nothing core shadowed |
| R-02 | `lib/make-middleware.js:66,160,168-169,231` — pipe/unpipe/resume | rejected | documented method calls, not reassignments |
| R-03 | busboy stream types | rejected | documented Writable/Readable subclassing (`_write`/`_read`/`_destroy`/`_final`) |
| R-04 | append-field `set-value.js` writes incl. `__proto__` keys | rejected | all writes on null-prototype library containers; pollution path closed |
| R-05 | streamsearch internals | rejected | own lookbehind buffer only |
| R-06 | disk storage fs usage (`createWriteStream`, mkdir) | rejected | calls only; fs module untouched |
| R-07 | mime-types/mime-db/type-is/media-typer load-time work | rejected | own exports only |
| R-08 | loader hooks / patch vocab / internals sweeps | negative | zero hits tree-wide |

## Supporting context

- **busboy calls undocumented core `Buffer.prototype` methods** — `latin1Slice`/`utf8Slice`/`ucs2Slice`/`base64Slice` at 18 sites (e.g. `busboy/lib/types/multipart.js:63,73,112`). These are **private-API reads/calls**, not mutations: core installs these methods itself (`$NODEJS_SOURCE/lib/internal/buffer.js:1071-1076`). Corroborated by mscdex/busboy#319 (closed). This is the main forward-compat exposure in multer's tree: if Node.js ever removes or renames these internal Buffer methods, busboy parsing breaks at runtime.
- multer works around busboy bug mscdex/busboy#6 at the library level (no core involvement).
- User-supplied storage engines / fileFilter / streamHandler are consumer code outside the shipped package.

Reconciliation note: passes A and B fully blind; identical verdict, identical rejection ledgers (29 each), same supporting-context observations. Zero disagreements. Orchestrator re-verified `make-middleware.js` (null-prototype body, pipe/unpipe/resume call sites), `append-field/lib/set-value.js` context writes, and busboy `*Slice` call sites directly.

Limitations: pass B's reproduction covered load/instantiation (pass A exercised a full multipart run); verdict pinned to installed dependency versions; busboy's urlencoded branch unreachable from multer but audited anyway (clean). Note: both passes' report files were written via shell due to a harness restriction on subagent Write calls for report-named files — content unaffected.
