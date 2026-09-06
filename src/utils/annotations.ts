/**
 * Extract a balanced `@customType(...)` expression from Prisma doc text.
 */
export function extractCustomType(doc: string): string | null {
  const match = /@customType\s*\(/.exec(doc);
  if (!match || match.index === undefined) return null;

  const start = match.index + match[0].length;
  let depth = 1;
  let end = start;
  for (let index = start; index < doc.length && depth > 0; index++) {
    if (doc[index] === '(') depth++;
    if (doc[index] === ')') depth--;
    if (depth === 0) end = index;
  }
  if (depth !== 0) return null;

  const expression = doc.slice(start, end).trim();
  return expression.startsWith('Schema.') || isCustomType(expression) ? expression : null;
}

/**
 * Read model-field custom type annotations from a Prisma contract source.
 */
export function parseCustomTypeAnnotations(psl: string): Map<string, string> {
  const annotations = new Map<string, string>();
  let modelName: string | null = null;
  let docs: string[] = [];

  for (const line of psl.split(/\r?\n/)) {
    if (!modelName) {
      const model = /^\s*model\s+([A-Za-z_]\w*)\s*\{/.exec(line);
      if (model?.[1]) modelName = model[1];
      continue;
    }

    if (/^\s*}\s*$/.test(line)) {
      modelName = null;
      docs = [];
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith('///')) {
      docs.push(trimmed.slice(3).trimStart());
      continue;
    }

    if (!trimmed.startsWith('@@') && !trimmed.startsWith('//')) {
      const field = /^\s*([A-Za-z_]\w*)\s+\S/.exec(line);
      const customType = docs.length > 0 ? extractCustomType(docs.join('\n')) : null;
      if (field?.[1] && customType) {
        annotations.set(`${modelName}.${field[1]}`, customType);
      }
    }
    docs = [];
  }

  return annotations;
}

function isCustomType(typeStr: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(typeStr);
}

/**
 * Effect 3 → 4 `@customType` syntax patterns to detect.
 *
 * `@customType(...)` strings are emitted verbatim, so a v3 expression compiles
 * against Effect 3 but breaks against Effect 4 (this generator targets v4). We
 * only WARN — we never rewrite, because regex-transforming arbitrary user
 * TypeScript expressions is unsafe (it can corrupt valid code and can't cover
 * every shape). Each entry: a matcher and the v4 replacement guidance.
 *
 * In Effect 4 all schema filters moved under `.check(Schema.is*)`, and the
 * variadic combinators (`Union`/`Tuple`/multi-`Literal`) take an array.
 */
interface LegacyPattern {
  readonly test: RegExp;
  readonly hint: string;
}

const LEGACY_V3_PATTERNS: readonly LegacyPattern[] = [
  // Filters: Schema.<name>(...) used as a pipeable, now `.check(Schema.is<Name>(...))`.
  { test: /\bSchema\.int\s*\(/, hint: 'Schema.int() → Schema.check(Schema.isInt())' },
  {
    test: /\bSchema\.between\s*\(/,
    hint: 'Schema.between(min, max) → Schema.check(Schema.isBetween({ minimum, maximum })) (v4 takes an object, not positional args)',
  },
  {
    test: /\bSchema\.minLength\s*\(/,
    hint: 'Schema.minLength(n) → Schema.check(Schema.isMinLength(n))',
  },
  {
    test: /\bSchema\.maxLength\s*\(/,
    hint: 'Schema.maxLength(n) → Schema.check(Schema.isMaxLength(n))',
  },
  {
    test: /\bSchema\.length\s*\(/,
    hint: 'Schema.length(n) → Schema.check(Schema.isLengthBetween(n, n))',
  },
  {
    test: /\bSchema\.greaterThanOrEqualTo\s*\(/,
    hint: 'Schema.greaterThanOrEqualTo(n) → Schema.check(Schema.isGreaterThanOrEqualTo(n))',
  },
  {
    test: /\bSchema\.greaterThan\s*\(/,
    hint: 'Schema.greaterThan(n) → Schema.check(Schema.isGreaterThan(n))',
  },
  {
    test: /\bSchema\.lessThanOrEqualTo\s*\(/,
    hint: 'Schema.lessThanOrEqualTo(n) → Schema.check(Schema.isLessThanOrEqualTo(n))',
  },
  {
    test: /\bSchema\.lessThan\s*\(/,
    hint: 'Schema.lessThan(n) → Schema.check(Schema.isLessThan(n))',
  },
  {
    test: /\bSchema\.multipleOf\s*\(/,
    hint: 'Schema.multipleOf(n) → Schema.check(Schema.isMultipleOf(n))',
  },
  { test: /\bSchema\.finite\s*\(/, hint: 'Schema.finite() → Schema.check(Schema.isFinite())' },
  {
    test: /\bSchema\.positive\s*\(/,
    hint: 'Schema.positive() → Schema.check(Schema.isGreaterThan(0))',
  },
  {
    test: /\bSchema\.nonNegative\s*\(/,
    hint: 'Schema.nonNegative() → Schema.check(Schema.isGreaterThanOrEqualTo(0))',
  },
  {
    test: /\bSchema\.negative\s*\(/,
    hint: 'Schema.negative() → Schema.check(Schema.isLessThan(0))',
  },
  {
    test: /\bSchema\.nonPositive\s*\(/,
    hint: 'Schema.nonPositive() → Schema.check(Schema.isLessThanOrEqualTo(0))',
  },
  {
    test: /\bSchema\.nonEmpty\s*\(/,
    hint: 'Schema.nonEmpty() → Schema.check(Schema.isNonEmpty())',
  },
  {
    test: /\bSchema\.pattern\s*\(/,
    hint: 'Schema.pattern(re) → Schema.check(Schema.isPattern(re))',
  },
  {
    test: /\bSchema\.startsWith\s*\(/,
    hint: 'Schema.startsWith(s) → Schema.check(Schema.isStartsWith(s))',
  },
  {
    test: /\bSchema\.endsWith\s*\(/,
    hint: 'Schema.endsWith(s) → Schema.check(Schema.isEndsWith(s))',
  },
  {
    test: /\bSchema\.lowercased\s*\(/,
    hint: 'Schema.lowercased() → Schema.check(Schema.isLowercased())',
  },
  {
    test: /\bSchema\.uppercased\s*\(/,
    hint: 'Schema.uppercased() → Schema.check(Schema.isUppercased())',
  },
  { test: /\bSchema\.trimmed\s*\(/, hint: 'Schema.trimmed() → Schema.check(Schema.isTrimmed())' },
  // Removed / renamed schemas.
  {
    test: /\bSchema\.DateFromSelf\b/,
    hint: 'Schema.DateFromSelf → Schema.Date (v4 Schema.Date is the native-Date schema)',
  },
  { test: /\bSchema\.UUID\b/, hint: 'Schema.UUID → Schema.String.check(Schema.isUUID())' },
  {
    test: /\bSchema\.optionalWith\s*\(/,
    hint: 'Schema.optionalWith({ exact: true }) → Schema.optionalKey',
  },
  // Variadic combinators that now take an array (non-array first arg = v3 form).
  // `Schema.Union(A, B)` → `Schema.Union([A, B])`; single-member calls are fine.
  {
    test: /\bSchema\.Union\s*\(\s*[^[)]/,
    hint: 'Schema.Union(a, b, …) is variadic in v3 → Schema.Union([a, b, …]) (array) in v4',
  },
  {
    test: /\bSchema\.Tuple\s*\(\s*[^[)]/,
    hint: 'Schema.Tuple(a, b, …) is variadic in v3 → Schema.Tuple([a, b, …]) (array) in v4',
  },
  // Multi-arg Literal → Literals([...]). Single Schema.Literal('x') is unchanged,
  // so only flag when a comma appears before the closing paren.
  {
    test: /\bSchema\.Literal\s*\([^)]*,/,
    hint: "Schema.Literal(a, b, …) → Schema.Literals([a, b, …]) (single Schema.Literal('x') is unchanged)",
  },
];

/**
 * Detect Effect 3 syntax in a `@customType` expression and return human-readable
 * upgrade hints. Returns an empty array when the expression looks v4-clean.
 *
 * Detection is heuristic (string matching), so it is WARN-ONLY — callers should
 * surface these as build warnings, never block generation or rewrite the string.
 *
 * @param typeStr - The raw `@customType(...)` expression
 * @returns v4 upgrade hints for each matched legacy pattern
 */
export function detectLegacyEffectV3Syntax(typeStr: string): string[] {
  return LEGACY_V3_PATTERNS.filter((p) => p.test.test(typeStr)).map((p) => p.hint);
}

/**
 * Check whether any annotation references an imported custom schema.
 */
export function hasCustomTypeAnnotations(annotations: ReadonlyMap<string, string>): boolean {
  return [...annotations.values()].some(isCustomType);
}
