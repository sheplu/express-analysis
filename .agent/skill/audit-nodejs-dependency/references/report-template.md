# Patch audit report template

Create or update `audits/<library-name>/report.md`. Keep the library name under
any requested output root. Use relative source paths and public upstream
references; represent source roots as `$PACKAGE_ROOT` and `$NODEJS_SOURCE`.
Omit machine-specific paths from metadata, commands, errors, and supporting files.

Replace the guidance below with actual evidence. Keep the verdict and confirmed
patches prominent. Supporting context should remain concise.

```markdown
# Node.js patch audit: <library name>

- Verdict: confirmed patching / no confirmed patching in the inspected scope / inconclusive
- Status: in progress | complete | partial
- Input: <package, relative path/alias, or public issue/PR>
- Library: <version, commit/ref, artifact type, relevant local changes>
- Node.js baseline: <version, full commit/ref, relevant local changes>
- Reproduction runtime: <version or not run; no executable path>
- Scope: <runtime entrypoints/dependencies; issue-only if requested>
- Coverage: <source, upstream, and runtime status with limitations>

## Patching verdict

<Answer whether patching was demonstrated. Count shared core mutations and
instance/application overrides separately, distinguish direct/transitive origin,
and identify unresolved candidates or excluded branches that limit the verdict.>

## Confirmed Node.js patches

### F-001: <core symbol and exact replacement/mutation>

- Category: <shared core mutation / instance or application override / core module interception / core source rewrite>
- Library site(s): <each relative file:line and pinned public source link>
- Origin: <direct or target -> dependency@version>
- Core baseline: <Node.js relative file:line, revision, original behavior>
- Exact mutation: <object, key, operation, and replacement>
- Execution chain: <entrypoint -> helper -> write>
- Activation: <import/call, guards, load order, production/optional/test-only>
- Scope and restoration: <affected consumers/instances, permanence or reset>
- Resulting behavior: <precise before/after and practical effect>
- Evidence: <static proof and/or reproduction command/result>
- Upstream: <relevant issue/PR/commit, state and applicability>

<Repeat for confirmed patches. If none, say so; do not promote private API
usage or normal extension points into this section.>

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | <relative file:line, symbol> | confirmed -> F-001 / unresolved / rejected as patch | <reason> |

## Supporting context

<Brief relevant private API usage, copied implementations that do not replace
core, supported extensions, library workarounds, or Node.js accommodations.
Identify actual library activation and separate generic/historical proposals.
Retain relevant prior finding IDs when moving observations here.>

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| <relative files/repository> | <portable command or public URL> | <evidence, state/merge status, negative result, or access gap> |

## Coverage and limitations

<Entry points, resolved dependencies, selected Node.js files and relevant refs,
branches tested/excluded, source expansions, unavailable evidence, and what
would change the verdict. Preserve public provenance and relative file hashes.>

## Changes since the previous audit

<New/revalidated/changed/historical findings; first audit if none.>
```
