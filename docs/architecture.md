# Architecture

```text
src/ast.ts       TypeScript parser + symbol bindings -> FileAnalysis
src/config.ts    read JSON options / inspect exported Next config without execution
src/resolver.ts  source snapshot -> bounded constants/imports + evidence
src/analyze.ts   scan files -> merge observed graph -> rules / suppression -> Report
src/identity.ts  structural finding groups -> versioned fingerprints
src/baseline.ts  fingerprint occurrence counts -> new/existing findings
src/reporters.ts Report -> text, JSON, Markdown, SARIF, static HTML
src/eslint.ts    ESLint source buffer -> same engine -> ESLint diagnostics
bin/            Node CLI argument parsing / exit codes / output
packages/eslint-plugin/  optional public alias for next-cache-trace/eslint
```

V0.1 deliberately ships one main package plus an ESLint alias instead of publishing four internal packages. This keeps graph types and rule versions synchronized; the architectural layers remain separate modules. Native tsc emits ESM and declaration files; a bundler and Vitest are not needed for these Node-only modules. TypeScript 5.9 is pinned to a compatible minor because the analyzer uses its compiler API and the TypeScript ESLint parser's supported range excludes TypeScript 7.

The parser uses an in-memory TypeScript Program with noLib/noResolve. Its binder distinguishes direct import symbols from shadowing local bindings. It does not type-check the user's application or execute imports. Source-to-source cross-module call graphs and re-export resolution are explicitly unsupported.

Project scans are synchronous internally (ESLint rule visitors are synchronous); an async analyzeProject wrapper remains available. Each scan builds a fresh project snapshot, replacing the old per-file AST cache. Disk contents are reread so edits cannot retain obsolete tag producers. The current ESLint buffer overrides that file's disk content. Multi-file unsaved buffers are not available.

Reports use relative forward-slash source paths. One fresh TypeScript Program covers the complete source snapshot, and the resolver follows only direct named exports/imports, immutable const literals, object fields and arrays. Evidence records usage, definition, import and literal steps. Re-exports, wrappers, mutable aggregates, dynamic expressions and runtime behavior stay unresolved. SARIF encodes path segments, provides a source-root URI and stable content-derived fingerprints. The HTML graph uses escaped strings, no scripts and no network assets.

Schema 0.3 describes the report model; npm version 0.2.0 describes the package release. Baselines require matching schema, tool minor version and analysis signature. Identities group structurally equal findings within a source file and retain their multiplicities. Moving a file or renaming its enclosing function can produce new findings. Neither reports nor baselines imply runtime freshness guarantees.
