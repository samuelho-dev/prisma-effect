import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseContract, readContract } from '../prisma/contract';
import fixtureJson from './fixtures/prisma8/contract.json';

describe('Prisma 8 contract input', () => {
  it('parses the emitted fixture contract', () => {
    const contract = parseContract(fixtureJson);

    expect(contract.schemaVersion).toBe('1');
    expect(contract.targetFamily).toBe('sql');
  });

  it('rejects an unsupported schema version', () => {
    expect(() =>
      parseContract({
        ...fixtureJson,
        schemaVersion: '2',
      })
    ).toThrow(/schemaVersion/);
  });

  it('rejects a non-SQL target family', () => {
    expect(() =>
      parseContract({
        ...fixtureJson,
        targetFamily: 'document',
      })
    ).toThrow(/targetFamily/);
  });

  it('rejects unsupported value-set variants at their field path', () => {
    const invalid = structuredClone(fixtureJson);
    invalid.domain.namespaces.public.models.AllTypes.fields.status.valueSet.entityKind = 'model';

    expect(() => parseContract(invalid)).toThrow(/AllTypes.*status.*valueSet.*entityKind/s);
  });

  it('explains how to create a missing contract', async () => {
    const missingPath = join(import.meta.dirname, 'fixtures/prisma8/does-not-exist.contract.json');

    await expect(readContract(missingPath)).rejects.toThrow(
      `Contract not found at ${missingPath}. Run "prisma contract emit" first.`
    );
  });
});
