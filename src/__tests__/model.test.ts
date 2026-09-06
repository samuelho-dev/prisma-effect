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
    expect(requireField(requireModel(fixtureSet, 'CuidRecord'), 'id').hasStorageDefault).toBe(
      false
    );
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

  it('preserves explicit contract namespaces and physical database keys', () => {
    const auditRecord = requireModel(fixtureSet, 'AuditRecord');
    expect(auditRecord.namespaceId).toBe('audit');
    expect(auditRecord.dbKey).toBe('audit.audit_record');
  });

  it('uses stored enum values', () => {
    expect(requireEnum(fixtureSet, 'Status').values).toEqual(['active', 'inactive', 'pending']);
    expect(requireEnum(fixtureSet, 'Role').values).toEqual(['ADMIN', 'GUEST', 'USER']);
  });

  it('rejects names that normalize to the same generated identifier', () => {
    const preference = (name: string, table: string) =>
      model(name, {
        table,
        columns: { id: column('pg/uuid@1', 'uuid') },
        fields: { id: scalar('pg/uuid@1') },
        primaryKey: ['id'],
      });
    const contract = makeContract({
      namespaces: {
        public: { models: [preference('session_model_preference', 'preference')] },
        audit: { models: [preference('SessionModelPreference', 'audit_preference')] },
      },
    });

    expect(() => buildModelSet(contract)).toThrow(
      'Duplicate generated identifier SessionModelPreference (audit.SessionModelPreference and public.session_model_preference); use --multi-domain'
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
    const bugModel = requireModel(set, 'Bug');
    const protoModel: TableModel = {
      ...bugModel,
      fields: bugModel.fields.map((field) => ({ ...field, tsName: '__proto__' })),
    };
    expect(
      new EffectGenerator(set).generateModelSchema(protoModel, new Map(), new Map())
    ).toContain('["__proto__"]: columnType(TaskId, TaskId, Schema.Never)');
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

    const missingMapping = makeContract({
      namespaces: {
        public: {
          models: [
            model('MissingMapping', {
              table: 'missing_mapping',
              columns: { id: column('pg/uuid@1', 'uuid') },
              fields: { id: scalar('pg/uuid@1') },
              primaryKey: ['id'],
            }),
          ],
        },
      },
    });
    delete missingMapping.domain.namespaces.public.models.MissingMapping.storage.fields.id;
    expect(() => buildModelSet(missingMapping)).toThrow(
      'Model MissingMapping.id has no storage column mapping'
    );

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

  it('does not brand foreign keys to non-primary columns', () => {
    const user = model('User', {
      table: 'user',
      columns: {
        id: column('pg/uuid@1', 'uuid'),
        email: column('pg/text@1', 'text'),
      },
      fields: {
        id: scalar('pg/uuid@1'),
        email: scalar('pg/text@1'),
      },
      primaryKey: ['id'],
    });
    const profile = model('Profile', {
      table: 'profile',
      columns: {
        id: column('pg/uuid@1', 'uuid'),
        userEmail: column('pg/text@1', 'text'),
      },
      fields: {
        id: scalar('pg/uuid@1'),
        userEmail: scalar('pg/text@1'),
      },
      primaryKey: ['id'],
      foreignKeys: [foreignKey('public', 'profile', 'userEmail', 'public', 'user', 'email')],
    });
    const set = buildModelSet(
      makeContract({ namespaces: { public: { models: [user, profile] } } })
    );

    expect(requireField(requireModel(set, 'Profile'), 'userEmail').fkTarget).toBeUndefined();
  });

  it('preserves union, dictionary, collection, and nullability metadata', () => {
    const entry = model('Entry', {
      table: 'entry',
      columns: { values: column('pg/jsonb@1', 'jsonb', true) },
      fields: {
        values: {
          nullable: true,
          many: true,
          dict: true,
          type: {
            kind: 'union',
            members: [
              { kind: 'scalar', codecId: 'pg/text@1' },
              { kind: 'valueObject', name: 'Address' },
            ],
          },
        },
      },
    });
    const set = buildModelSet(
      makeContract({
        namespaces: {
          public: {
            models: [entry],
            valueObjects: [valueObject('Address', { city: scalar('pg/text@1') })],
          },
        },
      })
    );

    expect(requireField(requireModel(set, 'Entry'), 'values')).toMatchObject({
      nullable: true,
      many: true,
      dict: true,
      kind: {
        type: 'union',
        members: [
          { type: 'scalar', codecId: 'pg/text@1' },
          { type: 'valueObject', name: 'Address' },
        ],
      },
    });
  });

  it('reports missing tables and enums with their field paths', () => {
    const entry = model('Entry', {
      table: 'entry',
      columns: { status: column('pg/text@1', 'text') },
      fields: {
        status: {
          ...scalar('pg/text@1'),
          valueSet: {
            plane: 'domain',
            entityKind: 'enum',
            entityName: 'Missing',
            namespaceId: 'public',
          },
        },
      },
    });
    const missingTable = makeContract({ namespaces: { public: { models: [entry] } } });
    delete missingTable.storage.namespaces.public.entries.table?.entry;
    expect(() => buildModelSet(missingTable)).toThrow(
      'Model Entry maps to unknown table public.entry'
    );

    expect(() =>
      buildModelSet(makeContract({ namespaces: { public: { models: [entry] } } }))
    ).toThrow('Enum public.Missing referenced by Entry.status was not found');
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
