import type { DMMF } from '@prisma/generator-helper';
import { buildKyselyFieldType, generateDBInterface } from './type';
import { buildFieldType } from '../effect/type';
import { getModelDbName } from '../prisma/type';

/**
 * Kysely domain generator - orchestrates Kysely integration
 * Applies Kysely helpers to Effect schemas
 */
export class KyselyGenerator {
  constructor(private readonly dmmf: DMMF.Document) {}

  /**
   * Generate field definition with Kysely helpers applied
   */
  generateFieldWithKysely(field: DMMF.Field) {
    // Get base Effect type
    const baseFieldType = buildFieldType(field, this.dmmf);

    // Apply Kysely helpers and @map
    const kyselyFieldType = buildKyselyFieldType(baseFieldType, field);

    return `  ${field.name}: ${kyselyFieldType}`;
  }

  /**
   * Generate all fields for a model with Kysely integration
   */
  generateModelFields(fields: readonly DMMF.Field[]) {
    return Array.from(fields).map((field) => this.generateFieldWithKysely(field)).join(',\n');
  }

  /**
   * Generate DB interface for all models
   */
  generateDBInterface(models: readonly DMMF.Model[]) {
    return generateDBInterface(models);
  }

  /**
   * Generate index.ts re-export file
   */
  generateIndexFile() {
    return `export * from "./enums";\nexport * from "./types";`;
  }
}
