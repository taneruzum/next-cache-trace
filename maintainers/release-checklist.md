# Release checklist — 0.2.0 candidate

Maintainer record; this directory is intentionally excluded from the npm tarball.

- [ ] Review changelog, manifests, lockfile and generated tarballs.
- [x] Run `npm run lint`, `npm test`, `npm run verify` (2026-09-22); coverage was measured on 2026-09-20.
- [x] Review baseline behavior on a real Next.js 16 App Router project (external Ayaz testbed).
- [ ] Run hosted Node/OS/Next jobs for the exact release commit.
- [ ] Publish only the reviewed artifacts, then verify registry installation.

Local checks do not prove hosted CI, publication or independent user demand.
