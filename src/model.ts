export type Severity = 'error' | 'warning' | 'info';
export type RuleCode = 'NCT001' | 'NCT002' | 'NCT003' | 'NCT004' | 'NCT005' | 'NCT900' | 'NCT901' | 'NCT902';
export interface Location { file: string; line: number; column: number }
export interface Finding extends Location { code: RuleCode; severity: Severity; title: string; message: string; help: string }
export interface TagSite extends Location { tag: string; method: string; scope: string; area: string | null }
export interface Boundary extends Location { id: string; name: string; directive: string; explicitLifetime: boolean }
export interface FileAnalysis { file: string; findings: Finding[]; producers: TagSite[]; invalidations: TagSite[]; boundaries: Boundary[]; usages: Location[] }
export interface TraceOptions {
  include?: string[]; exclude?: string[]; rules?: Partial<Record<RuleCode, Severity | 'off'>>;
  cacheComponents?: boolean; config?: string;
}
export interface CacheConfig { enabled: boolean | null; file: string | null; reason: string }
export interface Report {
  schemaVersion: '0.2'; projectRoot: string; config: CacheConfig; filesScanned: number;
  summary: Record<Severity, number>; findings: Finding[]; suppressedCount: number;
  graph: { producers: TagSite[]; invalidations: TagSite[]; boundaries: Boundary[] };
  coverage: { literalProducers: number; literalInvalidations: number; unresolved: number; note: string };
}
export const RULES: Record<RuleCode, { severity: Severity; title: string; help: string }> = {
  NCT001: { severity: 'warning', title: 'No observed literal producer', help: 'Check spelling, dynamic tags, external packages and scan exclusions. Absence from this scan is not proof of a bug.' },
  NCT002: { severity: 'error', title: 'Request API inside shared cache', help: 'Read cookies/headers outside the cached function and pass serializable values as arguments.' },
  NCT003: { severity: 'warning', title: 'Tag shared across route areas', help: 'Verify cross-route invalidation is intentional, or use narrower tags. Shared tags can be valid.' },
  NCT004: { severity: 'error', title: 'Cache Components disabled', help: 'Enable cacheComponents in next.config for Cache Components directives and APIs.' },
  NCT005: { severity: 'info', title: 'Implicit cache lifetime', help: 'The default cache profile is valid. Add cacheLife if you want an explicit policy.' },
  NCT900: { severity: 'info', title: 'Unresolved static relationship', help: 'Inspect the expression manually; this analyzer does not evaluate application code.' },
  NCT901: { severity: 'info', title: 'Unresolved cache configuration', help: 'Inspect next.config, or set cacheComponents explicitly in next-cache-trace.config.json.' },
  NCT902: { severity: 'error', title: 'Source parse error', help: 'Fix the syntax error before relying on the cache analysis.' }
};
export function finding(code: RuleCode, location: Location, message: string): Finding {
  return { code, ...RULES[code], ...location, message };
}
