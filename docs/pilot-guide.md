# First useful scan: installation, fixes, and a small pilot

The intended user is a team with Next.js 16 App Router cache code: literal cacheTag/fetch/unstable_cache tags and tag-based invalidation. A project without those patterns is not a convincing test of this tool's value. This is a static review/CI tool, not a solution to every stale UI, framework bug, or distributed cache problem.

## Install the unpublished candidate locally

From the package checkout:

```sh
npm ci
npm run verify
npm pack --pack-destination artifacts
```

From your Next.js app, substitute the actual absolute tarball path:

```sh
npm install --save-dev /absolute/path/to/next-cache-trace/artifacts/next-cache-trace-0.1.0.tgz
npx --no-install next-cache-trace audit . --fail-on none
npx --no-install next-cache-trace audit . --format html --output artifacts/cache.html
```

Quote paths containing spaces in PowerShell. Installing changes the app's package.json and lockfile; do it on a review branch. Alternatively, run `node /absolute/path/to/next-cache-trace/bin/next-cache-trace.js audit /absolute/path/to/app --fail-on none` without installing anything in the app. Scanning does not execute or edit app source. Existing report files require `--force` to replace.

The tarball is local, not a registry release. Do not commit an absolute `file:` dependency as a portable production setup. Once an npm version is actually published, replace the pilot dependency with that pinned registry version.

## Work through the first report

1. Check coverage: files scanned, observed producers/invalidations, and unresolved expressions. A clean empty graph is not a successful cache validation.
2. Review NCT006 migration calls and select immediate expiration or stale-while-revalidate intentionally. See the rule reference's decision table. Do not automatically append `'max'`.
3. Fix NCT007/NCT008 literal limits on both sides of the relationship. Dynamic tag limits remain unchecked.
4. For NCT001, compare the suggested producer with your intent. A missing source can also be an excluded file, an imported wrapper, or another service.
5. Run the app's own mutation/read flow after changes. Confirm the expected page data, not just a clean static report.

NCT003 (cross-area sharing) and NCT005 (default lifetime) are review signals. To keep an initial pilot focused, use this optional `next-cache-trace.config.json`:

```json
{
  "rules": { "NCT003": "off", "NCT005": "off" }
}
```

Keep unresolved diagnostics visible while assessing scan coverage. If needed, enable NCT009 with `"NCT009": "info"`; this is a reminder about a valid API choice, not proof of a bug.

## Add CI only after reviewing the initial findings

After installing the package, add an app script:

```json
{
  "scripts": {
    "cache:check": "next-cache-trace audit . --fail-on warning"
  }
}
```

Run `npm run cache:check` after the ordinary dependency-install step in CI. Warning thresholds also include heuristic NCT001/NCT003 warnings unless configured off. Document legitimate exceptions with a specific suppression reason. There is no existing-findings baseline feature: resolve or explicitly suppress known findings before making the check blocking.

## Validate demand separately from tests

Invite 3–5 independent Next.js 16 users who actually use these APIs to try a reviewed build. This is a proposed pilot, not evidence of existing demand. Do not send private source or reports publicly: reports contain paths and tag strings.

Record for each pilot:

- The real task they were doing (migration, tag rename, stale-data investigation).
- Confirmed actionable findings, false positives, unresolved cases and elapsed scan time.
- Whether they made a code change because of the report; which change and why.
- Whether they keep the check in CI/editor after one week, without prompting.
- What their existing compiler, ESLint rules or framework logs already caught.

Continue investing if the tool finds useful issues their current workflow misses and users keep it installed. If most findings are redundant or the real pain is runtime behavior, collect minimal reproductions before committing to a runtime product. Test counts, download counts and positive comments alone do not establish demand.

## External manual testbed

For the separately supplied `next-cache-testbed` fixture only:

```sh
npm run build
npm run test:testbed -- /absolute/path/to/next-cache-testbed
```

This optional smoke script checks that fixture's known outcomes and writes HTML/JSON/SARIF reports under the package's `artifacts` directory. It does not install dependencies or modify testbed source. It is not run by normal CI because the external fixture is not distributed with the package.
