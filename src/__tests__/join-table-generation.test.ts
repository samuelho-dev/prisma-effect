import prismaInternals from '@prisma/internals';
import { describe, expect, it } from 'vitest';
import { generateJoinTableSchema } from '../effect/join-table';
import { detectImplicitManyToMany } from '../prisma/relation';

const { getDMMF } = prismaInternals;

/**
 * Join Table Generation - Functional Behavior Tests
 *
 * Tests verify BEHAVIOR not IMPLEMENTATION:
 * - Does generated code use semantic field names (category_id vs A)?
 * - Are field names properly mapped to Prisma's A/B columns?
 * - Do generated schemas support operational types (Select/Insert/Update)?
 * - Does the generator handle different ID types (UUID, Int)?
 *
 * Minimal string matching - focus on key generated patterns.
 * NO type coercions (as any, as unknown).
 */

describe('Join Table Generation - Functional Tests', () => {
  describe('Semantic Field Names with A/B Mapping', () => {
    it('should generate semantic snake_case field names mapped to database A/B columns', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id         String     @id @db.Uuid
          categories Category[]
        }

        model Category {
          id    String @id @db.Uuid
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Should use semantic names in TypeScript
      expect(generated).toContain('category_id:');
      expect(generated).toContain('post_id:');

      // Should map semantic field names to the database A/B columns via encodeKeys
      expect(generated).toContain('Schema.encodeKeys(');
      expect(generated).toMatch(/category_id:\s*"A"/);
      expect(generated).toMatch(/post_id:\s*"B"/);

      // Should NOT use raw A/B field names
      expect(generated).not.toMatch(/\bA:\s+columnType/);
      expect(generated).not.toMatch(/\bB:\s+columnType/);
    });

    it('should handle multi-word model names with snake_case', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Product {
          id   String      @id
          tags ProductTag[]
        }

        model ProductTag {
          id       String    @id
          products Product[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Product < ProductTag alphabetically, so A = Product, B = ProductTag
      expect(generated).toContain('product_id:');
      expect(generated).toContain('product_tag_id:');
      expect(generated).toContain('Schema.encodeKeys(');
      expect(generated).toMatch(/product_id:\s*"A"/);
      expect(generated).toMatch(/product_tag_id:\s*"B"/);
    });
  });

  describe('Schema Structure Generation', () => {
    it('should generate schema directly with PascalCase export', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id         String     @id @db.Uuid
          categories Category[]
        }

        model Category {
          id    String @id @db.Uuid
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Schema is exported directly (not internal with underscore)
      expect(generated).toContain('export const CategoryToPost = Schema.Struct({');
      expect(generated).toContain('export type CategoryToPost = typeof CategoryToPost;');
    });

    it('should generate type alias for schema', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id         String     @id
          categories Category[]
        }

        model Category {
          id    String @id
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      expect(generated).toContain('export type CategoryToPost = typeof CategoryToPost;');
    });

    it('should include descriptive comment header', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id         String     @id
          categories Category[]
        }

        model Category {
          id    String @id
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      expect(generated).toContain('// _CategoryToPost Join Table Schema');
      expect(generated).toContain('// Database columns: A (Category), B (Post)');
      expect(generated).toContain('// TypeScript fields: category_id, post_id');
    });
  });

  describe('Schema Exports', () => {
    it('should export schema directly with type alias', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id         String     @id
          categories Category[]
        }

        model Category {
          id    String @id
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Should export schema directly with type alias
      expect(generated).toContain('export const CategoryToPost = Schema.Struct({');
      expect(generated).toContain('export type CategoryToPost = typeof CategoryToPost;');
    });

    it('should not export individual type aliases', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id         String     @id
          categories Category[]
        }

        model Category {
          id    String @id
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // No type aliases - consumers use type utilities: Selectable<typeof CategoryToPost>
      expect(generated).not.toContain('export type CategoryToPostSelect');
      expect(generated).not.toContain('export type CategoryToPostSelectEncoded');
    });
  });

  describe('Branded ID Type References', () => {
    it('should reference branded ID schemas for UUID ID fields', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id         String     @id @db.Uuid
          categories Category[]
        }

        model Category {
          id    String @id @db.Uuid
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Should reference branded ID schemas, not raw Schema.String.check(Schema.isUUID())
      expect(generated).toContain('columnType(CategoryId, Schema.Never, Schema.Never)');
      expect(generated).toContain('columnType(PostId, Schema.Never, Schema.Never)');
      expect(generated).not.toContain('Schema.String.check(Schema.isUUID())');
    });

    it('should reference branded ID schemas for Int ID fields', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id         Int        @id @default(autoincrement())
          categories Category[]
        }

        model Category {
          id    Int    @id @default(autoincrement())
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Should reference branded ID schemas regardless of underlying type
      expect(generated).toContain('columnType(CategoryId, Schema.Never, Schema.Never)');
      expect(generated).toContain('columnType(PostId, Schema.Never, Schema.Never)');
      expect(generated).not.toContain('Schema.Number');
    });

    it('should reference branded ID schemas for mixed ID types across models', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model Post {
          id   String @id @db.Uuid
          tags Tag[]
        }

        model Tag {
          id    Int   @id @default(autoincrement())
          posts Post[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Post comes before Tag alphabetically, so A = Post, B = Tag
      expect(generated).toContain('post_id:');
      expect(generated).toContain('columnType(PostId, Schema.Never, Schema.Never)');
      expect(generated).toContain('tag_id:');
      expect(generated).toContain('columnType(TagId, Schema.Never, Schema.Never)');
      // Should not contain raw schema types
      expect(generated).not.toContain('Schema.String.check(Schema.isUUID())');
      expect(generated).not.toContain('Schema.Number');
    });

    it('should derive branded ID name from PascalCase model name', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model UserProfile {
          id           String         @id
          permissions  UserPermission[]
        }

        model UserPermission {
          id       String       @id
          profiles UserProfile[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Branded IDs should follow PascalCase model name + "Id"
      expect(generated).toContain('columnType(UserPermissionId, Schema.Never, Schema.Never)');
      expect(generated).toContain('columnType(UserProfileId, Schema.Never, Schema.Never)');
    });
  });

  describe('Read-Only Foreign Keys', () => {
    it('should use columnType for read-only behavior on both columns', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model User {
          id    String @id
          roles Role[]
        }

        model Role {
          id    String @id
          users User[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Both columns should use columnType with Never for insert/update
      const columnTypeMatches = generated.match(/columnType/g);
      expect(columnTypeMatches).toHaveLength(2); // Once for A, once for B

      // Should use Never for insert and update (read-only)
      expect(generated).toContain('Schema.Never, Schema.Never');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complex M2M with compound names', async () => {
      const schema = `
        datasource db {
          provider = "postgresql"
        }

        model UserProfile {
          id           String         @id
          permissions  UserPermission[]
        }

        model UserPermission {
          id       String       @id
          profiles UserProfile[]
        }
      `;

      const dmmf = await getDMMF({ datamodel: schema });
      const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);
      const generated = generateJoinTableSchema(joinTables[0], dmmf);

      // Should generate semantic snake_case for compound words
      expect(generated).toContain('user_permission_id:');
      expect(generated).toContain('user_profile_id:');

      // Should still map to A/B via encodeKeys
      expect(generated).toContain('Schema.encodeKeys(');
      expect(generated).toMatch(/user_permission_id:\s*"A"/);
      expect(generated).toMatch(/user_profile_id:\s*"B"/);
    });
  });
});
