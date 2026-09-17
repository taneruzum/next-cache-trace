# Contributing

Use a supported Node.js version (20.19+, or 22.13+ on Node 22) and npm.

```bash
npm ci
npm test
npm run verify
```

Source is strict TypeScript under src/. Generated dist/ is not committed. The main package exports its CLI/API and an ESLint adapter. packages/eslint-plugin is a small optional alias package.

For analyzer changes, include positive and negative fixtures: especially imports from unrelated modules, shadowed names, nested boundaries and dynamic expressions. Add an example demonstrating any claim about Next.js behavior, and link the official source in docs/framework-notes.md. No telemetry or runtime evaluation of project files.

Tests use node:test. Keep graph/CLI/ESLint semantics in one engine; do not duplicate rules in the ESLint adapter. npm run test:pack is a clean consumer installation and needs registry access.

Bug reports should include a minimal sanitized snippet, Node/Next versions and the command used. Never paste credentials or private application code.
