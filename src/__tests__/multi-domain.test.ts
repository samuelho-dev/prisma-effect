/**
 * Multi-Domain Generation Tests
 *
 * Tests the new multi-domain support feature that:
 * 1. Detects domains from schema file structure
 * 2. Scaffolds contract libraries per domain
 * 3. Generates schemas in separate domain directories
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DMMF, GeneratorOptions } from '@prisma/generator-helper';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isMultiDomainEnabled,
  isScaffoldingEnabled,
  parseGeneratorConfig,
} from '../generator/config';
import { detectDomains } from '../generator/domain-detector';
import { GeneratorOrchestrator } from '../generator/orchestrator';

describe('Multi-Domain Generation', () => {
  const testOutputDir = path.join(import.meta.dirname, 'test-output-multi-domain');

  beforeEach(() => {
    // Clean up test output directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('Configuration Parsing', () => {
    it('should parse multi-domain configuration correctly', () => {
      const mockOptions: GeneratorOptions = {
        generator: {
          name: 'effectSchemas',
          provider: {
            value: 'prisma-effect-kysely',
            fromEnvVar: null,
          },
          output: {
            value: testOutputDir,
            fromEnvVar: null,
          },
          config: {
            multiFileDomains: 'true',
            scaffoldLibraries: 'true',
            libraryGenerator: '../node_modules/monorepo-library-generator',
          },
          binaryTargets: [],
          previewFeatures: [],
          sourceFilePath: '/test/schema.prisma',
        },
        schemaPath: '/test/schema.prisma',
        dmmf: createMockDMMF([]),
        datasources: [],
        datamodel: '',
        version: '1.0.0',
        otherGenerators: [],
      };

      const config = parseGeneratorConfig(mockOptions);

      expect(config.multiFileDomains).toBe('true');
      expect(config.scaffoldLibraries).toBe('true');
      expect(config.libraryGenerator).toBe('../node_modules/monorepo-library-generator');
      expect(isMultiDomainEnabled(config)).toBe(true);
      expect(isScaffoldingEnabled(config)).toBe(true);
    });

    it('should default to single-domain mode when multiFileDomains is false', () => {
      const mockOptions: GeneratorOptions = {
        generator: {
          name: 'effectSchemas',
          provider: {
            value: 'prisma-effect-kysely',
            fromEnvVar: null,
          },
          output: {
            value: testOutputDir,
            fromEnvVar: null,
          },
          config: {
            multiFileDomains: 'false',
          },
          binaryTargets: [],
          previewFeatures: [],
          sourceFilePath: '/test/schema.prisma',
        },
        schemaPath: '/test/schema.prisma',
        dmmf: createMockDMMF([]),
        datasources: [],
        datamodel: '',
        version: '1.0.0',
        otherGenerators: [],
      };

      const config = parseGeneratorConfig(mockOptions);

      expect(config.multiFileDomains).toBe('false');
      expect(isMultiDomainEnabled(config)).toBe(false);
      expect(isScaffoldingEnabled(config)).toBe(false);
    });

    it('should handle missing config gracefully (backward compatibility)', () => {
      const mockOptions: GeneratorOptions = {
        generator: {
          name: 'effectSchemas',
          provider: {
            value: 'prisma-effect-kysely',
            fromEnvVar: null,
          },
          output: {
            value: testOutputDir,
            fromEnvVar: null,
          },
          config: {},
          binaryTargets: [],
          previewFeatures: [],
          sourceFilePath: '/test/schema.prisma',
        },
        schemaPath: '/test/schema.prisma',
        dmmf: createMockDMMF([]),
        datasources: [],
        datamodel: '',
        version: '1.0.0',
        otherGenerators: [],
      };

      const config = parseGeneratorConfig(mockOptions);

      expect(config.multiFileDomains).toBe('false');
      expect(config.scaffoldLibraries).toBe('false');
      expect(isMultiDomainEnabled(config)).toBe(false);
    });
  });

  describe('Domain Detection', () => {
    it('should detect domains from model groups', () => {
      const userModel = createMockModel('User', [
        { name: 'id', type: 'String', isId: true },
        { name: 'email', type: 'String' },
      ]);

      const productModel = createMockModel('Product', [
        { name: 'id', type: 'String', isId: true },
        { name: 'name', type: 'String' },
      ]);

      const dmmf = createMockDMMF([userModel, productModel]);

      // With no schema location metadata, should return single "shared" domain
      const domains = detectDomains(dmmf);

      expect(domains).toHaveLength(1);
      expect(domains[0].name).toBe('shared');
      expect(domains[0].models).toHaveLength(2);
    });

    it('should handle empty model list', () => {
      const dmmf = createMockDMMF([]);
      const domains = detectDomains(dmmf);

      expect(domains).toHaveLength(1);
      expect(domains[0].name).toBe('shared');
      expect(domains[0].models).toHaveLength(0);
    });
  });

  describe('Single-Domain Mode (Default Behavior)', () => {
    it('should generate all schemas in single output directory', async () => {
      const userModel = createMockModel('User', [
        { name: 'id', type: 'String', isId: true },
        { name: 'email', type: 'String' },
        { name: 'name', type: 'String' },
      ]);

      const productModel = createMockModel('Product', [
        { name: 'id', type: 'String', isId: true },
        { name: 'name', type: 'String' },
        { name: 'price', type: 'Int' },
      ]);

      const mockOptions: GeneratorOptions = {
        generator: {
          name: 'effectSchemas',
          provider: {
            value: 'prisma-effect-kysely',
            fromEnvVar: null,
          },
          output: {
            value: testOutputDir,
            fromEnvVar: null,
          },
          config: {
            multiFileDomains: 'false',
          },
          binaryTargets: [],
          previewFeatures: [],
          sourceFilePath: '/test/schema.prisma',
        },
        schemaPath: '/test/schema.prisma',
        dmmf: createMockDMMF([userModel, productModel]),
        datasources: [],
        datamodel: '',
        version: '1.0.0',
        otherGenerators: [],
      };

      const orchestrator = new GeneratorOrchestrator(mockOptions);
      await orchestrator.generate(mockOptions);

      // Should generate files in single output directory
      expect(fs.existsSync(path.join(testOutputDir, 'types.ts'))).toBe(true);
      expect(fs.existsSync(path.join(testOutputDir, 'enums.ts'))).toBe(true);
      expect(fs.existsSync(path.join(testOutputDir, 'index.ts'))).toBe(true);

      // Should NOT create domain subdirectories
      expect(fs.existsSync(path.join(testOutputDir, 'user'))).toBe(false);
      expect(fs.existsSync(path.join(testOutputDir, 'product'))).toBe(false);

      // Verify types.ts contains both models
      const typesContent = fs.readFileSync(path.join(testOutputDir, 'types.ts'), 'utf-8');
      expect(typesContent).toContain('Schema.Schema.Type<typeof User>');
      expect(typesContent).toContain('Schema.Schema.Type<typeof Product>');
    });
  });

  describe('Multi-Domain Mode (Without Scaffolding)', () => {
    it('should generate schemas in separate domain directories', async () => {
      // Create mock models that would be in different domains
      const userModel = createMockModel('User', [
        { name: 'id', type: 'String', isId: true },
        { name: 'email', type: 'String' },
      ]);

      const productModel = createMockModel('Product', [
        { name: 'id', type: 'String', isId: true },
        { name: 'name', type: 'String' },
      ]);

      // Create DMMF with schema location metadata (simulating Prisma 5.15+)
      const dmmf = createMockDMMF([userModel, productModel]);

      // Add schema location metadata manually
      (dmmf.datamodel.models[0] as any).schemaLocation = 'prisma/schemas/user.prisma';
      (dmmf.datamodel.models[1] as any).schemaLocation = 'prisma/schemas/product.prisma';

      const mockOptions: GeneratorOptions = {
        generator: {
          name: 'effectSchemas',
          provider: {
            value: 'prisma-effect-kysely',
            fromEnvVar: null,
          },
          output: {
            value: testOutputDir,
            fromEnvVar: null,
          },
          config: {
            multiFileDomains: 'true',
            scaffoldLibraries: 'false', // No scaffolding, just generation
          },
          binaryTargets: [],
          previewFeatures: [],
          sourceFilePath: '/test/schema.prisma',
        },
        schemaPath: '/test/schema.prisma',
        dmmf,
        datasources: [],
        datamodel: '',
        version: '1.0.0',
        otherGenerators: [],
      };

      const orchestrator = new GeneratorOrchestrator(mockOptions);
      await orchestrator.generate(mockOptions);

      // Should create domain directories
      expect(fs.existsSync(path.join(testOutputDir, 'user/src/generated'))).toBe(true);
      expect(fs.existsSync(path.join(testOutputDir, 'product/src/generated'))).toBe(true);

      // Should generate types.ts in each domain
      expect(fs.existsSync(path.join(testOutputDir, 'user/src/generated/types.ts'))).toBe(true);
      expect(fs.existsSync(path.join(testOutputDir, 'product/src/generated/types.ts'))).toBe(true);

      // Verify user domain only has User model
      const userTypesContent = fs.readFileSync(
        path.join(testOutputDir, 'user/src/generated/types.ts'),
        'utf-8'
      );
      expect(userTypesContent).toContain('Schema.Schema.Type<typeof User>');
      expect(userTypesContent).not.toContain('Schema.Schema.Type<typeof Product>');

      // Verify product domain only has Product model
      const productTypesContent = fs.readFileSync(
        path.join(testOutputDir, 'product/src/generated/types.ts'),
        'utf-8'
      );
      expect(productTypesContent).toContain('Schema.Schema.Type<typeof Product>');
      expect(productTypesContent).not.toContain('Schema.Schema.Type<typeof User>');
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createMockDMMF(models: DMMF.Model[]) {
  return {
    datamodel: {
      models,
      enums: [],
      types: [],
      indexes: [],
    },
    schema: {
      inputObjectTypes: {
        prisma: [],
        model: undefined,
      },
      outputObjectTypes: {
        prisma: [],
        model: [],
      },
      enumTypes: {
        prisma: [],
        model: undefined,
      },
      fieldRefTypes: {
        prisma: undefined,
      },
    },
    mappings: {
      modelOperations: [],
      otherOperations: {
        read: [],
        write: [],
      },
    },
  };
}

interface MockField {
  name: string;
  type: string;
  isId?: boolean;
  isRequired?: boolean;
  isList?: boolean;
}

function createMockModel(name: string, mockFields: MockField[]) {
  const fields: DMMF.Field[] = mockFields.map((f) => ({
    name: f.name,
    kind: 'scalar' as const,
    isList: f.isList ?? false,
    isRequired: f.isRequired ?? true,
    isUnique: false,
    isId: f.isId ?? false,
    isReadOnly: false,
    hasDefaultValue: false,
    type: f.type,
    isGenerated: false,
    isUpdatedAt: false,
  }));

  return {
    name,
    dbName: null,
    schema: null,
    fields,
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
  } as DMMF.Model;
}
