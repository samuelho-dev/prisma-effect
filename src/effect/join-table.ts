import type { DMMF } from '@prisma/generator-helper';
import type { JoinTableInfo } from '../prisma/relation.js';
import { toPascalCase, toSnakeCase } from '../utils/naming.js';

/**
 * Generate Effect Schema for an implicit many-to-many join table
 *
 * Structure:
 * - Direct export with semantic snake_case field names
 * - Maps TypeScript names to database A/B columns using Schema.encodeKeys
 * - Uses columnType(Id, Id, Never) for the FK columns: provided on INSERT (you
 *   supply both foreign keys when linking a row) but read-only on UPDATE — a
 *   composite-PK join row is inserted or deleted, never updated in place
 * - No type exports - consumers use type utilities: Selectable<JoinTable>
 *
 * Example:
 * - Database columns: A, B (Prisma requirement for implicit many-to-many)
 * - TypeScript fields: product_id, product_tag_id (semantic names)
 * - Types: columnType(ProductId, ProductId, Schema.Never) (insertable, read-only on update, branded)
 */
export function generateJoinTableSchema(joinTable: JoinTableInfo, _dmmf: DMMF.Document) {
  const { tableName, relationName, modelA, modelB } = joinTable;

  // Generate semantic snake_case field names from model names
  // e.g., "Product" -> "product_id", "ProductTag" -> "product_tag_id"
  const columnAFieldName = `${toSnakeCase(modelA)}_id`;
  const columnBFieldName = `${toSnakeCase(modelB)}_id`;

  // Reference branded ID schemas (e.g., ProductId, SellerId) generated earlier in the output
  const modelASchemaType = `${toPascalCase(modelA)}Id`;
  const modelBSchemaType = `${toPascalCase(modelB)}Id`;

  // columnType(Id, Id, Never): the FK is supplied on INSERT and read-only on
  // UPDATE (composite-PK join rows are inserted/deleted, not updated).
  // The struct uses semantic field names; Schema.encodeKeys renames them to the
  // database A/B columns on the encoded side (Effect 4 replacement for the old
  // Schema.propertySignature(...).pipe(Schema.fromKey(...)) pattern).
  const columnAField = `  ${columnAFieldName}: columnType(${modelASchemaType}, ${modelASchemaType}, Schema.Never)`;
  const columnBField = `  ${columnBFieldName}: columnType(${modelBSchemaType}, ${modelBSchemaType}, Schema.Never)`;

  // Use PascalCase for exported name (consistent with regular models)
  const pascalName = toPascalCase(relationName);

  // Generate schema with semantic names mapped to A/B
  return `// ${tableName} Join Table Schema (Prisma implicit many-to-many)
// Database columns: A (${modelA}), B (${modelB})
// TypeScript fields: ${columnAFieldName}, ${columnBFieldName}
export const ${pascalName} = Schema.Struct({
${columnAField},
${columnBField},
}).pipe(Schema.encodeKeys({ ${columnAFieldName}: "A", ${columnBFieldName}: "B" }));
export type ${pascalName} = typeof ${pascalName};`;
}
