import type { TableModel } from '../prisma/model.js';
import { generateDBInterface } from './type.js';

export class KyselyGenerator {
  generateDBInterface(models: readonly TableModel[]): string {
    return generateDBInterface(models);
  }

  generateIndexFile(hasEnums: boolean): string {
    return `${hasEnums ? 'export * from "./enums.js";\n' : ''}export * from "./types.js";`;
  }
}
