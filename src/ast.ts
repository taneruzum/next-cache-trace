import ts from 'typescript';
import { posix } from 'node:path';
import { finding, type FileAnalysis, type Location, type Boundary, type TagSite } from './model.js';
import { unwrap, propertyName } from './config.js';

const DIRECTIVES = new Set(['use cache', 'use cache: remote', 'use cache: private']);
export function analyzeSource(file: string, text: string): FileAnalysis {
  const canonical = (name: string): string => posix.normalize(name.replaceAll('\\', '/'));
  const compilerFile = canonical(file);
  const compilerOptions: ts.CompilerOptions = { allowJs: true, noLib: true, noResolve: true, target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve };
  const source = ts.createSourceFile(compilerFile, text, ts.ScriptTarget.Latest, true);
  const host: ts.CompilerHost = {
    getSourceFile: name => canonical(name) === compilerFile ? source : undefined,
    getDefaultLibFileName: () => '', writeFile: () => {}, getCurrentDirectory: () => '',
    getDirectories: () => [], fileExists: name => canonical(name) === compilerFile, readFile: name => canonical(name) === compilerFile ? text : undefined,
    getCanonicalFileName: canonical, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n'
  };
  const program = ts.createProgram([compilerFile], compilerOptions, host);
  const checker = program.getTypeChecker();
  const result: FileAnalysis = { file, findings: [], producers: [], invalidations: [], boundaries: [], usages: [] };
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
  function addTags(args: readonly ts.Expression[], method: string, call: ts.CallExpression, scope: string, producer: boolean): void {
    if (!args.length) { unknown(call, method + ' has no statically readable tag arguments.'); return; }
    // Only count fully known, valid-length literals. Spreads/variables may change
    // cardinality and are covered by NCT900 instead of an invented exact count.
    const literals = args.map(unwrap);
    if (producer && literals.length > 128 && literals.every(value => (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && value.text.length <= 256)) {
      result.findings.push(finding('NCT008', location(call), method + ' supplies ' + literals.length + ' literal tags in one call/array; the supported limit is 128. Reduce the list and review affected invalidations.'));
    }
    for (const arg of args) {
      const value = unwrap(arg);
      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
        if (value.text.length > 256) result.findings.push(finding('NCT007', location(call), method + ' uses a literal tag of ' + value.text.length + ' UTF-16 code units; the supported limit is 256. This tag cannot be reliably assigned and invalidated.'));
        const site: TagSite = { ...location(call), tag: value.text, method, scope, area };
        (producer ? result.producers : result.invalidations).push(site);
      } else unknown(arg, method + ' uses a dynamic tag; no relationship is inferred.');
    }
  }
  function getProperty(object: ts.Expression | undefined, key: string): ts.Expression | undefined {
    if (!object) return undefined;
    const node = unwrap(object);
    if (!ts.isObjectLiteralExpression(node)) return undefined;
    let result: ts.Expression | undefined;
    for (const p of node.properties) {
      if (ts.isSpreadAssignment(p)) result = undefined;
      else if (propertyName(p.name) === key) result = ts.isPropertyAssignment(p) ? p.initializer : undefined;
    }
    return result;
  }
  function optionTags(options: ts.Expression | undefined, call: ts.CallExpression, method: string, scope: string): void {
    if (!options) return;
    const tagArray = getProperty(options, 'tags');
    if (tagArray && ts.isArrayLiteralExpression(unwrap(tagArray))) addTags((unwrap(tagArray) as ts.ArrayLiteralExpression).elements, method, call, scope, true);
    else if (tagArray || !ts.isObjectLiteralExpression(unwrap(options)) || (ts.isObjectLiteralExpression(unwrap(options)) && (unwrap(options) as ts.ObjectLiteralExpression).properties.some(p => ts.isSpreadAssignment(p)))) unknown(options, method + ' options cannot be fully resolved; they may contain tag producers.');
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
      const expr = unwrap(node.expression);
      if (ts.isIdentifier(expr) && expr.text === 'fetch' && !checker.getSymbolAtLocation(expr)) {
        const options = node.arguments[1];
        const next = getProperty(options, 'next');
        if (next) optionTags(next, node, 'fetch', scope);
        else if (options && (!ts.isObjectLiteralExpression(unwrap(options)) || (unwrap(options) as ts.ObjectLiteralExpression).properties.some(p => ts.isSpreadAssignment(p)))) unknown(options, 'fetch options may contain unobserved next.tags.');
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
