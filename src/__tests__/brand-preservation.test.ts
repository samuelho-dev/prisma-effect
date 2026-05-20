/**
 * Brand Preservation Investigation
 *
 * This test file investigates how VariantMarker brands flow through:
 * 1. columnType() return type
 * 2. Schema.Schema.Type extraction
 * 3. Schema.Struct field types
 * 4. Insertable type utility
 */

import { Schema } from 'effect';
import { describe, it, expectTypeOf } from 'vitest';
import { columnType, generated, Insertable, VariantTypeId, VariantMarker } from '../kysely/helpers';

describe('Brand Preservation Through Type System', () => {
  describe('Step 1: columnType return type', () => {
    it('should return schema with VariantMarker in type signature', () => {
      const idField = columnType(
        Schema.String.check(Schema.isUUID()).pipe(Schema.brand('TestId')),
        Schema.Never,
        Schema.Never
      );

      // Extract the Type parameter
      type IdType = Schema.Schema.Type<typeof idField>;

      // Check if VariantMarker is preserved
      type HasVariantMarker = IdType extends { readonly [VariantTypeId]: any } ? true : false;

      // This should be true if VariantMarker is preserved
      expectTypeOf<HasVariantMarker>().toEqualTypeOf<true>();
    });

    it('should preserve VariantMarker with different insert/update types', () => {
      const timestampField = columnType(Schema.Date, Schema.optional(Schema.Date), Schema.Date);

      type TimestampType = Schema.Schema.Type<typeof timestampField>;
      type HasVariant = TimestampType extends { readonly [VariantTypeId]: any } ? true : false;

      expectTypeOf<HasVariant>().toEqualTypeOf<true>();
    });
  });

  describe('Step 2: Schema.Struct field type preservation', () => {
    it('should preserve VariantMarker on individual fields after Struct creation', () => {
      const TestModel = Schema.Struct({
        id: columnType(
          Schema.String.check(Schema.isUUID()).pipe(Schema.brand('TestId')),
          Schema.Never,
          Schema.Never
        ),
        name: Schema.String,
      });

      // Extract the full model type
      type ModelType = Schema.Schema.Type<typeof TestModel>;

      // Extract the id field type
      type IdFieldType = ModelType['id'];

      // Check if id field has VariantMarker
      type IdHasVariant = IdFieldType extends { readonly [VariantTypeId]: any } ? true : false;

      expectTypeOf<IdHasVariant>().toEqualTypeOf<true>();
    });

    it('should preserve VariantMarker on generated fields', () => {
      const TestModel = Schema.Struct({
        id: columnType(Schema.Number.pipe(Schema.brand('TestId')), Schema.Never, Schema.Never),
        createdAt: generated(Schema.Date),
      });

      type ModelType = Schema.Schema.Type<typeof TestModel>;
      type CreatedAtType = ModelType['createdAt'];

      // generated() wraps with Generated<T> which includes VariantMarker<never, T>
      type HasVariant = CreatedAtType extends { readonly [VariantTypeId]: any } ? true : false;

      expectTypeOf<HasVariant>().toEqualTypeOf<true>();
    });
  });

  describe('Step 3: Insertable type utility', () => {
    it('should omit fields with VariantMarker<never, never>', () => {
      const TestModel = Schema.Struct({
        id: columnType(
          Schema.String.check(Schema.isUUID()).pipe(Schema.brand('TestId')),
          Schema.Never,
          Schema.Never
        ),
        name: Schema.String,
        email: Schema.String,
      });

      type TestInsert = Insertable<typeof TestModel>;

      // id should be omitted (VariantMarker<never, never>)
      type HasId = 'id' extends keyof TestInsert ? true : false;
      expectTypeOf<HasId>().toEqualTypeOf<false>();

      // name and email should be present
      type HasName = 'name' extends keyof TestInsert ? true : false;
      type HasEmail = 'email' extends keyof TestInsert ? true : false;
      expectTypeOf<HasName>().toEqualTypeOf<true>();
      expectTypeOf<HasEmail>().toEqualTypeOf<true>();
    });

    it('should omit generated fields (VariantMarker<never, T>)', () => {
      const TestModel = Schema.Struct({
        id: columnType(Schema.Number.pipe(Schema.brand('TestId')), Schema.Never, Schema.Never),
        name: Schema.String,
        createdAt: generated(Schema.Date),
        updatedAt: generated(Schema.Date),
      });

      type TestInsert = Insertable<typeof TestModel>;

      // generated fields should be omitted
      type HasCreatedAt = 'createdAt' extends keyof TestInsert ? true : false;
      type HasUpdatedAt = 'updatedAt' extends keyof TestInsert ? true : false;

      expectTypeOf<HasCreatedAt>().toEqualTypeOf<false>();
      expectTypeOf<HasUpdatedAt>().toEqualTypeOf<false>();

      // Regular fields should be present
      type HasName = 'name' extends keyof TestInsert ? true : false;
      expectTypeOf<HasName>().toEqualTypeOf<true>();
    });
  });

  describe('Step 4: Declaration merging pattern', () => {
    // Simulate the generated code pattern
    const User = Schema.Struct({
      id: columnType(
        Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId')),
        Schema.Never,
        Schema.Never
      ),
      email: Schema.String,
      name: Schema.String,
      createdAt: generated(Schema.Date),
    });
    type User = typeof User;

    it('should work with declaration merging for Insertable', () => {
      type UserInsert = Insertable<User>;

      // id and createdAt should be omitted
      type HasId = 'id' extends keyof UserInsert ? true : false;
      type HasCreatedAt = 'createdAt' extends keyof UserInsert ? true : false;

      expectTypeOf<HasId>().toEqualTypeOf<false>();
      expectTypeOf<HasCreatedAt>().toEqualTypeOf<false>();

      // email and name should be present
      type HasEmail = 'email' extends keyof UserInsert ? true : false;
      type HasName = 'name' extends keyof UserInsert ? true : false;

      expectTypeOf<HasEmail>().toEqualTypeOf<true>();
      expectTypeOf<HasName>().toEqualTypeOf<true>();
    });
  });

  describe('Step 5: Extracted VariantMarker values', () => {
    it('should correctly extract insert type from VariantMarker', () => {
      const TestModel = Schema.Struct({
        id: columnType(
          Schema.String.check(Schema.isUUID()).pipe(Schema.brand('TestId')),
          Schema.Never,
          Schema.Never
        ),
        name: Schema.String,
      });

      type ModelType = Schema.Schema.Type<typeof TestModel>;
      type IdFieldType = ModelType['id'];

      // Extract the VariantMarker
      type ExtractedMarker = IdFieldType extends { readonly [VariantTypeId]: infer M } ? M : never;

      // Check that M has 'insert' and 'update' keys
      type HasInsertKey = 'insert' extends keyof ExtractedMarker ? true : false;
      type HasUpdateKey = 'update' extends keyof ExtractedMarker ? true : false;

      expectTypeOf<HasInsertKey>().toEqualTypeOf<true>();
      expectTypeOf<HasUpdateKey>().toEqualTypeOf<true>();

      // Extract insert type (should be never)
      type InsertType = ExtractedMarker extends { insert: infer I } ? I : 'NOT_FOUND';
      expectTypeOf<InsertType>().toEqualTypeOf<never>();

      // Extract update type (should be never)
      type UpdateType = ExtractedMarker extends { update: infer U } ? U : 'NOT_FOUND';
      expectTypeOf<UpdateType>().toEqualTypeOf<never>();
    });

    it('should correctly extract insert type from generated field', () => {
      const TestModel = Schema.Struct({
        createdAt: generated(Schema.Date),
      });

      type ModelType = Schema.Schema.Type<typeof TestModel>;
      type CreatedAtType = ModelType['createdAt'];

      // Extract VariantMarker
      type ExtractedMarker = CreatedAtType extends { readonly [VariantTypeId]: infer M }
        ? M
        : never;

      // Insert should be never (generated fields are omitted from insert)
      type InsertType = ExtractedMarker extends { insert: infer I } ? I : 'NOT_FOUND';
      expectTypeOf<InsertType>().toEqualTypeOf<never>();

      // Update should be Date (generated fields can be updated)
      type UpdateType = ExtractedMarker extends { update: infer U } ? U : 'NOT_FOUND';
      expectTypeOf<UpdateType>().toEqualTypeOf<Date>();
    });
  });
});
