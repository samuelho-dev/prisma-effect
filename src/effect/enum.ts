import type { DMMF } from '@prisma/generator-helper';
import { getEnumValueDbName } from '../prisma/enum';

/**
 * Generate Effect Schema Literal enum code
 */
export function generateEnumSchema(enumDef: DMMF.DatamodelEnum) {
  const enumValues = enumDef.values
    .map((v) => {
      const value = getEnumValueDbName(v);
      return `"${value}"`;
    })
    .join(', ');

  const enumName = enumDef.name;

  return `export const ${enumName} = Schema.Literal(${enumValues});

export type ${enumName} = Schema.Schema.Type<typeof ${enumName}>;`;
}

/**
 * Generate all enum schemas as a single file content
 */
export function generateEnumsFile(enums: readonly DMMF.DatamodelEnum[]) {
  const header = `/**
 * Generated: ${new Date().toISOString()}
 * DO NOT EDIT MANUALLY
 */`;

  const imports = `import { Schema } from "effect";`;

  const enumSchemas = Array.from(enums).map(generateEnumSchema).join('\n\n');

  return `${header}\n\n${imports}\n\n${enumSchemas}`;
}
