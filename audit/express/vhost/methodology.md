# vhost — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #17; cloned `master` @ `f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99` (v3.0.2) into `vhost/upstream/vhost`; `npm install --ignore-scripts --omit=dev` yielded an **empty dependency set** (zero runtime deps).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; independently verified the zero-`require` claim (`grep -n "require(" index.js` → no matches) and re-read the `req.vhost` + null-prototype object sites; merged into final report.

## Scope

- In scope: `index.js` (164 lines) — the entire runtime surface.
- Out of scope: tests, docs.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six pattern groups (all negative except read-only hits) plus an exhaustive assignment inventory (23 assignments, all classified). Upstream gh issue searches empty.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/incoming.js` (:125 lazy `headers` accessor; member inventory — no `vhost`)
- `lib/_http_incoming.js` (DEP0199 shim), `lib/http.js`

## Runtime reproduction (pass A)

- Node v24.19.0; `pass-a/repro-no-mutation.js`: after require + middleware exercise, only own-key `vhost` added to req; core prototypes/descriptors unchanged. (Pass B: static proof deemed sufficient for a zero-import file — reasonable.)

## Reconciliation outcome

- Verdicts identical: no confirmed patching in the inspected scope.
- Ledgers: A 9 / B 6 entries, same substance (A itemized more read-only entries + the historical pre-3.0 note); all rejected; 0 unresolved.
- Disagreements: **none**. Orchestrator verification matched all claims.

## Limitations

- Audit covers the git checkout, not npm tarball bytes.
- Reproduction exercised the string-pattern matching branch; regexp branch covered statically (same write site).
- Simplest package of the series; coverage is total.
