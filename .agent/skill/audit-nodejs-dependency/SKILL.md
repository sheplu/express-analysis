---
name: audit-nodejs-dependency
description: Audit whether a Node.js library or its runtime dependencies patch or monkeypatch Node.js core. Trace mutations, method/prototype overrides, module interception, and core source rewrites; verify with targeted Node.js source and upstream issues/PRs, then save a library-named report with an explicit patching verdict.
---

# Audit a dependency for Node.js patches

The primary question is: **Does this library patch or monkeypatch Node.js?**
Find every demonstrated patch in the inspected runtime scope, including patches
applied through dependencies, and report exactly what changes, where, and when.

Private API usage, standalone copies of core code, ordinary inheritance, and
compatibility workarounds are supporting context. They do not establish a patch.
Keep them brief and separate from the patch verdict and confirmed patch findings.

## Input, configuration, and output

Accept a package/version, local source directory, issue/PR URL, or pasted issue.
Read invocation arguments as ordinary text; avoid client-specific substitutions.

```text
/audit-nodejs-dependency express@5.1.0
/audit-nodejs-dependency ./node_modules/graceful-fs
/audit-nodejs-dependency <issue-or-PR-URL> inspect HTTP prototype overrides
```

- Resolve the Node.js checkout from an explicit instruction or the
  `NODEJS_SOURCE` environment variable. Do not hardcode a personal directory or
  create machine-specific configuration. If no checkout is available, retrieve
  only relevant, version-pinned upstream files when possible. Continue the
  library inspection and mark unavailable core comparisons as a limitation.
- Save to `audits/<library-name>/report.md` at the workspace root, or the same
  library-named path under a requested output root. Examples:
  `audits/express/report.md` and `audits/@scope/name/report.md`.
  Validate package-name components; reject absolute paths, `..`, and unexpected
  separators. Update the same report each time.
- Prefer the requested version, then an installed/locked version, then an
  available checkout with its commit recorded. Pin remote-only source before
  inspecting it. Resolve the affected package from an issue's content; the issue
  repository may be Node.js rather than the affected library.
- Ask only when the target cannot be identified or ambiguity changes the audit.

## Keep shared artifacts portable

Use real local paths privately for execution. In reports, manifests, scripts,
command logs, and responses, use package/repository-relative file references and
aliases such as `$PACKAGE_ROOT`, `$NODEJS_SOURCE`, `$WORKSPACE`, and
`$FIXTURE_ROOT`. Record public repository URLs, exact versions/commits, relevant
local changes, and relative file hashes as provenance.

Do not persist home directories, usernames, absolute installation paths, runtime
executable paths, temporary directory names, or environment dumps. Runtime
versions are sufficient; show reproduction commands as
`node <workspace-relative-script> "$PACKAGE_ROOT"`. Sanitize captured output,
errors, and stack traces before saving, then check shared artifacts for local
path leaks. Keep source locations supplied in the current conversation out of
the reusable skill.

## Establish the library scope

1. Read applicable repository instructions. Identify package metadata, shipped
   runtime files, all entrypoints/exports, initialization and install scripts,
   and resolved runtime dependencies. Include conditional/optional entrypoints.
   A full PR audit requires the runtime tree at its head; a diff alone leaves
   coverage partial.
2. Record the library's version/ref and source provenance. Record the relevant
   Node.js version/ref separately from the runtime used for any reproduction.
   Inspect available alternative refs with `git show <ref>:<path>`; keep both
   checkouts unchanged.
3. Read any existing report before updating it, set its status to
   `in progress`, and preserve earlier evidence pending revalidation. Update
   evidence as work progresses so an interruption leaves a useful report.

Inspect the target's runtime code and dependencies capable of applying patches.
For each runtime dependency, check its resolved entrypoint/initialization before
excluding it: a patch can be hidden behind an ordinary package name. Follow
relevant helpers/transitive imports at their resolved versions. Avoid a blanket
scan of the installed dependency tree. Honor explicit issue-only scope, and
label tests, examples, historical code, and optional activation separately.

## Find actual writes and replacements

List files first, then use bounded `rg -n` searches and follow aliases/callers.
Include shipped dist/generated/bundled entrypoints even when Git ignores them.
An installed target inside node_modules must still be scanned: work from its
own root with scoped `--no-ignore` when needed, excluding only nested
dependencies and unrelated generated output. Prior audit reports supply leads;
they are not evidence of current executable code.

Inventory core imports/re-exports, aliases, and global core API use. Cover
CommonJS, ESM, node: imports, destructuring, dynamic loading, computed properties,
and helpers receiving core objects. These are separate candidate searches over
scoped package files:

```text
require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:
\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(
\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign
monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b
require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks
process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/
```

