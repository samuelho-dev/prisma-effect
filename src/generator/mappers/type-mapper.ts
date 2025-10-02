import type { DMMF } from '@prisma/generator-helper';
import { isUuidField } from './uuid-detector';

/**
 * Prisma scalar types that map to Effect Schema types
 */
type PrismaScalarType =
  | 'String'
  | 'Int'
  | 'Float'
  | 'BigInt'
  | 'Decimal'
  | 'Boolean'
  | 'DateTime'
  | 'Json'
  | 'Bytes';

/**
 * Centralized mapping from Prisma types to Effect Schema types
 */
const PRISMA_TO_EFFECT_SCHEMA = {
  String: 'Schema.String',
  Int: 'Schema.Number',
  Float: 'Schema.Number',
  BigInt: 'Schema.BigInt',
  Decimal: 'Schema.String', // For precision
  Boolean: 'Schema.Boolean',
  DateTime: 'Schema.Date',
  Json: 'Schema.Unknown', // Safe unknown type
  Bytes: 'Schema.Uint8Array',
} as const satisfies Record<PrismaScalarType, string>;

/**
 * Maps Prisma field types to Effect Schema type strings with Kysely integration
 */
export class TypeMapper {
  constructor(private readonly dmmf: DMMF.Document) {}

  /**
   * Get the complete Effect Schema type string for a field, including:
   * - Base type mapping
   * - UUID detection
   * - Array wrapping
   * - Optional handling
   * - Kysely column type integration (generated/columnType)
   */
  getEffectSchemaType(field: DMMF.Field) {
    let baseType = this.getBaseType(field);

    // Handle arrays
    if (field.isList) {
      baseType = `Schema.Array(${baseType})`;
    }

    // Kysely integration: Handle @default and @id fields FIRST
    if (field.hasDefaultValue) {
      if (field.isId) {
        // ID fields with @default are read-only (can't be inserted/updated)
        baseType = `columnType(${baseType}, Schema.Never, Schema.Never)`;
      } else {
        // Regular fields with @default use generated() - makes insert optional
        baseType = `generated(${baseType})`;
      }
    }
    // THEN handle optional fields (only if NOT already generated)
    else if (!field.isRequired) {
      baseType = `Schema.optional(${baseType})`;
    }

    return baseType;
  }

  /**
   * Get the base Effect Schema type for a field
   */
  private getBaseType(field: DMMF.Field) {
    // Handle String type with UUID detection
    if (field.type === 'String' && isUuidField(field)) {
      return 'Schema.UUID';
    }

    // Handle scalar types with type-safe lookup using type guard
    const fieldType = field.type;
    if (this.isPrismaScalarType(fieldType)) {
      return PRISMA_TO_EFFECT_SCHEMA[fieldType];
    }

    // Check if it's an enum
    const enumDef = this.dmmf.datamodel.enums.find(
      (e) => e.name === field.type,
    );
    if (enumDef) {
      // Use imported enum schema directly (unquoted)
      return field.type;
    }

    // Fallback to Unknown for unsupported types
    return 'Schema.Unknown';
  }

  /**
   * Type guard to check if a string is a valid PrismaScalarType
   */
  private isPrismaScalarType(type: string): type is PrismaScalarType {
    return type in PRISMA_TO_EFFECT_SCHEMA;
  }
}
