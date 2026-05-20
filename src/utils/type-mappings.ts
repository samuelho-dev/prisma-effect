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
 * Note: DateTime uses Schema.Date so that:
 * - Type = Date (runtime)
 * - Encoded = Date (database)
 * This allows Kysely to work with native Date objects directly.
 * (In Effect 4, Schema.Date is the native-Date schema — no ISO string coercion;
 * it replaces Effect 3's Schema.DateFromSelf.)
 */
export const PRISMA_TO_EFFECT_SCHEMA = {
  String: 'Schema.String',
  Int: 'Schema.Number',
  Float: 'Schema.Number',
  BigInt: 'Schema.BigInt',
  Decimal: 'Schema.String', // For precision
  Boolean: 'Schema.Boolean',
  DateTime: 'Schema.Date', // Native Date type for Kysely compatibility
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
