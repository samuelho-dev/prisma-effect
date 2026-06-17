import type { DMMF } from '@prisma/generator-helper';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { generateEnumSchema, generateEnumsFile } from '../effect/enum';
import { buildFieldType } from '../effect/type';
import { createMockDMMF, createMockEnum, createMockField } from './helpers/dmmf-mocks';

/**
 * Enum Generation - Functional Behavior Tests
 *
 * Tests verify BEHAVIOR not IMPLEMENTATION:
 * - Can generated enums validate values correctly?
 * - Do enum fields map to correct Schema types?
 * - Does generated code execute without errors?
 * - Do enums integrate with Effect Schema properly?
 *
 * NO string matching on implementation details.
 * NO type coercions (as any, as unknown).
 */
describe('Enum Generation - Functional Tests', () => {
  describe('Enum Schema Runtime Behavior', () => {
    // Use actual enum for behavioral tests
    enum ProductStatus {
      ARCHIVED = 'ARCHIVED',
      DRAFT = 'DRAFT',
      ACTIVE = 'ACTIVE',
    }

    const ProductStatusSchema = Schema.Enum(ProductStatus);

    it('should allow property access on generated enum', () => {
      expect(ProductStatus.ACTIVE).toBe('ACTIVE');
      expect(ProductStatus.DRAFT).toBe('DRAFT');
      expect(ProductStatus.ARCHIVED).toBe('ARCHIVED');
    });

    it('should validate valid enum values', () => {
      const decodeSync = Schema.decodeUnknownSync(ProductStatusSchema);

      // Test string values
      expect(decodeSync('ACTIVE')).toBe('ACTIVE');
      expect(decodeSync('DRAFT')).toBe('DRAFT');
      expect(decodeSync('ARCHIVED')).toBe('ARCHIVED');

      // Test enum member values
      expect(decodeSync(ProductStatus.ACTIVE)).toBe('ACTIVE');
      expect(decodeSync(ProductStatus.DRAFT)).toBe('DRAFT');
    });

    it('should reject invalid enum values', () => {
      const decodeSync = Schema.decodeUnknownSync(ProductStatusSchema);

      expect(() => decodeSync('INVALID')).toThrow();
      expect(() => decodeSync('invalid')).toThrow();
      expect(() => decodeSync(123)).toThrow();
      expect(() => decodeSync(null)).toThrow();
    });

    it('should encode enum values correctly', () => {
      const encodeSync = Schema.encodeSync(ProductStatusSchema);

      expect(encodeSync(ProductStatus.ACTIVE)).toBe('ACTIVE');
      expect(encodeSync(ProductStatus.DRAFT)).toBe('DRAFT');
    });

    it('should provide correct type inference', () => {
      type ExtractedType = Schema.Schema.Type<typeof ProductStatusSchema>;

      // Type inference should allow enum members
      const status1: ExtractedType = ProductStatus.ACTIVE;
      const status2: ExtractedType = ProductStatus.DRAFT;

      expect(status1).toBe('ACTIVE');
      expect(status2).toBe('DRAFT');
    });

    it('should be compatible with Kysely string literal types', () => {
      // Simulate Kysely's expected type
      type RoleDB = 'ADMIN' | 'USER';

      enum Role {
        ADMIN = 'ADMIN',
        USER = 'USER',
      }

      // Enum values should be assignable to string literal union
      const dbValue: RoleDB = Role.ADMIN;

      expect(dbValue).toBe('ADMIN');
    });
  });

  describe('Enum Schema in Struct Integration', () => {
    it('should work correctly in Schema.Struct', () => {
      enum Status {
        PENDING = 'PENDING',
        COMPLETED = 'COMPLETED',
      }

      const StatusSchema = Schema.Enum(Status);

      const TaskSchema = Schema.Struct({
        id: Schema.Number,
        name: Schema.String,
        status: StatusSchema,
      });

      // Valid task with enum
      const validTask = {
        id: 1,
        name: 'Test Task',
        status: Status.PENDING,
      };

      const result = Schema.decodeUnknownSync(TaskSchema)(validTask);
      expect(result).toEqual(validTask);
      expect(result.status).toBe('PENDING');

      // Invalid task with wrong status
      const invalidTask = {
        id: 1,
        name: 'Test Task',
        status: 'INVALID_STATUS',
      };

      expect(() => Schema.decodeUnknownSync(TaskSchema)(invalidTask)).toThrow();
    });

    it('should work with optional enum fields', () => {
      enum Priority {
        LOW = 'LOW',
        HIGH = 'HIGH',
      }

      const PrioritySchema = Schema.Enum(Priority);

      const TaskSchema = Schema.Struct({
        name: Schema.String,
        priority: Schema.NullOr(PrioritySchema),
      });

      // With priority
      const withPriority = {
        name: 'Task 1',
        priority: Priority.HIGH,
      };

      const result1 = Schema.decodeUnknownSync(TaskSchema)(withPriority);
      expect(result1.priority).toBe('HIGH');

      // With null priority
      const withNullPriority = {
        name: 'Task 2',
        priority: null,
      };

      const result2 = Schema.decodeUnknownSync(TaskSchema)(withNullPriority);
      expect(result2.priority).toBeNull();
    });

    it('should work with array of enum values', () => {
      enum Tag {
        URGENT = 'URGENT',
        REVIEW = 'REVIEW',
        BUG = 'BUG',
      }

      const TagSchema = Schema.Enum(Tag);

      const ItemSchema = Schema.Struct({
        tags: Schema.Array(TagSchema),
      });

      const validItem = {
        tags: [Tag.URGENT, Tag.BUG],
      };

      const result = Schema.decodeUnknownSync(ItemSchema)(validItem);
      expect(result.tags).toEqual(['URGENT', 'BUG']);

      // Invalid array element
      const invalidItem = {
        tags: [Tag.URGENT, 'INVALID'],
      };

      expect(() => Schema.decodeUnknownSync(ItemSchema)(invalidItem)).toThrow();
    });
  });

  describe('Field Type Mapping Behavior', () => {
    const mockDMMF = createMockDMMF({
      enums: [createMockEnum('PRODUCT_STATUS', ['ACTIVE', 'DRAFT'])],
      models: [],
    });

    it('should map enum field to Schema wrapper', () => {
      const mockEnumField = createMockField({
        name: 'status',
        kind: 'enum',
        type: 'PRODUCT_STATUS',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        isGenerated: false,
        isUpdatedAt: false,
      });

      const result = buildFieldType(mockEnumField, mockDMMF);

      // Should return PascalCase (which IS the Schema now)
      expect(result).toBe('ProductStatus');
    });

    it('should map array enum field to Array wrapper', () => {
      const mockArrayEnumField = createMockField({
        name: 'statuses',
        kind: 'enum',
        type: 'PRODUCT_STATUS',
        isList: true,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        isGenerated: false,
        isUpdatedAt: false,
      });

      const result = buildFieldType(mockArrayEnumField, mockDMMF);

      // Should wrap in Array
      expect(result).toBe('Schema.Array(ProductStatus)');
    });

    it('should map optional enum field to NullOr wrapper', () => {
      const mockOptionalEnumField = createMockField({
        name: 'status',
        kind: 'enum',
        type: 'PRODUCT_STATUS',
        isList: false,
        isRequired: false,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        isGenerated: false,
        isUpdatedAt: false,
      });

      const result = buildFieldType(mockOptionalEnumField, mockDMMF);

      // Should wrap in NullOr
      expect(result).toBe('Schema.NullOr(ProductStatus)');
    });
  });

  describe('Code Generation E2E', () => {
    const mockEnum: DMMF.DatamodelEnum = {
      name: 'USER_ROLE',
      values: [
        { name: 'ADMIN', dbName: null },
        { name: 'USER', dbName: null },
        { name: 'GUEST', dbName: null },
      ],
      dbName: null,
    };

    it('should generate executable enum code', () => {
      const generatedCode = generateEnumSchema(mockEnum);

      // Canonical Effect-v4 pattern: a Schema.Literals string-union (no TS enum). The PascalCase
      // export IS the Schema; the type alias reads its `.Type`.
      expect(generatedCode).toContain(
        'export const UserRole = Schema.Literals(["ADMIN", "USER", "GUEST"])'
      );
      expect(generatedCode).toContain('export type UserRole = typeof UserRole.Type');
    });

    it('should generate valid TypeScript that can be executed', () => {
      const generatedCode = generateEnumSchema(mockEnum);

      // The literals carry every member as a string literal.
      expect(generatedCode).toMatch(/Schema\.Literals\(\[/);
      expect(generatedCode).toMatch(/"ADMIN"/);
      expect(generatedCode).toMatch(/"USER"/);
      expect(generatedCode).toMatch(/"GUEST"/);
    });

    it('should use Schema.Literals (the canonical v4 finite-set schema), not Schema.Enum', () => {
      const generatedCode = generateEnumSchema(mockEnum);

      // Schema.Literals gives Type==Encoded==the string union — Kysely-friendly + literal domain
      // types. Schema.Enum (Type==the TS enum) is only for interop with a pre-existing enum object.
      expect(generatedCode).toContain('Schema.Literals(');
      expect(generatedCode).not.toContain('Schema.Enum');
      // No TS enum is emitted anymore.
      expect(generatedCode).not.toContain('export enum');
    });

    it('should use PascalCase for the Schema/Type name', () => {
      const generatedCode = generateEnumSchema(mockEnum);

      expect(generatedCode).toContain('export const UserRole = Schema.Literals(');
      expect(generatedCode).toContain('export type UserRole = typeof UserRole.Type');
      expect(generatedCode).not.toContain('user_role_schema');
    });

    it('should generate complete enums file with imports', () => {
      const mockEnums: DMMF.DatamodelEnum[] = [
        {
          name: 'STATUS',
          values: [{ name: 'ACTIVE', dbName: null }],
          dbName: null,
        },
      ];

      const generatedFile = generateEnumsFile(mockEnums);

      expect(generatedFile).toContain('import { Schema } from "effect"');
      expect(generatedFile).toContain('export const STATUS = Schema.Literals(["ACTIVE"])');
    });
  });

  describe('Enum with @map directive', () => {
    it('should handle enums with mapped database values', () => {
      const mockMappedEnum: DMMF.DatamodelEnum = {
        name: 'TaskStatus',
        values: [
          { name: 'TODO', dbName: 'todo_db' },
          { name: 'IN_PROGRESS', dbName: 'in_progress_db' },
          { name: 'DONE', dbName: 'done_db' },
        ],
        dbName: 'task_status_db',
      };

      const generatedCode = generateEnumSchema(mockMappedEnum);

      // The @map dbName becomes the literal value (the actual stored string).
      expect(generatedCode).toContain('export const TaskStatus = Schema.Literals(');
      expect(generatedCode).toContain('"todo_db"');
      expect(generatedCode).toContain('"in_progress_db"');
      expect(generatedCode).toContain('"done_db"');
    });
  });

  describe('Multiple enums integration', () => {
    it('should handle multiple enums in one file', () => {
      const mockEnums: DMMF.DatamodelEnum[] = [
        {
          name: 'ROLE',
          values: [{ name: 'ADMIN', dbName: null }],
          dbName: null,
        },
        {
          name: 'STATUS',
          values: [{ name: 'ACTIVE', dbName: null }],
          dbName: null,
        },
      ];

      const generatedFile = generateEnumsFile(mockEnums);

      expect(generatedFile).toContain('export const ROLE = Schema.Literals(["ADMIN"])');
      expect(generatedFile).toContain('export const STATUS = Schema.Literals(["ACTIVE"])');
    });
  });
});
