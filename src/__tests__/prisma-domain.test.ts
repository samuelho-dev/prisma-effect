import type { DMMF } from '@prisma/generator-helper';
import * as PrismaType from '../prisma/type';
import * as PrismaEnum from '../prisma/enum';
import { PrismaGenerator } from '../prisma/generator';

// Helper to create mock DMMF fields with sensible defaults
function createMockField(overrides: Partial<DMMF.Field>): DMMF.Field {
  return {
    name: 'mockField',
    type: 'String',
    kind: 'scalar',
    isRequired: true,
    isList: false,
    isId: false,
    isUnique: false,
    hasDefaultValue: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    ...overrides,
  } as DMMF.Field;
}

// Helper to create mock DMMF models
function createMockModel(overrides: Partial<DMMF.Model>): DMMF.Model {
  return {
    name: 'MockModel',
    dbName: null,
    schema: null,
    fields: [],
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    ...overrides,
  } as DMMF.Model;
}

// Helper to create mock DMMF document
function createMockDMMF(overrides?: {
  models?: DMMF.Model[];
  enums?: DMMF.DatamodelEnum[];
}): DMMF.Document {
  return {
    datamodel: {
      models: overrides?.models || [],
      enums: overrides?.enums || [],
      types: [],
      indexes: [],
    },
    schema: {} as any,
    mappings: {} as any,
  } as unknown as DMMF.Document;
}

