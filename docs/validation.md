# Validation record

## Follow-up — 2026-09-19

- Strict TypeScript build and all 58 behavioral tests passed on Windows using Node 24.14.1 and Node 20.19.0.
- `npm run verify` passed, including clean tarball installation, typed consumer, installed CLI, ESLint alias and package-content dry runs. The first sandboxed attempt hit npm-cache EPERM; the approved retry passed.
- Sixteen additional tests cover deprecated signatures, 256/257 and 128/129 boundaries, decoded strings, dynamic/spread limitations, symbol shadowing, spelling/case hints, stable SARIF fingerprints, CLI thresholds, suppressions and opt-in ESLint/CLI behavior.
- The external synthetic `next-cache-testbed` was scanned without installing or executing its application code. Its 15 source files produced 1 error, 9 warnings, 5 info and 1 suppressed finding; graph counts remain 7 producers, 5 invalidations and 7 cached boundaries.
- Compared with its earlier expected output, five NCT006 migration warnings were added. NCT001 now suggests `shared-menu` for `shared-meny`. No extra NCT001 appears for the matched orders/settings/invoices tags.
- Disabling NCT006 restores the original 1/4/5 visible summary (suppressed count becomes 6). Exclusions, NCT900 suppression and the disabled-cache configuration override also passed assertions. Testbed source hashes were unchanged.
- Reproduce via `npm run build` then `npm run test:testbed -- /path/to/next-cache-testbed`. Reports are generated under `artifacts/testbed-updated.*` in the package checkout.
- This testbed is intentionally synthetic and not a runnable Next application. It verifies analyzer behavior, **not independent demand or production freshness**. No new browser visual verification, hosted CI matrix run, npm publication, or independent user pilot was performed for this update.

## Earlier checks — 2026-09-18

### Executed locally

| Check | Observed result |
| --- | --- |
| Strict TypeScript build | Passed using TypeScript 5.9.3 |
| Behavioral tests on Windows / Node 24.14.1 | 42 passed |
| Behavioral tests on Windows / Node 20.19.0 | 42 passed |
| ESLint engine | 10.10.0 tested locally, including TSX and unsaved current-file overrides |
| Clean tarball consumer | CLI bin, typed API import and companion ESLint plugin passed |
| Next example | Production build passed: Next 16.3.5, React 19.3.0, Cache Components enabled |
| Main dependency audit | Zero known vulnerabilities returned |
| Example production dependency audit | Zero known vulnerabilities returned |
| Intentional-risk fixture | All five NCT001–NCT005 rules observed |
| Working blog fixture | Zero findings, one posts producer and one matching invalidation |
| HTML content checks | Escaped untrusted content, no executable scripts, CSP present |

## Existing projects (read-only)

| Project | Scanned files | Errors / warnings / info | Cache boundaries |
| --- | ---: | --- | ---: |
| Private template A | 65 | 0 / 0 / 2 | 0 |
| Private application B | 50 | 0 / 0 / 1 | 0 |

The information diagnostics describe opaque fetch options, not proven defects. These scans establish tool operation on those projects; they do not establish cache correctness or product-market demand. Neither project supplied recognized cached boundaries for a positive real-world cache-bug demonstration.

## Not yet verified

- Hosted Windows/macOS/Linux CI, Node 22 and the complete Next 16 minor-version matrix: workflows prepared; check the repository Actions page for results after the initial push.
- ESLint 9: dedicated CI job prepared; current local tests use ESLint 10.
- Visual browser rendering: local file navigation was rejected by browser URL policy. No workaround was attempted. Manual visual review remains.
- Live GitHub code-scanning annotations and public npm installation: require repository setup and publication.
- npm authentication: whoami returned ENEEDAUTH. Both proposed package names returned E404 when queried; no names were reserved.

The package observes static source relationships only; known analysis boundaries are documented in README.md and architecture.md.
