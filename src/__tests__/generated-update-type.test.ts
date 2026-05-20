/**
 * Test that Updateable properly extracts the update type from Generated<T>
 *
 * Issue: When using Updateable<typeof Model> where Model has a Generated<ENUM> field,
 * the update type should be ENUM, not Generated<ENUM>
 */

import { Schema } from 'effect';
import { describe, it, expect } from 'vitest';
import {
  columnType,
  generated,
  Updateable,
  Insertable,
  type Generated,
  type ExtractUpdateType,
} from '../kysely/helpers';

// Simulate an enum like PAYMENT_STATUS
const PaymentStatus = Schema.Literal('PENDING', 'SUCCEEDED', 'FAILED');
type PaymentStatus = Schema.Schema.Type<typeof PaymentStatus>;

// Simulate the Payment model as generated
const Payment = Schema.Struct({
  id: columnType(
    Schema.String.check(Schema.isUUID()).pipe(Schema.brand('PaymentId')),
    Schema.Never,
    Schema.Never
  ),
  amount: generated(Schema.Number),
  status: generated(PaymentStatus),
  created_at: generated(Schema.Date),
});

type Payment = typeof Payment;

describe('Generated field update type extraction', () => {
  describe('ExtractUpdateType utility', () => {
    it('should extract update type from Generated<T>', () => {
      // Generated<T> has VariantMarker<T | undefined, T>
      // So ExtractUpdateType<Generated<PaymentStatus>> should be PaymentStatus
      type StatusUpdateType = ExtractUpdateType<Generated<PaymentStatus>>;

      // If ExtractUpdateType works correctly, this should compile:
      const status: StatusUpdateType = 'SUCCEEDED';
      expect(status).toBe('SUCCEEDED');
    });

    it('should extract update type from regular types', () => {
      type StringUpdateType = ExtractUpdateType<string>;

      const str: StringUpdateType = 'hello';
      expect(str).toBe('hello');
    });
  });

  describe('Updateable type with Generated enum fields', () => {
    it('should allow raw enum value assignment for Generated status field', () => {
      type PaymentUpdate = Updateable<Payment>;

      // This should compile without error:
      // status should be PaymentStatus (optional), not Generated<PaymentStatus>
      const update: PaymentUpdate = {
        status: 'SUCCEEDED',
      };

      expect(update.status).toBe('SUCCEEDED');
    });

    it('should allow all valid enum values', () => {
      type PaymentUpdate = Updateable<Payment>;

      const update1: PaymentUpdate = { status: 'PENDING' };
      const update2: PaymentUpdate = { status: 'SUCCEEDED' };
      const update3: PaymentUpdate = { status: 'FAILED' };

      expect(update1.status).toBe('PENDING');
      expect(update2.status).toBe('SUCCEEDED');
      expect(update3.status).toBe('FAILED');
    });

    it('should allow updating other generated fields', () => {
      type PaymentUpdate = Updateable<Payment>;

      const update: PaymentUpdate = {
        amount: 100,
        status: 'SUCCEEDED',
        created_at: new Date(),
      };

      expect(update.amount).toBe(100);
      expect(update.status).toBe('SUCCEEDED');
      expect(update.created_at).toBeInstanceOf(Date);
    });

    it('should not include id field (read-only)', () => {
      type PaymentUpdate = Updateable<Payment>;

      // id should NOT be in the update type
      type HasId = 'id' extends keyof PaymentUpdate ? true : false;
      const hasId: HasId = false;
      expect(hasId).toBe(false);
    });

    it('should have all fields optional', () => {
      type PaymentUpdate = Updateable<Payment>;

      // Empty update should be valid
      const emptyUpdate: PaymentUpdate = {};
      expect(Object.keys(emptyUpdate).length).toBe(0);

      // Single field update should be valid
      const singleUpdate: PaymentUpdate = { status: 'FAILED' };
      expect(singleUpdate.status).toBe('FAILED');
    });
  });

  describe('Insertable type with Generated enum fields', () => {
    it('should make Generated fields optional (not required)', () => {
      type PaymentInsert = Insertable<Payment>;

      // Generated fields should be optional, not required
      // This should compile without providing status, amount, or created_at
      const insert: PaymentInsert = {};

      expect(Object.keys(insert).length).toBe(0);
    });

    it('should allow providing Generated field values', () => {
      type PaymentInsert = Insertable<Payment>;

      const insert: PaymentInsert = {
        status: 'PENDING',
        amount: 50,
      };

      expect(insert.status).toBe('PENDING');
      expect(insert.amount).toBe(50);
    });
  });
});
