import type { DMMF } from '@prisma/generator-helper';
/**
 * Generates Effect Schema Struct types from Prisma models with Kysely integration
 */
export declare class TypeGenerator {
    private readonly typeMapper;
    constructor(dmmf: DMMF.Document);
    /**
     * Generate a complete types file with all model schemas and DB interface
     */
    generateFile(dmmf: DMMF.Document): string;
    /**
     * Generate auto-generated file header with timestamp
     */
    private generateHeader;
    /**
     * Generate import statements including enums and kysely helpers from package
     */
    private generateImports;
    /**
     * Generate all model schemas, sorted alphabetically for consistency
     */
    private generateAllModelSchemas;
    /**
     * Generate schema for a single model
     * Creates base schema (_ModelName) and operational schemas (ModelName)
     */
    private generateModelSchema;
    /**
     * Generate fields for a model schema
     * Handles @map directives, filtering, and sorting
     * Applies transforms in correct order: base type → Kysely helpers → @map
     */
    private generateModelFields;
    /**
     * Generate Kysely Database interface with all model tables
     */
    private generateDBInterface;
}
//# sourceMappingURL=type-generator.d.ts.map