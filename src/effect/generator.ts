import type { DMMF } from '@prisma/generator-helper';
import { buildKyselyFieldType, fieldKeyMapping } from '../kysely/type.js';
import { buildForeignKeyMap, type JoinTableInfo } from '../prisma/relation.js';
import { isUuidField } from '../prisma/type.js';
import { generateFileHeader } from '../utils/codegen.js';
import { toPascalCase } from '../utils/naming.js';
import { generateEnumsFile } from './enum.js';
import { generateJoinTableSchema } from './join-table.js';
import { buildFieldType } from './type.js';

/**
 * Effect domain generator - orchestrates Effect Schema generation
 */
export class EffectGenerator {
  constructor(private readonly dmmf: DMMF.Document) {}

  /**
   * Generate enums.ts file content
   */
  generateEnums(enums: readonly DMMF.DatamodelEnum[]) {
    return generateEnumsFile(enums);
  }

  /**
   * Generate branded ID schema for a model
   * @returns The branded ID schema declaration + exported type, or null if no ID field
   */
  generateBrandedIdSchema(model: DMMF.Model, fields: readonly DMMF.Field[]) {
    const idField = fields.find((f) => f.isId);
    if (!idField) {
      return null;
    }

    const name = toPascalCase(model.name);
    const baseType = this.getIdBaseType(idField);

    // Export Id as both value and type with same name
    return `export const ${name}Id = ${baseType}.pipe(Schema.brand("${name}Id"));
export type ${name}Id = typeof ${name}Id.Type;`;
  }

  /**
   * Determine the base Effect Schema type for an ID field.
   * UUID strings → Schema.String.check(Schema.isUUID()), integers → Schema.Int,
   * bigints → Schema.BigInt, all others → Schema.String
   */
  private getIdBaseType(field: DMMF.Field) {
    if (isUuidField(field)) return 'Schema.String.check(Schema.isUUID())';
    if (field.type === 'Int') return 'Schema.Int';
    if (field.type === 'BigInt') return 'Schema.BigInt';
    return 'Schema.String';
  }

  /**
   * Generate the main model schema.
   *
   * Emits TWO schemas per table (Kysely's `PersonTable` → `Person` convention):
   * - `{Name}Table` — the wrapper-laden struct (columnType/generated intact).
   *   Drives the Kysely `DB` interface; its ColumnType/Generated brands give
   *   `.insertInto`/`.updateTable` their insert/update variance. NEVER a query
   *   result type (Kysely's own rule).
   * - `{Name}` — the bare SELECT row, `Selectable({Name}Table)` (wrappers
   *   stripped). This is the composable value+type-merged schema contracts,
   *   RPC outputs, and decode boundaries bind to. Derived ONCE here so no
   *   consumer re-wraps `Selectable(...)`.
   */
  generateModelSchema(model: DMMF.Model, fields: readonly DMMF.Field[]) {
    const fkMap = buildForeignKeyMap(model, this.dmmf.datamodel.models);
    const name = toPascalCase(model.name);
    const tableName = `${name}Table`;

    // Collect @map renames; they are applied once as a struct-level encodeKeys
    // (Effect 4 removed the per-field Schema.fromKey pattern).
    const keyMappings: Array<{ tsName: string; dbName: string }> = [];

    const fieldDefinitions = fields
      .map((field) => {
        // Get base Effect type
        const baseType = buildFieldType(field, this.dmmf, fkMap);
        // Apply Kysely helpers (columnType, generated)
        // Pass model.name so @id fields use the model's branded ID type
        const fieldType = buildKyselyFieldType(baseType, field, model.name);

        const mapping = fieldKeyMapping(field);
        if (mapping) keyMappings.push(mapping);

        return `  ${field.name}: ${fieldType}`;
      })
      .join(',\n');

    const encodeKeys =
      keyMappings.length > 0
        ? `.pipe(Schema.encodeKeys({ ${keyMappings
            .map((m) => `${m.tsName}: "${m.dbName}"`)
            .join(', ')} }))`
        : '';

    return `export const ${tableName} = Schema.Struct({
${fieldDefinitions}
})${encodeKeys};
export const ${name} = Selectable(${tableName});
export type ${name} = typeof ${name}.Type;`;
  }

  /**
   * Generate types.ts file header
   */
  generateTypesHeader(hasEnums: boolean) {
    const header = generateFileHeader();

    // Import runtime helpers from prisma-effect-kysely.
    // columnType/generated wrap the *Table struct fields (Kysely variance);
    // Selectable strips them to produce the bare SELECT row schema.
    const imports = [
      `import { Schema } from "effect";`,
      `import { columnType, generated, JsonValue, Selectable } from "prisma-effect-kysely";`,
    ];

    if (hasEnums) {
      // Import PascalCase enum schemas
      const enumImports = this.dmmf.datamodel.enums.map((e) => toPascalCase(e.name)).join(', ');

      // Emit a `.js` extension so the generated file resolves under NodeNext / verbatimModuleSyntax
      // (TS2835). Bundler/Node16 resolution also accept the explicit extension, so this is strictly
      // more compatible than the bare specifier.
      imports.push(`import { ${enumImports} } from "./enums.js";`);
    }

    return `${header}\n\n${imports.join('\n')}`;
  }

  /**
   * Generate schemas for all join tables
   */
  generateJoinTableSchemas(joinTables: readonly JoinTableInfo[]) {
    return joinTables.map((jt) => generateJoinTableSchema(jt, this.dmmf)).join('\n\n');
  }
}
