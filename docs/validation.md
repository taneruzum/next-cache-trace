# Validation record — 2026-09-18

## Executed locally

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
