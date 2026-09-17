# Intentional cache risks

This fixture is not an application template. It is a compact test case for all five initial rules.

```bash
node ../../bin/next-cache-trace.js audit . --format html --output report.html --fail-on none
```

Expected results: `NCT001`, `NCT002`, `NCT003`, `NCT004`, and `NCT005`.
