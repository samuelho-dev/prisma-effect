import type { TableField } from '../prisma/model.js';
import { toPascalCase } from '../utils/naming.js';

export const CODEC_TO_EFFECT: Record<string, string> = {
  'pg/text@1': 'Schema.String',
  'pg/varchar@1': 'Schema.String',
  'pg/char@1': 'Schema.String',
  'pg/inet@1': 'Schema.String',
  'pg/bit@1': 'Schema.String',
  'pg/varbit@1': 'Schema.String',
  'pg/enum@1': 'Schema.String',
  'pg/text-array@1': 'Schema.Array(Schema.String)',
  'pg/uuid@1': 'Schema.String.check(Schema.isUUID())',
  'pg/int@1': 'Schema.Number',
  'pg/int2@1': 'Schema.Number',
  'pg/int4@1': 'Schema.Number',
  'pg/int8number@1': 'Schema.Number',
  'pg/float@1': 'Schema.Number',
  'pg/float4@1': 'Schema.Number',
  'pg/float8@1': 'Schema.Number',
  'pg/int8@1': 'Schema.BigInt',
  'pg/unboundedint@1': 'Schema.BigInt',
  'pg/numeric@1': 'Schema.String',
  'pg/bool@1': 'Schema.Boolean',
  'pg/date-temporal@1': 'Schema.Date',
  'pg/timestamp-temporal@1': 'Schema.Date',
  'pg/timestamptz-temporal@1': 'Schema.Date',
  'pg/time-temporal@1': 'Schema.String',
  'pg/timetz@1': 'Schema.String',
  'pg/interval@1': 'Schema.String',
  'pg/date-string@1': 'Schema.String',
  'pg/timestamp-string@1': 'Schema.String',
  'pg/timestamptz-string@1': 'Schema.String',
  'pg/time-string@1': 'Schema.String',
  'pg/json@1': 'JsonValue',
  'pg/jsonb@1': 'JsonValue',
  'pg/bytea@1': 'Schema.Uint8Array',
};

export function isJsonCodec(codecId: string): boolean {
  return codecId === 'pg/json@1' || codecId === 'pg/jsonb@1';
}

export function baseFieldType(field: TableField, override: string | null): string {
  let fieldType: string;

  if (override) {
    fieldType = override;
  } else if (field.fkTarget) {
    fieldType = `${toPascalCase(field.fkTarget.idModel)}Id`;
  } else {
    switch (field.kind.type) {
      case 'enum':
        fieldType = toPascalCase(field.kind.enumName);
        break;
      case 'valueObject':
        fieldType = toPascalCase(field.kind.name);
        break;
      case 'union':
        fieldType = `Schema.Union([${field.kind.members
          .map((member) =>
            member.type === 'valueObject'
              ? toPascalCase(member.name)
              : (CODEC_TO_EFFECT[member.codecId] ?? 'Schema.Unknown')
          )
          .join(', ')}])`;
        break;
      case 'scalar':
        fieldType = CODEC_TO_EFFECT[field.codecId] ?? 'Schema.Unknown';
        break;
    }
  }

  if (field.dict) fieldType = `Schema.Record(Schema.String, ${fieldType})`;
  if (field.many) fieldType = `Schema.Array(${fieldType})`;
  if (field.nullable) fieldType = `Schema.NullOr(${fieldType})`;
  return fieldType;
}
