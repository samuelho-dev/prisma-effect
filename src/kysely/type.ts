import type { DMMF } from '@prisma/generator-helper';
import { hasDefaultValue, isIdField, getFieldDbName } from '../prisma/type';

/**
 * Determine if field needs Kysely columnType wrapper
 * ID fields with @default are read-only (can't insert/update)
 */
export function needsColumnType(field: DMMF.Field) {
  return hasDefaultValue(field) && isIdField(field);
}

/**
 * Determine if field needs Kysely generated wrapper
 * Regular fields with @default are optional on insert
 */
export function needsGenerated(field: DMMF.Field) {
  return hasDefaultValue(field) && !isIdField(field);
}

/**
 * Apply Kysely helper wrappers to a field type
 */
export function applyKyselyHelpers(fieldType: string, field: DMMF.Field) {
  if (needsColumnType(field)) {
    return `columnType(${fieldType}, Schema.Never, Schema.Never)`;
  } else if (needsGenerated(field)) {
    return `generated(${fieldType})`;
  }
  return fieldType;
}

/**
 * Apply @map directive wrapper if field has different DB name
 */
export function applyMapDirective(fieldType: string, field: DMMF.Field) {
  const dbName = getFieldDbName(field);
  if (field.dbName && field.dbName !== field.name) {
    return `Schema.propertySignature(${fieldType}).pipe(Schema.fromKey("${dbName}"))`;
  }
  return fieldType;
}

/**
 * Build complete field type with Kysely helpers and @map
 * Order: base type � Kysely helpers � @map wrapper
 */
export function buildKyselyFieldType(
  baseFieldType: string,
  field: DMMF.Field,
) {
  // Step 1: Apply Kysely helpers (domain transformation)
  let fieldType = applyKyselyHelpers(baseFieldType, field);

  // Step 2: Apply @map wrapper (structural transformation)
  fieldType = applyMapDirective(fieldType, field);

  return fieldType;
}

/**
 * Generate DB interface entry for a model
 */
export function generateDBInterfaceEntry(model: DMMF.Model) {
  const tableName = model.dbName || model.name;
  const baseSchemaName = `_${model.name}`;
  return `  ${tableName}: Schema.Schema.Encoded<typeof ${baseSchemaName}>;`;
}

/**
 * Generate complete DB interface
 */
export function generateDBInterface(models: readonly DMMF.Model[]) {
  const tableEntries = Array.from(models)
    .map(generateDBInterfaceEntry)
    .join('\n');

  return `// Kysely Database Interface
export interface DB {
${tableEntries}
}`;
}
