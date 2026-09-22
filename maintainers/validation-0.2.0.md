# 0.2.0 validation record

## Release preparation — 2026-09-22

- `npm run verify` passed on Windows/Node 24.14.1: lint, 88 tests, fresh tarball consumer (CLI, TypeScript, ESLint) and both pack dry runs.
- The updated external testbed script passed for the Ayaz app and all six fixture roots. Assertions check rules, files and lines; source hashes remained unchanged.
- Ayaz: 15 files, 0 errors / 0 warnings / 4 info, 6 producers / 5 invalidations / 5 boundaries. Baseline and imported tag evidence assertions passed.
- Storefront: 27 files, 2 errors / 9 warnings / 23 info, 4 suppressed. Legacy JS, dynamic config, parser errors, limits and nested-app isolation assertions passed.
- The user reported a Next.js build and Server Action POST check (24 to 30 in cached catalog data). That runtime scenario was not rerun in this preparation session and is distinct from independent user adoption.
- npm registry currently reports 0.1.0 for both packages. The maintainer deferred npm publication while resolving account access; GitHub source delivery is authorized separately. Hosted CI results must be checked for the pushed commit.

## Earlier local checks — 2026-09-20

Local Windows validation on Node 24.14.1 currently includes 88 passing tests covering cross-file constants, evidence chains, mutation rejection, baseline multiplicity, CLI thresholds, Markdown/SARIF/HTML, ESLint and clean-project behavior.

The synthetic 100/1,000/5,000-file benchmark reported roughly 134/769/3,547 ms cold and 84/706/3,460 ms warm in one process. These are directional measurements, not production guarantees; rerun on the target CI runner before setting budgets.

Hosted CI, an independent pilot, npm publication and runtime freshness remain separate external validation tasks.
