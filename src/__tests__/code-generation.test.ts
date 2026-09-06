import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generate } from '../generator/orchestrator';

// Mock prettier
vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

describe('Prisma 8 contract code generation', () => {
  const contract = join(import.meta.dirname, 'fixtures/prisma8/contract.json');
  let temporaryDirectory: string;
  let output: string;
  let files: string[];
  let typesContent: string;
  let enumsContent: string;
  let indexContent: string;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'prisma-effect-kysely-codegen-'));
    output = join(temporaryDirectory, 'generated');
    ({ files } = await generate({ contract, output }));
    [typesContent, enumsContent, indexContent] = await Promise.all([
      readFile(join(output, 'types.ts'), 'utf8'),
      readFile(join(output, 'enums.ts'), 'utf8'),
      readFile(join(output, 'index.ts'), 'utf8'),
    ]);
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('writes types, enums, and their barrel exports', () => {
    expect(files).toEqual([
      join(output, 'enums.ts'),
      join(output, 'types.ts'),
      join(output, 'index.ts'),
    ]);
    expect(indexContent).toContain('export * from "./enums.js";');
    expect(indexContent).toContain('export * from "./types.js";');
  });

  it('emits branded IDs and the correct Kysely primary-key contracts', () => {
    expect(typesContent).toContain(
      'export const PostId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("PostId"))'
    );
    expect(typesContent).toContain('export const TodoId = Schema.Int.pipe(Schema.brand("TodoId"))');
    expect(typesContent).toContain(
      'export const CountryId = Schema.String.pipe(Schema.brand("CountryId"))'
    );
    expect(typesContent).toContain('id: columnType(PostId, PostId, Schema.Never)');
    expect(typesContent).toContain('id: columnType(TodoId, Schema.Never, Schema.Never)');
    expect(typesContent).toContain('code: columnType(CountryId, CountryId, Schema.Never)');
    const bugTable = typesContent.slice(
      typesContent.indexOf('export const BugTable = Schema.Struct({'),
      typesContent.indexOf('export const Bug = Selectable(BugTable)')
    );
    expect(bugTable).toContain('id: columnType(TaskId, TaskId, Schema.Never)');
    expect(typesContent).not.toContain('export const BugId');
    const postTagTable = typesContent.slice(
      typesContent.indexOf('export const PostTagTable = Schema.Struct({'),
      typesContent.indexOf('export const PostTag = Selectable(PostTagTable)')
    );
    expect(postTagTable).toContain('postId: PostId');
    expect(postTagTable).toContain('tagId: TagId');
    expect(postTagTable).not.toContain('columnType(');
  });

  it('emits relation brands, defaults, and value objects', () => {
    expect(typesContent).toContain('authorId: UserId');
    expect(typesContent).toContain('managerId: Schema.NullOr(EmployeeId)');
    expect(typesContent).toContain('createdAt: generated(Schema.Date)');
    expect(typesContent).toContain('status: generated(Status)');
    expect(typesContent).toContain('address: Schema.NullOr(Address)');
    const addressDeclaration = 'export const Address = Schema.Struct({';
    const allTypesDeclaration = 'export const AllTypesTable = Schema.Struct({';
    expect(typesContent).toContain(addressDeclaration);
    expect(typesContent).toContain(allTypesDeclaration);
    expect(typesContent.indexOf(addressDeclaration)).toBeLessThan(
      typesContent.indexOf(allTypesDeclaration)
    );
  });

  it('maps scalar and collection codecs', () => {
    expect(typesContent).toContain('jsonField: columnType(JsonValue, JsonValue, JsonValue)');
    expect(typesContent).toContain('bigIntField: Schema.BigInt');
    expect(typesContent).toContain('decimalField: Schema.String');
    expect(typesContent).toContain('bytesField: Schema.Uint8Array');
    expect(typesContent).toContain('stringArray: Schema.Array(Schema.String)');
  });

  it('applies mapped keys and custom type annotations', () => {
    expect(typesContent).toContain(
      '.pipe(Schema.encodeKeys({ mappedDefault: "mapped_default", mappedField: "db_mapped_field" }))'
    );
    expect(typesContent).toContain('email: Schema.String.check(Schema.isMinLength(3))');
    expect(typesContent).toContain(
      'coordinates: Schema.Array(Schema.Array(Schema.Number).check(Schema.isLengthBetween(3, 3)))'
    );
  });

  it('emits every physical table and no implicit join table', () => {
    expect(typesContent).toContain('all_types: Schema.Schema.Type<typeof AllTypesTable>');
    expect(typesContent).toContain(
      'session_preferences: Schema.Schema.Type<typeof SessionModelPreferenceTable>'
    );
    expect(typesContent).toContain('post_tag: Schema.Schema.Type<typeof PostTagTable>');
    expect(typesContent).toContain('bug: Schema.Schema.Type<typeof BugTable>');

    const dbInterface = typesContent.slice(typesContent.indexOf('export interface DB'));
    expect(dbInterface).not.toMatch(/^\s*_[A-Za-z0-9_]*:/m);
  });

  it('uses stored enum values', () => {
    expect(enumsContent).toContain(
      'export const Status = Schema.Literals(["active", "inactive", "pending"])'
    );
    expect(enumsContent).toContain(
      'export const Role = Schema.Literals(["ADMIN", "GUEST", "USER"])'
    );
  });
});
