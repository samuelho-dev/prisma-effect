import type { DMMF } from '@prisma/generator-helper';
import type { JoinTableInfo } from '../prisma/relation.js';
import { getFieldDbName, hasDefaultValue, isIdField } from '../prisma/type.js';
import { toPascalCase } from '../utils/naming.js';

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
 * @param fieldType - The base Effect Schema type
 * @param field - The Prisma field
 * @param modelName - Optional model name for branded ID generation
 */
export function applyKyselyHelpers(fieldType: string, field: DMMF.Field, modelName?: string) {
  if (needsColumnType(field)) {
    // For @id fields, use the model's branded ID type instead of Schema.UUID
    const idType = modelName ? `${toPascalCase(modelName)}Id` : fieldType;
    return `columnType(${idType}, Schema.Never, Schema.Never)`;
  } else if (needsGenerated(field)) {
    return `generated(${fieldType})`;
  }
  // Wrap Json fields with columnType so Kysely's distributive InsertType/UpdateType
  // takes the ColumnType fast path instead of recursively expanding JsonValue
  if (field.type === 'Json') {
    return `columnType(${fieldType}, ${fieldType}, ${fieldType})`;
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
 * Order: base type → Kysely helpers → @map wrapper
 * @param baseFieldType - The base Effect Schema type
 * @param field - The Prisma field
 * @param modelName - Optional model name for branded ID generation
 */
export function buildKyselyFieldType(baseFieldType: string, field: DMMF.Field, modelName?: string) {
  // Step 1: Apply Kysely helpers (domain transformation)
  let fieldType = applyKyselyHelpers(baseFieldType, field, modelName);

  // Step 2: Apply @map wrapper (structural transformation)
  fieldType = applyMapDirective(fieldType, field);

  return fieldType;
}

/**
 * Generate DB interface entry for a model
 *
 * Uses Schema.Schema.Type<Model> for regular tables. The Type side
 * preserves branded IDs (e.g. `string & Brand<"SellerId">`), which is
 * what Kysely's Selectable/Insertable/Updateable consumers want.
 *
 * Regular tables don't use Schema.fromKey, so `Type === Encoded` for
 * column names — both shapes have the same key structure. The
 * difference is at the leaf level: Type preserves brands and refinements,
 * Encoded strips them. For a SQL contract, brand info is harmless and
 * useful (Kysely passes it through to consumers).
 *
 * Join tables are different — see generateJoinTableDBInterfaceEntry —
 * because they use Schema.fromKey to remap column names, and only
 * Encoded preserves the real DB column names.
 *
 * ColumnType<S, I, U> brand preserves the __select__/__insert__/__update__
 * phantom properties on both sides, so INSERT/UPDATE inference works.
 */
export function generateDBInterfaceEntry(model: DMMF.Model) {
  const tableName = model.dbName || model.name;
  const modelName = toPascalCase(model.name);
  return `  ${tableName}: Schema.Schema.Type<typeof ${modelName}>;`;
}

/**
 * Generate DB interface entry for a join table
 *
 * Critical: must use Schema.Schema.Encoded so the Kysely DB interface
 * exposes Prisma's real `A`/`B` column names. Schema.fromKey mapping
 * (`product_id` -> `A`) only applies during Effect Schema decode/encode;
 * Kysely passes column names directly to Postgres, so the TS interface
 * has to match the DB exactly. Decode through the Effect schema in
 * application code if you want the semantic field names.
 */
export function generateJoinTableDBInterfaceEntry(joinTable: JoinTableInfo) {
  const { tableName, relationName } = joinTable;
  const schemaName = toPascalCase(relationName);
  return `  ${tableName}: Schema.Schema.Encoded<typeof ${schemaName}>;`;
}

/**
 * Generate complete DB interface including join tables
 */
export function generateDBInterface(
  models: readonly DMMF.Model[],
  joinTables: JoinTableInfo[] = []
) {
  const modelEntries = Array.from(models).map(generateDBInterfaceEntry).join('\n');

  const joinTableEntries =
    joinTables.length > 0
      ? `\n${joinTables.map(generateJoinTableDBInterfaceEntry).join('\n')}`
      : '';

  return `// Kysely Database Interface
export interface DB {
${modelEntries}${joinTableEntries}
}`;
}
