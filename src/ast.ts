import ts from 'typescript';
import { posix } from 'node:path';
import { finding, type FileAnalysis, type Location, type Boundary, type TagSite } from './model.js';
import { unwrap } from './config.js';
import { SourceContext } from './resolver.js';
import type { EvidenceStep } from './model.js';

const DIRECTIVES = new Set(['use cache', 'use cache: remote', 'use cache: private']);
export function analyzeSource(file: string, text: string): FileAnalysis {
  return analyzeFile(file, new SourceContext(new Map([[file, text]])));
}

export function analyzeFile(file: string, context: SourceContext): FileAnalysis {
  const compilerFile = posix.normalize(file.replaceAll('\\', '/'));
  const source = context.sources.get(compilerFile)!;
  const { program, checker } = context;
  const result: FileAnalysis = { file, findings: [], producers: [], invalidations: [], boundaries: [], usages: [], cacheUsages: [] };
  const location = (node: ts.Node): Location => {
    const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { file, line: pos.line + 1, column: pos.character + 1 };
  };
  for (const diagnostic of program.getSyntacticDiagnostics(source)) {
    const pos = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    result.findings.push(finding('NCT902', { file, line: pos.line + 1, column: pos.character + 1 }, ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')));
  }
  function imported(identifier: ts.Identifier): { module: string; name: string } | undefined {
    const symbol = checker.getSymbolAtLocation(identifier);
    for (const decl of symbol?.declarations ?? []) {
      if (ts.isImportSpecifier(decl)) {
        const clause = decl.parent.parent;
        const module = clause.parent.moduleSpecifier;
        if (!decl.isTypeOnly && !clause.isTypeOnly && ts.isStringLiteral(module)) return { module: module.text, name: (decl.propertyName ?? decl.name).text };
      }
      if (ts.isNamespaceImport(decl)) {
        const clause = decl.parent;
        const module = clause.parent.moduleSpecifier;
        if (!clause.isTypeOnly && ts.isStringLiteral(module)) return { module: module.text, name: '*' };
      }
    }
    return undefined;
  }
  function apiName(expression: ts.Expression, module: string): string | undefined {
    const expr = unwrap(expression);
    if (ts.isIdentifier(expr)) { const info = imported(expr); return info?.module === module ? info.name : undefined; }
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
      const info = imported(expr.expression);
      if (info?.module === module && info.name === '*') return expr.name.text;
    }
    return undefined;
  }
  function directive(statements: ts.NodeArray<ts.Statement>, accepted = DIRECTIVES): ts.ExpressionStatement | undefined {
    for (const stmt of statements) {
      if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) break;
      if (accepted.has(stmt.expression.text)) return stmt;
    }
    return undefined;
  }
  const fileDirective = directive(source.statements);
  const serverDirectives = new Set(['use server']);
  const fileServerDirective = directive(source.statements, serverDirectives);
  const exports = new Set<string>();
  for (const stmt of source.statements) if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) for (const item of stmt.exportClause.elements) exports.add((item.propertyName ?? item.name).text);
  function isExported(fn: ts.FunctionLikeDeclaration): boolean {
    let node: ts.Node = fn;
    while (node.parent && node.parent !== source) node = node.parent;
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (node === fn) return true;
      if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(d => d.initializer && unwrap(d.initializer) === fn);
    }
    if (ts.isExportAssignment(node)) return unwrap(node.expression) === fn;
    if (fn.name && ts.isIdentifier(fn.name) && exports.has(fn.name.text) && fn.parent === source) return true;
    if (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) && exports.has(fn.parent.name.text) && fn.parent.parent.parent.parent === source) return true;
    return false;
  }
  const functionName = (fn: ts.FunctionLikeDeclaration): string => fn.name?.getText(source) ?? (ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText(source) : '<anonymous>');
  const segments = compilerFile.split('/');
  const app = segments.indexOf('app');
  const area = app < 0 ? null : (segments.slice(app + 1, -1).find(p => !p.startsWith('(') && !p.startsWith('@')) ?? '(root)');
  const unknown = (node: ts.Node, message: string) => result.findings.push(finding('NCT900', location(node), message));
  function addTags(args: readonly ts.Expression[], method: string, call: ts.CallExpression, scope: string, producer: boolean, trail: EvidenceStep[] = []): void {
    if (!args.length) { unknown(call, method + ' has no statically readable tag arguments.'); return; }
    // Only count fully known, valid-length literals. Spreads/variables may change
    // cardinality and are covered by NCT900 instead of an invented exact count.
    const resolved: { value: string; evidence: EvidenceStep[] }[] = [];
    let complete = true;
    let work = 0;
    const collect = (arg: ts.Expression, evidence: EvidenceStep[], depth = 0): void => {
      if (++work > 10000) {
        if (work === 10001) unknown(call, method + ': Tag expansion limit (10000 expressions) reached.');
        complete = false;
        return;
      }
      if (ts.isSpreadElement(arg)) {
        const spread = context.resolve(arg.expression, evidence);
        if (depth < 16 && spread.node && ts.isArrayLiteralExpression(spread.node)) {
          for (const item of spread.node.elements) { collect(item, spread.evidence, depth + 1); if (work > 10000) break; }
        } else { complete = false; unknown(call, method + ': ' + (spread.reason ?? 'Unresolved spread or array depth limit.')); }
      } else {
        const value = context.strings(arg, evidence);
        if (value.reason) { complete = false; unknown(call, method + ': ' + value.reason); }
        resolved.push(...value.values);
      }
    };
    for (const arg of args) { collect(arg, trail); if (work > 10000) break; }
    if (producer && complete && resolved.length > 128 && resolved.every(value => value.value.length <= 256)) {
      result.findings.push(finding('NCT008', location(call), method + ' supplies ' + resolved.length + ' resolved tags in one call/array; the supported limit is 128. Reduce the list and review affected invalidations.'));
    }
    for (const value of resolved) {
        if (value.value.length > 256) result.findings.push(finding('NCT007', location(call), method + ' uses a tag of ' + value.value.length + ' UTF-16 code units; the supported limit is 256. This tag cannot be reliably assigned and invalidated.'));
        const site: TagSite = { ...location(call), tag: value.value, method, scope, area,
          resolution: value.evidence.some(e => e.kind === 'definition' || e.kind === 'import') ? 'resolved' : 'literal',
          evidence: [context.step(call, 'usage'), ...value.evidence] };
        (producer ? result.producers : result.invalidations).push(site);
    }
  }
  function optionTags(options: ts.Expression | undefined, call: ts.CallExpression, method: string, scope: string, evidence: EvidenceStep[] = []): void {
    if (!options) return;
    const property = context.property(options, 'tags', evidence);
    const tagArray = property.node && context.resolve(property.node, property.evidence);
    if (tagArray?.node && ts.isArrayLiteralExpression(tagArray.node)) addTags(tagArray.node.elements, method, call, scope, true, tagArray.evidence);
    else if (property.node || property.reason !== 'No statically readable tags property.') unknown(call, method + ': ' + (tagArray?.reason ?? property.reason ?? 'Tag options cannot be resolved.'));
  }
  function visit(node: ts.Node, boundary?: Boundary, scope = '<module>', serverAction = false): void {
    if (ts.isFunctionLike(node) && 'body' in node && node.body) {
      const fn = node as ts.FunctionLikeDeclaration;
      const body = fn.body!;
      const own = ts.isBlock(body) ? directive(body.statements) : undefined;
      const effective = own ?? (fileDirective && isExported(fn) ? fileDirective : undefined);
      let current: Boundary | undefined;
      if (effective) {
        const loc = location(own ?? fn);
        current = { ...loc, id: file + ':' + loc.line + ':' + loc.column, name: functionName(fn), directive: (effective.expression as ts.StringLiteral).text, explicitLifetime: false };
        result.boundaries.push(current);
        result.usages.push(loc);
      }
      // Nested ordinary functions are not assumed to execute. No call-graph inference.
      const ownServer = ts.isBlock(body) && !!directive(body.statements, serverDirectives);
      visit(body, current, functionName(fn), ownServer || (!!fileServerDirective && isExported(fn)));
      if (current && !current.explicitLifetime) result.findings.push(finding('NCT005', current, current.name + ' uses the default cache lifetime (no direct cacheLife call).'));
      return;
    }
    if (ts.isCallExpression(node)) {
      const method = apiName(node.expression, 'next/cache');
      if (method === 'cacheTag') { addTags(node.arguments, method, node, scope, true); result.usages.push(location(node)); }
      if (method === 'revalidateTag' || method === 'updateTag') addTags(node.arguments.slice(0, 1), method, node, scope, false);
      if (method === 'revalidateTag') {
        if (node.arguments.length === 1 && !ts.isSpreadElement(node.arguments[0])) result.findings.push(finding('NCT006', location(node), 'revalidateTag(tag) without a profile is deprecated in Next.js 16. Select an explicit invalidation policy; adding "max" changes immediate expiration to stale-while-revalidate.'));
        const profile = node.arguments[1] && unwrap(node.arguments[1]);
        if (serverAction && profile && (ts.isStringLiteral(profile) || ts.isNoSubstitutionTemplateLiteral(profile)) && profile.text === 'max') result.findings.push(finding('NCT009', location(node), 'Server Action ' + scope + ' uses revalidateTag(tag, "max"), which allows stale data while revalidating. If this action must immediately read its own write, consider updateTag; otherwise this usage is valid.'));
      }
      if (method === 'cacheLife') { if (boundary) boundary.explicitLifetime = true; result.usages.push(location(node)); }
      if (method === 'unstable_cache') optionTags(node.arguments[2], node, method, scope);
      if (method && ['cacheTag', 'cacheLife', 'updateTag', 'revalidateTag', 'unstable_cache'].includes(method)) result.cacheUsages.push(location(node));
      const expr = unwrap(node.expression);
      if (ts.isIdentifier(expr) && expr.text === 'fetch' && !checker.getSymbolAtLocation(expr)) {
        const options = node.arguments[1];
        const next = options && context.property(options, 'next');
        if (next?.node) { result.cacheUsages.push(location(node)); optionTags(next.node, node, 'fetch', scope, next.evidence); }
        else if (next && next.reason !== 'No statically readable next property.') { result.cacheUsages.push(location(node)); unknown(node, 'fetch options may contain unobserved next.tags. ' + next.reason); }
      }
      const request = apiName(node.expression, 'next/headers');
      if (boundary && boundary.directive !== 'use cache: private' && (request === 'cookies' || request === 'headers')) result.findings.push(finding('NCT002', location(node), request + '() is called directly inside ' + boundary.directive + ' function ' + boundary.name + '.'));
    }
    ts.forEachChild(node, child => visit(child, boundary, scope, serverAction));
  }
  if (fileDirective) result.usages.push(location(fileDirective));
  visit(source);
  return result;
}
