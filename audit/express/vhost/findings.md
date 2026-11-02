# vhost — findings detail (files, lines, issues)

Library: vhost 3.0.2 (master @ `f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches.

## Why vhost cannot monkeypatch core (by construction)

- `index.js` contains **zero `require`/`import` statements** — no core module is ever loaded.
- Zero runtime dependencies — no transitive vector.
- The only core-backed objects it touches are the `req`/`res` passed in by the host framework, and `res` is never touched at all.

## All core-object interactions

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 61 | `req.vhost = vhostdata` | only write to a core-backed object; library-owned documented API key; absent from core IncomingMessage (negative grep across `$NODEJS_SOURCE/lib/internal/http/incoming.js`, `lib/_http_incoming.js`, `lib/http.js`) |
| `index.js` | 77, 140 | `req.headers.host` | read-only via documented lazy `headers` accessor (`incoming.js:125`); never mutated |
| `index.js` | 64 | `handle(req, res, next)` | transparent dispatch; nothing wrapped/saved/replaced |
| `index.js` | 102 | `Object.prototype.toString.call(val)` | read-only brand check |
| `index.js` | 153–160 | `obj.host/hostname/length/[i] = …` | writes to a fresh `Object.create(null)` library object (the value assigned to req.vhost — pollution-safe) |

## Negative sweeps (both passes, zero hits)

All six skill pattern groups: core imports (none exist), globals/Buffer/process, prototype/descriptor mutation, patch vocabulary, loader interception, bindings/internals. No npm lifecycle hooks. Exhaustive assignment scan: 23 assignments in the file, every one classified (library-owned or the single metadata key).

## Historical note

Pre-3.0 versions used `server.emit('request', …)` re-dispatch — public API use, removed in v3.0.0; not in the audited source.

## Runtime corroboration (pass A, Node v24.19.0)

After require + middleware exercise: only own-key `vhost` added to req; all checked core prototypes/descriptors unchanged.

## Node.js-change risk

None identified. Depends only on the documented `req.headers` shape. Theoretical-only collision if core ever introduced an IncomingMessage member named `vhost`.
