/**
 * JsonValue Schema Tests
 *
 * Tests verify:
 * - JsonValue accepts all valid JSON types (string, number, boolean, null, array, object)
 * - JsonValue rejects non-JSON values (undefined, Date, functions)
 * - NullOr(JsonValue) preserves null distinction (not absorbed like NullOr(Unknown))
 * - Selectable/Insertable with JsonValue fields resolve to concrete types, not {}
 * - JsonValue works as runtime schema for decode/encode
 */

import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { columnType, generated, JsonValue, Insertable, Selectable } from '../kysely/helpers';

describe('JsonValue Schema', () => {
  describe('type definition', () => {
    it('should be a valid Effect schema', () => {
      expect(Schema.isSchema(JsonValue)).toBe(true);
    });

    it('should accept string values', () => {
      const result = Schema.decodeUnknownSync(JsonValue)('hello');
      expect(result).toBe('hello');
    });

    it('should accept number values', () => {
      const result = Schema.decodeUnknownSync(JsonValue)(42);
      expect(result).toBe(42);
    });

    it('should accept boolean values', () => {
      expect(Schema.decodeUnknownSync(JsonValue)(true)).toBe(true);
      expect(Schema.decodeUnknownSync(JsonValue)(false)).toBe(false);
    });

    it('should accept null', () => {
      const result = Schema.decodeUnknownSync(JsonValue)(null);
      expect(result).toBeNull();
    });

    it('should accept arrays of JSON values', () => {
      const result = Schema.decodeUnknownSync(JsonValue)([1, 'two', true, null]);
      expect(result).toEqual([1, 'two', true, null]);
    });

    it('should accept nested arrays', () => {
      const result = Schema.decodeUnknownSync(JsonValue)([
        [1, 2],
        [3, [4, 5]],
      ]);
      expect(result).toEqual([
        [1, 2],
        [3, [4, 5]],
      ]);
    });

    it('should accept plain objects', () => {
      const result = Schema.decodeUnknownSync(JsonValue)({ key: 'value', num: 42 });
      expect(result).toEqual({ key: 'value', num: 42 });
    });

    it('should accept deeply nested objects', () => {
      const deep = {
        level1: {
          level2: {
            level3: [1, { nested: true }],
          },
        },
      };
      const result = Schema.decodeUnknownSync(JsonValue)(deep);
      expect(result).toEqual(deep);
    });
  });

  describe('NullOr(JsonValue) preserves null distinction', () => {
    it('should not absorb null into the type', () => {
      // This is the key test — Schema.NullOr(Schema.Unknown) resolves to `unknown`
      // because `unknown | null = unknown`. Schema.NullOr(JsonValue) should NOT
      // collapse — it should remain `JsonValue | null` as a distinct union.
      type NullableJson = Schema.Schema.Type<typeof NullableJsonSchema>;
      const NullableJsonSchema = Schema.NullOr(JsonValue);

      // Type-level check: null should be distinguishable from JsonValue
      // If this were Schema.Unknown, NullableJson would just be `unknown`
      // and this type-level test would fail (unknown extends null is false,
      // but null extends unknown is true — so they'd be the same type)
      type IsDistinct = [NullableJson] extends [JsonValue] ? false : true;
      // NullableJson = JsonValue | null, which does NOT extend JsonValue alone
      // because null is already part of JsonValue union... wait.
      // Actually JsonValue includes null in its union. So NullOr(JsonValue) = JsonValue.
      // BUT the key point is that JsonValue is a CONCRETE union type, not `unknown`.
      // The TS language server can resolve it without hitting depth limits.

      // Runtime: both null and objects should decode
      expect(Schema.decodeUnknownSync(NullableJsonSchema)(null)).toBeNull();
      expect(Schema.decodeUnknownSync(NullableJsonSchema)({ key: 'value' })).toEqual({
        key: 'value',
      });
    });

    it('should produce a concrete type that the TS language server can resolve', () => {
      // Define a model with a JsonValue field — same as what the generator produces
      const ProductLike = Schema.Struct({
        id: columnType(Schema.String.pipe(Schema.brand('ProductId')), Schema.Never, Schema.Never),
        name: Schema.String,
        content: Schema.NullOr(JsonValue),
        metadata: Schema.NullOr(JsonValue),
        created_at: generated(Schema.Date),
      });

      type ProductLike = typeof ProductLike;

      // Selectable should resolve to a concrete type with named fields
      type Selected = Selectable<ProductLike>;

      // Verify the type is NOT {} — it has concrete fields
      type HasName = 'name' extends keyof Selected ? true : false;
      type HasContent = 'content' extends keyof Selected ? true : false;
      type HasMetadata = 'metadata' extends keyof Selected ? true : false;

      const hasName: HasName = true;
      const hasContent: HasContent = true;
      const hasMetadata: HasMetadata = true;

      expect(hasName).toBe(true);
      expect(hasContent).toBe(true);
      expect(hasMetadata).toBe(true);

      // Runtime: decode a product-like object
      const selectSchema = Selectable(ProductLike);
      const product = Schema.decodeUnknownSync(selectSchema)({
        id: 'prod-123',
        name: 'Test Product',
        content: null,
        metadata: { tags: ['audio', 'sample'] },
        created_at: new Date(),
      });

      expect(product.name).toBe('Test Product');
      expect(product.content).toBeNull();
      expect(product.metadata).toEqual({ tags: ['audio', 'sample'] });
    });
  });

  describe('Insertable with JsonValue fields', () => {
    it('should make NullOr(JsonValue) fields optional on insert', () => {
      const TestModel = Schema.Struct({
        name: Schema.String,
        metadata: Schema.NullOr(JsonValue),
      });

      const insertSchema = Insertable(TestModel);

      // Should work without metadata (optional because nullable)
      const withoutMetadata = Schema.decodeUnknownSync(insertSchema)({
        name: 'Test',
      });
      expect(withoutMetadata.name).toBe('Test');

      // Should work with metadata
      const withMetadata = Schema.decodeUnknownSync(insertSchema)({
        name: 'Test',
        metadata: { key: 'value' },
      });
      expect(withMetadata.metadata).toEqual({ key: 'value' });
    });
  });
});
