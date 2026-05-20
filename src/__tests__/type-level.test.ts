import { Schema } from 'effect';
import { describe, it, expect, expectTypeOf } from 'vitest';
import { columnType, generated, Insertable, Updateable, Selectable } from '../kysely/helpers';

// Read struct field names via the public `fields` record (Effect 4 dropped the
// `effect/SchemaAST` TypeLiteral.propertySignatures shape this test used).
// encodeKeys-wrapped schemas (join tables) are decodeTo nodes — `.to` is the
// decoded/semantic struct, `.from` is the encoded DB-column struct.
const getPropertyNames = (schema: Schema.Top): string[] => {
  const direct = (schema as { fields?: Record<string, unknown> }).fields;
  if (direct) return Object.keys(direct);
  const to = (schema as { to?: { fields?: Record<string, unknown> } }).to;
  if (to?.fields) return Object.keys(to.fields);
  return [];
};

const User = Schema.Struct({
  id: columnType(Schema.String.check(Schema.isUUID()), Schema.Never, Schema.Never),
  createdAt: generated(Schema.Date),
  name: Schema.String,
  email: Schema.String,
});
type User = typeof User;

describe('Selectable<User>', () => {
  it('should include all fields', () => {
    const fields = getPropertyNames(Selectable(User));
    expect(fields).toContain('id');
    expect(fields).toContain('createdAt');
    expect(fields).toContain('name');
    expect(fields).toContain('email');

    type UserSelect = Selectable<User>;
    expectTypeOf<UserSelect>().toHaveProperty('id');
    expectTypeOf<UserSelect>().toHaveProperty('createdAt');
    expectTypeOf<UserSelect>().toHaveProperty('name');
    expectTypeOf<UserSelect>().toHaveProperty('email');
  });
});

describe('Insertable<User>', () => {
  it('should exclude id but include generated fields as optional', () => {
    const fields = getPropertyNames(Insertable(User));
    expect(fields).not.toContain('id'); // ColumnType<string, never, never> is excluded
    expect(fields).toContain('createdAt'); // Generated fields are now optional, not excluded
    expect(fields).toContain('name');
    expect(fields).toContain('email');

    type UserInsert = Insertable<User>;
    expectTypeOf<UserInsert>().not.toHaveProperty('id'); // Excluded (never insert type)
    expectTypeOf<UserInsert>().toHaveProperty('createdAt'); // Optional (generated)
    expectTypeOf<UserInsert>().toHaveProperty('name');
    expectTypeOf<UserInsert>().toHaveProperty('email');
  });
});

describe('Updateable<User>', () => {
  it('should exclude id but include generated fields', () => {
    const fields = getPropertyNames(Updateable(User));
    expect(fields).not.toContain('id');
    expect(fields).toContain('createdAt');
    expect(fields).toContain('name');
    expect(fields).toContain('email');

    type UserUpdate = Updateable<User>;
    expectTypeOf<UserUpdate>().not.toHaveProperty('id');
    expectTypeOf<UserUpdate>().toHaveProperty('createdAt');
    expectTypeOf<UserUpdate>().toHaveProperty('name');
    expectTypeOf<UserUpdate>().toHaveProperty('email');
  });
});
