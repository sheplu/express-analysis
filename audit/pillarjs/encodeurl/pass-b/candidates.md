# Candidate ledger — encodeurl@3.0.0 patch audit (pass B)

Runtime scope: `$PACKAGE_ROOT/src/index.ts` (git ref) and `$NPM_ARTIFACT/dist/index.js`
(shipped entrypoint; `package.json` `main`/`exports`). Zero runtime dependencies.
Line references give src line / dist line where both apply.

| ID | Site and core target | Status | Evidence / rejection reason |
| --- | --- | --- | --- |
| C-001 | `src/index.ts:12-13` / `dist/index.js:11` — module-level shared `ENCODE_CHARS_REGEXP` with `g` flag; potential cross-call `lastIndex` state concern (domain attention item) | **rejected as patch** | Library-owned, module-private constant — never assigned to any core/global/prototype object, never exported, so mutating its `lastIndex` cannot patch Node core by definition. Additionally no observable state leak: `String.prototype.search` (via `RegExp.prototype[Symbol.search]`) saves/restores `lastIndex`, and the global-flag `Symbol.replace` path resets it; repro called `encodeUrl` twice per input (plain, already-encoded, mixed, malformed-percent, unpaired-surrogate) with identical results both times (`repro/result.txt`, "stable across repeat call: true"). |
| C-002 | `src/index.ts:35` / `dist/index.js:33` — references global intrinsic `encodeURI` as a `.replace` replacer | **rejected as patch** | Read-only use of the global function; no assignment to `globalThis.encodeURI` or any descriptor operation anywhere in the package (search group G3: zero hits repo-wide). Repro confirms `encodeURI` identity unchanged before vs after require + exercise. |
| C-003 | `src/index.ts:33-35` / `dist/index.js:31-33` — calls `String.prototype.search`, `String.prototype.toWellFormed`, `String.prototype.replace` on the input string | **rejected as patch** | Plain method invocations on a caller-supplied string; no writes to `String.prototype` (G3 zero hits). Repro confirms `String.prototype` own-key set and `replace` identity/descriptor unchanged. `toWellFormed` is a standard ES2024 intrinsic (Node >= 20; package `engines` requires >= 22), used, not polyfilled. |
| C-004 | `package.json` `scripts.prepare` (`ts-scripts install && npm run build`) — lifecycle script | **rejected as patch** | Build-time tooling (devDependencies) only. `prepare` does not execute on consumer installs from a registry tarball; no `preinstall`/`install`/`postinstall` scripts exist. Not runtime code. |
| C-005 | `dist/index.js` is a build output absent from the git clone — risk of src/dist divergence or tampered publish | **resolved — no divergence** | `dist/index.js.map` `sourcesContent[0]` is byte-identical to git `src/index.ts` at HEAD (and `src/index.ts` is identical between HEAD and the `v3.0.0` tag). Dist JS body is a faithful type-stripped transpile of the same function. Tarball SHA-1/SHA-512 match `npm view encodeurl@3.0.0` `dist.shasum`/`dist.integrity` exactly; extracted `$NPM_ARTIFACT` matches the tarball byte-for-byte. |

Confirmed candidates: **0**. Unresolved candidates: **0**. Rejected/resolved: **5**.

No candidate ever reached a write: search groups G3 (prototype/descriptor writes),
G4 (patch vocabulary), G5 (module-loading interception), and G6 (internal bindings)
returned zero hits across the entire repository and the shipped artifact, and the
runtime code contains no import/require of any Node builtin module at all (G1 zero
hits in runtime files).
