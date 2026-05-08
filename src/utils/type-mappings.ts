/**
 * Centralized Prisma type mappings
 *
 * Single source of truth for mapping Prisma scalar types to:
 * - Effect Schema types (for schema generation)
 * - TypeScript types (for Kysely interfaces)
 *
 * This eliminates duplication across effect/type.ts, kysely/type.ts, and effect/join-table.ts
 */

/**
 * Prisma scalar type mapping to Effect Schema types
 * Uses const assertion for type safety
 *
 * DateTime uses `Schema.DateFromSelf` (Type === Encoded === Date) — matches
 * Prisma's contract that Client returns DateTime as native `Date` instances
 * (https://www.prisma.io/docs — "Prisma Client returns all DateTime values
 * as native JavaScript Date objects"). Also matches Kysely's idiomatic
 * `ColumnType<Date, ...>` pattern: SELECT yields Date.
 *
 * For RPC/JSON wire boundaries (where dates serialize to ISO strings),
 * decode through a `Schema.Date`-typed contract schema at the boundary.
 * Effect's Schema is single-pair (Type, Encoded) by design — see Doc 10944
 * "The Rule of Schemas" — and the dual-boundary problem is solved by
 * having two schemas (DA-side vs wire-side), not one Union.
 */
export const PRISMA_TO_EFFECT_SCHEMA = {
  String: 'Schema.String',
  Int: 'Schema.Number',
  Float: 'Schema.Number',
  BigInt: 'Schema.BigInt',
  Decimal: 'Schema.String', // For precision
  Boolean: 'Schema.Boolean',
  DateTime: 'Schema.DateFromSelf', // Date ↔ Date — Prisma+Kysely canonical
  Json: 'JsonValue', // Recursive JSON type — prevents null absorption in NullOr
  Bytes: 'Schema.Uint8Array',
} as const;

/**
 * Prisma scalar type mapping to TypeScript types (for Kysely interfaces)
 */
export const PRISMA_TO_TYPESCRIPT = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  DateTime: 'Date',
  Json: 'JsonValue',
  Bytes: 'Buffer',
  Decimal: 'string',
  BigInt: 'string', // Kysely convention
} as const;

/**
 * Type-safe key type for Prisma scalar types
 */
export type PrismaScalarType = keyof typeof PRISMA_TO_EFFECT_SCHEMA;

/**
 * Type guard to check if a string is a valid Prisma scalar type
 */
export function isPrismaScalarType(type: string): type is PrismaScalarType {
  return type in PRISMA_TO_EFFECT_SCHEMA;
}

/**
 * Get Effect Schema type for a Prisma scalar type
 * Returns undefined for non-scalar types (enums, relations)
 */
export function getEffectSchemaType(type: string) {
  if (isPrismaScalarType(type)) {
    return PRISMA_TO_EFFECT_SCHEMA[type];
  }
  return undefined;
}

/**
 * Get TypeScript type for a Prisma scalar type
 * Returns the input type unchanged for non-scalar types (enums, models)
 */
export function getTypeScriptType(type: string) {
  if (isPrismaScalarType(type)) {
    return PRISMA_TO_TYPESCRIPT[type];
  }
  return type;
}
