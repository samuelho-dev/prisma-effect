import type { EnumModel } from '../prisma/model.js';
import { generateFileHeader } from '../utils/codegen.js';

export function generateEnumSchema(enumModel: EnumModel): string {
  const literals = enumModel.values.map((value) => JSON.stringify(value)).join(', ');
  return `export const ${enumModel.schemaName} = Schema.Literals([${literals}]);
export type ${enumModel.schemaName} = typeof ${enumModel.schemaName}.Type;`;
}

export function generateEnumsFile(enums: readonly EnumModel[]): string {
  const enumSchemas = enums.map(generateEnumSchema).join('\n\n');
  return `${generateFileHeader()}\n\nimport { Schema } from "effect";\n\n${enumSchemas}`;
}
