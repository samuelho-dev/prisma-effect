import type { DMMF } from '@prisma/generator-helper';
/**
 * Metadata about how to transform a field type
 */
export interface FieldTypeMetadata {
    baseType: string;
    needsGenerated: boolean;
    needsColumnType: boolean;
}
/**
 * Maps Prisma field types to Effect Schema type strings with Kysely integration
 */
export declare class TypeMapper {
    private readonly dmmf;
    constructor(dmmf: DMMF.Document);
    /**
     * Get metadata about how to transform a field type, including:
     * - Base type mapping (with UUID detection, arrays, optionals)
     * - Whether it needs Kysely generated() wrapper
     * - Whether it needs Kysely columnType() wrapper
     */
    getEffectSchemaType(field: DMMF.Field): FieldTypeMetadata;
    /**
     * Get the base Effect Schema type for a field
     */
    private getBaseType;
    /**
     * Type guard to check if a string is a valid PrismaScalarType
     */
    private isPrismaScalarType;
}
//# sourceMappingURL=type-mapper.d.ts.map