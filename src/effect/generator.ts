import { applyKyselyHelpers } from '../kysely/type.js';
import type {
  ContractModelSet,
  TableField,
  TableModel,
  ValueObjectModel,
} from '../prisma/model.js';
import { generateFileHeader } from '../utils/codegen.js';
import { toPascalCase } from '../utils/naming.js';
import { generateEnumsFile } from './enum.js';
import { baseFieldType } from './type.js';

function propertyKey(name: string): string {
  if (name === '__proto__') return `[${JSON.stringify(name)}]`;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

export class EffectGenerator {
  constructor(private readonly modelSet: ContractModelSet) {}

  generateEnums(): string {
    return generateEnumsFile(this.modelSet.enums);
  }

  generateBrandedIdSchema(model: TableModel): string | null {
    if (!model.brandedId) return null;

    let baseType: string;
    switch (model.brandedId.codecId) {
      case 'pg/uuid@1':
        baseType = 'Schema.String.check(Schema.isUUID())';
        break;
      case 'pg/int@1':
      case 'pg/int2@1':
      case 'pg/int4@1':
      case 'pg/int8number@1':
        baseType = 'Schema.Int';
        break;
      case 'pg/int8@1':
      case 'pg/unboundedint@1':
        baseType = 'Schema.BigInt';
        break;
      default:
        baseType = 'Schema.String';
    }

    return `export const ${model.schemaName}Id = ${baseType}.pipe(Schema.brand("${model.schemaName}Id"));
export type ${model.schemaName}Id = typeof ${model.schemaName}Id.Type;`;
  }

  generateValueObjectSchema(
    valueObject: ValueObjectModel,
    references: ReadonlyMap<TableField, string>
  ): string {
    const fields = valueObject.fields
      .map(
        (field) =>
          `  ${propertyKey(field.tsName)}: ${baseFieldType(field, references.get(field) ?? null)}`
      )
      .join(',\n');
    return `export const ${valueObject.schemaName} = Schema.Struct({
${fields}
});
export type ${valueObject.schemaName} = typeof ${valueObject.schemaName}.Type;`;
  }

  generateValueObjectSchemas(references: ReadonlyMap<TableField, string>): string {
    const byName = new Map(
      this.modelSet.valueObjects.map((valueObject) => [valueObject.name, valueObject])
    );
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: ValueObjectModel[] = [];

    const visit = (valueObject: ValueObjectModel): void => {
      if (visited.has(valueObject.name)) return;
      if (visiting.has(valueObject.name)) {
        throw new Error(`Value object ${valueObject.name} forms a reference cycle`);
      }
      visiting.add(valueObject.name);
      for (const field of valueObject.fields) {
        const names =
          field.kind.type === 'valueObject'
            ? [field.kind.name]
            : field.kind.type === 'union'
              ? field.kind.members.flatMap((member) =>
                  member.type === 'valueObject' ? [member.name] : []
                )
              : [];
        for (const name of names) {
          const dependency = byName.get(name);
          if (dependency) visit(dependency);
        }
      }
      visiting.delete(valueObject.name);
      visited.add(valueObject.name);
      ordered.push(valueObject);
    };

    for (const valueObject of this.modelSet.valueObjects) visit(valueObject);
    return ordered
      .map((valueObject) => this.generateValueObjectSchema(valueObject, references))
      .join('\n\n');
  }

  generateModelSchema(
    model: TableModel,
    overrides: ReadonlyMap<string, string>,
    references: ReadonlyMap<TableField, string>
  ): string {
    const keyMappings: Array<{ tsName: string; column: string }> = [];
    const hasSinglePrimaryKey = model.fields.filter((field) => field.isPrimaryKey).length === 1;
    const fieldDefinitions = model.fields
      .map((field) => {
        const ownIdType =
          model.brandedId?.column === field.column ? `${model.schemaName}Id` : undefined;
        const referencedType = references.get(field);
        const override =
          overrides.get(`${model.namespaceId}.${model.name}.${field.tsName}`) ??
          overrides.get(`${model.name}.${field.tsName}`) ??
          ownIdType ??
          referencedType ??
          null;
        const baseType = baseFieldType(field, override);
        const idType =
          hasSinglePrimaryKey && field.isPrimaryKey
            ? (ownIdType ??
              (field.fkTarget
                ? (referencedType ?? `${toPascalCase(field.fkTarget.idModel)}Id`)
                : undefined))
            : undefined;
        const fieldType = applyKyselyHelpers(baseType, field, idType);
        if (field.tsName !== field.column) {
          keyMappings.push({ tsName: field.tsName, column: field.column });
        }
        return `  ${propertyKey(field.tsName)}: ${fieldType}`;
      })
      .join(',\n');

    const encodeKeys =
      keyMappings.length === 0
        ? ''
        : `.pipe(Schema.encodeKeys({ ${keyMappings
            .map(({ tsName, column }) => `${propertyKey(tsName)}: ${JSON.stringify(column)}`)
            .join(', ')} }))`;

    return `export const ${model.schemaName}Table = Schema.Struct({
${fieldDefinitions}
})${encodeKeys};
export const ${model.schemaName} = Selectable(${model.schemaName}Table);
export type ${model.schemaName} = typeof ${model.schemaName}.Type;`;
  }

  generateTypesHeader(imports: ReadonlyMap<string, readonly string[]>): string {
    const importLines = [...imports.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([specifier, names]) =>
          `import { ${[...new Set(names)].sort().join(', ')} } from "${specifier}";`
      );

    return `${generateFileHeader()}

import { Schema } from "effect";
import { columnType, generated, JsonValue, Selectable } from "prisma-effect-kysely";${
      importLines.length > 0 ? `\n${importLines.join('\n')}` : ''
    }`;
  }
}
