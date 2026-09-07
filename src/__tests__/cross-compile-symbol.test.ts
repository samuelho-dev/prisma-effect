/**
 * Test that verifies the unique symbol matching works correctly
 *
 * The issue: When using prisma-effect-kysely from node_modules,
 * TypeScript may not match the VariantMarker because unique symbols
 * are different per declaration file.
 */

import { Schema } from 'effect';
import { describe, it, expect } from 'vitest';
import {
  generated,
  VariantTypeId,
  type Generated,
  type VariantMarker,
  type Updateable,
} from '../kysely/helpers';

// Simulate an enum like PAYMENT_STATUS
const PaymentStatus = Schema.Literals(['PENDING', 'SUCCEEDED', 'FAILED']);
type PaymentStatus = Schema.Schema.Type<typeof PaymentStatus>;

describe('VariantMarker symbol matching', () => {
  it('Generated<T> should extend VariantMarker', () => {
    // Type-level test: this should compile without error
    type TestGenerated = Generated<PaymentStatus>;

    // Check that TestGenerated extends VariantMarker<PaymentStatus | undefined, PaymentStatus>
    type ExtendsVariant =
      TestGenerated extends VariantMarker<PaymentStatus | undefined, PaymentStatus> ? true : false;
    const extendsVariant: ExtendsVariant = true;
    expect(extendsVariant).toBe(true);
  });

  it('ExtractUpdateType should work with Generated', () => {
    type TestGenerated = Generated<PaymentStatus>;

    // The conditional type should match
    type ExtractedUpdate =
      TestGenerated extends VariantMarker<unknown, infer U> ? U : TestGenerated;

    // If extraction works, this should compile with 'SUCCEEDED'
    const value: ExtractedUpdate = 'SUCCEEDED';
    expect(value).toBe('SUCCEEDED');
  });

  it('Updateable should extract the correct type', () => {
    const Payment = Schema.Struct({
      status: generated(PaymentStatus),
    });

    type PaymentUpdate = Updateable<typeof Payment>;

    // status should be PaymentStatus (optional), not Generated<PaymentStatus>
    const update: PaymentUpdate = {
      status: 'SUCCEEDED',
    };

    expect(update.status).toBe('SUCCEEDED');
  });

  it('VariantTypeId should be consistent', () => {
    // Runtime check that the symbol is the same
    const symbol1 = VariantTypeId;
    const symbol2 = Symbol.for('prisma-effect-kysely/VariantType');

    // These should be the same at runtime
    expect(symbol1).toBe(symbol2);
  });
});
