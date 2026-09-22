import { createHash } from 'node:crypto';
import ts from 'typescript';
import type { Finding } from './model.js';

export const IDENTITY_VERSION = 1;
export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

function tokens(node: ts.Node, source: ts.SourceFile): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, node.getText(source));
  const result: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) result.push(kind + ':' + scanner.getTokenText());
  return result.join('|');
}

/** Stable semantic groups; baseline uses multiplicities to retain identical new occurrences. */
export function identifyFindings(findings: Finding[], sources: Map<string, string>): Finding[] {
  const parsed = new Map<string, ts.SourceFile>();
  return findings.map(f => {
    let source = parsed.get(f.file);
    if (!source) { source = ts.createSourceFile(f.file, sources.get(f.file) ?? '', ts.ScriptTarget.Latest, true); parsed.set(f.file, source); }
    const starts = source.getLineStarts();
    const position = (starts[f.line - 1] ?? 0) + f.column - 1;
    let target: ts.Node = source;
    const locate = (node: ts.Node): void => {
      if (node.getStart(source) <= position && node.end > position) { target = node; ts.forEachChild(node, locate); }
    };
    locate(source);
    // Calls provide a tighter anchor than entire functions/bodies. For directives
    // and configuration findings use the smallest containing statement.
    let anchor = target;
    while (anchor.parent && !ts.isCallExpression(anchor) && !ts.isStatement(anchor) && !ts.isSourceFile(anchor)) anchor = anchor.parent;
    const scopes: string[] = [];
    for (let n: ts.Node | undefined = anchor; n; n = n.parent) {
      if (ts.isFunctionLike(n)) scopes.unshift(n.name?.getText(source) ?? (ts.isVariableDeclaration(n.parent) ? n.parent.name.getText(source) : '<anonymous>'));
    }
    const site = f as Finding & { tag?: string; method?: string };
    return { ...f, fingerprint: digest(JSON.stringify([IDENTITY_VERSION, f.code, f.file, scopes, tokens(anchor, source), site.tag ?? null, site.method ?? null])) };
  });
}
