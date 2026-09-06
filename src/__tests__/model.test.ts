import { describe, expect, it } from 'vitest';
import { EffectGenerator } from '../effect/generator';
import { parseContract } from '../prisma/contract';
import {
  buildModelSet,
  type ContractModelSet,
  type EnumModel,
  type TableField,
  type TableModel,
} from '../prisma/model';
import fixtureJson from './fixtures/prisma8/contract.json';
import {
  column,
  foreignKey,
  makeContract,
  model,
  scalar,
  valueObject,
} from './helpers/contract-mocks';

const fixtureSet = buildModelSet(parseContract(fixtureJson));

function requireModel(set: ContractModelSet, name: string): TableModel {
  const found = set.models.find((entry) => entry.name === name);
  if (!found) throw new Error(`Expected fixture model ${name}`);
  return found;
}

function requireField(modelDefinition: TableModel, name: string): TableField {
  const found = modelDefinition.fields.find((field) => field.tsName === name);
  if (!found) throw new Error(`Expected field ${modelDefinition.name}.${name}`);
  return found;
}

function requireEnum(set: ContractModelSet, name: string): EnumModel {
  const found = set.enums.find((entry) => entry.name === name);
  if (!found) throw new Error(`Expected fixture enum ${name}`);
  return found;
}

describe('Prisma 8 contract model derivation', () => {
  it('models variant and ordinary foreign-key fields', () => {
    const bug = requireModel(fixtureSet, 'Bug');
    const post = requireModel(fixtureSet, 'Post');

    expect(requireField(bug, 'id').fkTarget).toEqual({
      model: 'Task',
      namespaceId: 'public',
      idModel: 'Task',
      idNamespaceId: 'public',
    });
    expect(bug.brandedId).toBeUndefined();
    expect(requireField(post, 'authorId').fkTarget).toEqual({
      model: 'User',
      namespaceId: 'public',
      idModel: 'User',
      idNamespaceId: 'public',
    });
  });

  it('does not brand a composite primary key', () => {
    expect(requireModel(fixtureSet, 'PostTag').brandedId).toBeUndefined();
  });

  it('distinguishes storage defaults from Prisma-applied defaults', () => {
    expect(requireField(requireModel(fixtureSet, 'Todo'), 'id').hasStorageDefault).toBe(true);
    expect(requireField(requireModel(fixtureSet, 'Post'), 'id').hasStorageDefault).toBe(false);
  });

  it('resolves enum and value-object field kinds', () => {
    const allTypes = requireModel(fixtureSet, 'AllTypes');

    expect(requireField(allTypes, 'status').kind).toEqual({
      type: 'enum',
      enumName: 'Status',
      namespaceId: 'public',
    });
    expect(requireField(allTypes, 'address').kind).toEqual({
      type: 'valueObject',
      name: 'Address',
    });
  });

  it('uses stored enum values', () => {
    expect(requireEnum(fixtureSet, 'Status').values).toEqual(['active', 'inactive', 'pending']);
    expect(requireEnum(fixtureSet, 'Role').values).toEqual(['ADMIN', 'GUEST', 'USER']);
  });

  it('rejects duplicate generated identifiers across namespaces', () => {
    const user = model('User', {
      table: 'user',
      columns: {
        id: { codecId: 'pg/uuid@1', nativeType: 'uuid', nullable: false },
      },
      fields: {
        id: {
          nullable: false,
          type: { kind: 'scalar', codecId: 'pg/uuid@1' },
        },
      },
      primaryKey: ['id'],
    });
    const contract = makeContract({
      namespaces: {
        public: { models: [user] },
        audit: { models: [user] },
      },
    });

    expect(() => buildModelSet(contract)).toThrow(
      'Duplicate generated identifier User (audit.User and public.User); use --multi-domain'
    );
  });

  it('resolves inherited primary-key brands and quotes physical-only fields', () => {
    const task = model('Task', {
      table: 'task',
      columns: { id: column('pg/uuid@1', 'uuid') },
      fields: { id: scalar('pg/uuid@1') },
      primaryKey: ['id'],
    });
    const bug = model('Bug', {
      table: 'bug',
      columns: { 'task-id': column('pg/uuid@1', 'uuid') },
      fields: {},
      primaryKey: ['task-id'],
      foreignKeys: [foreignKey('public', 'bug', 'task-id', 'public', 'task', 'id')],
    });
    const report = model('Report', {
      table: 'report',
      columns: {
        id: column('pg/uuid@1', 'uuid'),
        bugId: column('pg/uuid@1', 'uuid'),
      },
      fields: {
        id: scalar('pg/uuid@1'),
        bugId: scalar('pg/uuid@1'),
      },
      primaryKey: ['id'],
      foreignKeys: [foreignKey('public', 'report', 'bugId', 'public', 'bug', 'task-id')],
    });
    const set = buildModelSet(
      makeContract({ namespaces: { public: { models: [task, bug, report] } } })
    );

    expect(requireField(requireModel(set, 'Report'), 'bugId').fkTarget).toMatchObject({
      model: 'Bug',
      idModel: 'Task',
      idNamespaceId: 'public',
    });
    expect(
      new EffectGenerator(set).generateModelSchema(requireModel(set, 'Bug'), new Map(), new Map())
    ).toContain('"task-id": columnType(TaskId, TaskId, Schema.Never)');
  });

  it('rejects broken storage mappings and value-object references', () => {
    const brokenMapping = model('Mapped', {
      table: 'mapped',
      columns: { id: column('pg/uuid@1', 'uuid') },
      fields: { id: { ...scalar('pg/uuid@1'), column: 'missing' } },
      primaryKey: ['id'],
    });
    expect(() =>
      buildModelSet(makeContract({ namespaces: { public: { models: [brokenMapping] } } }))
    ).toThrow('Mapped.id maps to unknown column public.mapped.missing');

    const brokenValueObject = model('HasValue', {
      table: 'has_value',
      columns: { value: column('pg/jsonb@1', 'jsonb') },
      fields: {
        value: { nullable: false, type: { kind: 'valueObject', name: 'Missing' } },
      },
    });
    expect(() =>
      buildModelSet(makeContract({ namespaces: { public: { models: [brokenValueObject] } } }))
    ).toThrow('Value object public.Missing referenced by HasValue.value was not found');
  });

  it('rejects collisions with derived and generator-owned bindings', () => {
    const user = model('User', {
      table: 'user',
      columns: { id: column('pg/uuid@1', 'uuid') },
      fields: { id: scalar('pg/uuid@1') },
      primaryKey: ['id'],
    });

    expect(() =>
      buildModelSet(
        makeContract({
          namespaces: {
            public: {
              models: [user],
              valueObjects: [valueObject('UserId', { value: scalar('pg/text@1') })],
            },
          },
        })
      )
    ).toThrow('Duplicate generated identifier UserId');

    expect(() =>
      buildModelSet(
        makeContract({
          namespaces: {
            public: {
              valueObjects: [valueObject('Schema', { value: scalar('pg/text@1') })],
            },
          },
        })
      )
    ).toThrow('Duplicate generated identifier Schema');
  });
});
