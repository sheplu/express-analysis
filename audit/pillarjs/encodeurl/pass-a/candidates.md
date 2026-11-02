# Candidate ledger — encodeurl 3.0.0 (pass A)

Scope: `$PACKAGE_ROOT` (git master @ `6545e6a324edc62c6e7dcbd1205a51b480cfe20b`, runtime-identical to tag `v3.0.0`) and `$NPM_ARTIFACT` (published 3.0.0 tarball contents). Runtime files only: `$PACKAGE_ROOT/src/index.ts`, `$NPM_ARTIFACT/dist/index.js` (+ map, package.json metadata).

Totals: **0 confirmed / 5 rejected / 0 unresolved**.

## Rejected candidates

### C-001 — module-level shared `g`-flag RegExp (`ENCODE_CHARS_REGEXP`)
- Sites: `$PACKAGE_ROOT/src/index.ts:12-13`; `$NPM_ARTIFACT/dist/index.js:11`
- Concern (domain attention): regex `lastIndex` state mutation on a shared regex.
- Status: **rejected as patch**.
- Reason: the regex is a module-private, non-exported `const` owned by the library — mutating its `lastIndex` is not a mutation of any Node/ECMAScript core object. Additionally, per ECMA-262, `String.prototype.search` saves/restores `lastIndex` and `String.prototype.replace` with `g` resets it to 0 on entry and after the match loop, so there is no persistent cross-call state even within the library. Runtime reproduction (`check-globals.mjs`) observed no state-dependent behavior across repeated calls.

### C-002 — reference to global intrinsic `encodeURI`
- Sites: `$PACKAGE_ROOT/src/index.ts:35`; `$NPM_ARTIFACT/dist/index.js:33`
- Concern: write/replacement of the global `encodeURI` function.
- Status: **rejected as patch**.
- Reason: read-only; passed by reference as the replacer callback to `String.prototype.replace`. No assignment or `defineProperty` anywhere in either tree (searches S3, S8 zero hits). Reproduction confirmed the identity of `encodeURI` and its own-property descriptor on `globalThis` are unchanged after import and after calls.

### C-003 — calls to `String.prototype.search` / `toWellFormed` / `replace`
- Sites: `$PACKAGE_ROOT/src/index.ts:33-35`; `$NPM_ARTIFACT/dist/index.js:30-33`
- Concern: writes to `String.prototype` / `RegExp.prototype`, or `Symbol.search`/`Symbol.replace` overrides.
- Status: **rejected as patch**.
- Reason: invoke-only on the caller-supplied string argument. Zero hits for `.prototype` writes, `__proto__`, `setPrototypeOf`, `defineProperty/ies`, `Reflect.*`, `Object.assign`, or any `Symbol` usage in runtime code (searches S3, S9). Reproduction confirmed method identities and full own-property key sets of `String.prototype`, `RegExp.prototype`, and `Object.prototype` unchanged after import and call.

### C-004 — `scripts.prepare` in published package.json
- Site: `$NPM_ARTIFACT/package.json` (`"prepare": "ts-scripts install && npm run build"`)
- Concern: install-time code execution channel.
- Status: **rejected as patch**.
- Reason: npm does not run `prepare` when installing a registry tarball into a consumer project (it runs on pack/publish and for git-dependency installs). No `preinstall`/`install`/`postinstall` scripts exist. The referenced tooling is devDependencies-only and not shipped (`files: ["dist/"]`; tarball listing confirms only LICENSE, README.md, package.json, dist/).

### C-005 — shipped source map `dist/index.js.map`
- Site: `$NPM_ARTIFACT/dist/index.js.map`
- Concern: shipped artifact concealing code divergent from the audited git source.
- Status: **rejected as patch** (and as divergence finding).
- Reason: non-executable metadata. Its `sourcesContent[0]` is byte-identical to `git show v3.0.0:src/index.ts` and to HEAD `src/index.ts` (`diff` clean), confirming the dist build corresponds exactly to the audited source.

## Unresolved candidates

None.

## Confirmed candidates

None. No candidate traced to a write/replacement of a core API, global, shared prototype, core-backed instance, module-loading mechanism, or core source.
