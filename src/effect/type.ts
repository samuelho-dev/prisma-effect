import type { DMMF } from '@prisma/generator-helper';
import {
  isUuidField,
  isListField,
  isRequiredField,
  hasDefaultValue,
} from '../prisma/type';

/**
 * Prisma scalar type mapping to Effect Schema types
 * Uses const assertion to avoid type guards
 */
const PRISMA_SCALAR_MAP = {
  String: 'Schema.String',
  Int: 'Schema.Number',
  Float: 'Schema.Number',
  BigInt: 'Schema.BigInt',
  Decimal: 'Schema.String', // For precision
  Boolean: 'Schema.Boolean',
  DateTime: 'Schema.Date',
  Json: 'Schema.Unknown', // Safe unknown type
  Bytes: 'Schema.Uint8Array',
} as const;

/**
 * Map Prisma field type to Effect Schema type
 * No type guards - uses const assertion with fallback
 */
export function mapFieldToEffectType(field: DMMF.Field, dmmf: DMMF.Document) {
  // Handle String type with UUID detection
  if (field.type === 'String' && isUuidField(field)) {
    return 'Schema.UUID';
  }

  // Handle scalar types with const assertion lookup
  const scalarType =
    PRISMA_SCALAR_MAP[field.type as keyof typeof PRISMA_SCALAR_MAP];
  if (scalarType) {
    return scalarType;
  }

  // Check if it's an enum
  const enumDef = dmmf.datamodel.enums.find((e) => e.name === field.type);
  if (enumDef) {
    return field.type; // Use enum name directly
  }

  // Fallback to Unknown for unsupported types
  return 'Schema.Unknown';
}

/**
 * Build complete field type with array and optional wrapping
 */
export function buildFieldType(field: DMMF.Field, dmmf: DMMF.Document) {
  let baseType = mapFieldToEffectType(field, dmmf);

  // Handle arrays
  if (isListField(field)) {
    baseType = `Schema.Array(${baseType})`;
  }

  // Handle optional fields (only if NOT already has @default)
  if (!isRequiredField(field) && !hasDefaultValue(field)) {
    baseType = `Schema.UndefinedOr(${baseType})`;
  }

  return baseType;
}
