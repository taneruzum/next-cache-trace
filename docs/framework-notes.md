# Framework evidence (checked 2026-09-17)

- [use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache): directives apply to functions or module exports; Cache Components enables them. Read cookies/headers outside shared cached functions. Current docs permit reading draftMode().isEnabled; enabling/disabling draft mode inside a cache is a separate restriction not analyzed here.
- [private cache](https://nextjs.org/docs/app/api-reference/directives/use-cache-private): request-scoped cached functions may access cookies/headers. The analyzer does not treat them as shared-cache violations or validate experimental flags.
- [cacheTag](https://nextjs.org/docs/app/api-reference/functions/cacheTag): tags associate cached data with on-demand invalidation.
- [fetch](https://nextjs.org/docs/app/api-reference/functions/fetch): next.tags is another producer form; omitting it would make orphan-tag findings misleading.
- [unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache): its options.tags creates another producer form; it does not itself require cacheComponents.
- [cacheLife](https://nextjs.org/docs/app/api-reference/functions/cacheLife): default lifetime is valid, so NCT005 is informational.
- [ESLint plugins](https://eslint.org/docs/latest/use/configure/plugins): flat config plugins expose rule definitions under a user-selected namespace.
- [GitHub SARIF upload](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/upload-sarif-file): code-scanning upload requires suitable repository permissions and availability.

Next API behavior can change across minor releases. The build matrix checks the working cacheTag/updateTag example on 16.0–16.3; it does not prove every rule against every historical runtime. Runtime-specific edge cases remain outside the statically observed contract.
