import { Schema } from 'effect';
import * as AST from 'effect/SchemaAST';
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  columnType,
  DateFromInput,
  generated,
  Insertable,
  Updateable,
  Selectable,
} from '../kysely/helpers';

const getPropertyNames = (schema: Schema.Schema<unknown, unknown>) => {
  const ast = schema.ast;
  if (!AST.isTypeLiteral(ast)) return [];
  return ast.propertySignatures.map((prop) => String(prop.name));
};

const User = Schema.Struct({
  id: columnType(Schema.UUID, Schema.Never, Schema.Never),
  createdAt: generated(DateFromInput),
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
