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
  fkTarget?: { model: string; namespaceId: string; idModel: string; idNamespaceId: string };
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

function getFieldKind(
  contract: Contract,
  namespaceId: string,
  field: DomainField,
  fieldLabel: string
): FieldKind {
  if (field.valueSet) {
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

  const requireValueObject = (name: string): void => {
    if (!contract.domain.namespaces[namespaceId]?.valueObjects?.[name]) {
      throw new Error(
        `Value object ${namespaceId}.${name} referenced by ${fieldLabel} was not found`
      );
    }
  };

  switch (field.type.kind) {
    case 'scalar':
      return { type: 'scalar' };
    case 'valueObject':
      requireValueObject(field.type.name);
      return { type: 'valueObject', name: field.type.name };
    case 'union':
      return {
        type: 'union',
        members: field.type.members.map((member) => {
          if (member.kind === 'scalar') {
            return { type: 'scalar' as const, codecId: member.codecId };
          }
          requireValueObject(member.name);
          return { type: 'valueObject' as const, name: member.name };
        }),
      };
  }
}

function assertUniqueSchemaNames(set: ContractModelSet, multiDomain: boolean): void {
  const namespaceIds = [
    ...new Set(
      [...set.models, ...set.enums, ...set.valueObjects].map((entity) =>
        multiDomain ? entity.namespaceId : '*'
      )
    ),
  ];

  for (const namespaceId of namespaceIds) {
    const seen = new Map<string, string>([
      ['Schema', 'Effect import'],
      ['columnType', 'Kysely helper import'],
      ['generated', 'Kysely helper import'],
      ['JsonValue', 'Kysely helper import'],
      ['Selectable', 'Kysely helper import'],
      ['DB', 'generated database interface'],
    ]);
    const inScope = (entity: { namespaceId: string }): boolean =>
      !multiDomain || entity.namespaceId === namespaceId;
    const claim = (identifier: string, label: string): void => {
      const previous = seen.get(identifier);
      if (previous) {
        throw new Error(
          `Duplicate generated identifier ${identifier} (${previous} and ${label})${
            multiDomain ? '' : '; use --multi-domain'
          }`
        );
      }
      seen.set(identifier, label);
    };

    for (const model of set.models.filter(inScope)) {
      const label = `${model.namespaceId}.${model.name}`;
      claim(model.schemaName, label);
      claim(`${model.schemaName}Table`, label);
      if (model.brandedId) claim(`${model.schemaName}Id`, label);
    }
    for (const enumModel of set.enums.filter(inScope)) {
      claim(enumModel.schemaName, `${enumModel.namespaceId}.${enumModel.name}`);
    }
    for (const valueObject of set.valueObjects.filter(inScope)) {
      claim(valueObject.schemaName, `${valueObject.namespaceId}.${valueObject.name}`);
    }
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
              kind: getFieldKind(contract, namespaceId, field, `${name}.${fieldName}`),
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

      const mappedColumns = new Map<string, string>();
      for (const [fieldName, mapping] of Object.entries(definition.storage.fields)) {
        if (!definition.fields[fieldName]) {
          throw new Error(`Model ${name} maps unknown field ${fieldName} to storage`);
        }
        if (!table.columns[mapping.column]) {
          throw new Error(
            `Model ${name}.${fieldName} maps to unknown column ${definition.storage.namespaceId}.${definition.storage.table}.${mapping.column}`
          );
        }
        const previous = mappedColumns.get(mapping.column);
        if (previous) {
          throw new Error(
            `Model ${name} fields ${previous} and ${fieldName} both map to column ${mapping.column}`
          );
        }
        mappedColumns.set(mapping.column, fieldName);
      }

      const domainFieldByColumn = new Map(
        Object.entries(definition.storage.fields).map(([fieldName, field]) => [
          field.column,
          { name: fieldName, definition: definition.fields[fieldName] },
        ])
      );
      const foreignKeyByColumn = new Map<string, NonNullable<TableField['fkTarget']>>();

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
        if (targetModel && sourceColumn) {
          foreignKeyByColumn.set(sourceColumn, {
            ...targetModel,
            idModel: targetModel.model,
            idNamespaceId: targetModel.namespaceId,
          });
        }
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
              ? getFieldKind(contract, namespaceId, field, `${name}.${domainField.name}`)
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

  const modelByName = new Map(
    models.map((model) => [`${model.namespaceId}\0${model.name}`, model])
  );
  const resolveBrandOwner = (model: TableModel, visiting = new Set<string>()): TableModel => {
    if (model.brandedId) return model;
    const key = `${model.namespaceId}\0${model.name}`;
    if (visiting.has(key)) {
      throw new Error(
        `Primary-key foreign keys form a cycle at ${model.namespaceId}.${model.name}`
      );
    }
    visiting.add(key);
    const primaryKey = model.fields.find((field) => field.isPrimaryKey);
    const target = primaryKey?.fkTarget;
    const targetModel = target
      ? modelByName.get(`${target.namespaceId}\0${target.model}`)
      : undefined;
    if (!targetModel) {
      throw new Error(`Model ${model.namespaceId}.${model.name} has no resolvable ID brand`);
    }
    return resolveBrandOwner(targetModel, visiting);
  };

  for (const model of models) {
    for (const field of model.fields) {
      if (!field.fkTarget) continue;
      const target = modelByName.get(`${field.fkTarget.namespaceId}\0${field.fkTarget.model}`);
      if (!target) continue;
      const owner = resolveBrandOwner(target);
      field.fkTarget.idModel = owner.name;
      field.fkTarget.idNamespaceId = owner.namespaceId;
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
