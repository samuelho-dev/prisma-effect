import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generate } from '../generator/orchestrator';

vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

describe('Kysely generated contract shape', () => {
  let temporaryDirectory: string;
  let types: string;
  let index: string;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pek-kysely-'));
    const output = join(temporaryDirectory, 'generated');
    await generate({
      contract: join(import.meta.dirname, 'fixtures/prisma8/contract.json'),
      output,
    });
    [types, index] = await Promise.all([
      readFile(join(output, 'types.ts'), 'utf8'),
      readFile(join(output, 'index.ts'), 'utf8'),
    ]);
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('emits the Effect and Kysely surface', () => {
    expect(types).toContain('export const UserTable = Schema.Struct');
    expect(types).toContain('columnType(');
    expect(types).toContain('generated(');
    expect(types).toContain('Schema.NullOr(');
    expect(types).toContain('export interface DB {');
    expect(index).toContain('export * from "./types.js";');
  });
});
