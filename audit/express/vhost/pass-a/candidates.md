# Candidate ledger: vhost 3.0.2 (pass A)

Target: `$PACKAGE_ROOT` = expressjs/vhost @ f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99 (v3.0.2).
Runtime scope: `index.js` only (sole shipped runtime file; zero runtime dependencies).
Every candidate from the pattern sweeps and the full assignment inventory is listed; none were left unresolved.

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:61` | `req.vhost = vhostdata` — adds own-property `vhost` to the live request (`http.IncomingMessage` instance when under Node's http server) | rejected as patch | Library-owned metadata key. Not present on core `IncomingMessage`: `grep -n "vhost" $NODEJS_SOURCE/lib/internal/http/incoming.js $NODEJS_SOURCE/lib/http.js` → no hits (baseline d44625a4b80). Adds request metadata; overrides/shadows no core member or accessor. Reproduction (Node v24.19.0): only own-key added to req is `vhost`; all checked core prototypes unchanged. |
| C-002 | `$PACKAGE_ROOT/index.js:102` | `Object.prototype.toString.call(val)` in `isregexp()` | rejected as patch | Read-only invocation of the ECMAScript builtin (brand check for RegExp). No assignment, deletion, or descriptor change. Only hit from pattern P3. |
| C-003 | `$PACKAGE_ROOT/index.js:77` and `:140` | `var host = req.headers.host` in `hostnameof()`/`vhostof()` | rejected as patch | Read-only use of the documented `message.headers` property (core accessor at `$NODEJS_SOURCE/lib/internal/http/incoming.js:125`). Never assigns `req.headers`, never mutates the headers object (confirmed by full assignment inventory S1/S6: no such write exists). |
| C-004 | `$PACKAGE_ROOT/index.js:153-161` | `obj.host`, `obj.hostname`, `obj.length`, `obj[i-1] = match[i]` | rejected as patch | All writes land on a fresh `Object.create(null)` object created at line 153 and owned by the library; it becomes the value of `req.vhost`. Null prototype means no `Object.prototype` pollution even with hostile capture-group indices. |
| C-005 | `$PACKAGE_ROOT/index.js:15` | `module.exports = vhost` | rejected as patch | Ordinary export of the library's own module object; no `require.cache`, `require.extensions`, or `Module._*` interception anywhere in the file (pattern P5 negative). |
| C-006 | `$PACKAGE_ROOT/index.js:64` | `handle(req, res, next)` — handler dispatch | rejected as patch | Invokes the caller-supplied function with the untouched `req`/`res`/`next`. No core method on `req` or `res` is read, saved, wrapped, or replaced; `res` is never touched at all by the library. |
| C-007 | `$PACKAGE_ROOT/index.js:114,127` (also 39,43,47) | `String(val)`, `new RegExp(source, 'i')`, `throw new TypeError(...)` | rejected as patch | Constructive, read-only use of ECMAScript builtins; module-level regex literals (lines 22-26) are library-owned constants. |
| C-008 | `$PACKAGE_ROOT/package.json` | npm lifecycle scripts | rejected as patch | Only `lint`/`test`/`test-ci`/`test-cov`. No install/preinstall/postinstall/prepare hook → no install-time patch or core source rewrite vector. `files` field limits the published artifact to LICENSE/README.md/index.js. |
| C-009 (historical) | pre-3.0 `index.js` (`createHandle`, removed by commit 711882a) | `server.emit('request', req, res)` on a caller-supplied `http.Server` | rejected as patch (and absent from audited version) | Public EventEmitter API use, not a mutation; removed in v3.0.0 (2014-08-29). Recorded for context only. |

Confirmed: 0. Rejected: 9 (8 current + 1 historical). Unresolved: 0.

Complete assignment inventory backing the ledger (from `rg -n "=[^=]" index.js`, comparisons filtered): lines 15, 22, 23, 24, 25, 26, 51, 54, 61, 77, 86, 113, 119, 124, 140, 141, 147, 153, 155, 156, 157, 159, 160. Of these, only line 61 writes to an object not created by the library itself (the live `req`), handled as C-001. Lines 22-26/51/54/77/86/113/119/124/140/141/147/153/159 are `var` declarations or local reassignments; 155-157/160 write to the C-004 null-prototype object; 15 is C-005.
