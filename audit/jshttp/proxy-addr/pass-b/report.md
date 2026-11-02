# proxy-addr Pass B -- Monkeypatch Audit Summary

Package: proxy-addr 2.0.8
Commit: a11ad82545698af5c33e59f3ed0b52eab79bf610
Audit date: 2026-11-01
Auditor: Pass B (independent, double-blind)

## Verdict

**CLEAN -- No monkeypatching detected.**

## Scope

Three production files were audited:

| File                                            | Lines |
|-------------------------------------------------|-------|
| `$PACKAGE_ROOT/index.js`                        | 360   |
| `$PACKAGE_ROOT/node_modules/forwarded/index.js` | 91    |
| `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js` | 673 |

Six regex search groups were executed covering:
1. Module imports (`require`, `import`, `from`, `node:`)
2. Global references (`Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits`)
3. Prototype and property mutation (`.prototype`, `__proto__`, `setPrototypeOf`, `defineProperty`, `Object.assign`)
4. Patching keywords (`monkeypatch`, `patch`, `wrap`, `shim`, `polyfill`, `override`)
5. Module system hooks (`require.cache`, `require.extensions`, `Module._*`)
6. Node.js internal bindings (`process.binding`, `internalBinding`, `_http_*`, `internal/`)

## Findings

7 candidates were identified and classified. All 7 are **NOT A PATCH**.

| ID    | File                 | What was matched                        | Why it is not a patch                                  |
|-------|----------------------|-----------------------------------------|--------------------------------------------------------|
| C-001 | index.js:23-24       | `require('forwarded')`, `require('ipaddr.js')` | Standard dependency loading                     |
| C-002 | index.js:102         | `Object.prototype.hasOwnProperty.call(...)` | Read-only access; no write to Object.prototype     |
| C-003 | ipaddr.js:663        | `ipaddr.process = function(...)`        | Own method on library object; not Node.js `process`    |
| C-004 | ipaddr.js:71-342     | `IPv4.prototype.*`, `IPv6.prototype.*`  | Own class prototypes; not Node.js built-ins            |
| C-005 | ipaddr.js:537        | `Object.defineProperty(parsed, ...)`    | Defines property on a locally-created array instance   |
| C-006 | ipaddr.js:611        | `Object.defineProperty(parsed, ...)`    | Defines property on a locally-created array instance   |
| C-007 | ipaddr.js:1-12,673   | UMD wrapper with `root = this`          | Browser fallback path; never reached in Node.js        |

Search groups 4, 5, and 6 returned **zero** production-file hits.

## Detail

- **forwarded** (`$PACKAGE_ROOT/node_modules/forwarded/index.js`): 91 lines of
  pure string parsing and request property reading. No hits from any search
  group. Completely clean.

- **ipaddr.js** (`$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`): CoffeeScript-
  compiled IP address library. All prototype writes are to the library's own
  `IPv4` and `IPv6` constructors. Two `Object.defineProperty` calls target
  freshly-created local arrays (CIDR parse results), not shared prototypes.
  The UMD module wrapper's `root['ipaddr'] = ipaddr` fallback path is guarded
  by a `typeof module` check and is unreachable in Node.js.

- **proxy-addr** (`$PACKAGE_ROOT/index.js`): Two standard `require()` calls
  and one read-only `Object.prototype.hasOwnProperty.call()`. No writes to
  any prototype, global, or module system hook.

## Conclusion

proxy-addr 2.0.8 and its two runtime dependencies (forwarded, ipaddr.js) do
not monkeypatch Node.js runtime behavior, prototypes, module loading, globals,
or internal bindings. The library is safe from a monkeypatch perspective.
