import type { DMMF } from '@prisma/generator-helper';

/**
 * @customType Annotation Parser
 *
 * Allows overriding Effect Schema types for Prisma-supported fields.
 *
 * WORKS FOR: Prisma scalar types (String, Int, Boolean, DateTime, etc.)
 *
 * USE CASES (Effect 4 syntax — emitted verbatim, so must be v4-valid):
 *   // Length constraint for String field
 *   /// @customType(Schema.String.check(Schema.isMinLength(3)))
 *   email String
 *
 *   // Positive number constraint for Int field
 *   /// @customType(Schema.Number.check(Schema.isGreaterThan(0)))
 *   age Int
 *
 *   // Custom branded type
 *   /// @customType(Schema.String.pipe(Schema.brand('UserId')))
 *   userId String
 *
 * @param field - Prisma DMMF field
 * @returns Extracted type string or null if no annotation found
 */
export function extractEffectTypeOverride(field: DMMF.Field) {
  if (!field.documentation) return null;

  // Match @customType annotation - handle balanced parentheses
  const annotationMatch = field.documentation.match(/@customType\s*\(/);
  if (!annotationMatch) return null;

  // Find the matching closing parenthesis
  const startIdx = field.documentation.indexOf('@customType(') + '@customType('.length;
  let parenCount = 1;
  let endIdx = startIdx;

  for (let i = startIdx; i < field.documentation.length && parenCount > 0; i++) {
    if (field.documentation[i] === '(') parenCount++;
    if (field.documentation[i] === ')') parenCount--;
    if (parenCount === 0) {
      endIdx = i;
      break;
    }
  }

  if (parenCount !== 0) {
    return null;
  }

  const typeStr = field.documentation.substring(startIdx, endIdx).trim();

  // Validate it's either a custom type or starts with Schema.
  if (!(typeStr.startsWith('Schema.') || isCustomType(typeStr))) {
    return null;
  }

  return typeStr;
}

/**
 * Check if type string is a custom type reference
 *
 * Custom types are PascalCase identifiers without dots:
 * - Valid: Vector1536, JSONBType, CustomEnum
 * - Invalid: Schema.String, some.nested.type
 *
 * @param typeStr - Type string to check
 * @returns true if it's a custom type reference
 */
function isCustomType(typeStr: string) {
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
 * Check if field has any custom type annotations
 *
 * @param fields - Array of Prisma fields
 * @returns true if any field uses custom types in @effectType
 */
export function hasCustomTypeAnnotations(fields: readonly DMMF.Field[]) {
  return fields.some((field) => {
    const override = extractEffectTypeOverride(field);
    return override && isCustomType(override);
  });
}
