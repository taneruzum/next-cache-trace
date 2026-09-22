> Historical 0.1.0 record; statements below apply to that release, not to 0.2.0.

# Release checklist — 0.1.0 candidate

## Completed locally

- Strict TypeScript build and 58 behavioral tests (including migration, tag limits and opt-in advice).
- Windows checks under Node 20.19.0 and 24.14.1.
- Clean tarball installation: main package, actual installed CLI bin, TypeScript consumer and ESLint alias.
- Working Next.js 16.3.5 / React 19.3.0 example production build.
- Main and example dependency audits returned zero known vulnerabilities at the time checked.
- Two existing user projects scanned without modifying them.
- JSON/SARIF/HTML reports, public declarations, rule docs, contribution/security policy and issue templates.
- Cross-platform and Next-minor matrices plus manual SARIF workflow defined.
- External synthetic testbed: 15 files, 1 error / 9 warnings / 5 info, 1 suppressed; five deprecated calls and spelling hint verified without changing source.
- Pilot guide covers local installation, actionable fixes, CI adoption and demand-validation questions. Independent user demand remains unverified.

See validation.md for actual observations and limits.

## Final release procedure

1. Repository selected: https://github.com/taneruzum/next-cache-trace. Both package manifests contain repository/bugs/homepage metadata.
2. Private vulnerability reporting was enabled and verified on 2026-09-19; SECURITY.md contains the private report URL.
3. Push the release commit and require its CI run to pass. The initial commit passed all 14 jobs; that does not validate later changes.
4. The user supplied a desktop screenshot of the HTML report; the visible layout was reviewed. Automated full-browser/responsive verification remains outside the performed checks.
5. npm login was confirmed for the intended maintainer account on 2026-09-19.
6. Recheck the two package names and intended versions immediately before publishing. Previous E404 responses are not a reservation or a guarantee of publish permission.
7. Update CHANGELOG.md with the actual release date, run npm run verify, then regenerate the reviewed tarballs.
8. Publish the main package first, followed by the ESLint alias, using the reviewed artifacts:
   - npm publish artifacts/next-cache-trace-0.1.0.tgz --access public
   - npm publish artifacts/eslint-plugin-next-cache-trace-0.1.0.tgz --access public
9. Check the actual registry install and then tag the GitHub release.

Source targets the main branch of https://github.com/taneruzum/next-cache-trace. Consult the npm registry for actual publication status and the Actions page for validation of the exact release commit. A successful static test suite is not proof of runtime cache correctness or user demand.
