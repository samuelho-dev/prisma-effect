import { toPascalCase } from '../utils/naming.js';
import type { Contract } from './contract.js';

export interface TableField {
  tsName: string;
  column: string;
  codecId: string;
  nullable: boolean;
  many: boolean;
  dict: boolean;
  kind:
    | { type: 'scalar' }
    | { type: 'enum'; enumName: string; namespaceId: string }
    | { type: 'valueObject'; name: string }
    | {
        type: 'union';
        members: Array<{ type: 'scalar'; codecId: string } | { type: 'valueObject'; name: string }>;
      };
  hasStorageDefault: boolean;
  isPrimaryKey: boolean;
  fkTarget?: { model: string; namespaceId: string };
}

export interface TableModel {
  name: string;
  schemaName: string;
  namespaceId: string;
  table: string;
  dbKey: string;
  fields: TableField[];
  brandedId?: { column: string; codecId: string };
}

export interface EnumModel {
  name: string;
  schemaName: string;
  namespaceId: string;
  values: Array<string | number | boolean>;
}

export interface ValueObjectModel {
  name: string;
  schemaName: string;
  namespaceId: string;
  fields: TableField[];
}

export interface ContractModelSet {
  models: TableModel[];
  enums: EnumModel[];
  valueObjects: ValueObjectModel[];
}

type DomainField = Contract['domain']['namespaces'][string]['models'][string]['fields'][string];
type FieldKind = TableField['kind'];

function modelTableKey(namespaceId: string, table: string): string {
  return `${namespaceId}\0${table}`;
}

function getFieldKind(contract: Contract, field: DomainField, fieldLabel: string): FieldKind {
  if (field.valueSet?.entityKind === 'enum') {
    const enumDefinition =
      contract.domain.namespaces[field.valueSet.namespaceId]?.enum?.[field.valueSet.entityName];
    if (!enumDefinition) {
      throw new Error(
        `Enum ${field.valueSet.namespaceId}.${field.valueSet.entityName} referenced by ${fieldLabel} was not found`
      );
    }
    return {
      type: 'enum',
      enumName: field.valueSet.entityName,
      namespaceId: field.valueSet.namespaceId,
    };
  }

  switch (field.type.kind) {
    case 'scalar':
      return { type: 'scalar' };
    case 'valueObject':
      return { type: 'valueObject', name: field.type.name };
    case 'union':
      return {
        type: 'union',
        members: field.type.members.map((member) =>
          member.kind === 'scalar'
            ? { type: 'scalar' as const, codecId: member.codecId }
            : { type: 'valueObject' as const, name: member.name }
        ),
      };
  }
}

function assertUniqueSchemaNames(set: ContractModelSet, multiDomain: boolean): void {
  const seen = new Map<string, string>();
  const entities = [...set.models, ...set.enums, ...set.valueObjects];

  for (const entity of entities) {
    const key = multiDomain ? `${entity.namespaceId}\0${entity.schemaName}` : entity.schemaName;
    const previous = seen.get(key);
    const label = `${entity.namespaceId}.${entity.name}`;
    if (previous) {
      throw new Error(
        `Duplicate generated identifier ${entity.schemaName} (${previous} and ${label}); use --multi-domain`
      );
    }
    seen.set(key, label);
  }
}

function compareNamed(
  left: { namespaceId: string; name: string },
  right: { namespaceId: string; name: string }
): number {
  return left.namespaceId.localeCompare(right.namespaceId) || left.name.localeCompare(right.name);
}

