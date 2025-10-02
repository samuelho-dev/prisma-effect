import type { DMMF } from '@prisma/generator-helper';
/**
 * Generates Effect Schema Literal types from Prisma enums
 */
export declare class EnumGenerator {
    /**
     * Generate a complete enums file with all enum schemas
     */
    generateFile(dmmf: DMMF.Document): string;
    /**
     * Generate auto-generated file header with timestamp
     */
    private generateHeader;
    /**
     * Generate import statements for Effect Schema
     */
    private generateImports;
    /**
     * Generate a single enum schema
     * Supports @map annotations for database-level enum values
     */
    private generateEnumSchema;
}
//# sourceMappingURL=enum-generator.d.ts.map