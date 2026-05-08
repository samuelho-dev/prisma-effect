import type { DMMF } from '@prisma/generator-helper';
import { isListField, isRequiredField, isUuidField } from '../prisma/type.js';
import { extractEffectTypeOverride } from '../utils/annotations.js';
import { toPascalCase } from '../utils/naming.js';
import { PRISMA_TO_EFFECT_SCHEMA as PRISMA_SCALAR_MAP } from '../utils/type-mappings.js';

/**
 * Map Prisma field type to Effect Schema type
 * Priority order: annotation → FK branded → UUID → scalar → enum → unknown fallback
 *
 * @param field - The Prisma field to map
 * @param dmmf - The full DMMF document for enum lookups
 * @param fkMap - Optional FK field → target model mapping for branded FK types
 */
export function mapFieldToEffectType(
  field: DMMF.Field,
  dmmf: DMMF.Document,
  fkMap?: Map<string, string>
) {
  // PRIORITY 1: Check for @customType annotation
  const typeOverride = extractEffectTypeOverride(field);
  if (typeOverride) {
    return typeOverride;
  }

  // PRIORITY 2: Check if this is a FK field with branded target
  // FK fields use the referenced model's branded ID (e.g., UserId for user_id)
  if (fkMap && fkMap.has(field.name)) {
    const targetModel = fkMap.get(field.name)!;
    return `${toPascalCase(targetModel)}Id`;
  }

  // PRIORITY 3: Handle String type with UUID detection (non-FK UUIDs)
  if (field.type === 'String' && isUuidField(field)) {
    return 'Schema.UUID';
  }

  // PRIORITY 4: Handle scalar types with const assertion lookup
  const scalarType = PRISMA_SCALAR_MAP[field.type as keyof typeof PRISMA_SCALAR_MAP];
  if (scalarType) {
    return scalarType;
  }

  // PRIORITY 5: Check if it's an enum
  const enumDef = dmmf.datamodel.enums.find((e) => e.name === field.type);
  if (enumDef) {
    // PascalCase name IS the Schema now (not raw enum)
    return toPascalCase(field.type);
  }

  // PRIORITY 6: Fallback to Unknown
  return 'Schema.Unknown';
}

/**
 * Build complete field type with array and optional wrapping
 *
 * @param field - The Prisma field to build type for
 * @param dmmf - The full DMMF document for enum lookups
 * @param fkMap - Optional FK field → target model mapping for branded FK types
 */
export function buildFieldType(
  field: DMMF.Field,
  dmmf: DMMF.Document,
  fkMap?: Map<string, string>
) {
  let baseType = mapFieldToEffectType(field, dmmf, fkMap);

  // Handle arrays
  if (isListField(field)) {
    baseType = `Schema.Array(${baseType})`;
  }

  // Handle nullable fields - wrap with NullOr regardless of default value
  // This ensures SELECT type correctly allows null values (e.g., Boolean? @default(false))
  if (!isRequiredField(field)) {
    baseType = `Schema.NullOr(${baseType})`;
  }

  return baseType;
}
