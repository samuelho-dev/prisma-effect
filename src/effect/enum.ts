import type { DMMF } from '@prisma/generator-helper';
import { getEnumValueDbName } from '../prisma/enum.js';
import { generateFileHeader } from '../utils/codegen.js';
import { toPascalCase } from '../utils/naming.js';

/**
 * Generate TypeScript enum + Effect Schema.Enum wrapper
 *
 * Output pattern:
 * - Native TS enum with SCREAMING_SNAKE_CASE (internal, for Schema.Enum)
 * - PascalCase export IS the Schema (so it works in Schema.Struct)
 * - Type alias with same name (value + type pattern)
 */
export function generateEnumSchema(enumDef: DMMF.DatamodelEnum) {
  // PascalCase name is exported as BOTH the Schema value AND the type.
  const pascalName = toPascalCase(enumDef.name);
  // The native TS enum keeps its original Prisma name (usually SCREAMING_SNAKE).
  // But when that already equals the PascalCase const (e.g. `Role` -> `Role`),
  // TypeScript forbids the enum/const identifier from merging, so suffix the
  // enum with `Enum` (`Role` -> internal `RoleEnum`) to keep them distinct.
  const enumName = enumDef.name === pascalName ? `${pascalName}Enum` : enumDef.name;

  // Generate native TypeScript enum members
  const enumMembers = enumDef.values
    .map((v) => {
      const value = getEnumValueDbName(v);
      return `  ${v.name} = "${value}"`;
    })
    .join(',\n');

  // Export PascalCase as the Schema (not raw enum)
  // This allows PayoutStatus to be used directly in Schema.Struct fields
  // Also export type with same name for Insertable<User> pattern
  return `export enum ${enumName} {
${enumMembers}
}

export const ${pascalName} = Schema.Enum(${enumName});
export type ${pascalName} = Schema.Schema.Type<typeof ${pascalName}>;`;
}

/**
 * Generate all enum schemas as a single file content
 */
export function generateEnumsFile(enums: readonly DMMF.DatamodelEnum[]) {
  const header = generateFileHeader();
  const imports = `import { Schema } from "effect";`;
  const enumSchemas = enums.map(generateEnumSchema).join('\n\n');

  return `${header}\n\n${imports}\n\n${enumSchemas}`;
}
