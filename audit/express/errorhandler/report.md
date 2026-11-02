# Node.js patch audit: errorhandler

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#14 (`errorhandler`, https://github.com/expressjs/errorhandler)
- Library: errorhandler 1.5.2, git master @ `1922d04b78ed575ace5499b3d6f5591f2325f70b`, runtime dependencies installed (`--ignore-scripts --omit=dev`): accepts@1.3.8, escape-html@1.0.3, mime-db@1.52.0, mime-types@2.1.35, negotiator@0.6.3
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: core identity/descriptor checks unchanged after require + all three negotiated middleware branches — html/json/text)
- Scope: production/runtime code (`index.js`, 198 lines) plus all five runtime dependencies' entry/init paths. Tests/docs/public assets excluded (template files are runtime data, read-only).
- Coverage: source complete; runtime reproduction done (both passes); upstream issue search negative
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict, consistent ledgers (18 vs 20 entries), zero disagreements**; key sites re-verified directly during reconciliation.

## Patching verdict

errorhandler and its dependency tree perform no mutation of Node.js core APIs, globals, shared prototypes, core-backed instance behavior, module loading, or core source:

- `res.statusCode` writes (`index.js:89,94,99`) — documented public setter shadowing the prototype default (`$NODEJS_SOURCE/lib/internal/http/server.js:285`).
- `res._header` (`index.js:109`) — **read-only** private-API use of the OutgoingMessage flush state (initialized at `outgoing.js:188`; public equivalent is the `headersSent` getter at `:1011`); never written. Dates to upstream commit `8c95711` (2014). Supporting context, not a patch.
- The passed error object is **never mutated** — the JSON branch copies its enumerable props into a fresh object (`index.js:142-143`); confirmed statically and at runtime.
- `res.setHeader`/`res.end`/`req.socket.destroy()` — documented API calls only.
- accepts/negotiator wrap `req` in their own library objects (prototype assignments on library-owned constructors) and only **read** `req.headers`; zero writes to `req`.
- mime-types' load-time `populateMaps` fills its own `Object.create(null)` export maps from mime-db's static JSON; escape-html is a pure zero-require function.

0 confirmed patches; 0 unresolved candidates; all negative sweeps clean (loader interception, defineProperty/`__proto__`/setPrototypeOf on core, delete, builtin-global writes, process.binding/internalBinding, install scripts).

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (18 entries), `pass-b/candidates.md` (20 entries) — same substance, all rejected, 0 unresolved.

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:89,94,99` `res.statusCode =` | rejected | documented writable instance property |
| R-02 | `index.js:109` `res._header` | rejected | private-API **read**, no write (supporting context) |
| R-03 | `index.js:110` `req.socket.destroy()` | rejected | documented call |
| R-04 | `index.js:142-143` error-prop copy | rejected | copies into a fresh object; err untouched |
| R-05 | accepts/negotiator prototype work | rejected | library-owned constructors; req reads only |
| R-06 | mime-types/mime-db load-time tables | rejected | own null-prototype maps from static JSON |
| R-07 | escape-html | rejected | pure function, zero requires |
| R-08 | all mutation/loader/bindings sweeps | negative | zero hits across the runtime tree |

## Supporting context

- `res._header` is the only private-API touchpoint. It is a read; on current Node the public `headersSent` getter would serve. If Node.js ever removes the legacy `_header` alias, errorhandler's "cannot actually respond" guard silently degrades (would attempt to respond on an already-flushed response) rather than crashing — worth an upstream modernization PR but not patching. Same `_header` dependency exists more severely in express-session (which also *calls* `_implicitHeader`).

Reconciliation note: passes A and B fully blind; identical verdict; consistent ledgers; zero disagreements. Orchestrator re-read `index.js:86-112,140-145` — all claims match.

Limitations: reproduction on one Node version (no version-guarded branches exist in scope); Node baseline is main (`_http_*.js` shims; `lib/internal/http/*` cited).
