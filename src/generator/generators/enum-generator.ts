import type { DMMF } from '@prisma/generator-helper';

/**
 * Generates Effect Schema Literal types from Prisma enums
 */
export class EnumGenerator {
  /**
   * Generate a complete enums file with all enum schemas
   */
  generateFile(dmmf: DMMF.Document) {
    const header = this.generateHeader();
    const imports = this.generateImports();
    const enumSchemas = dmmf.datamodel.enums
      .map((enumDef) => this.generateEnumSchema(enumDef))
      .join('\n\n');

    return `${header}\n\n${imports}\n\n${enumSchemas}`;
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
   * Generate import statements for Effect Schema
   */
  private generateImports() {
    return `import { Schema } from "effect";`;
  }

  /**
   * Generate a single enum schema
   * Supports @map annotations for database-level enum values
   */
  private generateEnumSchema(enumDef: DMMF.DatamodelEnum) {
    // Use @map values if available, otherwise use enum names
    const enumValues = enumDef.values
      .map((v) => {
        // Check if there's a dbName (from @map annotation)
        const value = v.dbName || v.name;
        return `"${value}"`;
      })
      .join(', ');

    // Use exact enum name from Prisma, no conversions
    const enumName = enumDef.name;

    return `export const ${enumName} = Schema.Literal(${enumValues});

export type ${enumName} = Schema.Schema.Type<typeof ${enumName}>;`;
  }
}
