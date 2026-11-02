# Node.js patch audit: fresh — Pass B

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: fresh (https://github.com/jshttp/fresh)
- Library: v2.0.0, commit ee7367318cf86a77e8259c63ee014ff0f8853437
- Node.js baseline: v24.19.0
- Scope: \`\$PACKAGE_ROOT/index.js\` (138 lines) — the sole production file
- Coverage: All 6 regex search groups run against all non-test, non-benchmark files in the repository. The production file \`index.js\` was fully reviewed (138 lines). No runtime dependencies exist. The \`files\` field in package.json ships only \`HISTORY.md\`, \`LICENSE\`, and \`index.js\`.
- Protocol: Pass B of two-pass blind audit

## Patching verdict

**No monkeypatching detected.** The library contains a single production file (\`index.js\`, 138 lines) that exports one pure function. That function:

- Accepts two plain objects (request headers and response headers) and returns a boolean.
- Uses only standard JavaScript built-ins: \`Date.parse()\`, \`String.prototype.charCodeAt()\`, \`String.prototype.substring()\`, \`RegExp.prototype.test()\`, \`Array.prototype.push()\`, and \`typeof\`.
- Has zero \`require()\` or \`import\` statements — no dependencies, no Node.js core modules loaded.
- Does not reference \`process\`, \`Buffer\`, \`globalThis\`, \`global\`, or any Node.js-specific API.
- Does not touch any prototype, use \`Object.defineProperty\`, \`Object.assign\`, \`Reflect\`, \`__proto__\`, or \`setPrototypeOf\`.
- Does not interact with the module system (\`require.cache\`, \`require.extensions\`, \`Module._load\`, ESM hooks).
- Does not access Node.js internals (\`process.binding\`, \`internalBinding\`, \`_http_*\`, \`internal/*\`).
- Exports via a single \`module.exports = fresh\` assignment, which is standard CommonJS usage.

All 6 regex search groups returned zero hits against the production file. The only hits in the entire repository (3 total) were \`require()\` calls inside \`README.md\` code examples — non-executable documentation that is not even included in the npm package \`files\` field.

## Confirmed Node.js patches

None.

## Candidate ledger summary

| ID | Site and core target | Status | Evidence/reason |
|---|---|---|---|
| C-001 | README.md:24 — \`require('fresh')\` | REJECTED | Non-production documentation example |
| C-002 | README.md:75 — \`require('fresh')\` | REJECTED | Non-production documentation example |
| C-003 | README.md:76 — \`require('http')\` | REJECTED | Non-production documentation example |

All 3 candidates are in non-production files and are rejected. Zero candidates originated from production code.

## Supporting context

- **No private API usage.** The library does not use any Node.js APIs at all — neither public nor private. It is a pure JavaScript function operating on plain objects.
- **No compatibility patterns.** There is one defensive guard in \`parseHttpDate()\` (the \`istanbul ignore next\` comment) that checks \`typeof timestamp === 'number'\` to protect against third-party Date.parse polyfills (e.g., date.js). This is a *defensive* pattern against external patching, not patching itself.
- **Module export.** The single \`module.exports = fresh\` assignment is standard CommonJS export, not a mutation of the module system.
- **Zero attack surface.** With no dependencies, no imports, no access to globals, and no prototype manipulation, the library has no mechanism by which it could monkeypatch Node.js.

## Sources and verification

| Source | Command/query | Result |
|---|---|---|
| Search 1: require/import/node: | \`rg -n 'require\\s*\\(\\|...' \$PACKAGE_ROOT\` | 3 hits in README.md only; 0 in production |
| Search 2: Buffer/process/global/extends/inherits | \`rg -n '\\bBuffer\\b\\|\\bprocess\\b\\|...' \$PACKAGE_ROOT\` | 0 hits |
| Search 3: prototype/defineProperty/Reflect/Object.assign | \`rg -n '\\.prototype\\b\\|__proto__\\|...' \$PACKAGE_ROOT\` | 0 hits |
| Search 4: monkeypatch/patch/wrap/shim/polyfill/override | \`rg -n 'monkey.?patch\\|\\bpatch\\b\\|...' \$PACKAGE_ROOT\` | 0 hits |
| Search 5: require.cache/Module internals/ESM hooks | \`rg -n 'require\\.cache\\|require\\.extensions\\|...' \$PACKAGE_ROOT\` | 0 hits |
| Search 6: process.binding/internalBinding/internal modules | \`rg -n 'process\\.(binding\\|_linkedBinding)\\|...' \$PACKAGE_ROOT\` | 0 hits |
| Production file review | Manual review of \`\$PACKAGE_ROOT/index.js\` (138 lines) | Pure function, no side effects on runtime |
| Package metadata | \`\$PACKAGE_ROOT/package.json\` files field | Ships: HISTORY.md, LICENSE, index.js |
| Commit verification | \`git log -1\` in \`\$PACKAGE_ROOT\` | ee7367318cf86a77e8259c63ee014ff0f8853437 |
