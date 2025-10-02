import type { DMMF } from '@prisma/generator-helper';
import { TypeMapper } from '../mappers/type-mapper';

/**
 * Generates Effect Schema Struct types from Prisma models with Kysely integration
 */
export class TypeGenerator {
  private readonly typeMapper: TypeMapper;

  constructor(dmmf: DMMF.Document) {
    this.typeMapper = new TypeMapper(dmmf);
  }

  /**
   * Generate a complete types file with all model schemas and DB interface
   */
  generateFile(dmmf: DMMF.Document) {
    const header = this.generateHeader();
    const imports = this.generateImports(dmmf);
    const modelSchemas = this.generateAllModelSchemas(dmmf);
    const dbInterface = this.generateDBInterface(dmmf);

    return `${header}\n\n${imports}\n\n${modelSchemas}\n\n${dbInterface}`;
  }

  /**
   * Generate auto-generated file header with timestamp
   */
  private generateHeader() {
    return `/**
 * Generated: ${new Date().toISOString()}
 * DO NOT EDIT MANUALLY
 */`;
  }

  /**
   * Generate import statements including enums and kysely helpers from package
   */
  private generateImports(dmmf: DMMF.Document) {
    const imports: string[] = [
      `import { Schema } from "effect";`,
      `import { columnType, generated, getSchemas } from "prisma-effect-kysely";`,
    ];

    // Import enums if they exist
    const enumImports = dmmf.datamodel.enums
      .map((enumDef) => enumDef.name)
      .join(', ');

    if (enumImports) {
      imports.push(`import { ${enumImports} } from "./enums";`);
    }

    return imports.join('\n');
  }

  /**
   * Generate all model schemas, sorted alphabetically for consistency
   */
  private generateAllModelSchemas(dmmf: DMMF.Document) {
    return dmmf.datamodel.models
      .filter((model) => !model.name.startsWith('_')) // Skip internal models
      .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically
      .map((model) => this.generateModelSchema(model))
      .join('\n\n');
  }

  /**
   * Generate schema for a single model
   * Creates base schema (_ModelName) and operational schemas (ModelName)
   */
  private generateModelSchema(model: DMMF.Model) {
    const fields = this.generateModelFields(model);
    const baseSchemaName = `_${model.name}`;
    const operationalSchemaName = model.name;

    // Generate base schema definition
    const baseSchema = `// ${model.name} Base Schema
export const ${baseSchemaName} = Schema.Struct({
${fields}
});`;

    // Generate operational schemas using getSchemas
    const operationalSchema = `export const ${operationalSchemaName} = getSchemas(${baseSchemaName});`;

    // Generate TypeScript types for Select/Insert/Update
    const typeExports = `export type ${operationalSchemaName}Select = Schema.Schema.Type<typeof ${operationalSchemaName}.Selectable>;
export type ${operationalSchemaName}Insert = Schema.Schema.Type<typeof ${operationalSchemaName}.Insertable>;
export type ${operationalSchemaName}Update = Schema.Schema.Type<typeof ${operationalSchemaName}.Updateable>;`;

    return `${baseSchema}\n\n${operationalSchema}\n\n${typeExports}`;
  }

  /**
   * Generate fields for a model schema
   * Handles @map directives, filtering, and sorting
   * Applies transforms in correct order: base type → Kysely helpers → @map
   */
  private generateModelFields(model: DMMF.Model) {
    return [...model.fields]
      .filter((field) => field.kind === 'scalar' || field.kind === 'enum') // Exclude relation fields
      .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically
      .map((field) => {
        // STEP 1: Get metadata from TypeMapper (base type + Kysely needs)
        const metadata = this.typeMapper.getEffectSchemaType(field);
        let fieldType = metadata.baseType;

        // STEP 2: Apply Kysely helpers FIRST (domain transformation)
        if (metadata.needsColumnType) {
          fieldType = `columnType(${fieldType}, Schema.Never, Schema.Never)`;
        } else if (metadata.needsGenerated) {
          fieldType = `generated(${fieldType})`;
        }

        // STEP 3: THEN apply @map wrapper (structural transformation)
        if (field.dbName && field.dbName !== field.name) {
          fieldType = `Schema.propertySignature(${fieldType}).pipe(Schema.fromKey("${field.dbName}"))`;
        }

        return `  ${field.name}: ${fieldType}`;
      })
      .join(',\n');
  }

  /**
   * Generate Kysely Database interface with all model tables
   */
  private generateDBInterface(dmmf: DMMF.Document) {
    const tableEntries = dmmf.datamodel.models
      .filter((model) => !model.name.startsWith('_')) // Skip internal models
      .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically
      .map((model) => {
        // Get table name from @@map or use model name
        const tableName = model.dbName || model.name;
        const baseSchemaName = `_${model.name}`;
        return `  ${tableName}: Schema.Schema.Encoded<typeof ${baseSchemaName}>;`;
      })
      .join('\n');

    return `// Kysely Database Interface
export interface DB {
${tableEntries}
}`;
  }
}
