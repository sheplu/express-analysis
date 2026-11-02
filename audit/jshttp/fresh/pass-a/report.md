# Node.js patch audit: fresh -- Pass A

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: fresh (https://github.com/jshttp/fresh)
- Library: v2.0.0, commit ee7367318cf86a77e8259c63ee014ff0f8853437
- Node.js baseline: v24.19.0
- Scope: `index.js` (138 lines) -- the sole runtime file shipped via `package.json` `files` field
- Coverage: full coverage of all production code; zero runtime dependencies; tests and benchmarks excluded per protocol
- Protocol: Pass A of two-pass blind audit

## Patching verdict

**No monkeypatching detected.** The library is a pure function module that exports a single function (`fresh`). It:

- Has zero `require()` or `import` calls -- it imports nothing at all.
- Does not reference `process`, `Buffer`, `globalThis`, `global`, or any Node.js built-in module.
- Does not touch any `.prototype`, use `__proto__`, `Object.defineProperty`, `Object.assign`, `Reflect`, or `setPrototypeOf`.
- Does not interact with `require.cache`, `require.extensions`, `Module` internals, or ESM loader hooks.
- Does not reference `process.binding`, `internalBinding`, or any Node.js internal module.
- Contains no patterns matching `patch`, `wrap`, `shim`, `polyfill`, or `override`.

The library reads two plain objects (request headers and response headers) passed as arguments, calls `Date.parse` (a standard built-in), and returns a boolean. It has no side effects on any shared state.

## Confirmed Node.js patches

None.

## Candidate ledger summary

| ID    | Site and core target                 | Status   | Evidence/reason                                                          |
|-------|--------------------------------------|----------|--------------------------------------------------------------------------|
| C-001 | `Date.parse` call in `parseHttpDate` | REJECTED | Read-only call to standard API; defensive typeof guard against external patchers; no mutation |

## Supporting context

- The `parseHttpDate` function (lines 93-99) contains a comment noting awareness that the `date.js` library may patch `Date.parse` to return non-number values. The `typeof timestamp === 'number'` guard is a defensive consumer pattern, not a patch. Fresh itself never modifies `Date.parse`.
- The library uses `module.exports = fresh` as its sole export mechanism -- a standard CJS assignment to the module's own exports object, not a mutation of any shared prototype or global.
- The `parseTokenList` function is a self-contained string parser with no interaction with Node.js internals.

## Sources and verification

| Source          | Command/query                                                                 | Result                          |
|-----------------|-------------------------------------------------------------------------------|---------------------------------|
| Search group 1  | `rg -n 'require\s*\(\|...\|node:'` across `$PACKAGE_ROOT`                    | 0 hits in production files      |
| Search group 2  | `rg -n '\bBuffer\b\|\bprocess\b\|...'` across `$PACKAGE_ROOT`                | 0 hits                          |
| Search group 3  | `rg -n '\.prototype\b\|__proto__\|...'` across `$PACKAGE_ROOT`               | 0 hits                          |
| Search group 4  | `rg -n 'monkey.?patch\|\bpatch\b\|...'` across `$PACKAGE_ROOT`               | 0 hits                          |
| Search group 5  | `rg -n 'require\.cache\|require\.extensions\|...'` across `$PACKAGE_ROOT`     | 0 hits                          |
| Search group 6  | `rg -n 'process\.(binding\|_linkedBinding)\|...'` across `$PACKAGE_ROOT`      | 0 hits                          |
| Supplemental    | `rg -n '\bDate\.parse\b'` on `$PACKAGE_ROOT/index.js`                        | Line 94: read-only call         |
| Manual review   | Full read of `index.js` (138 lines)                                           | No patching patterns identified |
