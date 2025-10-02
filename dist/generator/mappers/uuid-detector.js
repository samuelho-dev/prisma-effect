"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUuidField = isUuidField;
/**
 * Type predicate to check if a value is a UUID default value
 * Validates structure and checks for UUID patterns without type coercion
 */
function isUuidDefaultValue(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value;
    if (candidate.name !== 'dbgenerated') {
        return false;
    }
    if (!Array.isArray(candidate.args)) {
        return false;
    }
    // Validate all array elements are strings
    if (!candidate.args.every((arg) => typeof arg === 'string')) {
        return false;
    }
    const argsString = candidate.args.join(' ');
    return argsString.includes('uuid') || argsString.includes('gen_random_uuid');
}
/**
 * Type-safe UUID field detection using complete DMMF type information
 * Uses a 4-tier detection strategy:
 * 1. Native type annotation (@db.Uuid)
 * 2. Documentation comments
 * 3. Default value patterns
 * 4. Field name patterns
 */
function isUuidField(field) {
    // 1. Check native type FIRST (most reliable indicator)
    // For @db.Uuid, nativeType is ['Uuid', []]
    if (field.nativeType && field.nativeType[0] === 'Uuid') {
        return true;
    }
    // 2. Check documentation for @db.Uuid attribute
    if (field.documentation?.includes('@db.Uuid')) {
        return true;
    }
    // 3. Check for UUID-like defaults on ID fields
    if (field.isId && field.hasDefaultValue && field.default) {
        if (isUuidDefaultValue(field.default)) {
            return true;
        }
    }
    // 4. Fallback: Check field name patterns
    const uuidFieldPatterns = [
        /^id$/, // Primary ID fields
        /_id$/, // Foreign key ID fields (user_id, product_id, etc.)
        /^.*_uuid$/, // Fields explicitly named with uuid suffix
        /^uuid$/, // Direct uuid fields
    ];
    return uuidFieldPatterns.some((pattern) => pattern.test(field.name));
}
//# sourceMappingURL=uuid-detector.js.map