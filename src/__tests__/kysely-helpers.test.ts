import { Schema } from 'effect';
import { columnType, generated, getSchemas } from '../kysely/helpers';

describe('Kysely Helpers', () => {
  describe('columnType', () => {
    it('should create a schema with separate select, insert, and update types', () => {
      const schema = columnType(
        Schema.Number,
        Schema.Never,
        Schema.Never,
      );

      // Verify schema has ColumnTypeId annotation
      const symbolKey = Symbol.for('/ColumnTypeId');
      expect(symbolKey in schema.ast.annotations).toBe(true);

      // Verify AST structure
      expect(schema.ast._tag).toBe('NeverKeyword');
      expect(typeof schema.pipe).toBe('function');
    });

    it('should store select, insert, and update schemas', () => {
      const selectSchema = Schema.Number;
      const insertSchema = Schema.Never;
      const updateSchema = Schema.Never;

      const schema = columnType(selectSchema, insertSchema, updateSchema);
      const annotations = schema.ast.annotations;
      const symbolKey = Symbol.for('/ColumnTypeId');
      const schemas = annotations[symbolKey] as {
        selectSchema: typeof selectSchema;
        insertSchema: typeof insertSchema;
        updateSchema: typeof updateSchema;
      };

      expect(schemas).toEqual({
        selectSchema,
        insertSchema,
        updateSchema,
      });
    });
  });

  describe('generated', () => {
    it('should create a schema that allows undefined during insert', () => {
      const schema = generated(Schema.Number);

      // Verify schema has GeneratedId annotation
      const symbolKey = Symbol.for('/GeneratedId');
      expect(symbolKey in schema.ast.annotations).toBe(true);

      // Verify it returns a schema with proper structure
      expect(schema.ast._tag).toBe('NeverKeyword');
      expect(typeof schema.pipe).toBe('function');
    });
  });

  describe('getSchemas', () => {
    it('should return Selectable, Insertable, and Updateable schemas', () => {
      const baseSchema = Schema.Struct({
        id: Schema.Number,
        name: Schema.String,
      });

      const schemas = getSchemas(baseSchema);

      expect(schemas).toHaveProperty('Selectable');
      expect(schemas).toHaveProperty('Insertable');
      expect(schemas).toHaveProperty('Updateable');
    });
  });

  describe('Runtime Validation', () => {
    describe('Schema Structure', () => {
      it('should filter out Never types in insert schema', () => {
      const baseSchema = Schema.Struct({
        id: columnType(Schema.Number, Schema.Never, Schema.Never),
        name: Schema.String,
      });

      const schemas = getSchemas(baseSchema);

      // id should not be in Insertable since its insert type is Never
      expect(schemas.Insertable.ast._tag).toBe('TypeLiteral');
      if (schemas.Insertable.ast._tag === 'TypeLiteral') {
        const fieldNames = schemas.Insertable.ast.propertySignatures.map((p: any) => p.name);
        expect(fieldNames).not.toContain('id');
        expect(fieldNames).toContain('name');
      }
    });
  });

    describe('Selectable schema decoding', () => {
      it('should decode valid Selectable data', () => {
        const baseSchema = Schema.Struct({
          id: generated(Schema.Number),
          name: Schema.String,
        });
        const schemas = getSchemas(baseSchema);

        const result = Schema.decodeUnknownSync(schemas.Selectable)({
          id: 123,
          name: 'test',
        });

        expect(result).toEqual({ id: 123, name: 'test' });
      });
    });

    describe('Insertable schema decoding', () => {
      it('should decode Insertable without generated fields', () => {
        const baseSchema = Schema.Struct({
          id: generated(Schema.Number),
          name: Schema.String,
        });
        const schemas = getSchemas(baseSchema);

        // Should work without 'id' (generated field)
        const result = Schema.decodeUnknownSync(schemas.Insertable)({
          name: 'test',
        });

        expect(result).toEqual({ name: 'test' });
      });

      it('should omit fields with Never insert type', () => {
        const baseSchema = Schema.Struct({
          id: columnType(Schema.Number, Schema.Never, Schema.Never),
          name: Schema.String,
        });
        const schemas = getSchemas(baseSchema);

        // Should decode without 'id' field
        const result = Schema.decodeUnknownSync(schemas.Insertable)({
          name: 'test',
        });

        expect(result).toEqual({ name: 'test' });
      });
    });

    describe('Updateable schema decoding', () => {
      it('should accept partial updates', () => {
        const baseSchema = Schema.Struct({
          id: Schema.Number,
          email: Schema.String,
          name: Schema.String,
        });
        const schemas = getSchemas(baseSchema);

        // Should accept partial update (only email)
        const result = Schema.decodeUnknownSync(schemas.Updateable)({
          email: 'new@example.com',
        });

        expect(result).toEqual({ email: 'new@example.com' });
      });
    });

    describe('Optional type detection (isOptionalType)', () => {
      it('should detect Undefined in Union and make field optional in Insertable', () => {
        const baseSchema = Schema.Struct({
          optional: Schema.Union(Schema.String, Schema.Undefined),
          required: Schema.String,
        });
        const schemas = getSchemas(baseSchema);

        // Should decode without optional field
        const result1 = Schema.decodeUnknownSync(schemas.Insertable)({
          required: 'test',
        });
        expect(result1).toEqual({ required: 'test' });

        // Should also accept optional field if provided
        const result2 = Schema.decodeUnknownSync(schemas.Insertable)({
          optional: 'value',
          required: 'test',
        });
        expect(result2).toEqual({ optional: 'value', required: 'test' });
      });
    });
  });
});
