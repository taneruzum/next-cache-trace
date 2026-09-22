import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { RULES, type Report, type TagSite } from './model.js';
import { VERSION } from './version.js';

const escapeHtml = (value: unknown): string => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function formatJson(report: Report): string { return JSON.stringify(report, null, 2); }
export function formatText(report: Report): string {
  const lines = ['next-cache-trace — ' + report.filesScanned + ' source file(s)', ''];
  if (!report.findings.length) lines.push('No findings within the analyzed scope.');
  for (const f of report.findings) lines.push('[' + f.severity + (f.baselineState ? '/' + f.baselineState : '') + '] ' + f.code + ' ' + f.file + ':' + f.line + ':' + f.column, '  ' + f.message, '  ' + f.help);
  lines.push('', report.summary.error + ' error(s), ' + report.summary.warning + ' warning(s), ' + report.summary.info + ' info, ' + report.suppressedCount + ' suppressed',
    'Graph: ' + report.graph.producers.length + ' observed producer(s), ' + report.graph.invalidations.length + ' invalidation(s), ' + report.graph.boundaries.length + ' cached boundary/boundaries.',
    'Coverage: ' + report.coverage.cacheUsages + ' cache usage(s), ' + (report.coverage.resolvedProducers + report.coverage.resolvedInvalidations) + ' constant-resolved tag site(s), ' + report.coverage.unresolved + ' unresolved diagnostic(s).',
    report.coverage.note);
  if (report.baseline) lines.push('Baseline: ' + report.baseline.existing + ' existing, ' + report.baseline.new + ' new, ' + report.baseline.resolved + ' resolved. CI uses new findings only.');
  return lines.join('\n');
}

export function explainTag(report: Report, tag: string): string {
  const lines = ['Tag ' + JSON.stringify(tag), 'Static source evidence; CI still evaluates the complete report.', ''];
  for (const [label, sites] of [['Producer', report.graph.producers], ['Invalidation', report.graph.invalidations]] as const) {
    const matches = sites.filter(site => site.tag === tag);
    if (!matches.length) lines.push(label + ': none observed');
    for (const site of matches) {
      lines.push(label + ': ' + site.method + ' in ' + site.scope + ' (' + site.file + ':' + site.line + ':' + site.column + ') [' + site.resolution + ']');
      for (const step of site.evidence) lines.push('  ' + step.kind + ' ' + step.file + ':' + step.line + ':' + step.column + ' ' + JSON.stringify(step.expression));
    }
  }
  lines.push('', report.coverage.note);
  return lines.join('\n');
}

