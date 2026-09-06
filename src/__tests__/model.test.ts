import { describe, expect, it } from 'vitest';
import { parseContract } from '../prisma/contract';
import {
  buildModelSet,
  type ContractModelSet,
  type EnumModel,
  type TableField,
  type TableModel,
} from '../prisma/model';
import fixtureJson from './fixtures/prisma8/contract.json';
import { makeContract, model } from './helpers/contract-mocks';

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
    });
    expect(bug.brandedId).toBeUndefined();
    expect(requireField(post, 'authorId').fkTarget).toEqual({
      model: 'User',
      namespaceId: 'public',
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
});
