# basic-auth-connect — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #6; cloned `master` @ `856183e95f7bea8579c4ee07f225b2e3edb8b8b8` (v1.1.0) into `basic-auth-connect/upstream/basic-auth-connect`; installed the sole runtime dep with `npm install --ignore-scripts --omit=dev` (`tsscmp@1.0.6`, lockfile-pinned with integrity hash).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:76-136` and `tsscmp/lib/index.js:14-35` directly; merged into final report.

## Scope

- In scope: `index.js` (136 lines) + `tsscmp/lib/index.js` (38 lines) — the complete runtime surface, read line-by-line in full by both passes.
- Out of scope: test.js, Makefile, docs.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups plus supplementary write/delete/descriptor sweeps over both packages. All mutation-pattern searches negative; candidates were exclusively documented calls and instance metadata writes.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/incoming.js:62-106` (IncomingMessage constructor — no `user`/`remoteUser`)
- `$NODEJS_SOURCE/lib/internal/http/server.js:285` (`statusCode` prototype default)
- `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813/1289` (`setHeader`/`end`)
- `$NODEJS_SOURCE/lib/buffer.js:320` (deprecated Buffer constructor delegating to `Buffer.from`)

## Runtime reproduction (pass A)

- Node v24.19.0; `pass-a/repro-no-mutation.js` + `repro-output.txt`.
- 17 identity/descriptor/key-set snapshots of http/crypto/Buffer/Module/require.extensions/globalThis before/after require + 12 middleware invocations (all three usage modes): all unchanged.

## Upstream corroboration

- tsscmp introduced by commit `bac1e6a` fixing CVE-2024-47178 / GHSA-7p89-p6hx-q4fw (timing attack; fixed in 1.1.0).
- Open unmerged PR expressjs/basic-auth-connect#10 (2.0.0 rewrite) would remove tsscmp — not in audited source.

## Reconciliation outcome

- Verdicts identical: no confirmed patching in the inspected scope.
- Ledgers: A 10 / B 13 entries — same substance (B itemized reads separately); all rejected, 0 unresolved.
- Disagreements: **none**. Orchestrator spot-check matched all claims.

## Limitations

- tsscmp pre-v6.6.0 fallback analyzed statically (dead on Node ≥ 6.6.0; loop-only, cannot patch core).
- Reproduction used mock req/res while snapshotting real core modules.
- Node baseline is main; `_http_*.js` re-export shims verified.
