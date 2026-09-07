import { isJsonCodec } from '../effect/type.js';
import type { TableField, TableModel } from '../prisma/model.js';

export function applyKyselyHelpers(
  fieldType: string,
  field: TableField,
  idType: string | undefined
): string {
  if (field.isPrimaryKey && idType !== undefined) {
    return field.hasStorageDefault
      ? `columnType(${idType}, Schema.Never, Schema.Never)`
      : `columnType(${idType}, ${idType}, Schema.Never)`;
  }
  if (field.hasStorageDefault) return `generated(${fieldType})`;
  if (field.kind.type === 'scalar' && isJsonCodec(field.codecId)) {
    return `columnType(${fieldType}, ${fieldType}, ${fieldType})`;
  }
  return fieldType;
}

export function generateDBInterface(models: readonly TableModel[]): string {
  const entries = models
    .map((model) => {
      const key = model.dbKey.includes('.') ? JSON.stringify(model.dbKey) : model.dbKey;
      return `  ${key}: Schema.Schema.Type<typeof ${model.schemaName}Table>;`;
    })
    .join('\n');

  return `// Kysely Database Interface
export interface DB {
${entries}
}`;
}
