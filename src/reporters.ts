import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { RULES, type Report, type TagSite } from './model.js';

const escapeHtml = (value: unknown): string => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function formatJson(report: Report): string { return JSON.stringify(report, null, 2); }
export function formatText(report: Report): string {
  const lines = ['next-cache-trace — ' + report.filesScanned + ' source file(s)', ''];
  if (!report.findings.length) lines.push('No findings within the analyzed scope.');
  for (const f of report.findings) lines.push('[' + f.severity + '] ' + f.code + ' ' + f.file + ':' + f.line + ':' + f.column, '  ' + f.message, '  ' + f.help);
  lines.push('', report.summary.error + ' error(s), ' + report.summary.warning + ' warning(s), ' + report.summary.info + ' info, ' + report.suppressedCount + ' suppressed',
    'Graph: ' + report.graph.producers.length + ' literal producer(s), ' + report.graph.invalidations.length + ' invalidation(s), ' + report.graph.boundaries.length + ' cached boundary/boundaries.',
    report.coverage.note);
  return lines.join('\n');
}
export function formatSarif(report: Report): string {
  const codes = Object.keys(RULES);
  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{ tool: { driver: { name: 'next-cache-trace', version: '0.1.0', rules: Object.entries(RULES).map(([id, rule]) => ({ id, shortDescription: { text: rule.title }, fullDescription: { text: rule.help }, defaultConfiguration: { level: rule.severity === 'info' ? 'note' : rule.severity } })) } },
      originalUriBaseIds: { '%SRCROOT%': { uri: pathToFileURL(resolve(report.projectRoot) + sep).href } },
      invocations: [{ executionSuccessful: true }],
      results: report.findings.map(f => ({ ruleId: f.code, ruleIndex: codes.indexOf(f.code), level: f.severity === 'info' ? 'note' : f.severity,
        message: { text: f.message }, partialFingerprints: { 'primaryLocationLineHash': createHash('sha256').update(f.code + ':' + f.file + ':' + f.message).digest('hex') },
        locations: [{ physicalLocation: { artifactLocation: { uri: f.file.split('/').map(encodeURIComponent).join('/'), uriBaseId: '%SRCROOT%' }, region: { startLine: f.line, startColumn: f.column } } }]
      })) }]
  }, null, 2);
}
export function formatHtml(report: Report): string {
  const tags = new Map<string, { producers: TagSite[]; invalidations: TagSite[] }>();
  for (const [kind, entries] of [['producers', report.graph.producers], ['invalidations', report.graph.invalidations]] as const) for (const item of entries) {
    if (!tags.has(item.tag)) tags.set(item.tag, { producers: [], invalidations: [] });
    tags.get(item.tag)![kind].push(item);
  }
  function sites(entries: TagSite[]): string {
    return entries.length ? '<ul>' + entries.map(e => '<li><strong>' + escapeHtml(e.scope) + '</strong><br><code>' + escapeHtml(e.method) + '</code><br>' + escapeHtml(e.file) + ':' + e.line + '</li>').join('') + '</ul>' : '<p class="muted">None observed</p>';
  }
  const graph = [...tags].sort(([a], [b]) => a.localeCompare(b)).map(([tag, group]) => '<article class="tag"><h3>' + escapeHtml(tag) + '</h3><div class="flow"><section><h4>Producers</h4>' + sites(group.producers) + '</section><div class="arrow" aria-label="connected by tag">↔</div><section><h4>Invalidations</h4>' + sites(group.invalidations) + '</section></div></article>').join('');
  const findings = report.findings.map(f => '<tr><td class="' + f.severity + '">' + f.severity + '</td><td>' + f.code + '</td><td>' + escapeHtml(f.file) + ':' + f.line + ':' + f.column + '</td><td>' + escapeHtml(f.message) + '<details><summary>Guidance</summary>' + escapeHtml(f.help) + '</details></td></tr>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>next-cache-trace report</title><style>' +
    'body{font:15px/1.5 system-ui,sans-serif;max-width:1150px;margin:40px auto;padding:0 24px;background:#f8fafc;color:#172033}h1{margin-bottom:4px}h4{margin-top:0}.muted{color:#526176}.stats{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}.error{color:#b91c1c}.warning{color:#8a5105}.info{color:#0369a1}.tag{background:#fff;border:1px solid #dbe2ea;border-radius:12px;padding:18px;margin:16px 0}.tag h3{margin:0 0 12px;overflow-wrap:anywhere}.flow{display:grid;grid-template-columns:1fr 40px 1fr;gap:8px}.arrow{align-self:center;text-align:center;font-size:24px}li{margin-bottom:8px;overflow-wrap:anywhere}ul{padding-left:20px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff}td,th{text-align:left;padding:12px;border-bottom:1px solid #dbe2ea;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf0f7}details{margin-top:8px}summary{cursor:pointer}@media(max-width:600px){body{padding:0 12px}.flow{grid-template-columns:1fr}.arrow{transform:rotate(90deg)}}' +
    '</style></head><body><header><h1>next-cache-trace</h1><p class="muted">' + escapeHtml(report.projectRoot) + '</p></header><div class="stats"><b>' + report.filesScanned + ' files</b><span class="error">' + report.summary.error + ' errors</span><span class="warning">' + report.summary.warning + ' warnings</span><span class="info">' + report.summary.info + ' info</span><span>' + report.suppressedCount + ' suppressed</span></div><p>' + escapeHtml(report.coverage.note) + '</p><p>Unresolved expressions/configuration/parse errors: ' + report.coverage.unresolved + '</p><main><h2>Literal tag relationships</h2>' + (graph || '<p>No literal tag relationships observed.</p>') + '<h2>Findings</h2><div class="table-wrap"><table><caption>Diagnostics within scanned files</caption><thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Message</th></tr></thead><tbody>' + (findings || '<tr><td colspan="4">No findings within the analyzed scope.</td></tr>') + '</tbody></table></div></main></body></html>';
}
