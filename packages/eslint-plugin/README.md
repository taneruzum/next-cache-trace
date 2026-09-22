# eslint-plugin-next-cache-trace

Optional alias for `next-cache-trace/eslint`. Install `next-cache-trace` alongside this package. Version 0.2.0 marks the main peer optional for workspace bootstrapping, but importing this alias requires the main package at runtime.

```bash
npm install --save-dev next-cache-trace@^0.2.0 eslint-plugin-next-cache-trace@^0.2.0 eslint
```

The main package also exposes the same plugin directly as `next-cache-trace/eslint`; this alias is optional.

```js
import trace from 'eslint-plugin-next-cache-trace';
export default [trace.configs.recommended];
```

For TypeScript/TSX provide the typescript-eslint parser. `configs.project` enables NCT001–NCT008 and analysis diagnostics; set `settings['next-cache-trace'].projectRoot` to the app root for cross-file rules. `configs.recommended` runs only file-local checks, including migration and tag-limit warnings. NCT009 (freshness-intent advice) is off in both presets; enable it explicitly only when wanted. See the main package README for the complete configuration and static-analysis boundaries.
