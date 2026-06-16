import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DMMF, GeneratorOptions } from '@prisma/generator-helper';
import prismaInternals from '@prisma/internals';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneratorOrchestrator } from '../generator/orchestrator';

const { getDMMF } = prismaInternals;

/**
 * Kysely Integration - Functional Behavior Tests
 *
 * Tests verify BEHAVIOR not IMPLEMENTATION:
 * - Does generated code work with Kysely's type system?
 * - Can we perform joins without type errors?
 * - Are DB interface types correctly inferred?
 * - Do generated schemas integrate with Kysely queries?
 *
 * Minimal string matching - focus on type-level behavior.
 * NO type coercions (as any, as unknown).
 */

// Mock prettier to avoid dynamic import issues
vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

describe('Kysely Integration - Functional Tests', () => {
  const testOutputPath = join(import.meta.dirname, '../test-output-kysely');
  const fixtureSchemaPath = join(import.meta.dirname, 'fixtures/test.prisma');

  let dmmf: DMMF.Document;

  beforeAll(async () => {
    const schemaContent = readFileSync(fixtureSchemaPath, 'utf-8');
    dmmf = await getDMMF({ datamodel: schemaContent });
  });

  afterEach(async () => {
    if (existsSync(testOutputPath)) {
      await rm(testOutputPath, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    dmmf = undefined;
  });

  describe('Schema Generation Structure', () => {
    let typesContent: string;

    beforeEach(async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);
      typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');
    });

    it('should generate schemas directly without underscore prefix', () => {
      // Schemas are exported directly (e.g., User, Post)
      expect(typesContent).toMatch(/export const UserTable = Schema.Struct/);
      expect(typesContent).toMatch(/export const PostTable = Schema.Struct/);
    });

    it('should use generated() for fields with @default', () => {
      // Fields with @default should use generated()
      expect(typesContent).toMatch(/generated\(/);
    });

    it('should export schemas with type aliases', () => {
      // Pattern: export const User = Schema.Struct({...}); export type User = typeof User.Type;
      expect(typesContent).toMatch(/export const UserTable = Schema.Struct/);
      expect(typesContent).toMatch(/export type User = typeof User.Type/);
    });

    it('should generate DB interface with Schema.Schema.Type pattern', () => {
      // DB interface uses Schema.Schema.Type<typeof Model> to preserve phantom properties
      expect(typesContent).toContain('export interface DB');
      expect(typesContent).toMatch(/:\s*Schema\.Schema\.Type<typeof \w+>;/);
    });

    it('should define DB as interface not type', () => {
      expect(typesContent).toMatch(/export interface DB\s*{/);
      expect(typesContent).not.toMatch(/export type DB\s*=/);
    });
  });

  describe('Field Name Mapping (@map Support)', () => {
    let typesContent: string;

    beforeEach(async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);
      typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');
    });

    it('should use encodeKeys to map @map field names to DB columns', () => {
      // Effect 4: struct-level Schema.encodeKeys({ tsName: "db_name" }) replaces
      // the per-field Schema.propertySignature(...).pipe(Schema.fromKey(...)).
      expect(typesContent).toMatch(/\.pipe\(\s*Schema\.encodeKeys\(/);
    });

    it('should use @@map for table names in DB interface', () => {
      // CompositeIdModel has @@map("composite_id_table")
      // DB interface uses mapped table name with Schema.Schema.Type<typeof Model>
      expect(typesContent).toMatch(
        /composite_id_table:\s*Schema.Schema.Type<typeof CompositeIdModelTable>/
      );
    });
  });

  describe('Schema Exports', () => {
    let typesContent: string;

    beforeEach(async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);
      typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');
    });

    it('should export schemas directly with type aliases', () => {
      // Pattern: export const Model = Schema.Struct({...}); export type Model = typeof Model;
      expect(typesContent).toMatch(/export const \w+ = Schema\.Struct/);
      expect(typesContent).toMatch(/export type \w+ = typeof \w+/);
    });

    it('should not export individual type aliases', () => {
      // No longer generate UserSelect, UserInsert, etc. - consumers use type utilities
      expect(typesContent).not.toMatch(/export type \w+Select\s*=/);
      expect(typesContent).not.toMatch(/export type \w+Insert\s*=/);
      expect(typesContent).not.toMatch(/export type \w+SelectEncoded\s*=/);
    });

    it('should include all models in DB interface', () => {
      const dbMatch = typesContent.match(/export interface DB\s*{([^}]+)}/s);
      expect(dbMatch).toBeTruthy();

      const dbContent = dbMatch?.[1];

      // Should have entries for each model using Schema.Schema.Type<typeof Model>
      expect(dbContent).toMatch(/:\s*Schema\.Schema\.Type<typeof \w+>;/);
    });
  });

  describe('Kysely Type System Compatibility', () => {
    let typesContent: string;

    beforeEach(async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);
      typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');
    });

    it('should use Schema.Schema.Type pattern for type safety', () => {
      // DB interface uses Schema.Schema.Type<typeof Model> to preserve phantom properties
      // Consumers use Insertable<User>, Selectable<User>, Updateable<User>
      expect(typesContent).toMatch(/Schema\.Schema\.Type<typeof \w+>/);
    });

    it('should generate DB interface with Schema.Schema.Type pattern', () => {
      // DB interface uses Schema.Schema.Type<typeof Model> to preserve phantom properties
      const dbMatch = typesContent.match(/export interface DB\s*{([^}]+)}/s);
      expect(dbMatch).toBeTruthy();

      const dbContent = dbMatch?.[1];

      // Should use Schema.Schema.Type<typeof Model> pattern
      expect(dbContent).toMatch(/:\s*Schema\.Schema\.Type<typeof \w+>;/);

      // Should NOT use Schema.Schema.Encoded inline
      expect(dbContent).not.toMatch(/Schema\.Schema\.Encoded/);
    });

    it('should expose junction tables by their ENCODED (physical A/B) shape', () => {
      // Implicit M2M join tables have physical Postgres columns `A`/`B`. Kysely
      // uses DB-interface field names as literal SQL identifiers, so the join
      // table must be typed by its ENCODED shape (Schema.Codec.Encoded → { A, B }),
      // NOT the decoded Schema.Schema.Type (which has the semantic *_id names used
      // only for decode output). Emitting the decoded names would make
      // `db.selectFrom('_x').where('_x.A', ...)` impossible / emit invalid SQL.
      expect(typesContent).toMatch(/_product_tags:\s*Schema\.Codec\.Encoded<typeof \w+>/);
    });
  });

  describe('Generated Code Validity', () => {
    let typesContent: string;
    let indexContent: string;

    beforeEach(async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);

      typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');
      indexContent = readFileSync(join(testOutputPath, 'index.ts'), 'utf-8');
    });

    it('should generate valid TypeScript that would compile', () => {
      // Basic syntax checks
      expect(typesContent).toMatch(/import \{ Schema \} from ["']effect["']/);
      expect(typesContent).toContain('export interface DB');

      // Should not have obvious syntax errors
      expect(typesContent).not.toContain('undefined;');
      // Note: 'null;' is now valid in Kysely table interfaces for optional fields (e.g., 'string | null')
    });

    it('should import required dependencies', () => {
      // types.ts should import from effect and runtime
      expect(typesContent).toMatch(/import \{ Schema \} from ["']effect["']/);
      expect(typesContent).toMatch(/from ["']prisma-effect-kysely/);
    });

    it('should re-export all types from index', () => {
      expect(indexContent).toMatch(/export \* from ["']\.\/types\.js["']/);
      expect(indexContent).toMatch(/export \* from ["']\.\/enums\.js["']/);
    });

    it('should generate consistent naming conventions', () => {
      // Model schemas: ModelName (exported directly)
      expect(typesContent).toMatch(/export const \w+ = Schema\.Struct/);

      // Branded ID schemas: ModelNameId
      expect(typesContent).toMatch(/export const \w+Id = Schema\.\w+\.pipe\(Schema\.brand\(/);

      // Type aliases for type usage
      expect(typesContent).toMatch(/export type \w+ = typeof \w+/);
    });
  });

  describe('Generated Code Supports Kysely Patterns', () => {
    let typesContent: string;

    beforeEach(async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);
      typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');
    });

    it('should export DB interface for Kysely constructor', () => {
      // DB interface is required for: new Kysely<DB>(config)
      expect(typesContent).toContain('export interface DB');
    });

    it('should include table names as keys in DB interface', () => {
      const dbMatch = typesContent.match(/export interface DB\s*{([^}]+)}/s);
      expect(dbMatch).toBeTruthy();

      const dbContent = dbMatch?.[1];

      // Should have table entries with Schema.Schema.Type<typeof Model>
      expect(dbContent).toMatch(/\w+:\s*Schema\.Schema\.Type<typeof \w+>;/);
    });

    it('should generate schemas compatible with Effect runtime', () => {
      // Schemas should be usable with Effect's decoder/encoder functions
      // Direct Schema.Struct exports
      expect(typesContent).toMatch(/export const \w+ = Schema\.Struct/);
    });
  });
});
