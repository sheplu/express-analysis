# csrf — findings detail (files, lines, issues)

Library: csrf 3.1.0 (master @ `33536b89609ea7354aeae2c0720087f6ff77eaa4`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches across the full 5-file runtime tree (csrf + rndm, tsscmp, uid-safe, random-bytes).

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 45 | `function Tokens (options)` plain constructor | library-owned; inherits `Object.prototype` only |
| `index.js` | 79-124 | `Tokens.prototype.create/secret/secretSync/verify...` assignments | writes to the library-owned prototype |
| `index.js` | 151-159 | `crypto.createHash('sha1').update(str,'ascii').digest('base64')` | read-only call chain |
| `tsscmp/lib/index.js` | 17-18 | `if (crypto.timingSafeEqual) return crypto.timingSafeEqual(a, b)` | feature-detect read + call; fallback loop module-local |
| `tsscmp/lib/index.js` | 31 | `crypto.pseudoRandomBytes(32)` | **deprecated-API call** (DEP0115) — exposure to track, not a write |
| `random-bytes/index.js` | 21 | `crypto.randomBytes === crypto.pseudoRandomBytes` init-time read | triggers core's own lazy alias materialization (below) |
| `rndm` | entry | `Math.random` | read/call only |
| `uid-safe`/`random-bytes` | entries | `crypto.randomBytes` callback/promise wrappers, `global.Promise`, `setTimeout` refs | reads/calls; own-export writes only |

## The lazy-alias subtlety (rejected candidate R-05 — documented for future audits)

Reading `crypto.pseudoRandomBytes` for the first time flips the property's descriptor from accessor to data property. This is **Node core's own mechanism**: `getRandomBytesAlias(key)` (`$NODEJS_SOURCE/lib/crypto.js:309-340`) defines a configurable getter that, on first access, redefines itself with the value `randomBytes` and emits the DEP0115 warning; it is installed for `prng`/`pseudoRandomBytes`/`rng` at `crypto.js:384-389`. Both passes proved the library's innocence independently:
- pass A: no-library **control run** shows the identical descriptor flip with zero library code loaded;
- pass B: `repro/lazy-alias-note.js` isolates the transition and verifies the resolved value is reference-identical to pristine `crypto.randomBytes`.

## Negative sweeps (both passes, zero hits)

- Patch keywords (group 4), module-loading interception (group 5), internals/bindings (group 6): zero hits
- Core-namespace assignments / descriptor deletions: zero hits
- No install scripts anywhere in the tree; no native code; `index.d.ts` types-only

## Runtime reproduction (both passes, Node v24.19.0)

Exercised `new Tokens()`, factory call, `secret()` (promise + callback), `secretSync()`, `create(secret)`, `verify()` true/false. Before/after: 15/15 pinned identities intact (crypto fns incl. `timingSafeEqual`, Hash + `Hash.prototype.update/digest`, `Math.random`, `Object.assign`, `Module._load/_resolveFilename`, `process.binding`, `Promise`, `setTimeout`); 0 descriptor diffs; 0 prototype/global/`require.extensions`/builtin-cache diffs; `require.cache` grew by exactly the 5 library files. **No core mutation observed.**

## Node.js-change risk

1. **`crypto.pseudoRandomBytes` removal (DEP0115)** — the only concrete exposure: `tsscmp/lib/index.js:31` calls it on every `verify()`. Alias removal makes csrf token verification throw. Upstream: suryagh/tsscmp#17. (`random-bytes/index.js:21` only degrades gracefully — `generateAttempts` would become 3 via `undefined !== randomBytes`... actually the read would return `undefined`, comparison false, 3 attempts — still functional.)
2. Everything else is stable public crypto API (`createHash`, `createHmac`, `randomBytes`, `timingSafeEqual`) — call-only usage.
