import type { DMMF } from '@prisma/generator-helper';
import * as PrismaEnum from './enum';
import * as PrismaType from './type';

/**
 * Prisma domain generator - orchestrates DMMF parsing and extraction
 * No schema generation here, just native Prisma data extraction
 */
export class PrismaGenerator {
  constructor(private readonly dmmf: DMMF.Document) {}

  /**
   * Get all enums from DMMF
   */
  getEnums(): readonly DMMF.DatamodelEnum[] {
    return PrismaEnum.extractEnums(this.dmmf);
  }

  /**
   * Get all models from DMMF (filtered and sorted)
   */
  getModels(): readonly DMMF.Model[] {
    const filtered = PrismaType.filterInternalModels(
      this.dmmf.datamodel.models,
    );
    return PrismaType.sortModels(filtered);
  }

  /**
   * Get schema fields for a model (filtered and sorted)
   */
  getModelFields(model: DMMF.Model): readonly DMMF.Field[] {
    const filtered = PrismaType.filterSchemaFields(model.fields);
    return PrismaType.sortFields(filtered);
  }
}
