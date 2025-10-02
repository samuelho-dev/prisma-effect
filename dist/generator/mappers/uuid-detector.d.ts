import type { DMMF } from '@prisma/generator-helper';
/**
 * Type-safe UUID field detection using complete DMMF type information
 * Uses a 4-tier detection strategy:
 * 1. Native type annotation (@db.Uuid)
 * 2. Documentation comments
 * 3. Default value patterns
 * 4. Field name patterns
 */
export declare function isUuidField(field: DMMF.Field): boolean;
//# sourceMappingURL=uuid-detector.d.ts.map