import type { DMMF } from '@prisma/generator-helper';
import { getEnumValueDbName } from '../prisma/enum.js';
import { generateFileHeader } from '../utils/codegen.js';
import { toPascalCase } from '../utils/naming.js';

/**
 * Generate an Effect `Schema.Literals` for a Prisma enum — the canonical Effect-v4 way to model a
 * finite string set (Effect's own modules use `Schema.Literals` for status sets; `Schema.Enum` is
 * reserved for interop with a pre-existing TS enum object). The result:
 * - `Type` and `Encoded` are BOTH the string literal union, so the value works as a plain string
 *   in queries (Kysely-friendly) and as a literal domain type — no TS-enum value juggling.
 * - The PascalCase export IS the Schema (usable directly in `Schema.Struct` fields).
 * - A type alias of the same name (value + type pattern).
 */
export function generateEnumSchema(enumDef: DMMF.DatamodelEnum) {
  const pascalName = toPascalCase(enumDef.name);
  const literals = enumDef.values.map((v) => `"${getEnumValueDbName(v)}"`).join(', ');

  return `export const ${pascalName} = Schema.Literals([${literals}]);
export type ${pascalName} = typeof ${pascalName}.Type;`;
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
