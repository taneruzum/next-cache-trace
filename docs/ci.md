# CI and code scanning

The repository CI uses npm ci with committed lockfiles. It checks Node 20.19/22.13/24 on Windows/macOS/Linux, a Next 16.0/16.1/16.2/16.3 production-build matrix and ESLint 9 compatibility. These are configured jobs, not claims of already-passed hosted runs.

The manual code-scanning workflow uploads the intentional-risk fixture so a maintainer can verify PR/source locations after creating the GitHub repository. It requires code scanning enabled and security-events: write. For a consumer app, install the published package (or a reviewed tarball) and use:

```yaml
- run: npx --no-install next-cache-trace audit . --format sarif --output artifacts/cache.sarif --fail-on none
- uses: github/codeql-action/upload-sarif@v4
  with:
    sarif_file: artifacts/cache.sarif
    category: next-cache-trace
```

Run a second audit with --fail-on error or warning if findings should block merging. --fail-on none still exits 2 for tool/configuration errors. For ordinary artifact uploads use upload-artifact instead; that does not create code-scanning annotations. Generated reports include paths and literal tag names, so choose the intended artifact visibility.
