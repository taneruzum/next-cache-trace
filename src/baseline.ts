import { IDENTITY_VERSION } from './identity.js';
import { RULES, type Report, type Severity } from './model.js';
import { VERSION } from './version.js';

export interface BaselineEntry { fingerprint: string; code: string; severity: Severity; count: number }
export interface Baseline {
  version: 1; identityVersion: number; reportSchemaVersion: string; toolVersion: string;
  analysisSignature: string; entries: BaselineEntry[];
}

export function createBaseline(report: Report): Baseline {
  if (report.coverage.parseErrors || report.findings.some(f => f.code === 'NCT902')) throw new Error('Fix source parse errors before creating a baseline');
  const entries = new Map<string, BaselineEntry>();
  for (const f of report.findings) {
    if (!f.fingerprint) throw new Error('Report is missing finding identities');
    const key = f.fingerprint + ':' + f.severity;
    const entry = entries.get(key) ?? { fingerprint: f.fingerprint, code: f.code, severity: f.severity, count: 0 };
    entry.count++; entries.set(key, entry);
  }
  return { version: 1, identityVersion: IDENTITY_VERSION, reportSchemaVersion: report.schemaVersion,
    toolVersion: VERSION, analysisSignature: report.analysisSignature, entries: [...entries.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint) || a.severity.localeCompare(b.severity)) };
}

export function applyBaseline(report: Report, input: unknown): Report {
  if (!input || typeof input !== 'object') throw new Error('Invalid baseline: expected an object');
  const baseline = input as Baseline;
  if (baseline.version !== 1 || baseline.identityVersion !== IDENTITY_VERSION || baseline.reportSchemaVersion !== report.schemaVersion
    || typeof baseline.toolVersion !== 'string' || baseline.toolVersion.split('.').slice(0, 2).join('.') !== VERSION.split('.').slice(0, 2).join('.')
    || baseline.analysisSignature !== report.analysisSignature) throw new Error('Baseline is incompatible with this tool, schema or analysis configuration; review and regenerate it');
  if (!Array.isArray(baseline.entries)) throw new Error('Invalid baseline entries');
  const remaining = new Map<string, number>();
  for (const entry of baseline.entries) {
    if (!entry || typeof entry.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(entry.fingerprint) || !Object.hasOwn(RULES, entry.code)
      || entry.code === 'NCT902' || !['error', 'warning', 'info'].includes(entry.severity) || !Number.isSafeInteger(entry.count) || entry.count < 1) throw new Error('Invalid baseline entry');
    const key = entry.fingerprint + ':' + entry.code + ':' + entry.severity;
    if (remaining.has(key)) throw new Error('Duplicate baseline entry');
    remaining.set(key, entry.count);
  }
  let existing = 0;
  const newSummary: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  const findings = report.findings.map(f => {
    const key = f.fingerprint + ':' + f.code + ':' + f.severity;
    const count = remaining.get(key) ?? 0;
    if (count > 0 && f.code !== 'NCT902') { remaining.set(key, count - 1); existing++; return { ...f, baselineState: 'existing' as const }; }
    newSummary[f.severity]++;
    return { ...f, baselineState: 'new' as const };
  });
  return { ...report, findings, baseline: { existing, new: findings.length - existing, resolved: [...remaining.values()].reduce((a, b) => a + b, 0), newSummary } };
}
