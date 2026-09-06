import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generate } from '../generator/orchestrator';

// Mock prettier
vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

function generatedTable(source: string, name: string): string {
  const startMarker = `export const ${name}Table = Schema.Struct({`;
  const endMarker = `export const ${name} = Selectable(${name}Table)`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1) throw new Error(`Generated ${name} table was not found`);
  return source.slice(start, end);
}

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

  it('exports compilable schema values and matching types', () => {
    expect(typesContent).toContain('import { Schema } from "effect";');
    expect(typesContent).toContain(
      'import { columnType, generated, JsonValue, Selectable } from "prisma-effect-kysely";'
    );
    expect(typesContent).toContain('export const User = Selectable(UserTable);');
    expect(typesContent).toContain('export type User = typeof User.Type;');
    expect(enumsContent).toContain('export type Role = typeof Role.Type;');
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
    expect(typesContent).toContain('id: columnType(CuidRecordId, CuidRecordId, Schema.Never)');
    expect(typesContent).toContain('code: columnType(CountryId, CountryId, Schema.Never)');
    const bugTable = generatedTable(typesContent, 'Bug');
    expect(bugTable).toContain('id: columnType(TaskId, TaskId, Schema.Never)');
    expect(typesContent).not.toContain('export const BugId');
    const postTagTable = generatedTable(typesContent, 'PostTag');
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
    const postTable = generatedTable(typesContent, 'Post');
    expect(postTable).not.toMatch(/^\s+(?:author|posts):/m);
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
    expect(typesContent).toContain(
      'optionalJson: columnType(Schema.NullOr(JsonValue), Schema.NullOr(JsonValue), Schema.NullOr(JsonValue))'
    );
    expect(typesContent).toContain('optionalRole: Schema.NullOr(Role)');
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
      '"audit.audit_record": Schema.Schema.Type<typeof AuditRecordTable>'
    );
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
