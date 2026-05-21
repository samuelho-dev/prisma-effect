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
 * Compute the encoded-key rename for a `@map`'d field, or null when the field
 * keeps its own name.
 *
 * Effect 4 removed `Schema.propertySignature(...).pipe(Schema.fromKey(...))`.
 * Field-key renames are now expressed at the struct level via
 * `Schema.encodeKeys({ tsName: "db_name" })`, so `generateModelSchema` collects
 * these mappings and appends a single `encodeKeys` call to the struct.
 */
export function fieldKeyMapping(field: DMMF.Field): { tsName: string; dbName: string } | null {
  if (field.dbName && field.dbName !== field.name) {
    return { tsName: field.name, dbName: getFieldDbName(field) };
  }
  return null;
}

/**
 * Build complete field type with Kysely helpers (columnType / generated).
 *
 * `@map` renames are no longer applied here — they are collected by the caller
 * and emitted as a struct-level `Schema.encodeKeys(...)` (see `fieldKeyMapping`).
 * @param baseFieldType - The base Effect Schema type
 * @param field - The Prisma field
 * @param modelName - Optional model name for branded ID generation
 */
export function buildKyselyFieldType(baseFieldType: string, field: DMMF.Field, modelName?: string) {
  return applyKyselyHelpers(baseFieldType, field, modelName);
}

/**
 * Generate DB interface entry for a model
 * Uses Schema.Schema.Type<Model> to preserve phantom properties (__select__, __insert__, __update__)
 * that Kysely needs for correct INSERT/UPDATE type inference.
 *
 * Previously used Selectable<Model> but this stripped the phantom properties,
 * causing Kysely to require all fields on INSERT (including generated/read-only fields).
 */
export function generateDBInterfaceEntry(model: DMMF.Model) {
  const tableName = model.dbName || model.name;
  const modelName = toPascalCase(model.name);
  return `  ${tableName}: Schema.Schema.Type<typeof ${modelName}>;`;
}

/**
 * Generate DB interface entry for a join table
 * Uses Schema.Schema.Type to preserve phantom properties for Kysely compatibility
 */
export function generateJoinTableDBInterfaceEntry(joinTable: JoinTableInfo) {
  const { tableName, relationName } = joinTable;
  const schemaName = toPascalCase(relationName);
  // Use the ENCODED type (the `Schema.encodeKeys` mapping), NOT the decoded
  // `Schema.Schema.Type`. Kysely uses the DB-interface field names as literal SQL
  // column identifiers, and an implicit M:N join table's physical columns are
  // `A`/`B` (Prisma's convention) — not the semantic `*_id` names. The decoded
  // type has the semantic names (for `Schema.decode` output); the encoded type
  // keeps `A`/`B` with the branded `columnType` values, so queries like
  // `db.selectFrom('_x').where('_x.A', ...)` emit valid SQL while joins stay
  // type-safe against the parent table's branded id.
  return `  ${tableName}: Schema.Codec.Encoded<typeof ${schemaName}>;`;
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
