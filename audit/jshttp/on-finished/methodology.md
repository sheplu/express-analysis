# on-finished v2.4.2 — Reconciliation Methodology

**Audit date**: 2026-11-01
**Commit**: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`

## Protocol

A double-blind audit was performed with two independent passes (Pass A and Pass B),
each running the same 6 regex search groups against all production source files
and building independent candidate ledgers. The reconciliation compares findings,
adjudicates disagreements, and produces the final verdict.

## Scope

Production files audited (2 total):
- `$PACKAGE_ROOT/index.js` (247 lines)
- `$PACKAGE_ROOT/node_modules/ee-first/index.js` (96 lines)

Runtime dependency: `ee-first` 1.1.1 (zero dependencies of its own).

## Pass Comparison

### Search Results

Both passes ran identical search groups and obtained identical results:
- Group 1 (require/import): 2 hits in index.js — `require('ee-first')`, `require('async_hooks')`
- Group 2 (globals): 1 hit — `process.nextTick` read-only usage
- Group 3 (prototype/defineProperty): 1 hit — JSDoc comment mentioning `ServerResponse.prototype.assignSocket`
- Group 4 (patch/wrap/shim): 4 hits — `wrap(listener)`, two "node.js 0.8 patch" comments, `function wrap` definition
- Group 5 (module hooks): 0 hits
- Group 6 (internal bindings): 0 hits
- ee-first: 0 hits across all 6 groups in both passes

### Candidate Comparison

| Topic | Pass A | Pass B | Agreement? |
|-------|--------|--------|------------|
| `patchAssignSocket` per-instance override | C-001: CONFIRMED MONKEYPATCH | C-001: CONFIRMED patch, dormant | YES |
| Per-instance (not prototype) | Yes | Yes | YES |
| Dead code on modern Node.js | Yes (socket assigned before handler) | Yes (`msg.socket` is `null`, not `undefined`) | YES |
| `__onFinished` expando property | C-002: CONFIRMED INSTANCE MUTATION | C-002: CONFIRMED mutation | YES |
| Self-cleaning | Yes (set to `null` at line 164) | Yes (semi-permanent, nulled after fire) | YES |
| `wrap(fn)` AsyncResource | C-003: NOT A PATCH | (not separately listed) | YES |
| Event listener registration | C-004: NOT A PATCH | C-003: NOT A PATCH | YES |
| ee-first clean | Yes | Yes | YES |
| No prototype mutations | Yes | Yes | YES |
| No global mutations | Yes | Yes | YES |
| No loader hooks | Yes | Yes | YES |

### Disagreements Adjudicated

**1. Restoration of C-001 (patchAssignSocket)**

- Pass A: "Permanent (no restore path)"
- Pass B: "Reversible: `delete res.assignSocket` would restore prototype access"

**Resolution**: Pass B is technically more precise. A `delete res.assignSocket` would
remove the own property and expose the prototype method again. However, the on-finished
library does NOT perform this restoration — there is no cleanup path in the source code.
The final finding uses "theoretically reversible via `delete`, but no code path in the
library performs restoration."

**2. Candidate numbering**

- Pass A has 4 candidates (C-001 through C-004)
- Pass B has 3 candidates (C-001 through C-003)

**Resolution**: Organizational difference only. Pass A separated AsyncResource creation
and EventEmitter usage into distinct candidates; Pass B combined or omitted the
AsyncResource candidate. Both agree these are NOT patches. No impact on findings.

### Cross-Reference with Node.js Source (Reconciler verification)

The reconciler independently verified the following against the Node.js source at
`$NODEJS_SOURCE`:

1. `ServerResponse.prototype.assignSocket` is defined at
   `$NODEJS_SOURCE/lib/internal/http/server.js:312` — confirmed by both passes.

2. `OutgoingMessage` constructor initializes `this[kSocket] = null` at
   `$NODEJS_SOURCE/lib/internal/http/outgoing.js:187` — this makes `msg.socket`
   return `null` (not `undefined`) on modern Node.js, confirming the dead-code
   determination.

3. `OutgoingMessage.prototype.socket` is a getter/setter defined via
   `ObjectDefineProperty` at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:304-316`.

4. `assignSocket` is NOT on `OutgoingMessage.prototype` — it is only on
   `ServerResponse.prototype`. IncomingMessage has no `assignSocket` method.

5. `__onFinished` does not appear anywhere in the Node.js source tree — it is
   purely a library-added property.

## Final Verdict

Both passes agree fully on all material findings. The single disagreement
(restoration semantics of C-001) is a minor nuance that does not affect the
overall verdict. The reconciled report promotes both confirmed mutations to
the findings ledger.
