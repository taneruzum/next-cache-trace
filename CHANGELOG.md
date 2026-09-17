# Changelog

## 0.1.0 — Unreleased

- Replaced the lexical prototype with strict TypeScript and TypeScript Compiler API analysis.
- Resolve direct Next imports, named aliases, namespace imports and local shadowing.
- Model function and file-export cache boundaries, literal producers and invalidations.
- Include fetch next.tags and unstable_cache producers.
- Correct private-cache and draftMode-read false positives.
- Add conservative exported-config analysis, unresolved/syntax diagnostics, JSON configuration and suppression comments.
- Share analysis between CLI and ESLint 9/10 flat config adapters.
- Provide typed public API and text/JSON/SARIF/escaped standalone HTML reports.
- Add cross-platform CI, clean tarball installation checks, SARIF workflow and a buildable Next.js 16 demo.
- Preserve local-only operation. Runtime dependencies are TypeScript and picomatch; the package is no longer dependency-free.
