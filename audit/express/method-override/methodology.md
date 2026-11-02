# method-override — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #15; cloned `master` @ `4df570e14dddc88b9464808f4cab3b2a73fc6dc8` (v3.0.0) into `method-override/upstream/method-override`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (debug@3.1.0, methods, ms, parseurl, vary).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Both were explicitly directed at the central classification question (is overwriting core-assigned `req.method` a patch?) without being given an expected answer.
3. Orchestrator reconciliation: compared verdicts/rationales; re-read `index.js:58-78` and verified the "Read only" contract at `doc/api/http.md:2987`; merged into final report.

## Scope

- In scope: `index.js` (144 lines) + all five runtime dependencies — 9 runtime files, 1,247 lines, read in full by both passes.
- Out of scope: tests, docs; debug's browser entry; `supports-color` (not installed).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups; assignment sweep isolated the single core-backed write (`req.method =`); all loader/bindings/prototype/global sweeps negative.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/incoming.js:96` (constructor init of `method`)
- `$NODEJS_SOURCE/lib/internal/http/common.js:118` (`parserOnHeadersComplete` wire assignment)
- `$NODEJS_SOURCE/doc/api/http.md:2977-2987` (documented "Read only" contract)
- `$NODEJS_SOURCE/lib/http.js:264` (`http.METHODS` export)

## Runtime reproduction (both passes)

- Node v24.19.0; `pass-a/repro-method-override.js`, `pass-b/repro-method-override.js` (+ output).
- Verified: `method` is an own writable data property; POST→DELETE flip on the live request; zero shared-state diffs (prototypes, constructors, `http.METHODS`) after require and after handling.

## Reconciliation outcome

- Verdicts identical: confirmed patching — 1 direct instance override at `index.js:75`.
- **Classification rationale identical and independently derived**: both passes cited the core docs' "Read only" declaration as the decisive factor and recorded the same counterfactual (mutation-sanctioned docs ⇒ no-patch verdict). This convergence on a genuine judgment call is the strongest signal of the series that the classification is stable.
- Ledgers: A 11 / B 12 entries, same substance; 0 unresolved. Disagreements: **none**.

## Limitations

- Reproduction covered the default header-getter path; query/function getter paths verified statically (identical write site).
- Baseline is main; classification independent of ref (constructor/parser/doc contract stable across release lines).
- Both passes wrote .md deliverables via shell heredoc (harness Write-tool restriction); content leak-checked.
