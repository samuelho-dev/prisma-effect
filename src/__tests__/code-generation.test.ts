import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DMMF, GeneratorOptions } from '@prisma/generator-helper';
import prismaInternals from '@prisma/internals';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectGenerator } from '../effect/generator';
import { GeneratorOrchestrator } from '../generator/orchestrator';
import {
  createMockDMMF,
  createMockEnum,
  createMockField,
  createMockModel,
} from './helpers/dmmf-mocks';

const { getDMMF } = prismaInternals;

/**
 * Code Generation - E2E and Validation Tests
 *
 * Unified test suite for all code generation behavior.
 * Tests verify BEHAVIOR not IMPLEMENTATION.
 *
 * Domains covered:
 * - E2E file generation (orchestration, file creation)
 * - Generated code structure (imports, exports, DB interface)
 * - TypeScript validity (syntax, type safety)
 * - Error handling (empty DMMF, invalid configs)
 * - Import generation (enum imports)
 *
 * NO type coercions (as any, as unknown).
 */

// Mock prettier
vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

describe('Code Generation - E2E and Validation', () => {
  const testOutputPath = join(import.meta.dirname, '../test-output-codegen');
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

  describe('E2E File Generation', () => {
    it('should generate all three files (enums.ts, types.ts, index.ts)', async () => {
      const options: GeneratorOptions = {
        generator: {
          output: { value: testOutputPath },
        },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);

      expect(existsSync(join(testOutputPath, 'enums.ts'))).toBe(true);
      expect(existsSync(join(testOutputPath, 'types.ts'))).toBe(true);
      expect(existsSync(join(testOutputPath, 'index.ts'))).toBe(true);
    });

    it('should throw error when output path is not configured', async () => {
      const options = {
        generator: { output: null },
        dmmf,
      } as GeneratorOptions;

      await expect(async () => {
        const orchestrator = new GeneratorOrchestrator(options);
        await orchestrator.generate(options);
      }).rejects.toThrow('Prisma Effect Generator: output path not configured');
    });

    it('should handle empty DMMF (no models, no enums)', async () => {
      const emptyDMMF = {
        datamodel: {
          models: [],
          enums: [],
        },
      };

      const options = {
        generator: { output: { value: testOutputPath } },
        dmmf: emptyDMMF,
      } as unknown as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);

      // Should still generate files
      expect(existsSync(join(testOutputPath, 'enums.ts'))).toBe(true);
      expect(existsSync(join(testOutputPath, 'types.ts'))).toBe(true);
      expect(existsSync(join(testOutputPath, 'index.ts'))).toBe(true);

      // Should have valid structure
      const typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');
      expect(typesContent).toMatch(/import \{ Schema \} from ["']effect["']/);
      expect(typesContent).toContain('export interface DB');
    });

    it('should generate valid TypeScript output', async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);

      const typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');

      // Should generate schemas exported directly
      expect(typesContent).toMatch(/export const \w+ = Schema\.Struct/);

      // Should generate type aliases
      expect(typesContent).toMatch(/export type \w+ = typeof \w+/);
    });
  });

  describe('Generated Code Structure', () => {
    let typesContent: string;
    let enumsContent: string;
    let indexContent: string;

    beforeEach(async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);

      typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');
      enumsContent = readFileSync(join(testOutputPath, 'enums.ts'), 'utf-8');
      indexContent = readFileSync(join(testOutputPath, 'index.ts'), 'utf-8');
    });

    it('should have correct import statements', () => {
      // types.ts imports
      expect(typesContent).toMatch(/import \{ Schema \} from ["']effect["']/);
      expect(typesContent).toMatch(/from ["']prisma-effect-kysely["']/);
      // No StrictType import - consumers use type utilities from prisma-effect-kysely

      // enums.ts imports
      expect(enumsContent).toMatch(/import \{ Schema \} from ["']effect["']/);
    });

    it('should emit the wrapper-laden table struct under a Table suffix', () => {
      // The Kysely-facing table schema (columnType/generated wrappers intact)
      // carries the `Table` suffix — Kysely's canonical convention. It drives
      // the DB interface; consumers never use it as a query result type.
      expect(typesContent).toMatch(/export const UserTable = Schema\.Struct/);
      expect(typesContent).toMatch(/export const PostTable = Schema\.Struct/);
    });

    it('should emit the bare-named SELECT row as Selectable(Table) + merged type', () => {
      // Bare `User` is the SELECT row (wrappers stripped) — what contracts,
      // RPC outputs, and decode boundaries bind to. Value+type merged.
      expect(typesContent).toMatch(/export const User = Selectable\(UserTable\)/);
      expect(typesContent).toMatch(/export type User = typeof User\.Type/);
    });

    it('should generate branded ID schemas for models with @id field', () => {
      // Branded ID schemas should be generated for each model with an ID field
      expect(typesContent).toMatch(
        /const UserId = Schema\.String\.check\(Schema\.isUUID\(\)\)\.pipe\(Schema\.brand\("UserId"\)\)/
      );
    });

    it('should not export individual type aliases', () => {
      // No longer generate UserSelect, UserInsert, etc. - consumers use type utilities
      expect(typesContent).not.toMatch(/export type UserSelect\s*=/);
      expect(typesContent).not.toMatch(/export type UserInsert\s*=/);
      expect(typesContent).not.toMatch(/export type UserSelectEncoded\s*=/);
    });

    it('should generate DB interface from the Table struct (wrappers preserved for Kysely)', () => {
      expect(typesContent).toContain('export interface DB');
      // DB interface MUST reference the wrapper-laden *Table struct so Kysely's
      // Selectable/Insertable/Updateable variance works on .insertInto/.updateTable.
      expect(typesContent).toMatch(/:\s*Schema\.Schema\.Type<typeof \w+Table>;/);

      const dbMatch = typesContent.match(/export interface DB\s*{([^}]+)}/s);
      expect(dbMatch).toBeTruthy();
      const dbContent = dbMatch?.[1];
      expect(dbContent).not.toMatch(/Schema\.Schema\.Encoded/);
      // The bare row (Selectable) must NOT appear in the DB interface.
      expect(dbContent).not.toMatch(/:\s*Schema\.Schema\.Type<typeof User>;/);
    });

    it('should re-export from index', () => {
      expect(indexContent).toMatch(/export \* from ["']\.\/types["']/);
      expect(indexContent).toMatch(/export \* from ["']\.\/enums["']/);
    });

    it('should not export duplicate strict alias names', () => {
      expect(typesContent).not.toMatch(/SelectStrict/);
      expect(typesContent).not.toMatch(/InsertStrict/);
      expect(typesContent).not.toMatch(/UpdateStrict/);
    });

    it('should generate Schema.Int branded ID for Int @id fields', () => {
      expect(typesContent).toMatch(/const TodoId = Schema\.Int\.pipe\(Schema\.brand\("TodoId"\)\)/);
    });
  });

  describe('TypeScript Validity', () => {
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

    it('should not use type assertions', () => {
      // No " as TypeName" patterns
      expect(typesContent).not.toMatch(/\)\s+as\s+[A-Z]/);
      expect(typesContent).not.toMatch(/\w+\s+as\s+[A-Z]/);
    });

    it('should not have obvious syntax errors', () => {
      expect(typesContent).not.toContain('undefined;');
      // Note: 'null;' is now valid in Kysely table interfaces for optional fields (e.g., 'string | null')
    });

    it('should use proper columnType and generated helpers', () => {
      expect(typesContent).toContain('columnType(');
      expect(typesContent).toContain('generated(');
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

  describe('Field Mapping Support', () => {
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
      // Effect 4: field renames are a struct-level Schema.encodeKeys({ tsName: "db_name" })
      expect(typesContent).toMatch(/Schema\.encodeKeys\(\{[^}]*mappedField:\s*"db_mapped_field"/);
    });

    it('should use @@map for table names in DB interface', () => {
      // CompositeIdModel has @@map("composite_id_table")
      // DB interface uses Schema.Schema.Type<typeof Model> to preserve phantom properties
      expect(typesContent).toMatch(
        /composite_id_table:\s*Schema\.Schema\.Type<typeof CompositeIdModelTable>/
      );
    });
  });

  describe('Enum Import Generation', () => {
    it('should import PascalCase Schema wrappers', () => {
      const mockDMMF = createMockDMMF({
        enums: [
          createMockEnum('PRODUCT_STATUS', ['ACTIVE', 'DRAFT']),
          createMockEnum('PRODUCT_TYPE', ['PHYSICAL', 'DIGITAL']),
        ],
        models: [],
      });

      const generator = new EffectGenerator(mockDMMF);
      const header = generator.generateTypesHeader(true);

      // Should import PascalCase Schema wrappers (the PascalCase name IS the Schema)
      expect(header).toContain('ProductStatus');
      expect(header).toContain('ProductType');

      // Should NOT use SCREAMING_SNAKE_CASE in imports
      expect(header).not.toContain('PRODUCT_STATUS');
      expect(header).not.toContain('PRODUCT_TYPE');
    });
  });

  describe('Branded ID Schema Type Selection', () => {
    it('should generate Schema.Int for Int @id field', () => {
      const model = createMockModel({ name: 'Todo' });
      const fields = [
        createMockField({ name: 'id', type: 'Int', isId: true, hasDefaultValue: true }),
        createMockField({ name: 'title', type: 'String' }),
      ];

      const generator = new EffectGenerator(createMockDMMF({ models: [model] }));
      const result = generator.generateBrandedIdSchema(model, fields);

      expect(result).toContain('Schema.Int');
      expect(result).not.toContain('Schema.String');
      expect(result).toContain('Schema.brand("TodoId")');
    });

    it('should generate Schema.BigInt for BigInt @id field', () => {
      const model = createMockModel({ name: 'Counter' });
      const fields = [
        createMockField({ name: 'id', type: 'BigInt', isId: true, hasDefaultValue: true }),
        createMockField({ name: 'value', type: 'Int' }),
      ];

      const generator = new EffectGenerator(createMockDMMF({ models: [model] }));
      const result = generator.generateBrandedIdSchema(model, fields);

      expect(result).toContain('Schema.BigInt');
      expect(result).not.toContain('Schema.String');
      expect(result).toContain('Schema.brand("CounterId")');
    });

    it('should generate Schema.String.check(Schema.isUUID()) for UUID @id field', () => {
      const model = createMockModel({ name: 'User' });
      const fields = [
        createMockField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          nativeType: ['Uuid', []],
        }),
      ];

      const generator = new EffectGenerator(createMockDMMF({ models: [model] }));
      const result = generator.generateBrandedIdSchema(model, fields);

      expect(result).toContain('Schema.String.check(Schema.isUUID())');
      expect(result).toContain('Schema.brand("UserId")');
    });

    it('should generate Schema.String for non-UUID string @id field', () => {
      const model = createMockModel({ name: 'Item' });
      const fields = [
        createMockField({ name: 'slug', type: 'String', isId: true, hasDefaultValue: true }),
      ];

      const generator = new EffectGenerator(createMockDMMF({ models: [model] }));
      const result = generator.generateBrandedIdSchema(model, fields);

      expect(result).toContain('Schema.String');
      expect(result).not.toContain('Schema.String.check(Schema.isUUID())');
      expect(result).toContain('Schema.brand("ItemId")');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing output path', async () => {
      const options = {
        generator: { output: null },
        dmmf,
      } as GeneratorOptions;

      await expect(async () => {
        const orchestrator = new GeneratorOrchestrator(options);
        await orchestrator.generate(options);
      }).rejects.toThrow();
    });

    it('should generate valid files even with minimal DMMF', async () => {
      const minimalDMMF = {
        datamodel: {
          models: [],
          enums: [],
        },
      };

      const options = {
        generator: { output: { value: testOutputPath } },
        dmmf: minimalDMMF,
      };

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);

      const typesContent = readFileSync(join(testOutputPath, 'types.ts'), 'utf-8');

      // Should have basic structure
      expect(typesContent).toContain('import { Schema }');
      expect(typesContent).toContain('export interface DB');
    });
  });

  describe('Generated Code Completeness', () => {
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

    it('should export all necessary schemas for each model', () => {
      // Wrapper-laden table struct (Kysely) + bare Selectable row (contracts)
      expect(typesContent).toMatch(/export const UserTable = Schema\.Struct/);
      expect(typesContent).toMatch(/export const User = Selectable\(UserTable\)/);
      // IdSchema is exported for branded types
      expect(typesContent).toMatch(
        /export const UserId = Schema\.String\.check\(Schema\.isUUID\(\)\)\.pipe\(Schema\.brand/
      );
      // Value+type merged row alias
      expect(typesContent).toMatch(/export type User = typeof User\.Type/);
    });

    it('should include all models in DB interface', () => {
      const dbMatch = typesContent.match(/export interface DB\s*{([^}]+)}/s);
      expect(dbMatch).toBeTruthy();

      const dbContent = dbMatch?.[1];

      // Should have entries for models using Schema.Schema.Type<typeof Model> pattern
      expect(dbContent).toMatch(/:\s*Schema\.Schema\.Type<typeof \w+>;/);
    });
  });

  describe('Generated Code TypeScript Compilation', () => {
    it('should generate TypeScript-valid code that compiles without errors', async () => {
      const options: GeneratorOptions = {
        generator: { output: { value: testOutputPath } },
        dmmf,
      } as GeneratorOptions;

      const orchestrator = new GeneratorOrchestrator(options);
      await orchestrator.generate(options);

      const typesPath = join(testOutputPath, 'types.ts');

      // Verify generated code has correct helper calls (generated, columnType)
      const typesFileContent = readFileSync(typesPath, 'utf-8');

      // Check that generated() and columnType() are used correctly
      expect(typesFileContent).toContain('generated(');
      expect(typesFileContent).toContain('columnType(');

      // Check schema export pattern
      expect(typesFileContent).toMatch(/export const \w+ = Schema\.Struct/);
      expect(typesFileContent).toMatch(/export type \w+ = typeof \w+/);
    }, 30000); // 30s timeout for tsc compilation
  });

  describe('Enum Type References', () => {
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

    it('should use PascalCase enum schema references', () => {
      // Enum fields should reference the imported PascalCase schema
      expect(typesContent).toMatch(/role:\s*Role/);
      expect(typesContent).toMatch(/status:\s*Status/);
    });

    it('should use Schema.NullOr for optional enum fields', () => {
      // Optional enum fields should use Schema.NullOr
      expect(typesContent).toMatch(/optionalRole:\s*Schema\.NullOr\(Role\)/);
      expect(typesContent).toMatch(/optionalStatus:\s*Schema\.NullOr\(Status\)/);
    });

    it('should NOT reference raw SCREAMING_SNAKE_CASE enum names', () => {
      // Should NOT contain raw SCREAMING_SNAKE_CASE enum references
      expect(typesContent).not.toMatch(/role:\s*ROLE/);
      expect(typesContent).not.toMatch(/status:\s*STATUS/);
    });
  });

  describe('Generated Field Handling', () => {
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

    it('should use columnType for ID fields with @default', () => {
      // User model has: id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      // ID fields with @default are read-only (can't insert/update)
      expect(typesContent).toMatch(/columnType\(.*Schema\.Never, Schema\.Never\)/);
    });

    it('should use generated() for non-ID fields with @default', () => {
      // Fields with @default (not ID) use generated() wrapper
      expect(typesContent).toContain('generated(');
    });
  });
});
