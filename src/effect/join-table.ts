import type { DMMF } from '@prisma/generator-helper';
import type { JoinTableInfo } from '../prisma/relation.js';
import { toPascalCase, toSnakeCase } from '../utils/naming.js';

/**
 * Generate Effect Schema for an implicit many-to-many join table
 *
 * Structure:
 * - Direct export with semantic snake_case field names
 * - Maps TypeScript names to database A/B columns using Schema.encodeKeys
 * - Uses columnType for read-only foreign keys (can't insert/update join table rows directly)
 * - No type exports - consumers use type utilities: Selectable<JoinTable>
 *
 * Example:
 * - Database columns: A, B (Prisma requirement for implicit many-to-many)
 * - TypeScript fields: product_id, product_tag_id (semantic names)
 * - Types: columnType(ProductId, Schema.Never, Schema.Never) (read-only, branded)
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

  // Use columnType for read-only FK fields (can't insert/update join table rows directly).
  // The struct uses semantic field names; Schema.encodeKeys renames them to the
  // database A/B columns on the encoded side (Effect 4 replacement for the old
  // Schema.propertySignature(...).pipe(Schema.fromKey(...)) pattern).
  const columnAField = `  ${columnAFieldName}: columnType(${modelASchemaType}, Schema.Never, Schema.Never)`;
  const columnBField = `  ${columnBFieldName}: columnType(${modelBSchemaType}, Schema.Never, Schema.Never)`;

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
