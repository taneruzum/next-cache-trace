export { analyzeProject, analyzeProjectSync } from './analyze.js';
export { analyzeSource } from './ast.js';
export { formatHtml, formatJson, formatSarif, formatText, formatMarkdown, explainTag } from './reporters.js';
export { createBaseline, applyBaseline, type Baseline, type BaselineEntry } from './baseline.js';
export { RULES } from './model.js';
export { explainFinding, formatFindingExplanation } from './guidance.js';
export type { Report, Finding, FindingExplanation, TraceOptions, FileAnalysis, Boundary, TagSite, Severity, RuleCode, Location, CacheConfig, EvidenceStep } from './model.js';