Inspect assignments, deletions, descriptor changes, saved originals, wrappers,
prototype reassignment, loader hooks, source transforms, and on-disk patches.
Trace computed keys and mutation helpers, including patching dependencies such as
shimmer or require-in-the-middle when used. Determine the object actually
modified; a regex hit or a helper name is only a lead.

Keep a candidate ledger. For each candidate, trace the entrypoint through helpers
to the exact write and affected core implementation. Record every distinct patch
site, direct/transitive origin, activation/version guards, load order, scope,
restoration behavior, and before/after behavior. Account for rejected and
unresolved candidates as well as confirmed ones.

## Verify against only the relevant Node.js code

Choose files from the observed target API or supplied issue. Expand only along a
specific import, symbol, or upstream reference; verify paths at the audited ref.

| Patch target | Initial Node.js source |
| --- | --- |
| HTTP request/response | lib/http.js, then relevant lib/_http_*.js or lib/internal/http/ implementation; follow re-exports |
| CommonJS loading | lib/internal/modules/cjs/loader.js |
| ESM hooks/builtin exports | lib/module.js, then the relevant lib/internal/modules/ helper |
| Filesystem | lib/fs.js, then relevant lib/internal/fs/ helper |
| Streams | lib/stream.js, then the relevant lib/internal/streams/ implementation |
| Buffer | lib/buffer.js, then lib/internal/buffer.js |
| Network/TLS, timers, async context | The matching public lib file, then directly referenced helpers |
| Native bindings | The JS binding callsite, then its matching src file |

Read the specific API contract when distinguishing an override from a supported
extension. Merely adding request metadata, defining library-owned methods,
subclassing through a documented constructor option, or implementing stream
_read/_write/_destroy/_final does not establish a core patch. An underscore field
may be library-owned; an undocumented core method may lack an underscore.
Neither naming convention proves mutation.
For loader hooks, establish an actual replacement/redirection of core behavior;
observation-only hooks or interception limited to third-party modules do not
establish a Node.js patch.

Use filename globs for test/doc discovery. Never recursively read or
content-search the whole Node.js lib, src, or test tree. A filename-only result
from `rg -l` still requires a content scan; narrow the search scope first.

As supporting context, inspect compatibility/legacy/monkeypatch comments in the
selected core files and follow package-specific references. Establish whether
the library actually activates that core behavior. Keep generic compatibility
branches, ecosystem tests, and unmerged proposals distinct from an implemented
accommodation for this library. Avoid unrelated ecosystem investigations.

## Corroborate and reproduce

Search primary library/Node.js issues and PRs relevant to observed patch targets
and the supplied issue, including open and closed items. Follow references in
code and tests first. Use bounded path-specific history, for example
`git log -n 20 -S '<symbol>' -- <file>`, then inspect the relevant diff.
Read upstream discussion and implementation before treating a workaround as
applied. Record URLs, state/merge status, affected revisions, rationale, and
whether the change exists in the audited source. Avoid entire issue archives.

When static evidence cannot settle a material patch claim, use a small isolated
process to compare function identities, descriptors, prototypes, or behavior
before/after import and the relevant call. Inspect code before executing it.
Keep reproduction scripts/results beside the report, use local source arguments
or environment variables, and omit machine paths from output. State the runtime
version and relevant untested branches. A tested branch cannot prove universal
absence. Avoid full Node builds, full suites, and exhaustive dependency installs.

Unavailable refs or upstream access should leave explicit limitations while
local investigation continues. Never infer implementation from a PR title,
merge status alone, or a maintainer assertion.

## Report the patching verdict first

Use [the report template](references/report-template.md). Lead with one verdict:

- **Confirmed patching:** one or more reachable writes/replacements of core
  APIs, globals, shared prototypes, core-backed instances, core module loading,
  or core source. Separate shared mutations from instance/application overrides.
- **No confirmed patching in the inspected scope:** candidates were checked and
  no patch was demonstrated. Include the coverage boundary.
- **Inconclusive:** missing source or unresolved candidates prevent an answer.
  Still list any individual patches already confirmed.

Primary findings contain confirmed patches only. For each, show the library
site and core baseline, exact mutation, execution chain/activation, scope and
origin, behavior change, evidence, and relevant issue/PR. Unsupported extension
assumptions, copied code not replacing core, private API reads, and general
compatibility workarounds belong in a short supporting-context section when
relevant. Do not expand those observations into a separate general internals,
security, or compatibility audit.

Use relative file:line references and revision-pinned public links. Keep concise
negative search results, rejected candidates, and coverage gaps. Track source,
upstream, and runtime coverage separately. Mark required missing work as
`partial`; optional reproduction is unnecessary when static proof suffices.

Revalidate previous findings, preserve their IDs, summarize changes, and retain
relevant historical evidence without presenting it as current. An incomplete
rerun must not silently erase prior evidence. End with the report path, patching
verdict, and material limitations. Writing local audit evidence does not
authorize changing the audited sources or posting externally.
