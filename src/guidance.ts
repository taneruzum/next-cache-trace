import type { Finding, FindingExplanation, RuleCode } from './model.js';

type Guide = Omit<FindingExplanation, 'source' | 'context'>;
const GUIDES: Record<RuleCode, Guide> = {
  NCT001: {
    why: 'No matching producer was observed in the scanned source. A typo, excluded module, dynamic tag or external producer can explain the missing relationship.',
    steps: ['Compare the spelling and case with observed producer tags.', 'Use audit --tag <tag> to inspect source evidence, then doctor to check scan scope.', 'If the producer is external, document it with a targeted suppression instead of inventing a local producer.'],
    examples: [{ when: 'The producer and invalidation intentionally refer to the same data (illustrative tag).', code: "cacheTag('posts');\n// In the invalidation caller:\nrevalidateTag('posts', 'max');" }]
  },
  NCT002: {
    why: 'A direct cookies()/headers() call depends on the current request, while this function uses a shared cache.',
    steps: ['Read request data before entering the cached function.', 'Pass only the serializable values needed by the function as arguments, and review the intended cache sharing.'],
    examples: [{ when: 'A cached query varies by a request-derived locale (adapt imports and query to your app).', code: "const locale = (await headers()).get('x-locale') ?? 'en';\nconst data = await getCatalog(locale);\n\nasync function getCatalog(locale: string) {\n  'use cache';\n  return loadCatalog(locale);\n}" }]
  },
  NCT003: {
    why: 'The same tag appears in multiple top-level route areas. Invalidating it may be intentionally broad; the scan does not prove which pages execute these producers.',
    steps: ['Inspect all producers with audit --tag <tag>.', 'Keep a shared tag for shared data; narrow tags only when the invalidation policies should differ.'], examples: []
  },
  NCT004: {
    why: 'Cache Components APIs or directives were found, but the statically inspected configuration does not enable Cache Components.',
    steps: ['Verify that you are scanning the intended Next.js 16 app.', 'Merge cacheComponents: true into its Next configuration, then run the app build.', 'For a dynamic config, use an analyzer override only after verifying the actual setting.'],
    examples: [{ when: 'Cache Components are intended and supported by this app (merge into the existing config).', code: 'export default {\n  cacheComponents: true,\n};' }]
  },
  NCT005: {
    why: 'No direct cacheLife call was observed in this cached function. The default lifetime is valid; a helper may also supply the policy.',
    steps: ['Keep the default if it fits the data.', 'Add an explicit profile only when it documents an intentional freshness policy.'],
    examples: [{ when: 'The hours profile matches the intended policy; it is not a universal recommendation.', code: "async function getCatalog() {\n  'use cache';\n  cacheLife('hours');\n  return loadCatalog();\n}" }]
  },
  NCT006: {
    why: 'The one-argument revalidateTag signature is deprecated in Next.js 16. Selecting a replacement also selects whether a subsequent read may receive stale data.',
    steps: ['Choose the required freshness behavior for this caller.', 'Review the conditional examples below; no automatic replacement is applied.', 'Test the application mutation/read flow after making the change.'],
    examples: [
      { when: 'Only within a Server Action, when the next read must see the write.', code: 'updateTag(tag);' },
      { when: 'In a Server Action or Route Handler, when stale data is acceptable during background revalidation.', code: "revalidateTag(tag, 'max');" },
      { when: 'In a Route Handler/webhook, when stale data must not be served on the next read.', code: 'revalidateTag(tag, { expire: 0 });' }
    ]
  },
  NCT007: {
    why: 'An observed tag exceeds the supported 256 UTF-16 code-unit limit. Keeping an invalid tag in the graph does not mean the runtime accepted it.',
    steps: ['Choose a shorter stable identifier or a consistent hash.', 'Update both producer and invalidation sites, including external callers.'], examples: []
  },
  NCT008: {
    why: 'One fully resolved tag list exceeds 128 entries. Separate calls are not combined by this check.',
    steps: ['Review whether a meaningful group tag can replace the list.', 'Align all invalidation callers with the revised tagging policy.'], examples: []
  },
  NCT009: {
    why: 'This Server Action uses a valid stale-while-revalidate policy. The advisory asks whether that policy matches the user-visible write flow.',
    steps: ['Keep the current call if serving stale data briefly is acceptable.', 'Consider updateTag only if this action must immediately read its own write.'],
    examples: [{ when: 'This Server Action requires read-your-own-writes.', code: 'updateTag(tag);' }]
  },
  NCT900: {
    why: 'The analyzer could not prove a static tag relationship. This is a coverage limitation, not proof that the application is wrong.',
    steps: ['Read the diagnostic reason and inspect the expression at this location.', 'Named constant re-exports are supported; export *, wrappers and runtime expressions remain unresolved.', 'Do not replace a dynamic tag with a fixed tag just to silence this diagnostic.'], examples: []
  },
  NCT901: {
    why: 'The exported Next configuration cannot be resolved without executing application code.',
    steps: ['Inspect the actual configuration and run doctor for scan context.', 'If the effective flag is known, supply cacheComponents in the analyzer config. It does not change Next.js configuration.'],
    examples: [{ when: 'You have independently verified that Cache Components are enabled; next-cache-trace.config.json only.', code: '{ "cacheComponents": true }' }]
  },
  NCT902: {
    why: 'A source file could not be parsed reliably. Relationships depending on that source cannot be trusted.',
    steps: ['Fix the syntax error at the reported location.', 'Run the audit again before accepting a baseline.'], examples: []
  }
};

export function explainFinding(item: Finding, text: string, context?: 'server-action' | 'unknown'): FindingExplanation {
  const lines = text.split(/\r?\n/);
  const start = Math.max(0, item.line - 2);
  const guide = GUIDES[item.code];
  return { ...guide, steps: [...guide.steps], examples: guide.examples.map(example => ({ ...example })),
    ...(context ? { context } : {}),
    source: lines.slice(start, item.line + 1).map((line, index) => ({ line: start + index + 1, text: line.length > 300 ? line.slice(0, 300) + '…' : line })) };
}

export function formatFindingExplanation(item: Finding): string {
  const detail = item.explanation;
  if (!detail) return item.help;
  const lines = detail.source.map(source => (source.line === item.line ? '> ' : '  ') + source.line + ' | ' + source.text);
  lines.push('', 'Why: ' + detail.why);
  if (detail.context) lines.push('Caller: ' + (detail.context === 'server-action' ? 'recognized Server Action.' : 'not proven to be a Server Action; check the calling context.'));
  lines.push(...detail.steps.map((step, i) => (i + 1) + '. ' + step));
  for (const example of detail.examples) lines.push('', 'Example — ' + example.when, example.code);
  if (detail.examples.length) lines.push('', 'Examples illustrate choices; adapt names/imports to your app. Source files are not modified.');
  return lines.join('\n');
}
