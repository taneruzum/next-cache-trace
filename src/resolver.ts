import ts from 'typescript';
import { relative, resolve } from 'node:path';
import { propertyName, unwrap } from './config.js';
import type { EvidenceStep } from './model.js';

export interface ResolvedExpression { node?: ts.Expression; evidence: EvidenceStep[]; reason?: string }
const canonical = (name: string) => name.replaceAll('\\', '/');

/** A bounded source-only resolver. It never loads modules or evaluates application code. */
export class SourceContext {
  readonly sources = new Map<string, ts.SourceFile>();
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  private writes = new Set<ts.VariableDeclaration>();
  private escapes = new Set<ts.VariableDeclaration>();
  private originCache = new Map<ts.Symbol, ts.VariableDeclaration | null>();
  private moduleCache = new Map<string, ts.SourceFile | null>();
  private invalidFiles = new Set<ts.SourceFile>();

  constructor(texts: Map<string, string>, private root = process.cwd(), private moduleOptions: ts.CompilerOptions = {}) {
    for (const [file, text] of texts) this.sources.set(canonical(file), ts.createSourceFile(canonical(file), text, ts.ScriptTarget.Latest, true));
    const lookup = (file: string) => this.sources.get(canonical(file)) ?? this.sources.get(canonical(relative(root, file)));
    const host: ts.CompilerHost = {
      getSourceFile: file => lookup(file), getDefaultLibFileName: () => '', writeFile() {},
      getCurrentDirectory: () => root, getDirectories: () => [], fileExists: file => !!lookup(file),
      readFile: file => lookup(file)?.text, getCanonicalFileName: canonical,
      useCaseSensitiveFileNames: () => true, getNewLine: () => '\n'
    };
    this.program = ts.createProgram([...this.sources.keys()], { allowJs: true, noLib: true, noResolve: true, target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve }, host);
    this.checker = this.program.getTypeChecker();
    for (const source of this.sources.values()) if (this.program.getSyntacticDiagnostics(source).length) this.invalidFiles.add(source);
    // Inspect every reference, including references in importing files. `as const`
    // does not prevent writes through aliases or escapes to unknown functions.
    for (const source of this.sources.values()) this.inspectReferences(source);
  }

  step(node: ts.Node, kind: EvidenceStep['kind']): EvidenceStep {
    const source = node.getSourceFile();
    const at = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { file: source.fileName, line: at.line + 1, column: at.character + 1, kind, expression: node.getText(source).slice(0, 240) };
  }

  private imported(decl: ts.ImportSpecifier): { source: ts.SourceFile; name: string } | undefined {
    const clause = decl.parent.parent;
    const module = clause.parent.moduleSpecifier;
    if (decl.isTypeOnly || clause.isTypeOnly || !ts.isStringLiteral(module)) return;
    const key = decl.getSourceFile().fileName + '\0' + module.text;
    let source = this.moduleCache.get(key);
    if (source === undefined) {
      const match = ts.resolveModuleName(module.text, resolve(this.root, decl.getSourceFile().fileName),
        { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler, ...this.moduleOptions }, {
          fileExists: file => this.sources.has(canonical(relative(this.root, file))),
          readFile: file => this.sources.get(canonical(relative(this.root, file)))?.text
        }).resolvedModule;
      source = match ? this.sources.get(canonical(relative(this.root, match.resolvedFileName))) : undefined;
      this.moduleCache.set(key, source ?? null);
    }
    return source ? { source, name: (decl.propertyName ?? decl.name).text } : undefined;
  }

