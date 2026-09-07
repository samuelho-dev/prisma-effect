import type { Contract } from '../../prisma/contract';

type DomainNamespace = Contract['domain']['namespaces'][string];
type DomainModel = DomainNamespace['models'][string];
type ContractField = DomainModel['fields'][string];
type StorageField = DomainModel['storage']['fields'][string];
type StorageNamespace = Contract['storage']['namespaces'][string];
type StorageTable = NonNullable<StorageNamespace['entries']['table']>[string];
type StorageColumn = StorageTable['columns'][string];
type ForeignKey = StorageTable['foreignKeys'][number];
type ContractEnum = NonNullable<DomainNamespace['enum']>[string];
type ValueObjectDefinition = NonNullable<DomainNamespace['valueObjects']>[string];
type EnumValue = ContractEnum['members'][number]['value'];

export type ModelField = ContractField & { column?: string };

interface ModelDefinition {
  name: string;
  table: string;
  columns: Record<string, StorageColumn>;
  fields: Record<string, ContractField>;
  storageFields: Record<string, StorageField>;
  primaryKey?: readonly string[];
  foreignKeys: readonly ForeignKey[];
}

interface EnumDefinition {
  name: string;
  definition: ContractEnum;
}

interface ValueObjectBuilder {
  name: string;
  definition: ValueObjectDefinition;
}

interface NamespaceDefinition {
  models?: readonly ModelDefinition[];
  enums?: readonly EnumDefinition[];
  valueObjects?: readonly ValueObjectBuilder[];
}

interface MakeContractOptions {
  namespaces: Record<string, NamespaceDefinition>;
}

export function model(
  name: string,
  options: {
    table: string;
    columns: Record<string, StorageColumn>;
    fields: Record<string, ModelField>;
    primaryKey?: readonly string[];
    foreignKeys?: readonly ForeignKey[];
  }
): ModelDefinition {
  const fields: Record<string, ContractField> = {};
  const storageFields: Record<string, StorageField> = {};

  for (const [fieldName, input] of Object.entries(options.fields)) {
    const { column = fieldName, ...field } = input;
    fields[fieldName] = field;
    storageFields[fieldName] = { column };
  }

  return {
    name,
    table: options.table,
    columns: options.columns,
    fields,
    storageFields,
    ...(options.primaryKey ? { primaryKey: options.primaryKey } : {}),
    foreignKeys: options.foreignKeys ?? [],
  };
}

export function enumDef(
  name: string,
  members: Record<string, EnumValue>,
  codecId = 'pg/enum@1'
): EnumDefinition {
  return {
    name,
    definition: {
      codecId,
      members: Object.entries(members).map(([memberName, value]) => ({
        name: memberName,
        value,
      })),
    },
  };
}

export function valueObject(
  name: string,
  fields: Record<string, ContractField>
): ValueObjectBuilder {
  return { name, definition: { fields } };
}

export function makeContract({ namespaces }: MakeContractOptions): Contract {
  const domainNamespaces: Record<string, DomainNamespace> = {};
  const storageNamespaces: Record<string, StorageNamespace> = {};

  for (const [namespaceId, namespace] of Object.entries(namespaces)) {
    const models: Record<string, DomainModel> = {};
    const tables: Record<string, StorageTable> = {};
    const enums: Record<string, ContractEnum> = {};
    const valueObjects: Record<string, ValueObjectDefinition> = {};

    for (const definition of namespace.models ?? []) {
      models[definition.name] = {
        fields: definition.fields,
        storage: {
          table: definition.table,
          namespaceId,
          fields: definition.storageFields,
        },
      };
      tables[definition.table] = {
        columns: definition.columns,
        foreignKeys: [...definition.foreignKeys],
        ...(definition.primaryKey ? { primaryKey: { columns: [...definition.primaryKey] } } : {}),
      };
    }

    for (const entry of namespace.enums ?? []) enums[entry.name] = entry.definition;
    for (const entry of namespace.valueObjects ?? []) {
      valueObjects[entry.name] = entry.definition;
    }

    domainNamespaces[namespaceId] = { models, enum: enums, valueObjects };
    storageNamespaces[namespaceId] = {
      id: namespaceId,
      entries: { table: tables },
    };
  }

  return {
    schemaVersion: '1',
    targetFamily: 'sql',
    target: 'postgres',
    domain: { namespaces: domainNamespaces },
    storage: { namespaces: storageNamespaces },
  };
}

