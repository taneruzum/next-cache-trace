# Architecture

```text
src/ast.ts       TypeScript parser + symbol bindings -> FileAnalysis
src/config.ts    read JSON options / inspect exported Next config without execution
src/resolver.ts  source snapshot -> bounded constants/imports + evidence
src/analyze.ts   scan files -> merge observed graph -> rules / suppression -> Report
src/identity.ts  structural finding groups -> versioned fingerprints
src/baseline.ts  fingerprint occurrence counts -> new/existing findings
src/reporters.ts Report -> text, JSON, Markdown, SARIF, static HTML
src/guidance.ts  finding + source snapshot -> reasons, excerpts and conditional examples
src/eslint.ts    ESLint source buffer -> same engine -> ESLint diagnostics
bin/            Node CLI argument parsing / exit codes / output
bin/setup.js    idempotent init + read-only doctor (never executes application code)
packages/eslint-plugin/  optional public alias for next-cache-trace/eslint
```

V0.1 deliberately ships one main package plus an ESLint alias instead of publishing four internal packages. This keeps graph types and rule versions synchronized; the architectural layers remain separate modules. Native tsc emits ESM and declaration files; a bundler and Vitest are not needed for these Node-only modules. TypeScript 5.9 is pinned to a compatible minor because the analyzer uses its compiler API and the TypeScript ESLint parser's supported range excludes TypeScript 7.

The parser uses an in-memory TypeScript Program with noLib/noResolve. Its binder distinguishes direct import symbols from shadowing local bindings. It does not type-check the user's application or execute imports. Named constant re-exports use bounded source lookup; source-to-source cross-module call graphs and re-exported Next API functions remain unsupported.

Project scans are synchronous internally (ESLint rule visitors are synchronous); an async analyzeProject wrapper remains available. Each scan builds a fresh project snapshot, replacing the old per-file AST cache. Disk contents are reread so edits cannot retain obsolete tag producers. The current ESLint buffer overrides that file's disk content. Multi-file unsaved buffers are not available.

Reports use relative forward-slash source paths. One fresh TypeScript Program covers the complete source snapshot. The resolver follows named exports/imports, explicit named re-export chains, local import/export lists, immutable const literals, object fields and arrays. Evidence records usage, export, definition, import and literal steps. A visited module/name set caps export lookup at 64; conflicting explicit exports, cycles, missing/excluded sources and parse errors yield unknown values. Cross-file mutation and escape inspection follows the same bindings. Wildcard/default/namespace exports, wrappers, mutable aggregates, dynamic expressions and runtime behavior stay unresolved. SARIF encodes path segments, provides a source-root URI and stable content-derived fingerprints. The HTML graph uses escaped strings, no scripts and no network assets.

Schema 0.4 describes the report model; 0.3.0 describes the package version. `Finding.explanation` is optional in the low-level source API and populated on project findings. It includes up to three source lines (300 characters per line plus truncation marker), reason, steps and illustrative examples. NCT006 records recognized Server Action versus unknown context. Reporters use this snapshot and never reread source files; explanations do not affect finding fingerprints or thresholds. Text/Markdown details are opt-in; HTML/JSON include them.

Baselines require matching schema, tool minor version and analysis signature; schema 0.3 baselines must be reviewed and regenerated. Identities group structurally equal findings within a source file and retain their multiplicities. Moving a file or renaming its enclosing function can produce new findings. Neither reports nor baselines imply runtime freshness guarantees.

`init` only writes missing config/script entries in the selected app. It refuses symlink/non-regular targets, prepares a temporary manifest before replacing it, preserves unrelated manifest fields and never installs packages. `doctor` reads installed package metadata without importing it, uses the normal project scan and reports setup failures separately from audit findings. It does not add version-dependent rules.
