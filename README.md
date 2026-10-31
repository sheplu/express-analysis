# express-analysis

A reusable skill for answering: **Does this Node.js library patch or monkeypatch
Node.js core?**

The [audit-nodejs-dependency skill](.agent/skill/audit-nodejs-dependency/SKILL.md)
accepts a package/version, local source directory, or issue/PR. It traces direct
and transitive patches, shared API/prototype changes, instance overrides, module
interception, and core source rewrites. Reports lead with a patching verdict,
exact mutation sites, activation conditions, and evidence.

```text
/audit-nodejs-dependency express@5.1.0
/audit-nodejs-dependency ./node_modules/graceful-fs
/audit-nodejs-dependency <issue-or-PR-URL> focus on HTTP prototype overrides
```

Provide a Node.js checkout in the request or through `NODEJS_SOURCE`. Without
one, the audit can use relevant version-pinned upstream files. Searches stay
within the core subsystems implicated by the library.

Reports update `audits/<library-name>/report.md`, for example
`audits/express/report.md` or `audits/@scope/name/report.md`. Private API use
and compatibility observations remain supporting context. Shared artifacts use
relative paths or source-root aliases and omit personal machine information.

The skill follows the [Agent Skills format](https://agentskills.io/specification).
The canonical Markdown lives in `.agent/skill/`; relative directory symlinks
expose it through the documented [Claude Code](https://code.claude.com/docs/en/skills)
and [Mistral Vibe](https://docs.mistral.ai/vibe/code/cli/skills) discovery folders.
