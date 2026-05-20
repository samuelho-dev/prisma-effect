import { describe, it, expect } from 'vitest';
import { Schema } from 'effect';
import { columnType, generated, Insertable, Updateable } from '../kysely/helpers';
import type { Insertable as InsertableType } from '../kysely/helpers';

/**
 * Regression test for TS2589: "Type instantiation is excessively deep and possibly infinite"
 *
 * Root cause: DeepMutable<T> from effect/Types recursively visits every nested property
 * of the extracted insert/update types. Combined with Kysely's per-column ValueExpression
 * checking, this exceeds TypeScript's ~50-level depth limit.
 *
 * Fix: Use shallow `-readonly` mapped types instead of recursive DeepMutable.
 */
describe('TS2589 regression: deep type instantiation', () => {
  // Branded ID types
  const SellerId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('SellerId'));
  const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'));

  // Enum-like types
  const SellerStatus = Schema.Literal('ACTIVE', 'INACTIVE', 'BANNED', 'PENDING');
  const PayoutSchedule = Schema.Literal('IMMEDIATE', 'DAILY', 'WEEKLY', 'MONTHLY');

  // Realistic seller schema with 27 fields (matching production schema)
  const Seller = Schema.Struct({
    activated_at: Schema.NullOr(Schema.Date),
    banned_reason: Schema.NullOr(Schema.String),
    business_profile: Schema.NullOr(Schema.Unknown),
    business_type: Schema.NullOr(Schema.String),
    capabilities: Schema.NullOr(Schema.Unknown),
    card_payments_capability: Schema.NullOr(Schema.String),
    charges_enabled: generated(Schema.Boolean),
    created_at: generated(Schema.Date),
    default_currency: generated(Schema.String),
    details_submitted: generated(Schema.Boolean),
    external_accounts: Schema.NullOr(Schema.Unknown),
    flagged_reason: Schema.NullOr(Schema.String),
    id: columnType(SellerId, Schema.Never, Schema.Never),
    last_verification_attempt: Schema.NullOr(Schema.Date),
    minimum_payout_threshold: generated(Schema.Number),
    payout_schedule: generated(PayoutSchedule),
    payouts_enabled: generated(Schema.Boolean),
    requirements: Schema.NullOr(Schema.Unknown),
    status: generated(SellerStatus),
    stripe_account_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
    tos_acceptance_date: Schema.NullOr(Schema.Date),
    transfers_capability: Schema.NullOr(Schema.String),
    updated_at: generated(Schema.Date),
    user_id: UserId,
    verification_due_by: Schema.NullOr(Schema.Date),
    verification_fields_needed: generated(Schema.Array(Schema.String)),
    verification_status: Schema.NullOr(Schema.String),
  });
  type Seller = typeof Seller;

  it('Insertable type should resolve without excessive depth for 27-field schemas', () => {
    // This type alias resolution should not trigger TS2589
    type InsertType = InsertableType<Seller>;

    // Verify the type resolves correctly by creating a value
    const data: InsertType = {
      user_id: '550e8400-e29b-41d4-a716-446655440000' as any,
    };

    expect(data).toBeDefined();
    expect(data.user_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('Insertable runtime schema should decode data with required and optional fields', () => {
    const insertSchema = Insertable(Seller);

    // Only required field is user_id; all others are nullable or generated (optional)
    const result = Schema.decodeUnknownSync(insertSchema)({
      user_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.user_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('Insertable should handle array fields correctly after DeepMutable removal', () => {
    const insertSchema = Insertable(Seller);

    const result = Schema.decodeUnknownSync(insertSchema)({
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      verification_fields_needed: ['email', 'phone'],
    });

    expect(result.verification_fields_needed).toEqual(['email', 'phone']);
    // Verify array is mutable (push should work) - runtime Schema.mutable() handles this
    (result.verification_fields_needed as string[]).push('address');
    expect(result.verification_fields_needed).toContain('address');
  });

  it('Updateable runtime schema should decode data correctly', () => {
    const updateSchema = Updateable(Seller);

    const result = Schema.decodeUnknownSync(updateSchema)({
      status: 'ACTIVE',
      verification_fields_needed: ['email'],
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.verification_fields_needed).toEqual(['email']);
  });
});
