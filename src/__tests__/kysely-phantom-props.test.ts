import type {
  Insertable as KyselyInsertable,
  Selectable as KyselySelectable,
  Updateable as KyselyUpdateable,
} from 'kysely';
import { describe, expectTypeOf, it } from 'vitest';
import type { ColumnType, Generated } from '../kysely/helpers';

/**
 * Tests for Kysely phantom property compatibility.
 *
 * These tests verify that our ColumnType and Generated types have the
 * __select__, __insert__, __update__ phantom properties that Kysely's
 * type extraction utilities expect.
 */
describe('Kysely Phantom Property Compatibility', () => {
  describe('ColumnType phantom properties', () => {
    it('should have __select__ phantom property', () => {
      type TestColumnType = ColumnType<string, never, string>;
      // Verify __select__ is extractable
      type ExtractedSelect = TestColumnType extends { __select__: infer S } ? S : 'fallback';
      expectTypeOf<ExtractedSelect>().toEqualTypeOf<string>();
    });

    it('should have __insert__ phantom property', () => {
      type TestColumnType = ColumnType<string, never, string>;
      // Kysely's InsertType checks: T extends { __insert__: infer I }
      type ExtractedInsert = TestColumnType extends { __insert__: infer I } ? I : 'fallback';
      expectTypeOf<ExtractedInsert>().toEqualTypeOf<never>();
    });

    it('should have __update__ phantom property', () => {
      type TestColumnType = ColumnType<string, never, string>;
      type ExtractedUpdate = TestColumnType extends { __update__: infer U } ? U : 'fallback';
      expectTypeOf<ExtractedUpdate>().toEqualTypeOf<string>();
    });

    it('should still be a subtype of the select type', () => {
      type TestColumnType = ColumnType<string, never, never>;
      // ColumnType<string, ...> should be assignable to string
      // (because it's string & ... intersection)
      const value: TestColumnType = 'test' as TestColumnType;
      const plainString: string = value; // Should work
      expectTypeOf<TestColumnType>().toMatchTypeOf<string>();
    });
  });

  describe('Generated phantom properties', () => {
    it('should have __select__ phantom property', () => {
      type TestGenerated = Generated<Date>;
      type ExtractedSelect = TestGenerated extends { __select__: infer S } ? S : 'fallback';
      expectTypeOf<ExtractedSelect>().toEqualTypeOf<Date>();
    });

    it('should have __insert__: never phantom property', () => {
      type TestGenerated = Generated<Date>;
      type ExtractedInsert = TestGenerated extends { __insert__: infer I } ? I : 'fallback';
      expectTypeOf<ExtractedInsert>().toEqualTypeOf<never>();
    });

    it('should have __update__ phantom property matching base type', () => {
      type TestGenerated = Generated<Date>;
      type ExtractedUpdate = TestGenerated extends { __update__: infer U } ? U : 'fallback';
      expectTypeOf<ExtractedUpdate>().toEqualTypeOf<Date>();
    });
  });

  describe('Kysely native utilities compatibility', () => {
    it('Kysely Insertable should work with table using our ColumnType', () => {
      // Simulated table interface using our types
      interface TestTable {
        id: ColumnType<string, never, never>; // Read-only ID
        email: string; // Regular required field
        name: string; // Regular required field
        createdAt: Generated<Date>; // Generated field
      }

      type TestInsert = KyselyInsertable<TestTable>;

      // id should be omitted (insert type is 'never')
      // createdAt should be omitted (Generated = never insert)
      // email and name should be required
      expectTypeOf<TestInsert>().toEqualTypeOf<{ email: string; name: string }>();
    });

    it('Kysely Selectable should work with table using our ColumnType', () => {
      interface TestTable {
        id: ColumnType<string, never, never>;
        email: string;
        createdAt: Generated<Date>;
      }

      type TestSelect = KyselySelectable<TestTable>;

      // All fields should be present in select type
      expectTypeOf<TestSelect>().toEqualTypeOf<{
        id: string;
        email: string;
        createdAt: Date;
      }>();
    });

    it('Kysely Updateable should work with table using our ColumnType', () => {
      interface TestTable {
        id: ColumnType<string, never, never>; // Read-only (update: never)
        email: string; // Can update
        updatedAt: ColumnType<Date, Date | undefined, Date>; // Can update
      }

      type TestUpdate = KyselyUpdateable<TestTable>;

      // id should be omitted (update type is 'never')
      // email and updatedAt should be optional
      expectTypeOf<TestUpdate>().toEqualTypeOf<{
        email?: string;
        updatedAt?: Date;
      }>();
    });
  });

  describe('Integration with DB interface pattern', () => {
    it('should work with Schema.Schema.Type pattern used in DB interface', () => {
      // This simulates how the generator produces DB interface:
      // export interface DB {
      //   User: Schema.Schema.Encoded<typeof User>;
      // }
      //
      // Where User schema has fields with ColumnType and Generated wrappers

      // Simulated row type (what Schema.Schema.Encoded<typeof User> produces)
      interface UserRow {
        id: ColumnType<string, never, never>;
        email: string;
        name: string;
        createdAt: Generated<Date>;
        updatedAt: Date;
      }

      interface DB {
        User: UserRow;
      }

      // Kysely's InsertExpression uses InsertType on each field
      type UserInsert = KyselyInsertable<DB['User']>;

      // Should correctly extract insert type:
      // - id: never (omitted)
      // - email: string (required)
      // - name: string (required)
      // - createdAt: never (omitted - Generated)
      // - updatedAt: Date (required)
      expectTypeOf<UserInsert>().toEqualTypeOf<{
        email: string;
        name: string;
        updatedAt: Date;
      }>();
    });
  });
});
