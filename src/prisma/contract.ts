import { readFile } from 'node:fs/promises';

import { Schema } from 'effect';

const ValueSetRef = Schema.Struct({
  plane: Schema.Literal('domain'),
  entityKind: Schema.Literal('enum'),
  entityName: Schema.String,
  namespaceId: Schema.String,
});

const ScalarType = Schema.Struct({
  kind: Schema.Literal('scalar'),
  codecId: Schema.String,
});

const ValueObjectType = Schema.Struct({
  kind: Schema.Literal('valueObject'),
  name: Schema.String,
});

const UnionType = Schema.Struct({
  kind: Schema.Literal('union'),
  members: Schema.Array(Schema.Union([ScalarType, ValueObjectType])),
});

const ContractField = Schema.Struct({
  nullable: Schema.Boolean,
  type: Schema.Union([ScalarType, ValueObjectType, UnionType]),
  many: Schema.optionalKey(Schema.Literal(true)),
  dict: Schema.optionalKey(Schema.Literal(true)),
  valueSet: Schema.optionalKey(ValueSetRef),
});

const ContractEnum = Schema.Struct({
  codecId: Schema.String,
  members: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.Union([Schema.String, Schema.Number, Schema.Boolean]),
    })
  ),
});

const ModelStorage = Schema.Struct({
  table: Schema.String,
  namespaceId: Schema.String,
  fields: Schema.Record(
    Schema.String,
    Schema.Struct({
      column: Schema.String,
    })
  ),
});

const ContractModel = Schema.Struct({
  fields: Schema.Record(Schema.String, ContractField),
  storage: ModelStorage,
});

const DomainNamespace = Schema.Struct({
  models: Schema.Record(Schema.String, ContractModel),
  valueObjects: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        fields: Schema.Record(Schema.String, ContractField),
      })
    )
  ),
  enum: Schema.optionalKey(Schema.Record(Schema.String, ContractEnum)),
});

const ColumnDefault = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('literal'),
    value: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal('function'),
    expression: Schema.String,
  }),
]);

const StorageColumn = Schema.Struct({
  codecId: Schema.String,
  nativeType: Schema.String,
  nullable: Schema.Boolean,
  many: Schema.optionalKey(Schema.Boolean),
  default: Schema.optionalKey(ColumnDefault),
});

const TableRef = Schema.Struct({
  columns: Schema.Array(Schema.String),
  namespaceId: Schema.String,
  tableName: Schema.String,
});

const StorageTable = Schema.Struct({
  columns: Schema.Record(Schema.String, StorageColumn),
  primaryKey: Schema.optionalKey(
    Schema.Struct({
      columns: Schema.Array(Schema.String),
    })
  ),
  foreignKeys: Schema.Array(
    Schema.Struct({
      source: TableRef,
      target: TableRef,
    })
  ),
});

const StorageNamespace = Schema.Struct({
  id: Schema.String,
  entries: Schema.Struct({
    table: Schema.optionalKey(Schema.Record(Schema.String, StorageTable)),
  }),
});

export const ContractSchema = Schema.Struct({
  schemaVersion: Schema.Literal('1'),
  targetFamily: Schema.Literal('sql'),
  target: Schema.String,
  domain: Schema.Struct({
    namespaces: Schema.Record(Schema.String, DomainNamespace),
  }),
  storage: Schema.Struct({
    namespaces: Schema.Record(Schema.String, StorageNamespace),
  }),
});

export type Contract = typeof ContractSchema.Type;

export function parseContract(json: unknown): Contract {
  return Schema.decodeUnknownSync(ContractSchema)(json);
}

export async function readContract(contractPath: string): Promise<Contract> {
  try {
    return parseContract(JSON.parse(await readFile(contractPath, 'utf8')));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Contract not found at ${contractPath}. Run "prisma contract emit" first.`, {
        cause: error,
      });
    }
    throw error;
  }
}
