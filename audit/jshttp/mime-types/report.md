# Node.js patch audit: mime-types

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: mime-types (https://github.com/jshttp/mime-types)
- Library: v3.0.2, commit 3a1187ee21388efe46b916d4991589d595bcb26c
- Node.js baseline: commit d44625a4b80c672215b469906ce583ce7eeeebaf (`$NODEJS_SOURCE`)
- Scope: production/runtime code — `$PACKAGE_ROOT/index.js` (147 lines) plus runtime dependency `mime-db@1.54.0` (`index.js` + `db.json`). All files read in full.
- Coverage: source complete; all 6 regex search groups run; `path` is the only core module imported (read-only)
- Protocol: two full independent blind audits (pass-a/, pass-b/) reconciled; both passes reached identical CLEAN verdict with 0 disagreements

## Patching verdict

mime-types does **not** patch or monkeypatch Node.js core. It imports `path.extname` as a read-only local binding (line 16) and never stores, assigns to, or mutates the `path` module. Its runtime dependency `mime-db` is a pure JSON data re-export with zero executable logic. All data structures (`exports.extensions`, `exports.types`) are library-owned `Object.create(null)` maps.

0 confirmed patches; 0 unresolved candidates.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence/reason |
| --- | --- | --- | --- |
| RC-001 | `$PACKAGE_ROOT/index.js:16` — `require('path').extname` | rejected | Read-only import bound to local variable; `path` module never mutated |
| RC-002 | `$PACKAGE_ROOT/index.js:36,38` — `Object.create(null)` | rejected | Creates new library-owned null-prototype objects on own exports |
| RC-003 | `$PACKAGE_ROOT/node_modules/mime-db/db.json` — "global" in MIME names | rejected | Inert JSON data (IANA MIME type names like `message/global`) |
| RC-004 | `$PACKAGE_ROOT/node_modules/mime-db/db.json` — "patch" in MIME names | rejected | Inert JSON data (`application/json-patch+json` etc.) |

## Supporting context

- mime-db v1.54.0 is a single-line re-export of static JSON data. Zero runtime dependencies, zero executable logic beyond `module.exports = require('./db.json')`.
- The library builds two lookup maps at load time from mime-db data, then exposes four pure functions: `charset`, `contentType`, `extension`, `lookup`.

## Sources and verification

| Source | Command/query | Result |
| --- | --- | --- |
| Production files | `rg -n` 6 search groups across all files | 4 candidates traced, all rejected |
| mime-db dep | Full read of `index.js` + regex search of `db.json` | Pure data, no executable mutations |

## Coverage and limitations

- All 3 production JS files read in full (281 lines total)
- `path` is the sole core module import (read-only `extname` binding)
- mime-db@1.54.0 audited inline as sole runtime dependency
- Verdict pinned to mime-types v3.0.2 @ 3a1187e with mime-db@1.54.0