export function buildModelSet(contract: Contract, multiDomain = false): ContractModelSet {
  const modelByTable = new Map<string, { model: string; namespaceId: string }>();

  for (const [namespaceId, namespace] of Object.entries(contract.domain.namespaces)) {
    for (const [modelName, model] of Object.entries(namespace.models)) {
      modelByTable.set(modelTableKey(model.storage.namespaceId, model.storage.table), {
        model: modelName,
        namespaceId,
      });
    }
  }

  const models: TableModel[] = [];
  const enums: EnumModel[] = [];
  const valueObjects: ValueObjectModel[] = [];

  for (const [namespaceId, namespace] of Object.entries(contract.domain.namespaces)) {
    for (const [name, definition] of Object.entries(namespace.enum ?? {})) {
      enums.push({
        name,
        schemaName: toPascalCase(name),
        namespaceId,
        values: definition.members.map((member) => member.value),
      });
    }

    for (const [name, definition] of Object.entries(namespace.valueObjects ?? {})) {
      valueObjects.push({
        name,
        schemaName: toPascalCase(name),
        namespaceId,
        fields: Object.entries(definition.fields)
          .map(
            ([fieldName, field]): TableField => ({
              tsName: fieldName,
              column: fieldName,
              codecId: field.type.kind === 'scalar' ? field.type.codecId : '',
              nullable: field.nullable,
              many: field.many ?? false,
              dict: field.dict ?? false,
              kind: getFieldKind(contract, field, `${name}.${fieldName}`),
              hasStorageDefault: false,
              isPrimaryKey: false,
            })
          )
          .sort((left, right) => left.tsName.localeCompare(right.tsName)),
      });
    }

    for (const [name, definition] of Object.entries(namespace.models)) {
      const storageNamespace = contract.storage.namespaces[definition.storage.namespaceId];
      const table = storageNamespace?.entries.table?.[definition.storage.table];
      if (!table) {
        throw new Error(
          `Model ${name} maps to unknown table ${definition.storage.namespaceId}.${definition.storage.table}`
        );
      }

      const domainFieldByColumn = new Map(
        Object.entries(definition.storage.fields).map(([fieldName, field]) => [
          field.column,
          { name: fieldName, definition: definition.fields[fieldName] },
        ])
      );
      const foreignKeyByColumn = new Map<string, { model: string; namespaceId: string }>();

      for (const foreignKey of table.foreignKeys) {
        if (foreignKey.source.columns.length !== 1) continue;

        const targetTable =
          contract.storage.namespaces[foreignKey.target.namespaceId]?.entries.table?.[
            foreignKey.target.tableName
          ];
        if (
          !targetTable ||
          foreignKey.target.columns.length !== 1 ||
          targetTable.primaryKey?.columns.length !== 1 ||
          targetTable.primaryKey.columns[0] !== foreignKey.target.columns[0]
        ) {
          continue;
        }

        const targetModel = modelByTable.get(
          modelTableKey(foreignKey.target.namespaceId, foreignKey.target.tableName)
        );
        const sourceColumn = foreignKey.source.columns[0];
        if (targetModel && sourceColumn) foreignKeyByColumn.set(sourceColumn, targetModel);
      }

      const primaryKeyColumns = new Set(table.primaryKey?.columns ?? []);
      const fields = Object.entries(table.columns)
        .map(([columnName, column]): TableField => {
          const domainField = domainFieldByColumn.get(columnName);
          const field = domainField?.definition;
          const fkTarget = foreignKeyByColumn.get(columnName);
          return {
            tsName: domainField?.name ?? columnName,
            column: columnName,
            codecId: field?.type.kind === 'scalar' ? field.type.codecId : column.codecId,
            nullable: field?.nullable ?? column.nullable,
            many: field?.many ?? column.many ?? false,
            dict: field?.dict ?? false,
            kind: field
              ? getFieldKind(contract, field, `${name}.${domainField.name}`)
              : { type: 'scalar' },
            hasStorageDefault: column.default !== undefined,
            isPrimaryKey: primaryKeyColumns.has(columnName),
            ...(fkTarget ? { fkTarget } : {}),
          };
        })
        .sort((left, right) => left.tsName.localeCompare(right.tsName));

      const primaryKeyColumn =
        table.primaryKey?.columns.length === 1 ? table.primaryKey.columns[0] : undefined;
      const primaryKeyField = fields.find((field) => field.column === primaryKeyColumn);
      const brandedId =
        primaryKeyField && !primaryKeyField.fkTarget
          ? { column: primaryKeyField.column, codecId: primaryKeyField.codecId }
          : undefined;

      models.push({
        name,
        schemaName: toPascalCase(name),
        namespaceId,
        table: definition.storage.table,
        dbKey:
          definition.storage.namespaceId === 'public'
            ? definition.storage.table
            : `${definition.storage.namespaceId}.${definition.storage.table}`,
        fields,
        ...(brandedId ? { brandedId } : {}),
      });
    }
  }

  const set = {
    models: models.sort(compareNamed),
    enums: enums.sort(compareNamed),
    valueObjects: valueObjects.sort(compareNamed),
  };
  assertUniqueSchemaNames(set, multiDomain);
  return set;
}
