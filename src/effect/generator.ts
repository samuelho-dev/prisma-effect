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
   * Generate the main model schema
   * Exports as `User` directly (not `_User`)
   * Package's type utilities derive Insertable<User>, Selectable<User>
   */
  generateModelSchema(model: DMMF.Model, fields: readonly DMMF.Field[]) {
    const fkMap = buildForeignKeyMap(model, this.dmmf.datamodel.models);
    const name = toPascalCase(model.name);

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

    return `export const ${name} = Schema.Struct({
${fieldDefinitions}
})${encodeKeys};
export type ${name} = typeof ${name};`;
  }

  /**
   * Generate types.ts file header
   */
  generateTypesHeader(hasEnums: boolean) {
    const header = generateFileHeader();

    // Import runtime helpers from prisma-effect-kysely
    // columnType and generated are used for field type annotations
    const imports = [
      `import { Schema } from "effect";`,
      `import { columnType, generated, JsonValue } from "prisma-effect-kysely";`,
    ];

    if (hasEnums) {
      // Import PascalCase enum schemas
      const enumImports = this.dmmf.datamodel.enums.map((e) => toPascalCase(e.name)).join(', ');

      imports.push(`import { ${enumImports} } from "./enums";`);
    }

    return `${header}\n\n${imports.join('\n')}`;
  }

  /**
   * Generate schemas for all join tables
   */
  generateJoinTableSchemas(joinTables: JoinTableInfo[]) {
    return joinTables.map((jt) => generateJoinTableSchema(jt, this.dmmf)).join('\n\n');
  }
}