  private exported(source: ts.SourceFile, name: string): ts.VariableDeclaration | undefined {
    if (this.invalidFiles.has(source)) return;
    // Re-exports and imported local export lists intentionally remain unsupported.
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement) && statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const decl of statement.declarationList.declarations) if (ts.isIdentifier(decl.name) && decl.name.text === name) return decl;
      }
      if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const item = statement.exportClause.elements.find(e => !e.isTypeOnly && e.name.text === name);
        if (item) return this.checker.getExportSpecifierLocalTargetSymbol(item)?.declarations?.find(ts.isVariableDeclaration);
      }
    }
  }

  private declaration(id: ts.Identifier): ts.VariableDeclaration | undefined {
    const symbol = ts.isShorthandPropertyAssignment(id.parent) ? this.checker.getShorthandAssignmentValueSymbol(id.parent) : this.checker.getSymbolAtLocation(id);
    const decl = symbol?.declarations?.[0];
    if (decl && ts.isVariableDeclaration(decl)) return decl;
    if (decl && ts.isImportSpecifier(decl)) {
      const target = this.imported(decl);
      return target && this.exported(target.source, target.name);
    }
  }

  private origin(input: ts.Expression, seen = new Set<ts.Node>()): ts.VariableDeclaration | undefined {
    const node = unwrap(input);
    if (seen.size > 64 || seen.has(node)) return;
    seen.add(node);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return this.origin(node.expression, seen);
    if (!ts.isIdentifier(node)) return;
    const symbol = this.checker.getSymbolAtLocation(node);
    if (symbol && this.originCache.has(symbol)) return this.originCache.get(symbol) ?? undefined;
    const decl = this.declaration(node);
    if (!decl) return;
    const init = decl.initializer && unwrap(decl.initializer);
    const target = init && (ts.isIdentifier(init) || ts.isPropertyAccessExpression(init) || ts.isElementAccessExpression(init)) ? this.origin(init, seen) : decl;
    if (symbol) this.originCache.set(symbol, target ?? null);
    return target;
  }

  private knownConsumer(call: ts.CallExpression): boolean {
    const expr = unwrap(call.expression);
    if (ts.isIdentifier(expr) && expr.text === 'fetch' && !this.checker.getSymbolAtLocation(expr)) return true;
    const identifier = ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) ? expr.expression : ts.isIdentifier(expr) ? expr : undefined;
    const decl = identifier && this.checker.getSymbolAtLocation(identifier)?.declarations?.[0];
    if (decl && ts.isImportSpecifier(decl)) {
      const clause = decl.parent.parent;
      const module = clause.parent.moduleSpecifier;
      return !decl.isTypeOnly && !clause.isTypeOnly && ts.isStringLiteral(module) && module.text === 'next/cache'
        && ['cacheTag', 'updateTag', 'revalidateTag', 'unstable_cache'].includes((decl.propertyName ?? decl.name).text);
    }
    if (decl && ts.isNamespaceImport(decl) && ts.isPropertyAccessExpression(expr)) {
      const module = decl.parent.parent.moduleSpecifier;
      return !decl.parent.isTypeOnly && ts.isStringLiteral(module) && module.text === 'next/cache'
        && ['cacheTag', 'updateTag', 'revalidateTag', 'unstable_cache'].includes(expr.name.text);
    }
    return false;
  }

  private inspectReferences(node: ts.Node): void {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node)) {
      const decl = this.origin(node);
      if (decl) {
        let use: ts.Node = node;
        while (use.parent && ((ts.isPropertyAccessExpression(use.parent) || ts.isElementAccessExpression(use.parent)) && use.parent.expression === use
          || ts.isAsExpression(use.parent) || ts.isParenthesizedExpression(use.parent) || ts.isNonNullExpression(use.parent) || ts.isSatisfiesExpression(use.parent))) use = use.parent;
        const parent = use.parent;
        let target = use;
        while (target.parent && (ts.isParenthesizedExpression(target.parent) || ts.isArrayLiteralExpression(target.parent)
          || ts.isObjectLiteralExpression(target.parent) || ts.isSpreadElement(target.parent) || ts.isSpreadAssignment(target.parent)
          || ts.isPropertyAssignment(target.parent) && target.parent.initializer === target || ts.isShorthandPropertyAssignment(target.parent))) target = target.parent;
        const assignment = target.parent;
        const writtenTarget = assignment && (ts.isBinaryExpression(assignment) && assignment.left === target
          && assignment.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && assignment.operatorToken.kind <= ts.SyntaxKind.LastAssignment
          || (ts.isForOfStatement(assignment) || ts.isForInStatement(assignment)) && assignment.initializer === target);
        if (writtenTarget || parent && (ts.isBinaryExpression(parent) && parent.left === use && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
          || ts.isDeleteExpression(parent) || (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator))) {
          this.writes.add(decl);
        } else if (!(ts.isVariableDeclaration(parent) && (parent.name === use || parent.initializer === use && ts.isIdentifier(parent.name)))
          && !ts.isImportSpecifier(parent) && !ts.isExportSpecifier(parent)
          && !(ts.isPropertyAssignment(parent) && parent.name === use)
          && !(ts.isPropertyAccessExpression(parent) && parent.name === use)) {
          // Only permit aggregate transport directly to known non-mutating cache APIs.
          let outer = use;
          while (outer.parent && (ts.isArrayLiteralExpression(outer.parent) || ts.isPropertyAssignment(outer.parent)
            || ts.isObjectLiteralExpression(outer.parent) || ts.isSpreadElement(outer.parent))) outer = outer.parent;
          const consumer = outer.parent;
          const projection = ts.isPropertyAccessExpression(use) || ts.isElementAccessExpression(use) ? this.resolve(use).node : undefined;
          const scalarProjection = projection && (ts.isStringLiteral(projection) || ts.isNoSubstitutionTemplateLiteral(projection));
          if (!scalarProjection && !(consumer && ts.isCallExpression(consumer) && consumer.expression !== outer && this.knownConsumer(consumer))) this.escapes.add(decl);
        }
      }
    }
    ts.forEachChild(node, child => this.inspectReferences(child));
  }

  resolve(input: ts.Expression, evidence: EvidenceStep[] = [], seen = new Set<ts.Node>()): ResolvedExpression {
    const node = unwrap(input);
    const unknown = (reason: string): ResolvedExpression => ({ evidence, reason });
    if (seen.size >= 64 || seen.has(node)) return unknown('Cyclic expression or resolution depth limit (64).');
    seen.add(node);
    if (this.invalidFiles.has(node.getSourceFile())) return unknown('The defining source has syntax errors.');
    if (ts.isIdentifier(node)) {
      const symbol = this.checker.getSymbolAtLocation(node);
      const imported = symbol?.declarations?.find(ts.isImportSpecifier);
      const decl = this.declaration(node);
      if (!decl?.initializer) return unknown('No supported local constant or direct named export in the scanned sources.');
      if (!ts.isVariableDeclarationList(decl.parent) || !(decl.parent.flags & ts.NodeFlags.Const) || !ts.isIdentifier(decl.name)) return unknown('Only const declarations with simple names are supported.');
      const origin = this.origin(node) ?? decl;
      if (this.writes.has(origin)) return unknown('The constant or one of its aliases is written to.');
      // Reads before a declaration in the same immediate execution scope are not values.
      if (decl.getSourceFile() === node.getSourceFile() && decl.pos > node.pos) {
        const scope = (n: ts.Node): ts.Node => { while (n.parent && !ts.isFunctionLike(n) && !ts.isSourceFile(n)) n = n.parent; return n; };
        if (scope(decl) === scope(node)) return unknown('Constant is read before its declaration.');
      }
      const trail = [...evidence];
      if (imported) trail.push(this.step(imported, 'import'), this.step(decl, 'export'));
      trail.push(this.step(decl.name, 'definition'));
      const resolved = this.resolve(decl.initializer, trail, seen);
      if (resolved.node && (ts.isObjectLiteralExpression(resolved.node) || ts.isArrayLiteralExpression(resolved.node)) && this.escapes.has(origin)) return unknown('The object/array escapes supported read-only uses; as const is not runtime immutability.');
      return resolved;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression && ts.isStringLiteral(unwrap(node.argumentExpression)) ? (unwrap(node.argumentExpression) as ts.StringLiteral).text : undefined;
      if (key === undefined) return unknown('Computed property keys are not resolved.');
      const property = this.property(node.expression, key, evidence, seen);
      return property.node ? this.resolve(property.node, property.evidence, seen) : property;
    }
    return { node, evidence };
  }

  property(input: ts.Expression, key: string, evidence: EvidenceStep[] = [], seen = new Set<ts.Node>()): ResolvedExpression {
    const object = this.resolve(input, evidence, seen);
    if (!object.node) return object;
    if (!ts.isObjectLiteralExpression(object.node)) return { evidence: object.evidence, reason: 'Expected a statically known object.' };
    let value: ts.Expression | undefined;
    for (const property of object.node.properties) {
      if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name) && propertyName(property.name) === undefined) return { evidence: object.evidence, reason: 'Object spreads or dynamic keys are not resolved.' };
      if (propertyName(property.name) === key) value = ts.isPropertyAssignment(property) ? property.initializer : ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
    }
    return value ? { node: value, evidence: object.evidence } : { evidence: object.evidence, reason: 'No statically readable ' + key + ' property.' };
  }

  strings(input: ts.Expression, evidence: EvidenceStep[] = []): { values: { value: string; evidence: EvidenceStep[] }[]; reason?: string } {
    const value = this.resolve(input, evidence);
    if (!value.node) return { values: [], reason: value.reason };
    if (ts.isStringLiteral(value.node) || ts.isNoSubstitutionTemplateLiteral(value.node)) return { values: [{ value: value.node.text, evidence: [...value.evidence, this.step(value.node, 'literal')] }] };
    return { values: [], reason: 'The tag is not a statically resolved string; runtime expressions are not evaluated.' };
  }
}
