# Release checklist — 0.2.0 candidate

Maintainer record; this directory is intentionally excluded from the npm tarball.

Follow [the branch and versioning policy](versioning-policy.md) for new work and releases. GitHub source delivery and npm publication are separate milestones.

- [ ] Review changelog, manifests, lockfile and generated tarballs.
- [x] Run `npm run lint`, `npm test`, `npm run verify` (2026-09-22); coverage was measured on 2026-09-20.
- [x] Review baseline behavior on a real Next.js 16 App Router project (external Ayaz testbed).
- [x] Hosted CI passed all 14 jobs for `84eb5c1961511404f273e90951047f14942080aa`: [run](https://github.com/taneruzum/next-cache-trace/actions/runs/35783666551). Recheck CI if the publication commit changes.
- [ ] Publish only the reviewed artifacts, then verify registry installation.

Local checks do not prove hosted CI, publication or independent user demand.
