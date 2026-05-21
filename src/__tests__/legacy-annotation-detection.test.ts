import { describe, expect, it } from 'vitest';
import { detectLegacyEffectV3Syntax } from '../utils/annotations';

describe('detectLegacyEffectV3Syntax', () => {
  describe('flags Effect 3 filter syntax', () => {
    it('Schema.int()', () => {
      const hints = detectLegacyEffectV3Syntax('Schema.Number.pipe(Schema.int())');
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain('Schema.check(Schema.isInt())');
    });

    it('Schema.between() — and notes the v4 object-arg shape', () => {
      const hints = detectLegacyEffectV3Syntax('Schema.Number.pipe(Schema.between(1, 5))');
      expect(hints[0]).toContain('isBetween({ minimum, maximum })');
    });

    it('Schema.positive() maps to isGreaterThan(0)', () => {
      const hints = detectLegacyEffectV3Syntax('Schema.Number.pipe(Schema.positive())');
      expect(hints[0]).toContain('Schema.check(Schema.isGreaterThan(0))');
    });

    it('the real creativetoolkits case: int + between together → two hints', () => {
      const hints = detectLegacyEffectV3Syntax(
        'Schema.Number.pipe(Schema.int(), Schema.between(1, 5))'
      );
      expect(hints).toHaveLength(2);
    });

    it('greaterThan is matched without also matching greaterThanOrEqualTo', () => {
      const gt = detectLegacyEffectV3Syntax('Schema.Number.pipe(Schema.greaterThan(0))');
      expect(gt).toHaveLength(1);
      expect(gt[0]).toContain('isGreaterThan(n)');
      const gte = detectLegacyEffectV3Syntax('Schema.Number.pipe(Schema.greaterThanOrEqualTo(0))');
      expect(gte).toHaveLength(1);
      expect(gte[0]).toContain('isGreaterThanOrEqualTo(n)');
    });
  });

  describe('flags variadic combinators (v4 takes an array)', () => {
    it('Schema.Union(a, b) — the real licensing.prisma case', () => {
      const hints = detectLegacyEffectV3Syntax('Schema.Union(SellerId, UserId)');
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain('Schema.Union([a, b, …])');
    });

    it('Schema.Tuple(a, b)', () => {
      const hints = detectLegacyEffectV3Syntax('Schema.Tuple(Schema.String, Schema.Number)');
      expect(hints[0]).toContain('Schema.Tuple([a, b, …])');
    });

    it('multi-arg Schema.Literal → Literals', () => {
      const hints = detectLegacyEffectV3Syntax("Schema.Literal('a', 'b')");
      expect(hints[0]).toContain('Schema.Literals([a, b, …])');
    });
  });

  describe('flags removed/renamed schemas', () => {
    it('Schema.DateFromSelf', () => {
      expect(detectLegacyEffectV3Syntax('Schema.DateFromSelf')[0]).toContain('Schema.Date');
    });
    it('Schema.UUID', () => {
      expect(detectLegacyEffectV3Syntax('Schema.UUID')[0]).toContain(
        'Schema.String.check(Schema.isUUID())'
      );
    });
    it('Schema.optionalWith', () => {
      expect(
        detectLegacyEffectV3Syntax('Schema.optionalWith(Schema.String, { exact: true })')[0]
      ).toContain('Schema.optionalKey');
    });
  });

  describe('does NOT flag valid v4 syntax (no false positives)', () => {
    it.each([
      'Schema.String',
      'Schema.Number.check(Schema.isInt())',
      'Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 5 }))',
      'Schema.String.check(Schema.isUUID()).pipe(Schema.brand("UserId"))',
      'Schema.Union([SellerId, UserId])',
      'Schema.Literals(["a", "b"])',
      "Schema.Literal('single')", // single literal is unchanged in v4
      'Schema.Array(Schema.Number).check(Schema.isLengthBetween(3, 3))',
      'Schema.Date',
    ])('clean: %s', (expr) => {
      expect(detectLegacyEffectV3Syntax(expr)).toEqual([]);
    });
  });
});
