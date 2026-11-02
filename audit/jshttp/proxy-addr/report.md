# proxy-addr Monkeypatch Audit -- Final Report

## Verdict: CLEAN

**proxy-addr v2.0.8 does not patch or monkeypatch Node.js core.**

No confirmed patches were found across the library or its runtime dependencies.

## Package Information

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Package        | proxy-addr                                 |
| Version        | 2.0.8                                      |
| Commit         | a11ad82545698af5c33e59f3ed0b52eab79bf610   |
| Entrypoint     | `$PACKAGE_ROOT/index.js`                   |
| Runtime deps   | forwarded (0.2.0), ipaddr.js (1.9.1)       |
| Audit date     | 2026-11-01                                 |

## Production Files Audited

| File                                                  | Lines |
|-------------------------------------------------------|-------|
| `$PACKAGE_ROOT/index.js`                              | 360   |
| `$PACKAGE_ROOT/node_modules/forwarded/index.js`       | 91    |
| `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`  | 673   |
| **Total**                                             | **1,124** |

## Confirmed Patches

None.

## Candidate Summary

Both independent audit passes ran all 6 regex search groups against all production files. Pass A identified 27 individual candidate hits; Pass B consolidated these into 7 grouped candidates. All candidates in both passes were classified **NOT A PATCH** with full agreement.

Search groups 4 (monkeypatch/shim/polyfill keywords), 5 (module system hooks), and 6 (internal bindings) returned zero hits in both passes.

## Dependency Assessment

| Dependency   | Status | Notes                                         |
|--------------|--------|-----------------------------------------------|
| forwarded    | CLEAN  | Zero hits across all search groups. Pure string parsing. |
| ipaddr.js    | CLEAN  | All prototype writes target own IPv4/IPv6 constructors. UMD global fallback unreachable in Node.js. |

## Sources and Verification

- Two independent double-blind audit passes with full agreement
- 6 regex search groups covering: imports, globals, prototypes, patching keywords, module hooks, internal bindings
- Manual trace of every candidate to actual write/mutation target
