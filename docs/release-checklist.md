# Release checklist — 0.1.0 candidate

## Completed locally

- Strict TypeScript build and 42 behavioral tests.
- Windows checks under Node 20.19.0 and 24.14.1.
- Clean tarball installation: main package, actual installed CLI bin, TypeScript consumer and ESLint alias.
- Working Next.js 16.3.5 / React 19.3.0 example production build.
- Main and example dependency audits returned zero known vulnerabilities at the time checked.
- Two existing user projects scanned without modifying them.
- JSON/SARIF/HTML reports, public declarations, rule docs, contribution/security policy and issue templates.
- Cross-platform and Next-minor matrices plus manual SARIF workflow defined.

See validation.md for actual observations and limits.

## Requires repository/account access

1. Repository selected: https://github.com/taneruzum/next-cache-trace. Both package manifests contain repository/bugs/homepage metadata.
2. Enable private vulnerability reporting; replace the pending contact in SECURITY.md with the real repository URL.
3. Push the source and let CI run. Windows local checks do not prove the Linux/macOS or every Next minor matrix. Fix any failures before publishing.
4. Review the HTML reports manually; browser automation could not open the local file URL in this environment.
5. Complete npm login on the intended maintainer account. The last npm whoami returned ENEEDAUTH.
6. Recheck the two package names. On 2026-09-17 the registry returned E404 for next-cache-trace and eslint-plugin-next-cache-trace. This is not a reservation or a guarantee of publish permission.
7. Update CHANGELOG.md with the actual release date, run npm run verify, then regenerate the reviewed tarballs.
8. Publish the main package first, followed by the ESLint alias, using the reviewed artifacts:
   - npm publish artifacts/next-cache-trace-0.1.0.tgz --access public
   - npm publish artifacts/eslint-plugin-next-cache-trace-0.1.0.tgz --access public
9. Check the actual registry install and then tag the GitHub release.

No npm publication has occurred. Source targets the main branch of https://github.com/taneruzum/next-cache-trace. Check the Actions page for hosted validation results. Package source implementation is complete for the documented V0.1 scope; external release gates remain open.