const markdown = (value: string): string => escapeHtml(value).replace(/([\\`*_{}\[\]()#+!|~])/g, '\\$1').replace(/[\r\n]+/g, ' ');
export function formatMarkdown(report: Report): string {
  const lines = ['# next-cache-trace', '', `${report.filesScanned} files; ${report.summary.error} errors, ${report.summary.warning} warnings, ${report.summary.info} informational findings.`, ''];
  if (report.baseline) lines.push(`Baseline: **${report.baseline.new} new**, ${report.baseline.existing} existing, ${report.baseline.resolved} resolved. CI evaluates new findings.`, '');
  lines.push('## Findings', '', '| State | Level | Rule | Source | Finding |', '| --- | --- | --- | --- | --- |');
  const ordered = [...report.findings].sort((a, b) => Number(a.baselineState === 'existing') - Number(b.baselineState === 'existing'));
  for (const f of ordered.slice(0, 100)) lines.push(`| ${f.baselineState ?? '—'} | ${f.severity} | ${f.code} | ${markdown(f.file)}:${f.line}:${f.column} | ${markdown(f.message.slice(0, 1200))} |`);
  if (!report.findings.length) lines.push('| — | — | — | — | No findings in analyzed scope |');
  if (report.findings.length > 100) lines.push('', 'Showing the first 100 findings; retain the full JSON/HTML report as an artifact.');
  lines.push('', '## Tags', '', '| Kind | Tag | Source | Resolution |', '| --- | --- | --- | --- |');
  const sites = [...report.graph.producers.map(site => ({...site, kind:'producer'})), ...report.graph.invalidations.map(site => ({...site, kind:'invalidation'}))];
  for (const site of sites.slice(0, 100)) lines.push(`| ${site.kind} | ${markdown(site.tag.slice(0, 300))} | ${markdown(site.file)}:${site.line} | ${site.resolution} |`);
  if (sites.length > 100) lines.push('', 'Showing the first 100 tag sites; see the complete JSON/HTML artifact for source evidence.');
  lines.push('', `Coverage: ${report.coverage.cacheUsages} cache usages, ${report.coverage.unresolved} unresolved diagnostics.`, '', report.coverage.note);
  return lines.join('\n');
}
export function formatSarif(report: Report): string {
  const codes = Object.keys(RULES);
  const occurrences = new Map<string, number>();
  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{ tool: { driver: { name: 'next-cache-trace', version: VERSION, rules: Object.entries(RULES).map(([id, rule]) => ({ id, shortDescription: { text: rule.title }, fullDescription: { text: rule.help }, defaultConfiguration: { level: rule.severity === 'info' ? 'note' : rule.severity } })) } },
      originalUriBaseIds: { '%SRCROOT%': { uri: pathToFileURL(resolve(report.projectRoot) + sep).href } },
      invocations: [{ executionSuccessful: true }],
      results: report.findings.map(f => { const key = f.fingerprint ?? ''; const ordinal = occurrences.get(key) ?? 0; occurrences.set(key, ordinal + 1); return ({ ruleId: f.code, ruleIndex: codes.indexOf(f.code), level: f.severity === 'info' ? 'note' : f.severity,
        ...(f.baselineState ? { baselineState: f.baselineState === 'existing' ? 'unchanged' : 'new' } : {}),
        message: { text: f.message }, partialFingerprints: { 'primaryLocationLineHash': createHash('sha256').update(f.code + ':' + f.file + ':' + f.message).digest('hex'), 'nextCacheTrace/v1': key + ':' + ordinal },
        locations: [{ physicalLocation: { artifactLocation: { uri: f.file.split('/').map(encodeURIComponent).join('/'), uriBaseId: '%SRCROOT%' }, region: { startLine: f.line, startColumn: f.column } } }]
      }); }) }]
  }, null, 2);
}
export function formatHtml(report: Report): string {
  const tags = new Map<string, { producers: TagSite[]; invalidations: TagSite[] }>();
  for (const [kind, entries] of [['producers', report.graph.producers], ['invalidations', report.graph.invalidations]] as const) for (const item of entries) {
    if (!tags.has(item.tag)) tags.set(item.tag, { producers: [], invalidations: [] });
    tags.get(item.tag)![kind].push(item);
  }
  const sites = (entries: TagSite[]): string => entries.length
    ? entries.map(e => '<span class="site"><span class="fn">' + escapeHtml(e.scope) + '</span> <span class="m mono">' + escapeHtml(e.method) + '</span><br><span class="loc mono">' + escapeHtml(e.file) + ':' + e.line + '</span></span><details><summary>Source evidence (' + e.resolution + ')</summary><ol>' + e.evidence.map(step => '<li>' + escapeHtml(step.kind + ' ' + step.file + ':' + step.line + ' ' + step.expression) + '</li>').join('') + '</ol></details>').join('')
    : '<span class="none">None observed</span>';
  // A tag's state summarises the evidence for the pair; it is not a rule verdict.
  // Any of these can be intentional, so the row is flagged for review, never called a bug.
  const rows = [...tags].sort(([a], [b]) => a.localeCompare(b)).map(([tag, group]) => {
    const areas = new Set(group.producers.map(p => p.area).filter(x => x !== null));
    const [kind, label] = !group.producers.length ? ['unmatched', 'no producer']
      : !group.invalidations.length ? ['orphan', 'never invalidated']
      : areas.size > 1 ? ['fanout', areas.size + ' route areas']
      : ['ok', 'matched'];
    return '<div class="row' + (kind === 'ok' ? '' : ' risk') + '">'
      + '<div class="cell tagname"><span class="t mono">' + escapeHtml(tag) + '</span><span class="pill ' + kind + '">' + escapeHtml(label) + '</span></div>'
      + '<div class="cell side">' + sites(group.producers) + '</div>'
      + '<div class="cell link" aria-hidden="true">&#8596;</div>'
      + '<div class="cell">' + sites(group.invalidations) + '</div></div>';
  }).join('');
  const ledger = rows
    ? '<div class="ledger"><div class="hd"><div>Tag</div><div>Producers</div><div></div><div>Invalidations</div></div>' + rows + '</div>'
    : '<div class="clean"><div class="big">No literal tag relationships observed</div><div class="small">This project may not use tag-based caching, or every tag is built dynamically.</div></div>';
  const findings = report.findings.map(f => '<article class="find ' + f.severity + '">'
    + '<div class="stripe"></div>'
    + '<div class="code"><span class="rule mono">' + f.code + '</span><span class="sev">' + f.severity + (f.baselineState ? ' / ' + f.baselineState : '') + '</span></div>'
    + '<div class="body"><div class="loc mono">' + escapeHtml(f.file) + ':' + f.line + ':' + f.column + '</div>'
    + '<div class="msg">' + escapeHtml(f.message) + '</div>'
    + '<details><summary>Guidance</summary><div class="help">' + escapeHtml(f.help) + '</div></details></div></article>').join('');
  const stat = (value: number, label: string, kind: string) => '<div class="stat ' + (value ? kind : 'z') + '"><div class="n">' + value + '</div><div class="k">' + label + '</div></div>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src ' + "'" + 'none' + "'" + '; style-src ' + "'" + 'unsafe-inline' + "'" + '; base-uri ' + "'" + 'none' + "'" + '; form-action ' + "'" + 'none' + "'" + '">'
    + '<title>next-cache-trace report</title><style>' + ":root{color-scheme:light dark;--bg:#f7f8fa;--panel:#fff;--panel-2:#fbfcfd;--line:#e2e6ec;--line-strong:#cfd6e0;--ink:#141a22;--ink-2:#4a5464;--ink-3:#727d8d;--accent:#0e7490;--error:#d92d20;--error-line:#fca19a;--warning:#b54708;--warning-soft:#fffaeb;--warning-line:#f5c77e;--info:#026aa2;--info-line:#8fd0ef;--ok:#067647;--ok-soft:#ecfdf3;--shadow:0 1px 2px rgba(20,26,34,.06),0 1px 3px rgba(20,26,34,.04)}@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){--bg:#0d1017;--panel:#151a23;--panel-2:#1a212c;--line:#262e3b;--line-strong:#394454;--ink:#e8ecf2;--ink-2:#a3adbd;--ink-3:#778496;--accent:#3bb6cf;--error:#f97066;--error-line:#7a2b26;--warning:#f5b458;--warning-soft:#241b0e;--warning-line:#7a5420;--info:#53b9e8;--info-line:#1f5878;--ok:#4ed08a;--ok-soft:#0f2a1c;--shadow:0 1px 2px rgba(0,0,0,.4)}}:root[data-theme=\"dark\"]{--bg:#0d1017;--panel:#151a23;--panel-2:#1a212c;--line:#262e3b;--line-strong:#394454;--ink:#e8ecf2;--ink-2:#a3adbd;--ink-3:#778496;--accent:#3bb6cf;--error:#f97066;--error-line:#7a2b26;--warning:#f5b458;--warning-soft:#241b0e;--warning-line:#7a5420;--info:#53b9e8;--info-line:#1f5878;--ok:#4ed08a;--ok-soft:#0f2a1c;--shadow:0 1px 2px rgba(0,0,0,.4)}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;-webkit-font-smoothing:antialiased}.mono{font-family:ui-monospace,SFMono-Regular,\"SF Mono\",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}.wrap{max-width:1120px;margin:0 auto;padding-block:0 56px;padding-left:20px;padding-right:20px}.mast{border-bottom:1px solid var(--line);background:var(--panel);padding-block:26px 0;padding-left:20px;padding-right:20px;margin-bottom:30px}.mast-in{max-width:1120px;margin:0 auto}.brand{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.brand h1{margin:0;font-size:19px;font-weight:650;letter-spacing:-.01em}.brand .ver{font-size:12px;color:var(--ink-3)}.root{margin:6px 0 0;font-size:12.5px;color:var(--ink-2);overflow-wrap:anywhere}.score{display:flex;flex-wrap:wrap;margin-top:20px}.stat{padding:10px 22px 15px;border-bottom:3px solid var(--line-strong);min-width:92px}.stat:first-child{padding-left:0}.stat .n{font-size:26px;font-weight:660;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--ink-3)}.stat .k{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);margin-top:3px}.stat.e{border-bottom-color:var(--error)}.stat.e .n{color:var(--error)}.stat.w{border-bottom-color:var(--warning)}.stat.w .n{color:var(--warning)}.stat.i{border-bottom-color:var(--info)}.stat.i .n{color:var(--info)}.stat.q .n{color:var(--ink)}.caveat{display:block;background:var(--panel-2);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;padding:12px 16px;font-size:13px;color:var(--ink-2);margin:0 0 32px}.caveat b{color:var(--ink);font-weight:600}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:650;margin:0 0 4px}.sub{font-size:13px;color:var(--ink-2);margin:0 0 16px;max-width:68ch}section+section{margin-top:40px}.ledger{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel);box-shadow:var(--shadow)}.hd,.row{display:grid;grid-template-columns:minmax(148px,1fr) 1.25fr 30px 1.25fr}.hd{background:var(--panel-2);border-bottom:1px solid var(--line);font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:650}.hd>div{padding:9px 16px}.row{border-top:1px solid var(--line)}.hd+.row{border-top:0}.row.risk{background:var(--warning-soft)}.cell{padding:14px 16px;min-width:0}.tagname{display:flex;flex-direction:column;gap:6px;border-right:1px solid var(--line)}.tagname .t{font-size:13.5px;font-weight:600;overflow-wrap:anywhere}.side{border-right:1px solid var(--line)}.link{display:flex;align-items:center;justify-content:center;color:var(--ink-3);font-size:15px;border-right:1px solid var(--line);padding:0}.row.risk .link{color:var(--warning)}.site{display:block;font-size:12.5px;overflow-wrap:anywhere;margin-bottom:9px}.site:last-child{margin-bottom:0}.site .fn{font-weight:600;color:var(--ink)}.site .m{color:var(--accent)}.site .loc{color:var(--ink-3)}.none{font-size:12.5px;color:var(--ink-3);font-style:italic}.pill{display:inline-flex;align-self:flex-start;font-size:10.5px;font-weight:650;text-transform:uppercase;letter-spacing:.05em;padding:2.5px 7px;border-radius:99px;border:1px solid transparent}.pill.ok{color:var(--ok);background:var(--ok-soft)}.pill.orphan{color:var(--warning);background:var(--panel);border-color:var(--warning-line)}.pill.unmatched{color:var(--error);background:var(--panel);border-color:var(--error-line)}.pill.fanout{color:var(--info);background:var(--panel);border-color:var(--info-line)}.finds{display:flex;flex-direction:column;gap:8px}.find{display:grid;grid-template-columns:4px auto 1fr;background:var(--panel);border:1px solid var(--line);border-radius:7px;overflow:hidden;box-shadow:var(--shadow)}.stripe{background:var(--line-strong)}.find.error .stripe{background:var(--error)}.find.warning .stripe{background:var(--warning)}.find.info .stripe{background:var(--info)}.code{padding:14px 0 14px 15px;display:flex;flex-direction:column;gap:5px;align-items:flex-start}.code .rule{font-size:12.5px;font-weight:660}.find.error .code .rule{color:var(--error)}.find.warning .code .rule{color:var(--warning)}.find.info .code .rule{color:var(--info)}.code .sev{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)}.body{padding:14px 16px;min-width:0}.loc{font-size:12px;color:var(--ink-2);overflow-wrap:anywhere;margin-bottom:5px}.msg{font-size:13.5px;overflow-wrap:anywhere}details{margin-top:9px}summary{font-size:12px;color:var(--accent);cursor:pointer;width:fit-content;list-style:none;display:flex;align-items:center;gap:5px}summary::-webkit-details-marker{display:none}summary::before{content:\"+\";font-family:ui-monospace,monospace;font-weight:700}details[open] summary::before{content:\"\\2212\"}summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}.help{font-size:12.5px;color:var(--ink-2);margin-top:7px;padding-left:13px;border-left:2px solid var(--line-strong)}.clean{background:var(--ok-soft);border:1px solid var(--line);border-radius:8px;padding:18px 20px}.clean .big{font-size:15px;font-weight:620;color:var(--ok)}.clean .small{font-size:13px;color:var(--ink-2);margin-top:2px}.foot{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-3);display:flex;gap:20px;flex-wrap:wrap}@media(max-width:760px){.hd{display:none}.row{grid-template-columns:1fr}.tagname,.side,.link{border-right:0}.tagname,.side{border-bottom:1px solid var(--line)}.link{justify-content:flex-start;padding:8px 16px;border-bottom:1px solid var(--line)}.find{grid-template-columns:4px 1fr}.code{flex-direction:row;align-items:center;gap:8px;padding:12px 16px 0 15px}.stat:first-child{padding-left:0}.stat{padding-left:16px;padding-right:16px;min-width:78px}}" + '</style></head><body>'
    + '<div class="mast"><div class="mast-in">'
    + '<div class="brand"><h1>next-cache-trace</h1><span class="ver mono">schema ' + escapeHtml(report.schemaVersion) + '</span></div>'
    + '<p class="root mono">' + escapeHtml(report.projectRoot) + '</p>'
    + '<div class="score">'
    + stat(report.filesScanned, 'files', 'q')
    + stat(report.summary.error, 'errors', 'e')
    + stat(report.summary.warning, 'warnings', 'w')
    + stat(report.summary.info, 'info', 'i')
    + stat(report.suppressedCount, 'suppressed', 'q')
    + stat(report.coverage.unresolved, 'unresolved', 'q')
    + '</div></div></div>'
    + '<div class="wrap">'
    + '<p class="caveat"><b>Static evidence only.</b> ' + escapeHtml(report.coverage.note.replace('Static evidence only. ', '')) + '</p>'
    + (report.baseline ? '<p class="caveat"><b>Baseline:</b> ' + report.baseline.existing + ' existing, ' + report.baseline.new + ' new, ' + report.baseline.resolved + ' resolved. CI uses new findings only.</p>' : '')
    + '<section><h2>Tag ledger</h2><p class="sub">Every observed tag, beside its producer and invalidation sites. Expand source evidence to follow constant definitions and imports. Highlighted rows have one side missing or span several route areas; review them in context.</p>' + ledger + '</section>'
    + '<section><h2>Findings</h2><p class="sub">Diagnostics within scanned files, most severe first.</p>'
    + (findings ? '<div class="finds">' + findings + '</div>' : '<div class="clean"><div class="big">No findings within the analyzed scope</div><div class="small">Absence of findings is not proof that caching is correct.</div></div>')
    + '</section>'
    + '<div class="foot"><span>' + report.graph.producers.length + ' observed producers</span><span>' + report.graph.invalidations.length + ' invalidations</span><span>' + report.graph.boundaries.length + ' cached boundaries</span><span>' + (report.coverage.resolvedProducers + report.coverage.resolvedInvalidations) + ' constant-resolved sites</span></div>'
    + '</div></body></html>';
}
