# Search log — encodeurl@3.0.0 patch audit (pass B)

Tooling: `rg -n` (ripgrep). Scopes:

- **S1** = `$PACKAGE_ROOT/src/index.ts` (git runtime source, master @ `6545e6a324edc62c6e7dcbd1205a51b480cfe20b`)
- **S2** = `$NPM_ARTIFACT/dist/index.js` (shipped runtime entrypoint, `--no-ignore`)
- **S3** = whole `$PACKAGE_ROOT` tree excluding `package-lock.json` (to surface out-of-scope hits)

## Skill candidate pattern groups

| # | Pattern | S1 (runtime src) | S2 (runtime dist) | S3 (whole repo) |
| --- | --- | --- | --- | --- |
| G1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | zero hits | zero hits | hits only in `src/index.bench.ts:1-2`, `src/index.spec.ts:1-2` (vitest imports, test/bench — out of scope), `README.md:19,37-38,58-60` (docs examples — out of scope) |
| G2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | zero hits | zero hits | hits only in `tsconfig.json:2`, `tsconfig.build.json:2` (JSON `"extends"` config key — out of scope), `README.md:50,80` (docs example — out of scope) |
| G3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | zero hits | zero hits | zero hits |
| G4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | zero hits | zero hits | zero hits |
| G5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | zero hits | zero hits | zero hits |
| G6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | zero hits | zero hits | zero hits |

Notes:

- G1/G2 whole-repo hits are entirely in tests, benchmarks, docs, and TS config;
  none are in shipped runtime code. The `README.md` examples are consumer-facing
  usage examples (`escape-html`, `node:url`), not code the package executes.
- `package-lock.json` was excluded: it pins devDependencies only (build/test
  toolchain); the package declares **zero** runtime `dependencies`.

## Additional targeted checks

| Check | Command (portable form) | Result |
| --- | --- | --- |
| Clone commit | `git -C $PACKAGE_ROOT log -1` | `6545e6a324edc62c6e7dcbd1205a51b480cfe20b` "Update coverage badge (#39)" — matches tasked ref |
| Tag vs HEAD drift | `git -C $PACKAGE_ROOT diff v3.0.0 HEAD --name-only` | only `README.md` differs; `src/index.ts` and `package.json` identical to the `v3.0.0` tag |
| Shipped file inventory | `ls $NPM_ARTIFACT/dist/` | `index.d.ts`, `index.js`, `index.js.map` — single runtime file |
| src ↔ dist correspondence | node one-liner comparing `index.js.map` `sourcesContent[0]` with `$PACKAGE_ROOT/src/index.ts` | **byte-identical** (`true`); `sources: ["../src/index.ts"]`; dist JS is a faithful type-stripped transpile of the same 4-line function body |
| Tarball ↔ extracted dir | `tar -xzf encodeurl-3.0.0.tgz` then `diff -r` vs `$NPM_ARTIFACT` | identical |
| Registry integrity | `shasum encodeurl-3.0.0.tgz`; `shasum -a 512 \| base64`; `npm view encodeurl@3.0.0 dist.shasum dist.integrity` | local SHA-1 `3e6cdb0e25c24382b62ab06c115e9bf6044b87bd` and SHA-512 `4McP5wRMkyFkj2+U0GfnZVjUQBSu+6kqbNhZsRqO1UeDVsdY8GDloc1bfAGHJ4MAVgJjo5RHveJA4fUZQMSMMA==` both **match** registry `dist.shasum` / `dist.integrity` exactly |
| Install scripts | `package.json` scripts | no `preinstall`/`install`/`postinstall`; `prepare` (ts-scripts build) does not run on registry-tarball consumer installs — build-time only |
| History of current impl | `git show 716b0fd -- src/index.ts` (PR #37 "Improve perf and package size") | rewrote regex + replaced two-pass `.replace` with `.search` + `.toWellFormed()` + `.replace`; no patching in before or after versions |
| Runtime mutation probe | `node repro/snapshot-diff.cjs "$NPM_ARTIFACT"` (Node v24.19.0) | exit 0, `NO MUTATION DETECTED` — see `repro/result.txt` |
