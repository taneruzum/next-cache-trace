# eslint-plugin-next-cache-trace

Optional alias for `next-cache-trace/eslint`. Install `next-cache-trace` alongside this package. The main package peer is marked optional only so the unpublished local workspace can be installed; it is required when this module is imported.

```js
import trace from 'eslint-plugin-next-cache-trace';
export default [trace.configs.recommended];
```

For TypeScript/TSX provide the typescript-eslint parser. `configs.project` enables NCT001–NCT005 and analysis diagnostics; set `settings['next-cache-trace'].projectRoot` to the app root for cross-file rules. `configs.recommended` runs only file-local checks. See the main package README for the complete configuration and static-analysis boundaries.
