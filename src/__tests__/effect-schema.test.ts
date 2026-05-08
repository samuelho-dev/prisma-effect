import { Schema } from 'effect';
import * as AST from 'effect/SchemaAST';
import { describe, expect, it } from 'vitest';
import {
  columnType,
  DateFromInput,
  generated,
  Insertable,
  Selectable,
  Updateable,
} from '../kysely/helpers';

/**
 * Effect Schema Runtime Behavior - Comprehensive Tests
 *
 * Tests verify runtime behavior of Selectable, Insertable, Updateable functions.
 * Uses direct pattern: Selectable(schema), Insertable(schema), Updateable(schema)
 */

describe('Effect Schema - Runtime Behavior', () => {
  describe('Schema Helpers', () => {
    describe('Runtime Schema Functions', () => {
      it('should return valid schemas from Selectable, Insertable, Updateable', () => {
        const baseSchema = Schema.Struct({
          id: Schema.Number,
          name: Schema.String,
        });

        expect(Schema.isSchema(Selectable(baseSchema))).toBe(true);
        expect(Schema.isSchema(Insertable(baseSchema))).toBe(true);
        expect(Schema.isSchema(Updateable(baseSchema))).toBe(true);
      });

      it('should handle generated fields correctly', () => {
        const baseSchema = Schema.Struct({
          id: generated(Schema.Number),
          name: Schema.String,
        });

        // Insert should work WITHOUT generated field
        const insertResult = Schema.decodeUnknownSync(Insertable(baseSchema))({
          name: 'test',
        });
        expect(insertResult).toEqual({ name: 'test' });

        // Select should include generated field
        const selectResult = Schema.decodeUnknownSync(Selectable(baseSchema))({
          id: 123,
          name: 'test',
        });
        expect(selectResult).toEqual({ id: 123, name: 'test' });

        // Update should allow updating generated field
        const updateResult = Schema.decodeUnknownSync(Updateable(baseSchema))({
          id: 456,
        });
        expect(updateResult).toEqual({ id: 456 });
      });
    });

    describe('columnType()', () => {
      it('should use different types for select/insert/update', () => {
        const schema = columnType(Schema.Number, Schema.Never, Schema.Never);

        // Can decode with select schema
        const result = Schema.decodeUnknownSync(schema)(42);
        expect(result).toBe(42);
      });

      it('should support different types in schema functions', () => {
        const baseSchema = Schema.Struct({
          id: columnType(Schema.Number, Schema.Never, Schema.Never),
          name: Schema.String,
        });

        // Select includes id
        const selectResult = Schema.decodeUnknownSync(Selectable(baseSchema))({
          id: 1,
          name: 'test',
        });
        expect(selectResult).toEqual({ id: 1, name: 'test' });

        // Insert excludes id (Never type)
        const insertResult = Schema.decodeUnknownSync(Insertable(baseSchema))({
          name: 'test',
        });
        expect(insertResult).toEqual({ name: 'test' });

        // Update excludes id
        const updateResult = Schema.decodeUnknownSync(Updateable(baseSchema))({
          name: 'updated',
        });
        expect(updateResult).toEqual({ name: 'updated' });
      });
    });

    describe('generated()', () => {
      it('should be omitted from Insertable schema', () => {
        const baseSchema = Schema.Struct({
          id: generated(Schema.Number),
          name: Schema.String,
        });

        const result = Schema.decodeUnknownSync(Insertable(baseSchema))({
          name: 'test',
        });
        expect(result).toEqual({ name: 'test' });
      });

      it('should be included in Selectable schema', () => {
        const baseSchema = Schema.Struct({
          id: generated(Schema.Number),
          name: Schema.String,
        });

        const result = Schema.decodeUnknownSync(Selectable(baseSchema))({
          id: 123,
          name: 'test',
        });
        expect(result).toEqual({ id: 123, name: 'test' });
      });

      it('should allow providing values for generated fields in insert (optional)', () => {
        const baseSchema = Schema.Struct({
          id: generated(Schema.Number),
          name: Schema.String,
        });

        // Generated fields are optional - can be provided or omitted
        const result = Schema.decodeUnknownSync(Insertable(baseSchema))({
          id: 999, // This is now allowed (optional field)
          name: 'test',
        });

        expect(result).toEqual({ id: 999, name: 'test' });
      });

      it('should handle multiple generated fields', () => {
        const baseSchema = Schema.Struct({
          id: generated(Schema.UUID),
          session_id: generated(Schema.UUID),
          created_at: generated(DateFromInput),
          name: Schema.String,
        });

        const result = Schema.decodeUnknownSync(Insertable(baseSchema))({
          name: 'test',
        });

        expect(result).toEqual({ name: 'test' });
      });
    });

    describe('Individual helper functions', () => {
      const TestSchema = Schema.Struct({
        id: Schema.UUID,
        name: Schema.String,
        email: Schema.String,
        age: Schema.Number,
        createdAt: DateFromInput,
      });

      it('Selectable() should return valid schema', () => {
        const result = Selectable(TestSchema);

        expect(Schema.isSchema(result)).toBe(true);

        // Encoded side is string for DateFromInput columns — wire format
        const decoded = Schema.decodeUnknownSync(result)({
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test User',
          email: 'test@example.com',
          age: 30,
          createdAt: '2026-05-08T00:00:00.000Z',
        });

        expect(decoded).toHaveProperty('id');
        expect(decoded).toHaveProperty('name');
        expect(decoded).toHaveProperty('email');
        expect(decoded.createdAt).toBeInstanceOf(Date);
      });

      it('Insertable() should return valid schema', () => {
        const result = Insertable(TestSchema);

        expect(Schema.isSchema(result)).toBe(true);

        const decoded = Schema.decodeUnknownSync(result)({
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test User',
          email: 'test@example.com',
          age: 30,
          createdAt: '2026-05-08T00:00:00.000Z',
        });

        expect(decoded).toHaveProperty('name');
      });

      it('Updateable() should return valid schema for partial updates', () => {
        const result = Updateable(TestSchema);

        expect(Schema.isSchema(result)).toBe(true);

        const decoded = Schema.decodeUnknownSync(result)({
          name: 'Updated Name',
        });

        expect(decoded).toHaveProperty('name');
      });
    });
  });

  describe('Insert Operations', () => {
    it('should allow insert without @default fields', () => {
      const UserSchema = Schema.Struct({
        id: generated(Schema.UUID),
        createdAt: generated(DateFromInput),
        name: Schema.String,
        email: Schema.String,
      });

      const insertData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const result = Schema.decodeUnknownSync(Insertable(UserSchema))(insertData);

      expect(result).toEqual(insertData);
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('createdAt');
    });

    it('should make nullable fields optional on insert (omitting = NULL in DB)', () => {
      const ProductSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        name: Schema.String,
        description: Schema.NullOr(Schema.String),
        price: Schema.NullOr(Schema.Number),
      });

      // Nullable fields can be omitted (SQL semantics - omitting = NULL)
      const insertWithoutNullables = {
        name: 'Widget',
      };

      const result1 = Schema.decodeUnknownSync(Insertable(ProductSchema))(insertWithoutNullables);
      expect(result1).toEqual(insertWithoutNullables);

      // With actual values
      const fullInsert = {
        name: 'Widget',
        description: 'A useful widget',
        price: 19.99,
      };

      const result2 = Schema.decodeUnknownSync(Insertable(ProductSchema))(fullInsert);
      expect(result2).toEqual(fullInsert);
    });

    it('should handle models with only generated fields', () => {
      const MetadataSchema = Schema.Struct({
        id: generated(Schema.UUID),
        createdAt: generated(DateFromInput),
        updatedAt: generated(DateFromInput),
      });

      const emptyInsert = {};

      const result = Schema.decodeUnknownSync(Insertable(MetadataSchema))(emptyInsert);
      expect(result).toEqual({});
    });
  });

  describe('Update Operations', () => {
    it('should make all fields optional for update', () => {
      const UserSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        name: Schema.String,
        email: Schema.String,
        updatedAt: generated(DateFromInput),
      });

      const partialUpdate = {
        name: 'New Name',
      };

      const result = Schema.decodeUnknownSync(Updateable(UserSchema))(partialUpdate);
      expect(result).toEqual({ name: 'New Name' });
    });

    it('should allow updating multiple fields', () => {
      const ProfileSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        bio: Schema.NullOr(Schema.String),
        avatar: Schema.NullOr(Schema.String),
        website: Schema.NullOr(Schema.String),
      });

      const update = {
        bio: 'Software developer',
        website: 'https://example.com',
      };

      const result = Schema.decodeUnknownSync(Updateable(ProfileSchema))(update);
      expect(result).toEqual(update);
    });

    it('should allow setting fields to null', () => {
      const ModelSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        optionalField: Schema.NullOr(Schema.String),
      });

      const clearUpdate = {
        optionalField: null,
      };

      const result = Schema.decodeUnknownSync(Updateable(ModelSchema))(clearUpdate);
      expect(result).toEqual({ optionalField: null });
    });

    it('should exclude Never-typed fields from Updateable schema structure', () => {
      const UserSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        name: Schema.String,
      });

      // Verify 'id' is NOT in the Updateable schema's property signatures
      const updateableAst = Updateable(UserSchema).ast;
      expect(AST.isTypeLiteral(updateableAst)).toBe(true);
      const fieldNames = (updateableAst as AST.TypeLiteral).propertySignatures.map((p) => p.name);
      expect(fieldNames).not.toContain('id');
      expect(fieldNames).toContain('name');
    });

    it('should exclude Never-typed fields from Insertable schema structure', () => {
      const UserSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        name: Schema.String,
      });

      // Verify 'id' is NOT in the Insertable schema's property signatures
      const insertableAst = Insertable(UserSchema).ast;
      expect(AST.isTypeLiteral(insertableAst)).toBe(true);
      const fieldNames = (insertableAst as AST.TypeLiteral).propertySignatures.map((p) => p.name);
      expect(fieldNames).not.toContain('id');
      expect(fieldNames).toContain('name');
    });
  });

  describe('Select Operations', () => {
    it('should include all fields for select', () => {
      const UserSchema = Schema.Struct({
        id: generated(Schema.UUID),
        name: Schema.String,
        email: Schema.String,
        createdAt: generated(DateFromInput),
      });

      // Wire-shape input — ISO string for date column (DateFromInput Encoded = string)
      const fullObject = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const result = Schema.decodeUnknownSync(Selectable(UserSchema))(fullObject);
      expect(result.id).toBe(fullObject.id);
      expect(result.name).toBe(fullObject.name);
      expect(result.email).toBe(fullObject.email);
      expect(result.createdAt).toEqual(new Date('2024-01-01'));
    });

    it('should validate field types on select', () => {
      const UserSchema = Schema.Struct({
        id: Schema.UUID,
        age: Schema.Number,
      });

      // Invalid UUID should fail
      expect(() =>
        Schema.decodeUnknownSync(Selectable(UserSchema))({
          id: 'not-a-uuid',
          age: 25,
        })
      ).toThrow();

      // Valid UUID should pass
      expect(() =>
        Schema.decodeUnknownSync(Selectable(UserSchema))({
          id: '123e4567-e89b-12d3-a456-426614174000',
          age: 25,
        })
      ).not.toThrow();
    });

    it('should handle optional fields in select', () => {
      const ProfileSchema = Schema.Struct({
        id: Schema.UUID,
        bio: Schema.NullOr(Schema.String),
      });

      // With null
      const withNull = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        bio: null,
      };

      const result1 = Schema.decodeUnknownSync(Selectable(ProfileSchema))(withNull);
      expect(result1).toEqual(withNull);

      // With value
      const withValue = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        bio: 'Developer',
      };

      const result2 = Schema.decodeUnknownSync(Selectable(ProfileSchema))(withValue);
      expect(result2).toEqual(withValue);
    });
  });

  describe('Schema Validation', () => {
    it('should validate UUID fields correctly', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(() => Schema.decodeUnknownSync(Schema.UUID)(validUuid)).not.toThrow();

      const invalidUuid = 'not-a-uuid';
      expect(() => Schema.decodeUnknownSync(Schema.UUID)(invalidUuid)).toThrow();
    });

    it('should validate nested structures', () => {
      const PostSchema = Schema.Struct({
        id: Schema.UUID,
        title: Schema.String,
        metadata: Schema.Struct({
          views: Schema.Number,
          likes: Schema.Number,
        }),
      });

      const validPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Post',
        metadata: {
          views: 100,
          likes: 5,
        },
      };

      const result = Schema.decodeUnknownSync(Selectable(PostSchema))(validPost);
      expect(result).toEqual(validPost);

      // Invalid nested structure
      const invalidPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Post',
        metadata: {
          views: 'not-a-number',
          likes: 5,
        },
      };

      expect(() => Schema.decodeUnknownSync(Selectable(PostSchema))(invalidPost)).toThrow();
    });

    it('should validate array fields', () => {
      const TagSchema = Schema.Struct({
        id: Schema.UUID,
        names: Schema.Array(Schema.String),
      });

      const validTag = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        names: ['typescript', 'effect', 'kysely'],
      };

      const result = Schema.decodeUnknownSync(Selectable(TagSchema))(validTag);
      expect(result).toEqual(validTag);

      // Invalid array elements
      const invalidTag = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        names: ['typescript', 123, 'kysely'],
      };

      expect(() => Schema.decodeUnknownSync(Selectable(TagSchema))(invalidTag)).toThrow();
    });
  });

  describe('Encoding and Decoding', () => {
    it('should accept both Date instances and ISO strings on the encoded side', () => {
      const EventSchema = Schema.Struct({
        id: Schema.UUID,
        occurredAt: DateFromInput,
      });

      const testDate = new Date('2024-01-01T12:00:00Z');
      const isoString = '2024-01-01T12:00:00.000Z';

      // Decode from Date instance (Kysely DA boundary — pg driver returns Date)
      const decodedFromDate = Schema.decodeUnknownSync(Selectable(EventSchema))({
        id: '123e4567-e89b-12d3-a456-426614174000',
        occurredAt: testDate,
      });
      expect(decodedFromDate.occurredAt).toBeInstanceOf(Date);
      expect(decodedFromDate.occurredAt.getTime()).toBe(testDate.getTime());

      // Decode from ISO string (RPC wire boundary — JSON.parse output)
      const decodedFromString = Schema.decodeUnknownSync(Selectable(EventSchema))({
        id: '123e4567-e89b-12d3-a456-426614174000',
        occurredAt: isoString,
      });
      expect(decodedFromString.occurredAt).toBeInstanceOf(Date);
      expect(decodedFromString.occurredAt.getTime()).toBe(testDate.getTime());

      // Encode picks first union member (DateFromSelf identity) — passes Date through
      // unchanged so Kysely receives native Date instances
      const encoded = Schema.encodeUnknownSync(Selectable(EventSchema))({
        id: '123e4567-e89b-12d3-a456-426614174000',
        occurredAt: testDate,
      });
      expect(encoded.occurredAt).toBeInstanceOf(Date);
    });

    it('should handle bigint encoding/decoding', () => {
      const CounterSchema = Schema.Struct({
        id: Schema.UUID,
        count: Schema.BigInt,
      });

      const counter = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        count: BigInt(9007199254740991),
      };

      // Encode to string
      const encoded = Schema.encodeUnknownSync(Selectable(CounterSchema))(counter);
      expect(typeof encoded.count).toBe('string');

      // Decode back to bigint
      const decoded = Schema.decodeUnknownSync(Selectable(CounterSchema))(encoded);
      expect(decoded.count).toBe(counter.count);
      expect(typeof decoded.count).toBe('bigint');
    });
  });

  describe('Complex Real-world Scenarios', () => {
    it('should handle mixed field types correctly', () => {
      const baseSchema = Schema.Struct({
        // Read-only ID
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        // Generated timestamp
        created_at: generated(DateFromInput),
        // Required fields
        email: Schema.String,
        username: Schema.String,
        // Optional fields
        bio: Schema.NullOr(Schema.String),
      });

      // Insertable: no id, no created_at, bio is optional (nullable = optional on insert)
      const insertResult = Schema.decodeUnknownSync(Insertable(baseSchema))({
        email: 'test@example.com',
        username: 'testuser',
      });
      expect(insertResult).toEqual({
        email: 'test@example.com',
        username: 'testuser',
      });

      // Updateable: partial update
      const updateResult = Schema.decodeUnknownSync(Updateable(baseSchema))({
        bio: 'New bio',
      });
      expect(updateResult).toEqual({ bio: 'New bio' });

      // Selectable: all fields — wire-shape input (ISO string for date)
      const selectResult = Schema.decodeUnknownSync(Selectable(baseSchema))({
        id: '123e4567-e89b-12d3-a456-426614174000',
        created_at: new Date().toISOString(),
        email: 'test@example.com',
        username: 'testuser',
        bio: 'New bio',
      });
      expect(selectResult).toHaveProperty('id');
      expect(selectResult).toHaveProperty('created_at');
      expect(selectResult.created_at).toBeInstanceOf(Date);
      expect(selectResult).toHaveProperty('email');
    });

    it('should handle typical user model with all field types', () => {
      const UserSchema = Schema.Struct({
        // Read-only generated ID
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        // Required fields
        email: Schema.String,
        username: Schema.String,
        // Optional fields
        bio: Schema.NullOr(Schema.String),
        avatar: Schema.NullOr(Schema.String),
        // Generated timestamps
        createdAt: generated(DateFromInput),
        updatedAt: generated(DateFromInput),
        // Array field
        roles: Schema.Array(Schema.String),
      });

      // Insert: Required fields and arrays; nullable fields are optional (omitting = NULL)
      const insertData = {
        email: 'test@example.com',
        username: 'testuser',
        roles: ['USER'],
      };

      const insertResult = Schema.decodeUnknownSync(Insertable(UserSchema))(insertData);
      expect(insertResult).toEqual(insertData);

      // Update: Partial update
      const updateData = {
        bio: 'New bio',
        avatar: 'https://example.com/avatar.jpg',
      };

      const updateResult = Schema.decodeUnknownSync(Updateable(UserSchema))(updateData);
      expect(updateResult).toEqual(updateData);

      // Select: Full object — wire-shape input (ISO strings for DateFromInput columns)
      const selectData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        username: 'testuser',
        bio: 'New bio',
        avatar: 'https://example.com/avatar.jpg',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        roles: ['USER'],
      };

      const selectResult = Schema.decodeUnknownSync(Selectable(UserSchema))(selectData);
      expect(selectResult.id).toBe(selectData.id);
      expect(selectResult.email).toBe(selectData.email);
      expect(selectResult.username).toBe(selectData.username);
      expect(selectResult.bio).toBe(selectData.bio);
      expect(selectResult.avatar).toBe(selectData.avatar);
      expect(selectResult.createdAt).toBeInstanceOf(Date);
      expect(selectResult.updatedAt).toBeInstanceOf(Date);
      expect(selectResult.roles).toEqual(selectData.roles);
    });
  });

  describe('TypeScript Type Safety', () => {
    it('should preserve Schema type for generated() - runtime check', () => {
      const dateSchema = generated(DateFromInput);
      const numberSchema = generated(Schema.Number);
      const uuidSchema = generated(Schema.UUID);

      // Runtime validation - verify Schema type is preserved through generated()
      // (Compile-time Encoded-side checks vary by leaf schema: DateFromInput has
      // Encoded = string while Schema.Number has Encoded = number — generated()
      // wraps both correctly.)
      expect(Schema.isSchema(dateSchema)).toBe(true);
      expect(Schema.isSchema(numberSchema)).toBe(true);
      expect(Schema.isSchema(uuidSchema)).toBe(true);
    });

    it('should preserve Schema type for columnType() - runtime check', () => {
      const uuidSchema = columnType(Schema.UUID, Schema.Never, Schema.Never);
      const numberSchema = columnType(Schema.Number, Schema.Never, Schema.Never);
      const dateSchema = columnType(DateFromInput, Schema.Never, Schema.Never);

      // Runtime validation - verify Schema type is preserved through columnType()
      expect(Schema.isSchema(uuidSchema)).toBe(true);
      expect(Schema.isSchema(numberSchema)).toBe(true);
      expect(Schema.isSchema(dateSchema)).toBe(true);
    });

    it('should return schemas with preserved TypeScript types from schema functions', () => {
      const baseSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        createdAt: generated(DateFromInput),
        name: Schema.String,
      });

      // Runtime validation - verify all schemas are valid Schema instances
      expect(Schema.isSchema(Selectable(baseSchema))).toBe(true);
      expect(Schema.isSchema(Insertable(baseSchema))).toBe(true);
      expect(Schema.isSchema(Updateable(baseSchema))).toBe(true);
    });

    it('should make arrays mutable in Insertable schema for Kysely compatibility', () => {
      const baseSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        names: Schema.Array(Schema.String),
        tags: Schema.Array(Schema.String),
      });

      // Runtime validation - arrays should be mutable
      const insertData = {
        names: ['typescript', 'effect'],
        tags: ['kysely', 'prisma'],
      };

      const result = Schema.decodeUnknownSync(Insertable(baseSchema))(insertData);
      expect(result).toEqual(insertData);

      // Verify the decoded arrays are mutable (have push method)
      expect(Array.isArray(result.names)).toBe(true);
      (result.names as string[]).push('new-item');
      expect(result.names).toContain('new-item');
    });

    it('should make arrays mutable in Updateable schema for Kysely compatibility', () => {
      const baseSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        roles: Schema.Array(Schema.String),
      });

      // Runtime validation - arrays should be mutable
      const updateData = {
        roles: ['admin', 'user'],
      };

      const result = Schema.decodeUnknownSync(Updateable(baseSchema))(updateData);
      expect(result).toEqual(updateData);

      // Verify the decoded arrays are mutable
      expect(Array.isArray(result.roles)).toBe(true);
      (result.roles as string[]).push('moderator');
      expect(result.roles).toContain('moderator');
    });

    it('should preserve readonly arrays in Selectable schema', () => {
      const baseSchema = Schema.Struct({
        id: Schema.UUID,
        items: Schema.Array(Schema.String),
      });

      // Runtime validation - decode should work
      const selectData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        items: ['a', 'b', 'c'],
      };

      const result = Schema.decodeUnknownSync(Selectable(baseSchema))(selectData);
      expect(result).toEqual(selectData);
      expect(result.items).toEqual(['a', 'b', 'c']);
    });

    it('should handle nested array types correctly', () => {
      const baseSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        coordinates: Schema.Array(Schema.Array(Schema.Number)),
      });

      // Insertable: nested arrays should be mutable (no id field in insert)
      const insertData = {
        coordinates: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      };

      const insertResult = Schema.decodeUnknownSync(Insertable(baseSchema))(insertData);
      expect(insertResult).toEqual(insertData);

      // Verify nested arrays are mutable
      (insertResult.coordinates as number[][])[0].push(3);
      expect(insertResult.coordinates[0]).toEqual([1, 2, 3]);

      // Selectable: nested arrays should be readonly (id field required)
      const selectData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      };

      const selectResult = Schema.decodeUnknownSync(Selectable(baseSchema))(selectData);
      expect(selectResult).toEqual(selectData);
    });

    it('should handle array types with columnType() wrapper correctly', () => {
      const baseSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        names: Schema.Array(Schema.String),
      });

      // Insertable should accept mutable arrays
      const insertData = {
        names: ['test1', 'test2'],
      };

      const insertResult = Schema.decodeUnknownSync(Insertable(baseSchema))(insertData);
      expect(insertResult).toEqual(insertData);

      // Updateable should accept mutable arrays
      const updateData = {
        names: ['updated1', 'updated2'],
      };

      const updateResult = Schema.decodeUnknownSync(Updateable(baseSchema))(updateData);
      expect(updateResult).toEqual(updateData);
    });

    it('should handle generated array fields (user use case: verification_fields_needed)', () => {
      const baseSchema = Schema.Struct({
        id: columnType(Schema.UUID, Schema.Never, Schema.Never),
        verification_fields_needed: generated(Schema.Array(Schema.String)),
        name: Schema.String,
      });

      // Selectable should include the generated array field
      const selectData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        verification_fields_needed: ['email', 'phone'],
        name: 'Test',
      };
      const selectResult = Schema.decodeUnknownSync(Selectable(baseSchema))(selectData);
      expect(selectResult.verification_fields_needed).toEqual(['email', 'phone']);

      // Insertable should NOT include the generated field (omitted entirely)
      const insertData = {
        name: 'Test',
      };
      const insertResult = Schema.decodeUnknownSync(Insertable(baseSchema))(insertData);
      expect(insertResult).toEqual(insertData);
      expect(insertResult).not.toHaveProperty('verification_fields_needed');

      // Updateable should allow updating the generated field
      const updateData = {
        verification_fields_needed: ['email', 'phone', 'address'],
      };
      const updateResult = Schema.decodeUnknownSync(Updateable(baseSchema))(updateData);
      expect(updateResult.verification_fields_needed).toEqual(['email', 'phone', 'address']);

      // Verify the array is mutable for update operations
      (updateResult.verification_fields_needed as string[]).push('ssn');
      expect(updateResult.verification_fields_needed).toContain('ssn');
    });
  });
});
