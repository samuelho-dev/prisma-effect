import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GeneratorOptions } from '@prisma/generator-helper';
import prismaInternals from '@prisma/internals';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GeneratorOrchestrator } from '../generator/orchestrator';

const { getDMMF } = prismaInternals;

// Mock prettier to avoid dynamic import issues
vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

describe('Kysely Native Integration', () => {
  const testSchema = `
    datasource db {
      provider = "postgresql"
    }

    generator effectSchemas {
      provider = "prisma-effect-kysely"
      output   = "./test-kysely-native"
    }

    model User {
      id         String   @id @default(uuid()) @db.Uuid
      name       String
      email      String
      created_at DateTime @default(now())
      updated_at DateTime @updatedAt
    }

    model Post {
      id        String   @id @default(uuid()) @db.Uuid
      title     String
      content   String?
      published Boolean  @default(false)
      author_id String   @db.Uuid
    }
  `;

  const outputDir = path.join(import.meta.dirname, 'test-kysely-native');

  beforeAll(async () => {
    const dmmf = await getDMMF({ datamodel: testSchema });

    const options: GeneratorOptions = {
      generator: { output: { value: outputDir } },
      dmmf,
    } as GeneratorOptions;

    const orchestrator = new GeneratorOrchestrator(options);
    await orchestrator.generate(options);
  });

  afterAll(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  describe('Effect Schema Generation', () => {
    it('should generate Effect schemas with columnType and generated helpers', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // Should import from prisma-effect-kysely (includes columnType, generated)
      expect(typesContent).toMatch(/from ["']prisma-effect-kysely["']/);

      // Should generate schemas directly (no underscore prefix)
      expect(typesContent).toMatch(/export const User = Schema\.Struct/);

      // Should use columnType for read-only ID fields
      expect(typesContent).toContain('columnType(');

      // Should use generated() for fields with @default
      expect(typesContent).toContain('generated(');
    });

    it('should generate schemas for Post model', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // Should generate schema for Post directly
      expect(typesContent).toMatch(/export const Post = Schema\.Struct/);

      // Optional content field should use Schema.NullOr
      expect(typesContent).toMatch(/content:\s*Schema\.NullOr/);

      // Boolean with @default should use generated()
      expect(typesContent).toContain('generated(Schema.Boolean)');
    });
  });

  describe('DB Interface with Schema.Schema.Type Pattern', () => {
    it('should use Schema.Schema.Type<typeof Model> in DB interface', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // DB interface should use Schema.Schema.Type<typeof Model> to preserve phantom properties
      expect(typesContent).toMatch(/export interface DB \{/);
      expect(typesContent).toMatch(/User:\s*Schema\.Schema\.Type<typeof User>/);
      expect(typesContent).toMatch(/Post:\s*Schema\.Schema\.Type<typeof Post>/);

      // Should NOT use SelectEncoded in DB interface
      expect(typesContent).not.toMatch(/User:\s*UserSelectEncoded/);
      expect(typesContent).not.toMatch(/Post:\s*PostSelectEncoded/);
    });
  });

  describe('Package Type Utilities Compatibility', () => {
    it('should generate types that work with package Insertable/Selectable', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // Package provides Insertable, Selectable, Updateable utilities
      // DB interface uses Schema.Schema.Type<typeof Model> to preserve phantom properties
      expect(typesContent).toMatch(/Schema\.Schema\.Type<typeof User>/);

      // Effect schemas use columnType for read-only ID fields
      expect(typesContent).toContain('columnType(');

      // Schema exports type alias for type usage
      expect(typesContent).toMatch(/export type User = typeof User/);
    });
  });

  describe('Effect Schema Integration', () => {
    it('should still generate Effect schemas with runtime helpers', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // Should generate schemas directly (no underscore prefix)
      expect(typesContent).toMatch(/export const User = Schema\.Struct/);

      // Should still use columnType and generated helpers
      expect(typesContent).toContain('columnType(');
      expect(typesContent).toContain('generated(');

      // Should generate branded ID schemas
      expect(typesContent).toMatch(
        /export const UserId = Schema\.UUID\.pipe\(Schema\.brand\("UserId"\)\)/
      );

      // Should export type alias
      expect(typesContent).toMatch(/export type User = typeof User/);

      // No type aliases for Select/Insert - consumers use type utilities
      expect(typesContent).not.toMatch(/export type UserSelect\s*=/);
      expect(typesContent).not.toMatch(/export type UserSelectEncoded\s*=/);
    });
  });

  describe('Effect Schema Type Mapping', () => {
    it('should map UUID to Schema.UUID for Effect schemas', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // UUID fields use Schema.UUID with branding for IDs
      expect(typesContent).toMatch(/Schema\.UUID\.pipe\(Schema\.brand/);
      // FK fields use Schema.UUID (not branded since no FK relation in this schema)
      expect(typesContent).toMatch(/author_id:\s*Schema\.UUID/);
    });

    it('should map DateTime to DateFromInput for Effect schemas', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // DateTime fields use DateFromInput (dual-boundary Date schema):
      // - Encoded = Date | string (Kysely native AND JSON wire)
      // - Type = Date (runtime)
      expect(typesContent).toContain('generated(DateFromInput)');
      expect(typesContent).toContain(
        'import { columnType, generated, JsonValue, DateFromInput } from "prisma-effect-kysely"'
      );
    });

    it('should map Boolean correctly for Effect schemas', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // Boolean field with @default uses generated() wrapper
      expect(typesContent).toContain('generated(Schema.Boolean)');
    });
  });

  describe('Schema Export Pattern', () => {
    it('should export schema with type alias', async () => {
      const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

      // Schemas are exported directly
      expect(typesContent).toMatch(/export const User = Schema\.Struct/);
      expect(typesContent).toMatch(/export const Post = Schema\.Struct/);

      // Type aliases for type usage
      expect(typesContent).toMatch(/export type User = typeof User/);
      expect(typesContent).toMatch(/export type Post = typeof Post/);
    });
  });
});
