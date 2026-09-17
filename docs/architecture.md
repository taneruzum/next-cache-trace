# Architecture

```text
src/ast.ts       TypeScript parser + symbol bindings -> FileAnalysis
src/config.ts    read JSON options / inspect exported Next config without execution
src/analyze.ts   scan files -> merge literal graph -> rules / suppression -> Report
src/reporters.ts Report -> text, JSON, SARIF, static HTML
src/eslint.ts    ESLint source buffer -> same engine -> ESLint diagnostics
bin/            Node CLI argument parsing / exit codes / output
packages/eslint-plugin/  optional public alias for next-cache-trace/eslint
```

V0.1 deliberately ships one main package plus an ESLint alias instead of publishing four internal packages. This keeps graph types and rule versions synchronized; the architectural layers remain separate modules. Native tsc emits ESM and declaration files; a bundler and Vitest are not needed for these Node-only modules. TypeScript 5.9 is pinned to a compatible minor because the analyzer uses its compiler API and the TypeScript ESLint parser's supported range excludes TypeScript 7.

The parser uses an in-memory TypeScript Program with noLib/noResolve. Its binder distinguishes direct import symbols from shadowing local bindings. It does not type-check the user's application or execute imports. Source-to-source cross-module call graphs and re-export resolution are explicitly unsupported.

Project scans are synchronous internally (ESLint rule visitors are synchronous); an async analyzeProject wrapper remains available. AST results are cached in a bounded 256-entry map keyed by path and source text. Disk contents are reread for each project scan, so edits cannot retain obsolete tag producers. The current ESLint buffer overrides that file's disk content. Multi-file unsaved buffers are not available.

Reports use relative forward-slash source paths. SARIF encodes path segments, provides a source-root URI and stable content-derived fingerprints. The HTML graph uses escaped strings, no scripts and no network assets.

Schema 0.2 describes the report model; npm version 0.1.0 describes this first release. Neither implies runtime freshness guarantees.
