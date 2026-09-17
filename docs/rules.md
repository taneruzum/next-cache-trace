# Rule reference

All source locations use 1-based line and column numbers. Rules analyze direct source evidence only.

| Code | Evidence | Remedy / caveat |
| --- | --- | --- |
| NCT001 | Literal invalidation absent from observed cacheTag/fetch/unstable_cache producers | Check spelling and scan scope. External and dynamic producers can be legitimate. |
| NCT002 | Imported cookies/headers called directly inside shared or remote cache | Read outside and pass serializable values. Private cache and draftMode reads are not errors. |
| NCT003 | A tag is produced in two different first app route segments | Review breadth; global invalidation is valid. Each affected producer gets a finding. Route groups are skipped; this is a heuristic, not domain inference. |
| NCT004 | A Cache Components directive/API is found and the exported config resolves to false, omits the flag, or is absent | Enable cacheComponents. One finding per affected file. fetch/unstable_cache alone do not require it. |
| NCT005 | A cached function has no direct cacheLife call | Optional policy documentation; defaults and helper-provided lifetimes may be intentional. |
| NCT900 | Dynamic tags or opaque cache option objects | Relationship unknown. Literal strings and interpolation-free templates are decoded; variables and concatenations are not evaluated. |
| NCT901 | Config uses a function/plugin wrapper, unknown spread, environment expression or mutation | Inspect manually, or supply the analyzer's cacheComponents override. |
| NCT902 | TypeScript parser diagnostic | Resolve the syntax problem before trusting the scan. |

Disable a CLI finding with `// next-cache-trace-disable-next-line NCT001 -- reason` immediately before its reported line. Multiple codes may be separated by spaces or commas. Disable/adjust a rule globally through the JSON config's `rules` object. ESLint also supports its standard disable comments.

The graph retains suppressed relationships. Report coverage retains unresolved counts even if their diagnostic rule is disabled.

The analyzer does not resolve runtime call graphs or arbitrary imported wrappers; consult the README's analysis boundaries before interpreting a clean report.
