import type { DMMF } from '@prisma/generator-helper';
import type { JoinTableInfo } from '../prisma/relation.js';
import { generateDBInterface } from './type.js';

/**
 * Kysely domain generator - orchestrates Kysely integration
 */
export class KyselyGenerator {
  constructor(private readonly _dmmf: DMMF.Document) {}

  /**
   * Generate DB interface for all models and join tables
   */
  generateDBInterface(models: readonly DMMF.Model[], joinTables: readonly JoinTableInfo[] = []) {
    return generateDBInterface(models, joinTables);
  }

  /**
   * Generate index.ts re-export file
   */
  generateIndexFile() {
    return `export * from "./enums";\nexport * from "./types";`;
  }
}
