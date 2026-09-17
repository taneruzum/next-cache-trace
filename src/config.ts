import ts from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RULES, type CacheConfig, type TraceOptions, type RuleCode } from './model.js';

export function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
}
export function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression)) return node.expression.text;
  return undefined;
}
export function readOptions(root: string, options: TraceOptions = {}): TraceOptions {
  const path = resolve(root, options.config ?? 'next-cache-trace.config.json');
  let saved: TraceOptions = {};
  if (options.config || existsSync(path)) {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Trace config must be an object');
    for (const key of Object.keys(value)) if (!['include', 'exclude', 'rules', 'cacheComponents'].includes(key)) throw new Error('Unknown trace config key: ' + key);
    for (const key of ['include', 'exclude']) if (value[key] !== undefined && (!Array.isArray(value[key]) || !(value[key] as unknown[]).every(x => typeof x === 'string'))) throw new Error(key + ' must be an array of glob strings');
    if (value.cacheComponents !== undefined && typeof value.cacheComponents !== 'boolean') throw new Error('cacheComponents override must be a boolean');
    if (value.rules !== undefined) {
      if (!value.rules || typeof value.rules !== 'object' || Array.isArray(value.rules)) throw new Error('rules must be an object');
      for (const [code, level] of Object.entries(value.rules)) if (!Object.hasOwn(RULES, code) || !['off', 'info', 'warning', 'error'].includes(level as string)) throw new Error('Invalid rule setting: ' + code);
    }
    saved = value as TraceOptions;
  }
  const merged = { ...saved, ...options, exclude: [...(saved.exclude ?? []), ...(options.exclude ?? [])], rules: { ...saved.rules, ...options.rules } };
  for (const [code, level] of Object.entries(merged.rules)) if (!RULES[code as RuleCode] || !['off', 'info', 'warning', 'error'].includes(level!)) throw new Error('Invalid rule setting: ' + code);
  return merged;
}

// Only inspect the exported object. Never import/execute a user's config.
export function readCacheConfig(root: string, override?: boolean): CacheConfig {
  if (override !== undefined) return { enabled: override, file: null, reason: 'Explicit analyzer override' };
  const filename = ['next.config.ts', 'next.config.mts', 'next.config.mjs', 'next.config.js', 'next.config.cjs'].find(name => existsSync(join(root, name)));
  if (!filename) return { enabled: false, file: null, reason: 'No next.config file found' };
  const source = ts.createSourceFile(filename, readFileSync(join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true);
  const variables = new Map<string, ts.Expression>();
  const reassigned = new Set<string>();
  let exported: ts.Expression | undefined;
  let unsafeMutation = false;
  function mutations(node: ts.Node): void {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      if (ts.isIdentifier(node.left)) reassigned.add(node.left.text);
      else if (node.left.getText(source) !== 'module.exports') unsafeMutation = true;
    }
    ts.forEachChild(node, mutations);
  }
  mutations(source);
  for (const stmt of source.statements) {
    if (ts.isVariableStatement(stmt) && (stmt.declarationList.flags & ts.NodeFlags.Const)) for (const decl of stmt.declarationList.declarations) if (ts.isIdentifier(decl.name) && decl.initializer) variables.set(decl.name.text, decl.initializer);
    if (ts.isExportAssignment(stmt)) exported = stmt.expression;
    if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression) && stmt.expression.left.getText(source) === 'module.exports' && stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) exported = stmt.expression.right;
  }
  function dereference(input: ts.Expression, seen = new Set<string>()): ts.Expression | undefined {
    const node = unwrap(input);
    if (!ts.isIdentifier(node)) return node;
    if (seen.has(node.text) || reassigned.has(node.text)) return undefined;
    seen.add(node.text);
    const value = variables.get(node.text);
    return value ? dereference(value, seen) : undefined;
  }
  function getFlag(input: ts.Expression, seen = new Set<ts.Node>()): boolean | null {
    const object = dereference(input);
    if (!object || !ts.isObjectLiteralExpression(object) || seen.has(object)) return null;
    seen.add(object);
    let result: boolean | null = false;
    for (const prop of object.properties) {
      if (ts.isSpreadAssignment(prop)) {
        // A spread may set the flag, or may omit it. Conservatively unknown.
        result = null;
      } else if (propertyName(prop.name) === 'cacheComponents') {
        const value = ts.isPropertyAssignment(prop) ? dereference(prop.initializer) : ts.isShorthandPropertyAssignment(prop) ? dereference(prop.name) : undefined;
        result = value?.kind === ts.SyntaxKind.TrueKeyword ? true : value?.kind === ts.SyntaxKind.FalseKeyword ? false : null;
      } else if (ts.isComputedPropertyName(prop.name) && propertyName(prop.name) === undefined) result = null;
    }
    return result;
  }
  const enabled = exported && !unsafeMutation ? getFlag(exported) : null;
  return { enabled, file: filename, reason: enabled === null ? 'Export uses dynamic expressions, wrappers, spreads or mutations' : 'Statically inspected exported config object' };
}
