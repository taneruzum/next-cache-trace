# Rule reference

All source locations use 1-based line and column numbers. Rules analyze direct source evidence only.

| Code | Evidence | Remedy / caveat |
| --- | --- | --- |
| NCT001 | Invalidation absent from observed literal or safely resolved cacheTag/fetch/unstable_cache producers | Check spelling and scan scope. External and dynamic producers can be legitimate. |
| NCT002 | Imported cookies/headers called directly inside shared or remote cache | Read outside and pass serializable values. Private cache and draftMode reads are not errors. |
| NCT003 | A tag is produced in two different first app route segments | Review breadth; global invalidation is valid. Each affected producer gets a finding. Route groups are skipped; this is a heuristic, not domain inference. |
| NCT004 | A Cache Components directive/API is found and the exported config resolves to false, omits the flag, or is absent | Enable cacheComponents. One finding per affected file. fetch/unstable_cache alone do not require it. |
| NCT005 | A cached function has no direct cacheLife call | Optional policy documentation; defaults and helper-provided lifetimes may be intentional. |
| NCT006 | Direct imported revalidateTag call with exactly one non-spread argument | Next.js 16 migration warning. Choose a policy deliberately; see below. Dynamic tag values still qualify. |
| NCT007 | Decoded observed tag longer than 256 UTF-16 code units | Applies to cacheTag, fetch next.tags, unstable_cache tags, revalidateTag and updateTag. Exactly 256 is allowed. Supported constants are resolved; runtime expressions and concatenations are not evaluated. |
| NCT008 | More than 128 observed, valid-length strings in a single cacheTag call or fetch/unstable_cache tags array | Exactly 128 is allowed. Fully resolved array spreads are counted. Unresolved entries, expansion limits and overlength tags skip this count check; NCT900/NCT007 still describe those limits. Separate calls are not summed. |
| NCT009 | Direct revalidateTag(tag, 'max') in an explicitly recognized Server Action | Off by default. This is valid SWR behavior. Consider updateTag only when read-your-own-writes is required. No automatic fix. |
| NCT900 | Dynamic tags or opaque cache option objects | Relationship unknown. Literals, supported const bindings, object/array fields and direct named imports are resolved. Re-exports, wrappers, mutable containers and runtime expressions remain unresolved. |
| NCT901 | Config uses a function/plugin wrapper, unknown spread, environment expression or mutation | Inspect manually, or supply the analyzer's cacheComponents override. |
| NCT902 | TypeScript parser diagnostic | Resolve the syntax problem before trusting the scan. |

Disable a CLI finding with `// next-cache-trace-disable-next-line NCT001 -- reason` immediately before its reported line. Multiple codes may be separated by spaces or commas. Disable/adjust a rule globally through the JSON config's `rules` object. ESLint also supports its standard disable comments.

The graph retains suppressed relationships. Report coverage retains unresolved counts and parse errors even if their diagnostic rule is disabled. A baseline cannot be created while parse errors are present.

The analyzer does not resolve runtime call graphs or arbitrary imported wrappers; consult the README's analysis boundaries before interpreting a clean report.

## Acting on migration warnings

Do not blindly replace `revalidateTag(tag)` with `revalidateTag(tag, 'max')`: that changes immediate expiration into stale-while-revalidate. Choose according to the caller's intent:

| Intent | Next.js 16 API |
| --- | --- |
| Server Action needs to immediately read its own write | `updateTag(tag)` |
| Serving stale data during background revalidation is acceptable | `revalidateTag(tag, 'max')` |
| Immediate expiration from a webhook/Route Handler | `revalidateTag(tag, { expire: 0 })` |

These are guidance, not automatic migrations. `updateTag` is restricted to Server Actions. The tool does not infer transaction boundaries, route refresh needs, or user intent. The absence of NCT006 does not validate every possible profile expression (for example `undefined`).

NCT009 recognizes function-level `use server` prologues and exported functions in file-level `use server` modules, including aliases and export lists. Ordinary nested functions do not inherit that classification; indirect helper execution is unknown. Enable with `{"rules":{"NCT009":"info"}}` in the CLI JSON config, or explicitly enable the ESLint rule. The low-level `analyzeSource` API returns candidate findings including NCT009; `analyzeProject` applies defaults and configuration.

## Tag spelling hints

NCT001 suggests up to three observed producer tags, with source filenames. Exact case-insensitive matches rank first. For tags at least four characters long, one insertion, deletion, substitution, or adjacent transposition is considered. Suggestions never turn a missing producer into a matched relationship and never rewrite source. Very short or distant names are not fuzzily matched.

The length/count rules preserve source entries in the graph for inspection. They do not claim over-limit tags were successfully registered.

## Framework references

Checked against the Next.js 16 documentation on 2026-09-19: [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag), [updateTag](https://nextjs.org/docs/app/api-reference/functions/updateTag), [cacheTag limits](https://nextjs.org/docs/app/api-reference/functions/cacheTag), and [fetch tags](https://nextjs.org/docs/app/api-reference/functions/fetch#optionsnexttags). `unstable_cache` uses the shared tag validator in the [Next.js 16.3.5 implementation](https://github.com/vercel/next.js/blob/v16.3.5/packages/next/src/server/web/spec-extension/unstable-cache.ts). Warnings target the documented limits rather than treating a runtime warning as proof of a user-visible incident.
