import type { DMMF } from '@prisma/generator-helper';
import { generateEnumsFile } from './enum';
import { buildFieldType } from './type';
import { getFieldDbName } from '../prisma/type';

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
   * Generate base schema for a model (_ModelName)
   */
  generateBaseSchema(model: DMMF.Model, fields: readonly DMMF.Field[]) {
    const fieldDefinitions = Array.from(fields)
      .map((field) => {
        const fieldType = buildFieldType(field, this.dmmf);
        return `  ${field.name}: ${fieldType}`;
      })
      .join(',\n');

    const baseSchemaName = `_${model.name}`;

    return `// ${model.name} Base Schema
export const ${baseSchemaName} = Schema.Struct({
${fieldDefinitions}
});`;
  }

  /**
   * Generate operational schemas (ModelName.Selectable, etc.)
   */
  generateOperationalSchemas(model: DMMF.Model) {
    const baseSchemaName = `_${model.name}`;
    const operationalSchemaName = model.name;

    return `export const ${operationalSchemaName} = getSchemas(${baseSchemaName});`;
  }

  /**
   * Generate TypeScript type exports
   */
  generateTypeExports(model: DMMF.Model) {
    const name = model.name;
    return `export type ${name}Select = Schema.Schema.Type<typeof ${name}.Selectable>;
export type ${name}Insert = Schema.Schema.Type<typeof ${name}.Insertable>;
export type ${name}Update = Schema.Schema.Type<typeof ${name}.Updateable>;`;
  }

  /**
   * Generate complete model schema (base + operational + types)
   */
  generateModelSchema(model: DMMF.Model, fields: DMMF.Field[]) {
    const baseSchema = this.generateBaseSchema(model, fields);
    const operationalSchema = this.generateOperationalSchemas(model);
    const typeExports = this.generateTypeExports(model);

    return `${baseSchema}\n\n${operationalSchema}\n\n${typeExports}`;
  }

  /**
   * Generate types.ts file header
   */
  generateTypesHeader(hasEnums: boolean) {
    const header = `/**
 * Generated: ${new Date().toISOString()}
 * DO NOT EDIT MANUALLY
 */`;

    const imports = [
      `import { Schema } from "effect";`,
      `import { columnType, generated, getSchemas } from "prisma-effect-kysely";`,
    ];

    if (hasEnums) {
      const enumNames = this.dmmf.datamodel.enums.map((e) => e.name).join(', ');
      imports.push(`import { ${enumNames} } from "./enums";`);
    }

    return `${header}\n\n${imports.join('\n')}`;
  }
}
