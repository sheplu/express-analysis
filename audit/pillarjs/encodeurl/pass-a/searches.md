# Search log — encodeurl 3.0.0 (pass A)

All searches run with `rg -n --no-ignore` over two scopes, excluding `.git/` and the dev-only `package-lock.json`:

- **Scope G** = `$PACKAGE_ROOT` (git clone, master @ `6545e6a324edc62c6e7dcbd1205a51b480cfe20b`): `src/index.ts` (runtime), plus out-of-scope files (`src/index.spec.ts`, `src/index.bench.ts`, `README.md`, tsconfig*, `.github/`, `.editorconfig`, `LICENSE`, `package.json`).
- **Scope A** = `$NPM_ARTIFACT` (= `$PACKAGE_ROOT/../npm-artifact/package`, extracted `encodeurl-3.0.0.tgz`): `dist/index.js` (runtime), `dist/index.js.map`, `dist/index.d.ts`, `package.json`, `README.md`, `LICENSE`.

"Runtime hits" below means hits in `src/index.ts` or `dist/*` only; test/benchmark/docs/config hits are recorded but out of scope.

## Skill candidate pattern groups (S1-S6)

| ID | Pattern | Scope G result | Scope A result |
| --- | --- | --- | --- |
| S1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | Hits only in `src/index.spec.ts:1-2`, `src/index.bench.ts:1-2` (vitest + self-import; tests/bench, out of scope) and `README.md:19,37-38,58-60` (docs). **Zero runtime hits — `src/index.ts` contains no import/require at all.** | Hits only in `README.md:19,37-38,58-60` (docs). **Zero runtime hits — `dist/index.js` contains no import/require at all.** |
| S2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | Hits only in `tsconfig.json:2`, `tsconfig.build.json:2` (config `"extends"`), `README.md:50,80` (doc example `Buffer.byteLength`). **Zero runtime hits.** | Hits only in `README.md:50,80`. **Zero runtime hits.** |
| S3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | **Zero hits (entire scope).** | **Zero hits (entire scope).** |
| S4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | **Zero hits (entire scope).** | **Zero hits (entire scope).** |
| S5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | **Zero hits (entire scope).** | **Zero hits (entire scope).** |
| S6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | **Zero hits (entire scope).** | **Zero hits (entire scope).** |

## Supplementary domain-specific searches (S7-S9)

| ID | Pattern / scope | Result |
| --- | --- | --- |
| S7 | `encodeURI` over runtime files only (`$PACKAGE_ROOT/src/index.ts`, `$NPM_ARTIFACT/dist/index.js`) | 2 hits: `src/index.ts:35` and `dist/index.js:33` — read-only use as replacer callback (`-> C-002`). No other `encodeURI`/`encodeURIComponent` references in runtime code. |
| S8 | Assignments to global intrinsics: `(encodeURI\|encodeURIComponent\|decodeURI\|decodeURIComponent\|String\|RegExp\|Object\|Array\|Function\|JSON\|Math)\s*(\.[A-Za-z_$.]+)?\s*=[^=]` over both scopes | **Zero hits.** No assignment to any intrinsic or intrinsic member anywhere. |
| S9 | Regex state / symbols / descriptors: `lastIndex\|Symbol\.\|Symbol\(\|toWellFormed\|freeze\|seal\|deleteProperty\|\bdelete\b` over both scopes | 3 hits: `src/index.ts:35`, `dist/index.js:33` (invoke-only `toWellFormed`), `dist/index.js.map:1` (sourcesContent copy of the same line). No `lastIndex` writes, no `Symbol` usage, no descriptor operations (`-> C-001, C-003`). |

## Integrity / correspondence commands (non-search verification)

| Command (portable form) | Result |
| --- | --- |
| `git -C "$PACKAGE_ROOT" log -1` | `6545e6a324edc62c6e7dcbd1205a51b480cfe20b` (master, origin/master, origin/HEAD) — matches tasked provenance |
| `git -C "$PACKAGE_ROOT" tag -l` / `git diff v3.0.0..HEAD --stat` | Tags v1.0.0-v3.0.0 present; tag-to-HEAD diff is `README.md` only (3+/3-) — runtime identical to released v3.0.0 |
| `shasum -a 1` / `-a 512` on `encodeurl-3.0.0.tgz` vs `npm view encodeurl@3.0.0 dist.shasum dist.integrity` | sha1 `3e6cdb0e25c24382b62ab06c115e9bf6044b87bd` and sha512 `4McP5wRMkyFkj2+U0GfnZVjUQBSu+6kqbNhZsRqO1UeDVsdY8GDloc1bfAGHJ4MAVgJjo5RHveJA4fUZQMSMMA==` — **both match the registry** |
| `npm view encodeurl@3.0.0 dependencies scripts main exports type` | `dependencies` empty; `main`/`exports` = `dist/index.js`; `type: module`; scripts contain no preinstall/install/postinstall (only non-consumer `prepare`) |
| `tar -tzf encodeurl-3.0.0.tgz` | Exactly 6 files: package.json, README.md, LICENSE, dist/index.js, dist/index.js.map, dist/index.d.ts |
| `tar -xzf` to temp + `diff -r <temp>/package "$NPM_ARTIFACT"` | IDENTICAL — extracted audit copy matches tarball |
| `diff "$NPM_ARTIFACT/package.json" "$PACKAGE_ROOT/package.json"` | IDENTICAL |
| map `sourcesContent[0]` vs `git show v3.0.0:src/index.ts` and vs HEAD `src/index.ts` | IDENTICAL (both) — dist build corresponds exactly to audited source |
| `git -C "$NODEJS_SOURCE" log -1` | `d44625a4b80c672215b469906ce583ce7eeeebaf` (main, clean) — baseline pinned; no lib/ file applicable as patch target |
| `node check-globals.mjs "$NPM_ARTIFACT/dist/index.js"` (Node v24.19.0) | `PASS: no global/prototype/intrinsic mutation detected after import or call`; behavior samples pass; exit 0 |
