import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generate } from '../generator/orchestrator';

vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

describe('Kysely native table contracts', () => {
  let temporaryDirectory: string;
  let types: string;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pek-kysely-native-'));
    const output = join(temporaryDirectory, 'generated');
    await generate({
      contract: join(import.meta.dirname, 'fixtures/prisma8/contract.json'),
      output,
    });
    types = await readFile(join(output, 'types.ts'), 'utf8');
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('preserves physical tables, write variance, nullability, and FK brands', () => {
    expect(types).toContain('export const UserTable = Schema.Struct');
    expect(types).toContain('columnType(');
    expect(types).toContain('generated(');
    expect(types).toContain('content: Schema.NullOr(Schema.String)');
    expect(types).toContain('authorId: UserId');
    expect(types).toContain('export interface DB {');
    expect(types).toContain('user: Schema.Schema.Type<typeof UserTable>');
    expect(types).toContain('post_tag: Schema.Schema.Type<typeof PostTagTable>');
  });
});