export function scalar(codecId: string, nullable = false): ContractField {
  return { nullable, type: { kind: 'scalar', codecId } };
}

export function column(codecId: string, nativeType: string, nullable = false): StorageColumn {
  return { codecId, nativeType, nullable };
}

export function foreignKey(
  sourceNamespace: string,
  sourceTable: string,
  sourceColumn: string,
  targetNamespace: string,
  targetTable: string,
  targetColumn: string
): ForeignKey {
  return {
    source: {
      columns: [sourceColumn],
      namespaceId: sourceNamespace,
      tableName: sourceTable,
    },
    target: {
      columns: [targetColumn],
      namespaceId: targetNamespace,
      tableName: targetTable,
    },
  };
}

function namespaceContract(withLocalCollisions: boolean): Contract {
  const auditModels = withLocalCollisions
    ? [
        model('User', {
          table: 'audit_user',
          columns: { id: column('pg/uuid@1', 'uuid') },
          fields: { id: scalar('pg/uuid@1') },
          primaryKey: ['id'],
        }),
      ]
    : [];

  return makeContract({
    namespaces: {
      public: {
        enums: [enumDef('Role', { ADMIN: 'ADMIN', USER: 'USER' }, 'pg/text@1')],
        models: [
          model('User', {
            table: 'user',
            columns: { id: column('pg/uuid@1', 'uuid') },
            fields: { id: scalar('pg/uuid@1') },
            primaryKey: ['id'],
          }),
        ],
      },
      audit: {
        ...(withLocalCollisions
          ? { enums: [enumDef('Role', { LOCAL: 'LOCAL' }, 'pg/text@1')] }
          : {}),
        models: [
          ...auditModels,
          model('AuditLog', {
            table: 'audit_log',
            columns: {
              id: {
                ...column('pg/int4@1', 'integer'),
                default: { kind: 'function', expression: 'autoincrement()' },
              },
              actorId: column('pg/uuid@1', 'uuid'),
              role: column('pg/text@1', 'text'),
            },
            fields: {
              id: scalar('pg/int4@1'),
              actorId: scalar('pg/uuid@1'),
              role: {
                ...scalar('pg/text@1'),
                valueSet: {
                  plane: 'domain',
                  entityKind: 'enum',
                  entityName: 'Role',
                  namespaceId: 'public',
                },
              },
            },
            primaryKey: ['id'],
            foreignKeys: [foreignKey('audit', 'audit_log', 'actorId', 'public', 'user', 'id')],
          }),
        ],
      },
    },
  });
}

export function twoNamespaceContract(): Contract {
  return namespaceContract(false);
}

export function collidingNamespaceContract(): Contract {
  return namespaceContract(true);
}

export function cyclicNamespaceContract(): Contract {
  return makeContract({
    namespaces: {
      public: {
        models: [
          model('A', {
            table: 'a',
            columns: {
              id: column('pg/uuid@1', 'uuid'),
              bId: column('pg/uuid@1', 'uuid'),
            },
            fields: {
              id: scalar('pg/uuid@1'),
              bId: scalar('pg/uuid@1'),
            },
            primaryKey: ['id'],
            foreignKeys: [foreignKey('public', 'a', 'bId', 'audit', 'b', 'id')],
          }),
        ],
      },
      audit: {
        models: [
          model('B', {
            table: 'b',
            columns: {
              id: column('pg/uuid@1', 'uuid'),
              aId: column('pg/uuid@1', 'uuid'),
            },
            fields: {
              id: scalar('pg/uuid@1'),
              aId: scalar('pg/uuid@1'),
            },
            primaryKey: ['id'],
            foreignKeys: [foreignKey('audit', 'b', 'aId', 'public', 'a', 'id')],
          }),
        ],
      },
    },
  });
}
