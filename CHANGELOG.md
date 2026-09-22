# Changelog

## 0.2.0 — Unreleased

- Resolve direct immutable constants, object/array fields and named imports with bounded source evidence chains.
- Add count-aware semantic baselines, full-report Markdown output, `--min-files` and `--require-cache-usage` scope gates.
- Add schema 0.3 coverage fields, fresh source snapshots, nested-app protection and package-wide version metadata.
- Move maintainer validation and release records outside the npm package.

The report schema is now 0.3 and graph sites include resolution and evidence fields; review typed consumers before upgrading. Baselines require the same tool minor, schema and analysis configuration. Compiler aliases support only relative config inheritance inside the audited root; nested Next apps must be excluded or audited separately.

## 0.1.0 — 2026-09-19

- Add Next.js 16 migration warnings for single-argument revalidateTag (NCT006).
- Check literal tag length (NCT007) and fully known tag-list limits (NCT008).
- Suggest nearby observed producer spellings/case for NCT001 without auto-fixing or inventing links.
- Add opt-in Server Action freshness review (NCT009); valid stale-while-revalidate calls remain allowed by default.
- Extend ESLint recommended checks and document a local-install/CI pilot workflow.

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