describe('Prisma Domain', () => {
  describe('UUID Detection (isUuidField)', () => {
    it('should detect UUID via native type (@db.Uuid) - Strategy 1', () => {
      const field = createMockField({
        name: 'id',
        nativeType: ['Uuid', []] as [string, string[]],
      });

      expect(PrismaType.isUuidField(field)).toBe(true);
    });

    it('should detect UUID via documentation (@db.Uuid comment) - Strategy 2', () => {
      const field = createMockField({
        name: 'tenant_id',
        documentation: '/// @db.Uuid',
      });

      expect(PrismaType.isUuidField(field)).toBe(true);
    });

    it('should detect UUID via field name pattern: /^id$/ - Strategy 3', () => {
      const field = createMockField({
        name: 'id',
        isId: true,
      });

      expect(PrismaType.isUuidField(field)).toBe(true);
    });

    it('should detect UUID via field name pattern: /_id$/', () => {
      const field = createMockField({
        name: 'user_id',
      });

      expect(PrismaType.isUuidField(field)).toBe(true);
    });

    it('should detect UUID via field name pattern: /^.*_uuid$/', () => {
      const field = createMockField({
        name: 'external_uuid',
      });

      expect(PrismaType.isUuidField(field)).toBe(true);
    });

    it('should detect UUID via field name pattern: /^uuid$/', () => {
      const field = createMockField({
        name: 'uuid',
      });

      expect(PrismaType.isUuidField(field)).toBe(true);
    });

    it('should NOT detect non-UUID String fields', () => {
      const field = createMockField({
        name: 'email',
      });

      expect(PrismaType.isUuidField(field)).toBe(false);
    });
  });

  describe('Field Database Name (getFieldDbName)', () => {
    it('should return dbName when @map directive is present', () => {
      const field = createMockField({
        name: 'userName',
        dbName: 'user_name',
      });

      expect(PrismaType.getFieldDbName(field)).toBe('user_name');
    });

    it('should return field name when no @map directive', () => {
      const field = createMockField({
        name: 'email',
      });

      expect(PrismaType.getFieldDbName(field)).toBe('email');
    });
  });

  describe('Field Property Checks', () => {
    it('hasDefaultValue should return true when field has @default', () => {
      const field = createMockField({
        name: 'createdAt',
        type: 'DateTime',
        hasDefaultValue: true,
      });

      expect(PrismaType.hasDefaultValue(field)).toBe(true);
    });

    it('isIdField should return true when field is @id', () => {
      const field = createMockField({
        name: 'id',
        type: 'Int',
        isId: true,
      });

      expect(PrismaType.isIdField(field)).toBe(true);
    });

    it('isRequiredField should return true when field is required', () => {
      const field = createMockField({
        name: 'email',
        isRequired: true,
      });

      expect(PrismaType.isRequiredField(field)).toBe(true);
    });

    it('isListField should return true when field is an array', () => {
      const field = createMockField({
        name: 'tags',
        isList: true,
      });

      expect(PrismaType.isListField(field)).toBe(true);
    });
  });

  describe('Field Filtering (filterSchemaFields)', () => {
    it('should include scalar fields', () => {
      const fields = [
        createMockField({
          name: 'id',
          type: 'Int',
          kind: 'scalar',
          isId: true,
        }),
      ];

      const filtered = PrismaType.filterSchemaFields(fields);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('id');
    });

    it('should include enum fields', () => {
      const fields = [
        createMockField({
          name: 'role',
          type: 'Role',
          kind: 'enum',
        }),
      ];

      const filtered = PrismaType.filterSchemaFields(fields);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('role');
    });

    it('should exclude relation fields', () => {
      const fields = [
        createMockField({
          name: 'profile',
          type: 'Profile',
          kind: 'object',
        }) as DMMF.Field,
      ];

      const filtered = PrismaType.filterSchemaFields(fields);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('Model Filtering (filterInternalModels)', () => {
    it('should exclude models starting with underscore', () => {
      const models = [
        createMockModel({ name: 'User' }),
        createMockModel({ name: '_InternalModel' }),
      ];

      const filtered = PrismaType.filterInternalModels(models);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('User');
    });

    it('should include all public models', () => {
      const models = [
        createMockModel({ name: 'User' }),
        createMockModel({ name: 'Post' }),
      ];

      const filtered = PrismaType.filterInternalModels(models);
      expect(filtered).toHaveLength(2);
    });
  });

  describe('Model Database Name (getModelDbName)', () => {
    it('should return dbName when @@map directive is present', () => {
      const model = createMockModel({
        name: 'CompositeIdModel',
        dbName: 'composite_id_table',
      });

      expect(PrismaType.getModelDbName(model)).toBe('composite_id_table');
    });

    it('should return model name when no @@map directive', () => {
      const model = createMockModel({
        name: 'User',
        dbName: null,
      });

      expect(PrismaType.getModelDbName(model)).toBe('User');
    });
  });

  describe('Sorting (sortModels, sortFields)', () => {
    it('should sort models alphabetically', () => {
      const models = [
        createMockModel({ name: 'Post' }),
        createMockModel({ name: 'User' }),
        createMockModel({ name: 'Category' }),
      ];

      const sorted = PrismaType.sortModels(models);
      expect(sorted[0].name).toBe('Category');
      expect(sorted[1].name).toBe('Post');
      expect(sorted[2].name).toBe('User');
    });

    it('should sort fields alphabetically', () => {
      const fields = [
        createMockField({ name: 'name' }),
        createMockField({ name: 'id' }),
        createMockField({ name: 'email' }),
      ];

      const sorted = PrismaType.sortFields(fields);
      expect(sorted[0].name).toBe('email');
      expect(sorted[1].name).toBe('id');
      expect(sorted[2].name).toBe('name');
    });
  });

  describe('Enum Handling', () => {
    it('should extract enums from DMMF', () => {
      const dmmf = createMockDMMF({
        enums: [
          {
            name: 'Role',
            values: [
              { name: 'USER', dbName: null },
              { name: 'ADMIN', dbName: null },
            ],
            dbName: null,
          } as DMMF.DatamodelEnum,
        ],
      });

      const enums = PrismaEnum.extractEnums(dmmf);
      expect(enums).toHaveLength(1);
      expect(enums[0].name).toBe('Role');
    });

    it('should get enum value db name with @map', () => {
      const enumValue = {
        name: 'ACTIVE',
        dbName: 'active',
      } as DMMF.EnumValue;

      expect(PrismaEnum.getEnumValueDbName(enumValue)).toBe('active');
    });

    it('should get enum value name when no @map', () => {
      const enumValue = {
        name: 'USER',
        dbName: null,
      } as DMMF.EnumValue;

      expect(PrismaEnum.getEnumValueDbName(enumValue)).toBe('USER');
    });

    it('should get all db values for enum', () => {
      const enumDef = {
        name: 'Status',
        values: [
          { name: 'ACTIVE', dbName: 'active' },
          { name: 'INACTIVE', dbName: 'inactive' },
          { name: 'PENDING', dbName: null },
        ],
        dbName: null,
      } as DMMF.DatamodelEnum;

      const dbValues = PrismaEnum.getEnumDbValues(enumDef);
      expect(dbValues).toEqual(['active', 'inactive', 'PENDING']);
    });
  });

  describe('PrismaGenerator', () => {
    it('should get enums from DMMF', () => {
      const dmmf = createMockDMMF({
        enums: [
          {
            name: 'Role',
            values: [{ name: 'USER', dbName: null }],
            dbName: null,
          } as DMMF.DatamodelEnum,
        ],
      });

      const generator = new PrismaGenerator(dmmf);
      const enums = generator.getEnums();
      expect(enums).toHaveLength(1);
      expect(enums[0].name).toBe('Role');
    });

    it('should get filtered and sorted models', () => {
      const dmmf = createMockDMMF({
        models: [
          createMockModel({ name: 'Post' }),
          createMockModel({ name: '_InternalModel' }),
          createMockModel({ name: 'User' }),
        ],
      });

      const generator = new PrismaGenerator(dmmf);
      const models = generator.getModels();

      // Should exclude _InternalModel and be sorted
      expect(models).toHaveLength(2);
      expect(models[0].name).toBe('Post');
      expect(models[1].name).toBe('User');
    });
  });
});
