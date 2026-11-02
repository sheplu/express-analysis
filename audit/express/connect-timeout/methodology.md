# connect-timeout — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #16 (expressjs/timeout); cloned `master` @ `7377defb5b7b5a9c3d50fabd42c4dd46ad175d13` (v1.9.1) into `timeout/upstream/connect-timeout`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (depd@1.1.2, ee-first, http-errors@1.6.3, ms, on-finished@2.3.0, on-headers@1.1.0, setprototypeof, statuses).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-verified `index.js` activation sites, dep versions, and on-finished 2.3.0's full guard chain (`attachFinishedListener` socket checks :117-129, `patchAssignSocket` :186-196); adjudicated the dormant-finding divergence; merged into final report.

## Scope

- In scope: `index.js` (89 lines) + all 8 runtime dependencies (16-file runtime scope).
- Out of scope: tests, docs; depd browser entry.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups; assignment sweeps isolated the dependency wraps and the two new req keys; loader/bindings/prototype sweeps zero-hit. Pass A additionally ran bounded history searches (`git log -S`) uncovering this package's **removed** direct wraps (commits `cb5c2ee`, `300ea5d`).

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/server.js:423` (writeHead), `:312` (assignSocket), `:929-934` (core `'timeout'` event emission)
- `$NODEJS_SOURCE/lib/internal/http/outgoing.js:187` (socket slot `null` init — F-003 dormancy)
- `$NODEJS_SOURCE/lib/internal/http/incoming.js` (member inventory — no `timedout`/`clearTimeout`)

## Runtime reproduction

- Node v24.19.0; `pass-a/repro.js` (+ output), `pass-b/repro.js`.
- Observed: writeHead wrapper as instance own-property (prototype untouched); **3 depd set/restore cycles (6 global writes) during require**, fully restored; assignSocket wrap NOT applied to a live response.

## Reconciliation outcome

- F-001/F-002: identical in both passes (A detailed depd 1.x compat-layer line numbers; B reported the aggregate fire count — consistent observations of the same behavior).
- **Divergence (1):** on-finished@2.3.0's dormant assignSocket wrap — pass A rejected as dead code; pass B counted it confirmed-but-dormant. **Adjudication:** kept as distinct legacy-gated finding F-003, consistent with the compression report's treatment of the same pattern (shipped dispatchable code within declared engines, explicitly unreachable on the audited baseline). Orchestrator independently re-read the 2.3.0 guard chain to confirm the dormancy logic matches 2.4.2's.
- Ledgers: A 22 / B 28 entries, same substance; 0 unresolved.
- Cross-series consistency: on-headers = 6th occurrence; depd = 7th (first on the 1.x line — note the compat layer doubles the write count); dormant assignSocket = 3rd occurrence (compression, morgan, here).

## Limitations

- F-003's active path requires Node 0.8 (not executable); proven dormant statically + by repro.
- Reproduction on Node v24.19.0; baseline is main.
- depd's log-time re-entry not triggered by connect-timeout's own `createError(503)` call (only by deprecated http-errors signatures in app code).
