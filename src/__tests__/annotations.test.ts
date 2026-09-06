import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCustomTypeAnnotations } from '../utils/annotations';

const fixtureSource = readFileSync(
  join(import.meta.dirname, 'fixtures/prisma8/contract.prisma'),
  'utf8'
);

describe('parseCustomTypeAnnotations', () => {
  it('reads the fixture model-field annotations', () => {
    expect(Object.fromEntries(parseCustomTypeAnnotations(fixtureSource))).toEqual({
      'AnnotationTest.email': 'Schema.String.check(Schema.isMinLength(3))',
      'AnnotationTest.age': 'Schema.Number.check(Schema.isGreaterThan(0))',
      'AnnotationTest.coordinates':
        'Schema.Array(Schema.Number).check(Schema.isLengthBetween(3, 3))',
    });
  });

  it('ignores ordinary comments, non-model blocks, and docs attached to model attributes', () => {
    const source = `
      enum Status {
        /// @customType(Schema.String)
        ACTIVE
      }

      type Address {
        /// @customType(Schema.Number)
        zip String
      }

      model Ignored {
        // @customType(Schema.Boolean)
        plain String
        /// @customType(Schema.String)
        @@map("ignored")
        afterAttribute String
      }
    `;

    expect(parseCustomTypeAnnotations(source).size).toBe(0);
  });

  it('keeps a complete expression with balanced nested parentheses', () => {
    const expression =
      'Schema.Array(Schema.Struct({ value: Schema.Number.check(Schema.isGreaterThan(0)) }))';
    const source = `
      model Nested {
        /// @customType(${expression})
        value Json
      }
    `;

    expect(parseCustomTypeAnnotations(source).get('Nested.value')).toBe(expression);
  });

  it('tracks namespaces and ignores annotation syntax inside literals', () => {
    const source = `
      namespace audit {
        model AuditEntry {
          /// @customType(Schema.Literal(")"))
          value String
        } /* audit model
        continued */
      }
      model PublicEntry {
        /// @customType(Schema.Literal("@customType"))
        literal String
        /// @customType(Schema.declare((input) => /[(]/.test(String(input))))
        pattern String
        /// @customType ( Schema.String )
        spaced String
      }
    `;

    expect(Object.fromEntries(parseCustomTypeAnnotations(source))).toEqual({
      'audit.AuditEntry.value': 'Schema.Literal(")")',
      'PublicEntry.literal': 'Schema.Literal("@customType")',
      'PublicEntry.pattern': 'Schema.declare((input) => /[(]/.test(String(input)))',
      'PublicEntry.spaced': 'Schema.String',
    });
  });

  it.each([
    ['@customType(Schema.String', 'unclosed'],
    ['@customType(Schema.String) trailing', 'trailing'],
    ['@customType(lowercase)', 'invalid'],
    ['@customType(Schema.String)\n        /// @customType(Schema.Number)', 'duplicate'],
  ])('rejects %s annotations', (annotation) => {
    const source = `
      model Invalid {
        /// ${annotation}
        value String
      }
    `;

    expect(() => parseCustomTypeAnnotations(source)).toThrow(
      'Invalid @customType annotation for Invalid.value'
    );
  });

  it.each([
    ['@@namespace()', 'invalid'],
    ['@@namespace("audit")\n        @@namespace("public")', 'duplicate'],
  ])('rejects %s namespace annotations', (annotation) => {
    const source = `
      model Invalid {
        value String
        ${annotation}
      }
    `;

    expect(() => parseCustomTypeAnnotations(source)).toThrow(/@@namespace.*model Invalid/);
  });
});
