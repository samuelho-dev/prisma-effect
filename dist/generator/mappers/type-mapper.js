"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeMapper = void 0;
const uuid_detector_1 = require("./uuid-detector");
/**
 * Centralized mapping from Prisma types to Effect Schema types
 */
const PRISMA_TO_EFFECT_SCHEMA = {
    String: 'Schema.String',
    Int: 'Schema.Number',
    Float: 'Schema.Number',
    BigInt: 'Schema.BigInt',
    Decimal: 'Schema.String', // For precision
    Boolean: 'Schema.Boolean',
    DateTime: 'Schema.Date',
    Json: 'Schema.Unknown', // Safe unknown type
    Bytes: 'Schema.Uint8Array',
};
/**
 * Maps Prisma field types to Effect Schema type strings with Kysely integration
 */
class TypeMapper {
    constructor(dmmf) {
        this.dmmf = dmmf;
    }
    /**
     * Get metadata about how to transform a field type, including:
     * - Base type mapping (with UUID detection, arrays, optionals)
     * - Whether it needs Kysely generated() wrapper
     * - Whether it needs Kysely columnType() wrapper
     */
    getEffectSchemaType(field) {
        let baseType = this.getBaseType(field);
        // Handle arrays
        if (field.isList) {
            baseType = `Schema.Array(${baseType})`;
        }
        // Handle optional fields (only if NOT already has @default)
        if (!field.isRequired && !field.hasDefaultValue) {
            baseType = `Schema.UndefinedOr(${baseType})`;
        }
        // Kysely integration metadata
        let needsGenerated = false;
        let needsColumnType = false;
        if (field.hasDefaultValue) {
            if (field.isId) {
                // ID fields with @default are read-only (can't be inserted/updated)
                needsColumnType = true;
            }
            else {
                // Regular fields with @default use generated() - makes insert optional
                needsGenerated = true;
            }
        }
        return {
            baseType,
            needsGenerated,
            needsColumnType,
        };
    }
    /**
     * Get the base Effect Schema type for a field
     */
    getBaseType(field) {
        // Handle String type with UUID detection
        if (field.type === 'String' && (0, uuid_detector_1.isUuidField)(field)) {
            return 'Schema.UUID';
        }
        // Handle scalar types with type-safe lookup using type guard
        const fieldType = field.type;
        if (this.isPrismaScalarType(fieldType)) {
            return PRISMA_TO_EFFECT_SCHEMA[fieldType];
        }
        // Check if it's an enum
        const enumDef = this.dmmf.datamodel.enums.find((e) => e.name === field.type);
        if (enumDef) {
            // Use imported enum schema directly (unquoted)
            return field.type;
        }
        // Fallback to Unknown for unsupported types
        return 'Schema.Unknown';
    }
    /**
     * Type guard to check if a string is a valid PrismaScalarType
     */
    isPrismaScalarType(type) {
        return type in PRISMA_TO_EFFECT_SCHEMA;
    }
}
exports.TypeMapper = TypeMapper;
//# sourceMappingURL=type-mapper.js.map