# Node.js patch audit: negotiator

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: negotiator (https://github.com/jshttp/negotiator)
- Library: v1.1.0, commit 14b0a7b88e7e7bb1cae38681195951bff29ca2fd
- Node.js baseline: commit d44625a4b80c672215b469906ce583ce7eeeebaf (`$NODEJS_SOURCE`)
- Scope: production/runtime code — 6 library files (`index.js`, `lib/accept.js`, `lib/charset.js`, `lib/encoding.js`, `lib/language.js`, `lib/mediaType.js`) plus 1 runtime dependency (`content-type@2.1.0`, `dist/index.js`). All 7 files read in full.
- Coverage: source complete; all 6 regex search groups run across all production files; zero Node.js core modules imported anywhere in scope
- Protocol: two full independent blind audits (pass-a/, pass-b/) reconciled; both passes reached identical CLEAN verdict with 0 disagreements

## Patching verdict

negotiator does **not** patch or monkeypatch Node.js core, directly or through its runtime dependency. It requires **no Node.js core module** — its only external dependency is `content-type` (a pure string parser with zero transitive deps). All prototype writes target the library's own `Negotiator` constructor. No globals, built-in prototypes, module system hooks, or internal bindings are touched.

0 confirmed patches; 0 unresolved candidates; zero hits for module-loading interception, internals/bindings access, global mutation, or core prototype writes.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence/reason |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:38-83` — `Negotiator.prototype.*` writes | rejected | Library-owned constructor; 16 method assignments to own prototype |
| C-002 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js:7` — `Object.defineProperty(exports, "__esModule", ...)` | rejected | Standard TS CJS interop marker on module's own exports object |
| C-003 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js:27-31` — NullObject factory | rejected | Local IIFE creating null-prototype constructor; never touches existing prototypes |
| C-004 | `$PACKAGE_ROOT/lib/accept.js:9`, `lib/language.js:11`, `lib/mediaType.js:11` — `require('content-type')` | rejected | Declared runtime dependency; content-type itself is clean |
| C-005 | `$PACKAGE_ROOT/index.js:11-14`, `lib/*.js` — local relative requires | rejected | Internal module wiring between library's own files |

## Supporting context

- Prior compression-audit finding (CLEAN) independently confirmed against current upstream HEAD.
- content-type dependency confirmed added as declared runtime dep; content-type v2.1.0 is itself clean (pure string parser, zero transitive deps, no core access).

## Sources and verification

| Source | Command/query | Result |
| --- | --- | --- |
| Production files | `rg -n` 6 search groups across all 7 files | 29 total hits; 5 candidates traced, all rejected |
| content-type dep | Full read of `dist/index.js` (176 lines) | Pure parser, zero core imports |

## Coverage and limitations

- All 7 production files read in full (806 lines total)
- Zero Node.js core modules imported anywhere
- content-type@2.1.0 audited inline as sole runtime dependency
- Verdict pinned to negotiator v1.1.0 @ 14b0a7b with content-type@2.1.0
