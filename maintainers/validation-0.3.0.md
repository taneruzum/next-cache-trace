# 0.3.0 local validation — 2026-09-28

Status: local development target, **Unreleased**. Branch: `codex/feat-030-usability`, based on `85f8c20`. This record does not claim hosted CI, a GitHub push/PR, npm publication, or independent pilot validation.

## Implemented scope

- `audit --explain` in text/Markdown; source snapshot excerpts, reasons and conditional examples. HTML/JSON include explanations. NCT006 distinguishes recognized Server Actions from unknown caller context without inventing a runtime call graph.
- Named constant re-export chains, aliases and local import/export lists, with evidence for each hop. Cycles, duplicate explicit exports, type-only/wildcard/default/namespace exports, missing/excluded sources and depth overflow remain unresolved. Mutations and escapes through importing barrels still invalidate aggregate evidence.
- Idempotent `init` with dry-run, preserved existing config/script entries, temporary manifest replacement and no dependency installation or baseline acceptance.
- Read-only `doctor` with installed Next metadata, source scope and coverage checks; text/JSON output. It does not apply audit finding thresholds.
- Both package manifests and lockfile target 0.3.0; ESLint alias peer range is `^0.3.0`, still optional. Report schema is 0.4. Existing schema 0.3 baselines require review/regeneration.

## Checks completed

Environment: Windows, Node.js 24.14.1. npm cache was redirected to the ignored workspace `.npm-cache` directory after the default user cache was not writable in the sandbox.

- `npm run verify`: **passed**, including lint, strict TypeScript build, **114 tests / 114 passed / 0 failed**, clean tarball consumer installation, TypeScript consumer and ESLint checks, and both package content dry-runs.
- The installed tarball's `audit`, `--explain`, `init --dry-run`, `init`, and `doctor --format json` were exercised in a temporary consumer. Package/lockfile versions and bundled setup/guidance modules were asserted.
- CLI explanation tests verify that CI thresholds remain unchanged, examples are conditional, old-schema baselines are rejected, and HTML/Markdown source excerpts are escaped.
- Resolver tests verify aliases, multi-hop evidence, fresh disk and editor overrides, mutation/escape handling, cycles, depth limits, exclusions and unsupported exports. ESLint project mode verifies refreshed barrel resolution after an edit.
- `git diff --check`: passed (Git emitted only line-ending conversion notices).

The complete local verification log is in ignored `artifacts/verify-0.3.0.log`.

## External testbed

Command: `npm run test:testbed -- "C:\Users\MR TANER\Desktop\NPM Paketlerim\next-cache-testbed"`.

All assertions passed using the current checkout's compiled analyzer/CLI. The testbed's installed analyzer dependency was not replaced and the Next application was not rebuilt or served.

- `apps/ayaz`: 15 source files; **0 errors, 0 warnings, 4 informational findings**, unchanged. Six producers, five invalidations, five cache boundaries; all invalidations matched. Baseline round trip and a newly introduced regression remain verified.
- `fixtures/storefront`: 27 files; **2 intentional errors, 9 warnings, 22 informational findings**. The former unresolved `app/(shop)/products/related.ts:7` now resolves `products:list` through `lib/tags-barrel.ts` to `lib/tags.ts`. Producer count increased from 14 to 15; active NCT900 count decreased from 9 to 8. Assertions now check the complete export evidence chain instead of expecting failure.
- Legacy JavaScript, dynamic config, parser errors, tag limits and nested-app guards all passed their existing assertions.
- Real-app `doctor`, `init --dry-run`, and fixture `audit --explain` were exercised inside the testbed check. Before/after SHA-256 maps confirm testbed source files are byte-identical.

Reports: `artifacts/testbed-{ayaz,storefront}.{html,json,sarif,md}`. Markdown and HTML include the new detailed guidance.

## Local tarballs

Generated from the verified build with `npm pack --ignore-scripts --pack-destination artifacts` for the core and ESLint workspace; no publication was performed.

| File | SHA-256 |
| --- | --- |
| `artifacts/next-cache-trace-0.3.0.tgz` | `4414a08b008d9fd55b23849346a21397a524f17e697c9eb4e2729b6d12d1a6c5` |
| `artifacts/eslint-plugin-next-cache-trace-0.3.0.tgz` | `efe3abfc2565d7b994dd36fd319a6dca6702d2a2dca238b4503446e85022c1d1` |

The source revision must be committed/reviewed and hosted CI validated before release. New cache profile/context rules, wildcard export resolution, PR impact comparison, watch mode and monorepo orchestration were not part of this implementation.
