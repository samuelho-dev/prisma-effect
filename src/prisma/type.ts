import type { DMMF } from '@prisma/generator-helper';

/**
 * Check if a field is a UUID, based solely on the authoritative DMMF type info.
 *
 * UUID is a *column type*, not a naming convention. Prisma always records a
 * `uuid` column as the `@db.Uuid` native type (a bare `String` maps to `text`),
 * so the native-type/`@db.Uuid` checks capture every genuine UUID column.
 *
 * A previous third tier inferred UUID from field-name patterns (`id`, `*_id`,
 * `*_uuid`, `uuid`). That was a false-positive generator: any external-system
 * identifier stored as text — Stripe IDs (`acct_…`, `cus_…`, `txn_…`), slugs,
 * provider/session references — ends in `_id` without being a UUID, yet got
 * `Schema.isUUID()` applied and then died at decode time on real data. The DMMF
 * already knows the real type, so the name guess only ever contradicted ground
 * truth. It has been removed; use `/// @db.Uuid` (or a real `@db.Uuid` column)
 * to mark UUID columns explicitly.
 */
export function isUuidField(field: DMMF.Field) {
  // Native type — the authoritative signal for a `uuid` column.
  if (field.nativeType?.[0] === 'Uuid') {
    return true;
  }

  // `@db.Uuid` recorded in the field's documentation/attributes.
  if (field.documentation?.includes('@db.Uuid')) {
    return true;
  }

  return false;
}

/**
 * Get the database column name for a field (respects @map directive)
 */
export function getFieldDbName(field: DMMF.Field) {
  return field.dbName ?? field.name;
}

/**
 * Check if field has a default value using native DMMF property
 */
export function hasDefaultValue(field: DMMF.Field) {
  return field.hasDefaultValue === true;
}

/**
 * Check if field is an ID field using native DMMF property
 */
export function isIdField(field: DMMF.Field) {
  return field.isId === true;
}

/**
 * Check if field is required using native DMMF property
 */
export function isRequiredField(field: DMMF.Field) {
  return field.isRequired === true;
}

/**
 * Check if field is a list/array using native DMMF property
 */
export function isListField(field: DMMF.Field) {
  return field.isList === true;
}

/**
 * Filter models to exclude internal models (starting with _)
 */
export function filterInternalModels(models: readonly DMMF.Model[]) {
  return models.filter((model) => !model.name.startsWith('_'));
}

/**
 * Filter fields to only include scalar and enum fields (exclude relations)
 */
export function filterSchemaFields(fields: readonly DMMF.Field[]) {
  return fields.filter((field) => field.kind === 'scalar' || field.kind === 'enum');
}

/**
 * Get the database table name for a model (respects @@map directive)
 */
export function getModelDbName(model: DMMF.Model) {
  return model.dbName ?? model.name;
}

/**
 * Sort models alphabetically for deterministic output
 */
export function sortModels(models: readonly DMMF.Model[]) {
  return models.slice().sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Sort fields alphabetically for deterministic output
 */
export function sortFields(fields: readonly DMMF.Field[]) {
  return fields.slice().sort((a, b) => a.name.localeCompare(b.name));
}
