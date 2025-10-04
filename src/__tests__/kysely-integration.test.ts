import { GeneratorOrchestrator } from '../generator/orchestrator';
import type { GeneratorOptions } from '@prisma/generator-helper';
import { getDMMF } from '@prisma/internals';
import { readFileSync, existsSync } from 'fs';
import { rm } from 'fs/promises';
import { join } from 'path';

// Mock prettier to avoid dynamic import issues in Jest
jest.mock('../utils/templates', () => ({
  formatCode: jest.fn((code: string) => Promise.resolve(code)),
}));

describe('Kysely Integration Tests', () => {
  const testOutputPath = join(__dirname, '../test-output-kysely');
  const fixtureSchemaPath = join(__dirname, 'fixtures/test.prisma');

  let dmmf: any;

  beforeAll(async () => {
    const schemaContent = readFileSync(fixtureSchemaPath, 'utf-8');
    dmmf = await getDMMF({ datamodel: schemaContent });
  });

  afterEach(async () => {
    if (existsSync(testOutputPath)) {
      await rm(testOutputPath, { recursive: true, force: true });
    }
  });

  describe('Kysely-compatible schema generation', () => {
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

    it('should generate base schemas with underscore prefix', () => {
      // Base schemas should be prefixed with _ (e.g., _User, _Post)
      expect(typesContent).toMatch(/export const _User/);
      expect(typesContent).toMatch(/export const _Post/);
    });

    it('should use generated() for fields with @default', () => {
      // Fields with @default should use generated()
      // For example, if there's a createdAt field with @default(now())
      expect(typesContent).toMatch(/generated\(/);
    });

    it('should export getSchemas for operational schemas', () => {
      // Should export operational schemas (Selectable, Insertable, Updateable)
      expect(typesContent).toMatch(/export const User = getSchemas/);
    });

    it('should generate DB interface using Schema.Encoded', () => {
      // DB interface should use Schema.Encoded<typeof _Model>
      expect(typesContent).toContain('export interface DB');
      expect(typesContent).toMatch(/Schema\.Schema\.Encoded<typeof _/);
    });
  });

  describe('Field name mapping (@map support)', () => {
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

    it('should use propertySignature with fromKey for @map fields', () => {
      // Should use Schema.propertySignature(...).pipe(Schema.fromKey("db_name"))
      expect(typesContent).toMatch(/Schema\.propertySignature/);
      expect(typesContent).toMatch(/\.pipe\(\s*Schema\.fromKey\(/);
    });

    it('should map to database column names using @map', () => {
      // fromKey should reference the @map value from schema
      expect(typesContent).toMatch(/fromKey\(["']db_mapped_field["']\)/);
    });

    it('should use @@map for table names in DB interface', () => {
      // CompositeIdModel has @@map("composite_id_table")
      // DB interface should use the mapped table name
      expect(typesContent).toMatch(/composite_id_table:\s*Schema\.Schema\.Encoded/);
    });
  });

  describe('DB interface structure', () => {
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

    it('should define DB as interface (not type)', () => {
      expect(typesContent).toMatch(/export interface DB\s*{/);
      expect(typesContent).not.toMatch(/export type DB\s*=/);
    });

    it('should include all models in DB interface', () => {
      const dbMatch = typesContent.match(/export interface DB\s*{([^}]+)}/s);
      expect(dbMatch).toBeTruthy();

      const dbContent = dbMatch![1];

      // Should have entries for each model
      expect(dbContent).toMatch(/:\s*Schema\.Schema\.Encoded/);
    });
  });

  describe('Type exports', () => {
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

    it('should export operational schema objects', () => {
      // Should export: export const User = getSchemas(_User);
      expect(typesContent).toMatch(/export const \w+ = getSchemas\(_\w+\)/);
    });

    it('should export TypeScript types for Select/Insert/Update', () => {
      // Should export types like:
      // export type UserSelect = Schema.Schema.Type<typeof User.Selectable>;
      expect(typesContent).toMatch(/export type \w+Select = Schema\.Schema\.Type<typeof \w+\.Selectable>/);
      expect(typesContent).toMatch(/export type \w+Insert = Schema\.Schema\.Type<typeof \w+\.Insertable>/);
      expect(typesContent).toMatch(/export type \w+Update = Schema\.Schema\.Type<typeof \w+\.Updateable>/);
    });
  });

});
