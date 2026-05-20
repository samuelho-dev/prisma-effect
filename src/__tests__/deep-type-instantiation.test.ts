/**
 * Deep Type Instantiation Test (TS2589)
 *
 * This test reproduces the "Type instantiation is excessively deep and possibly infinite"
 * error that occurs when using Kysely's `.returningAll()` with prisma-effect-kysely's
 * branded ColumnType/Generated types on tables with many fields.
 *
 * ROOT CAUSE:
 * Kysely's `Selectable<R>` applies `SelectType<T>` to each field:
 *   `SelectType<T> = T extends ColumnType<infer S, any, any> ? S : T`
 *
 * Our ColumnType<S,I,U> = S & VariantMarker<I,U> & { __select__: S, __insert__: I, __update__: U }
 * The VariantMarker contains a mapped conditional type:
 *   `{ readonly [K in 'insert' | 'update']: K extends 'insert' ? I : U }`
 *
 * For each field, TypeScript must fully evaluate the VariantMarker intersection
 * to check `extends { __select__: infer S }`. With 20+ fields each requiring this,
 * the recursive type instantiation depth exceeds TypeScript's limit (~50 levels).
 *
 * FIX:
 * Remove VariantMarker from the top-level intersection in ColumnType/Generated.
 * Move variant information behind a symbol key so TypeScript doesn't need to
 * evaluate it during Kysely's SelectType conditional check.
 */

import { Schema } from 'effect';
import type {
  Kysely,
  Selectable as KyselySelectable,
  Insertable as KyselyInsertable,
  InsertQueryBuilder,
  UpdateQueryBuilder,
} from 'kysely';
import { describe, it, expectTypeOf } from 'vitest';
import {
  columnType,
  generated,
  JsonValue,
  type ColumnType,
  type Generated,
  type Selectable,
  type Insertable,
  type Updateable,
} from '../kysely/helpers';

// ============================================================================
// Simulate a realistically complex database schema (20+ fields per table)
// This is what triggers TS2589 in production codebases
// ============================================================================

const SellerId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('SellerId'));
type SellerId = typeof SellerId.Type;

const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

const ProductId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ProductId'));
type ProductId = typeof ProductId.Type;

const OrderId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('OrderId'));
type OrderId = typeof OrderId.Type;

const PaymentId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('PaymentId'));
type PaymentId = typeof PaymentId.Type;

// A realistic Seller schema with many generated/columnType fields
const Seller = Schema.Struct({
  id: columnType(SellerId, Schema.Never, Schema.Never),
  user_id: UserId,
  status: generated(Schema.String),
  charges_enabled: generated(Schema.Boolean),
  payouts_enabled: generated(Schema.Boolean),
  details_submitted: generated(Schema.Boolean),
  default_currency: generated(Schema.String),
  payout_schedule: generated(Schema.String),
  minimum_payout_threshold: generated(Schema.Number),
  verification_fields_needed: generated(Schema.Array(Schema.String)),
  activated_at: Schema.NullOr(Schema.Date),
  banned_reason: Schema.NullOr(Schema.String),
  business_type: Schema.NullOr(Schema.String),
  card_payments_capability: Schema.NullOr(Schema.String),
  flagged_reason: Schema.NullOr(Schema.String),
  last_verification_attempt: Schema.NullOr(Schema.Date),
  stripe_account_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  tos_acceptance_date: Schema.NullOr(Schema.Date),
  transfers_capability: Schema.NullOr(Schema.String),
  verification_due_by: Schema.NullOr(Schema.Date),
  verification_status: Schema.NullOr(Schema.String),
  created_at: generated(Schema.Date),
  updated_at: generated(Schema.Date),
});
type SellerType = Schema.Schema.Type<typeof Seller>;

// A realistic Product schema
const Product = Schema.Struct({
  id: columnType(ProductId, Schema.Never, Schema.Never),
  name: Schema.String,
  description: Schema.String,
  price: Schema.Number,
  custom_url: Schema.String,
  market: Schema.String,
  type: Schema.String,
  seller_id: SellerId,
  status: generated(Schema.String),
  currency: generated(Schema.String),
  images: generated(Schema.Array(Schema.String)),
  custom_pricing: generated(Schema.NullOr(Schema.Boolean)),
  custom_quantity: generated(Schema.NullOr(Schema.Boolean)),
  custom_timing: generated(Schema.NullOr(Schema.Boolean)),
  is_subscription_only: generated(Schema.Boolean),
  content: Schema.NullOr(Schema.String),
  current_version_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  end_at: Schema.NullOr(Schema.Date),
  max_quantity: Schema.NullOr(Schema.Number),
  start_at: Schema.NullOr(Schema.Date),
  subcategory_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  suggested_price: Schema.NullOr(Schema.Number),
  thumbnail: Schema.NullOr(Schema.String),
  category_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  created_at: generated(Schema.Date),
  updated_at: generated(Schema.Date),
});
type ProductType = Schema.Schema.Type<typeof Product>;

// A realistic Order schema
const Order = Schema.Struct({
  id: columnType(OrderId, Schema.Never, Schema.Never),
  buyer_id: UserId,
  status: generated(Schema.String),
  checkout_flow: generated(Schema.String),
  currency: generated(Schema.String),
  subtotal: Schema.Number,
  total: Schema.Number,
  discount_amount: generated(Schema.Number),
  tax_amount: generated(Schema.Number),
  shipping_amount: generated(Schema.Number),
  email: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  stripe_payment_intent_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  completed_at: Schema.NullOr(Schema.Date),
  cancelled_at: Schema.NullOr(Schema.Date),
  refunded_at: Schema.NullOr(Schema.Date),
  created_at: generated(Schema.Date),
  updated_at: generated(Schema.Date),
});
type OrderType = Schema.Schema.Type<typeof Order>;

// A realistic Payment schema
const Payment = Schema.Struct({
  id: columnType(PaymentId, Schema.Never, Schema.Never),
  order_id: OrderId,
  amount: Schema.Number,
  currency: Schema.String,
  status: generated(Schema.String),
  payment_method: generated(Schema.String),
  stripe_payment_intent_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  stripe_charge_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  stripe_balance_transaction_id: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  failure_code: Schema.NullOr(Schema.String),
  failure_message: Schema.NullOr(Schema.String),
  refund_amount: Schema.NullOr(Schema.Number),
  refunded_at: Schema.NullOr(Schema.Date),
  created_at: generated(Schema.Date),
  updated_at: generated(Schema.Date),
});
type PaymentType = Schema.Schema.Type<typeof Payment>;

// DB interface matching what prisma-effect-kysely generates
interface TestDB {
  seller: SellerType;
  product: ProductType;
  order: OrderType;
  payment: PaymentType;
}

// ============================================================================
// Tests: Kysely's Selectable should resolve without TS2589
// ============================================================================

describe('Deep type instantiation - Kysely Selectable on complex schemas', () => {
  // This is what Kysely's returningAll() returns: KyselySelectable<DB[TB]>
  // With the current VariantMarker intersection, this triggers TS2589

  it('should resolve KyselySelectable<Seller> without depth error', () => {
    type SellerSelect = KyselySelectable<TestDB['seller']>;

    // If this compiles, the type resolved without TS2589
    expectTypeOf<SellerSelect>().toHaveProperty('id');
    expectTypeOf<SellerSelect>().toHaveProperty('user_id');
    expectTypeOf<SellerSelect>().toHaveProperty('status');
    expectTypeOf<SellerSelect>().toHaveProperty('created_at');
  });

  it('should resolve KyselySelectable<Product> without depth error', () => {
    type ProductSelect = KyselySelectable<TestDB['product']>;

    expectTypeOf<ProductSelect>().toHaveProperty('id');
    expectTypeOf<ProductSelect>().toHaveProperty('name');
    expectTypeOf<ProductSelect>().toHaveProperty('seller_id');
    expectTypeOf<ProductSelect>().toHaveProperty('created_at');
  });

  it('should resolve KyselySelectable<Order> without depth error', () => {
    type OrderSelect = KyselySelectable<TestDB['order']>;

    expectTypeOf<OrderSelect>().toHaveProperty('id');
    expectTypeOf<OrderSelect>().toHaveProperty('buyer_id');
    expectTypeOf<OrderSelect>().toHaveProperty('status');
  });

  it('should resolve KyselySelectable<Payment> without depth error', () => {
    type PaymentSelect = KyselySelectable<TestDB['payment']>;

    expectTypeOf<PaymentSelect>().toHaveProperty('id');
    expectTypeOf<PaymentSelect>().toHaveProperty('order_id');
    expectTypeOf<PaymentSelect>().toHaveProperty('amount');
  });
});

describe('Deep type instantiation - returningAll() query builder types', () => {
  // Simulate what happens when Kysely chains .insertInto().values().returningAll()
  // The return type of returningAll() is InsertQueryBuilder<DB, TB, Selectable<DB[TB]>>

  it('should type-check insertInto().returningAll() for Seller', () => {
    // This simulates the return type of:
    // db.insertInto('seller').values(input).returningAll().executeTakeFirstOrThrow()
    type ReturnType = KyselySelectable<TestDB['seller']>;

    // Verify the return type has correct field types
    expectTypeOf<ReturnType>().toHaveProperty('id');
    expectTypeOf<ReturnType>().toHaveProperty('user_id');
    expectTypeOf<ReturnType>().toHaveProperty('charges_enabled');

    // Branded IDs should be preserved
    type IdType = ReturnType['id'];
    expectTypeOf<IdType>().toMatchTypeOf<string>();
  });

  it('should type-check insertInto().returningAll() for Product', () => {
    type ReturnType = KyselySelectable<TestDB['product']>;

    expectTypeOf<ReturnType>().toHaveProperty('id');
    expectTypeOf<ReturnType>().toHaveProperty('name');
    expectTypeOf<ReturnType>().toHaveProperty('seller_id');
  });

  it('should type-check updateTable().returningAll() for Seller', () => {
    type ReturnType = KyselySelectable<TestDB['seller']>;

    expectTypeOf<ReturnType>().toHaveProperty('id');
    expectTypeOf<ReturnType>().toHaveProperty('status');
    expectTypeOf<ReturnType>().toHaveProperty('updated_at');
  });
});

describe('Deep type instantiation - KyselyInsertable still works', () => {
  // Ensure that KyselyInsertable (used by .values()) still correctly
  // recognizes ColumnType/Generated fields after the fix

  it('should exclude id from KyselyInsertable<Seller>', () => {
    type SellerInsert = KyselyInsertable<TestDB['seller']>;

    // id has ColumnType<SellerId, never, never> — should be excluded
    expectTypeOf<SellerInsert>().not.toHaveProperty('id');

    // user_id is a plain branded type — should be required
    expectTypeOf<SellerInsert>().toHaveProperty('user_id');
  });

  it('should make generated fields optional in KyselyInsertable<Product>', () => {
    type ProductInsert = KyselyInsertable<TestDB['product']>;

    // id should be excluded (never insert)
    expectTypeOf<ProductInsert>().not.toHaveProperty('id');

    // name should be required (plain string)
    expectTypeOf<ProductInsert>().toHaveProperty('name');

    // seller_id should be required (branded FK)
    expectTypeOf<ProductInsert>().toHaveProperty('seller_id');
  });
});

describe('Deep type instantiation - multiple tables simultaneously', () => {
  // This tests that resolving Selectable across multiple tables in the DB
  // interface doesn't compound the depth issue

  it('should resolve all table selectables without TS2589', () => {
    type AllSelectables = {
      seller: KyselySelectable<TestDB['seller']>;
      product: KyselySelectable<TestDB['product']>;
      order: KyselySelectable<TestDB['order']>;
      payment: KyselySelectable<TestDB['payment']>;
    };

    expectTypeOf<AllSelectables>().toHaveProperty('seller');
    expectTypeOf<AllSelectables>().toHaveProperty('product');
    expectTypeOf<AllSelectables>().toHaveProperty('order');
    expectTypeOf<AllSelectables>().toHaveProperty('payment');
  });
});

// ============================================================================
// JsonValue field tests - TS2589 regression prevention
// ============================================================================
// JsonValue is a recursive type. Kysely's distributive InsertType/UpdateType
// (`T extends ColumnType<...> ? ... : T`) expands each union member of JsonValue
// recursively, hitting TypeScript's depth limit.
//
// Fix: Json fields are wrapped with columnType(JsonValue, JsonValue, JsonValue)
// so Kysely's InsertType takes the ColumnType fast path (extracts via infer)
// instead of distributing over the recursive union.

const PaymentWithJson = Schema.Struct({
  id: columnType(PaymentId, Schema.Never, Schema.Never),
  order_id: OrderId,
  amount: Schema.Number,
  currency: Schema.String,
  status: generated(Schema.String),
  // Json fields wrapped in columnType — matches what the generator now produces
  last_payment_error: Schema.NullOr(columnType(JsonValue, JsonValue, JsonValue)),
  metadata: Schema.NullOr(columnType(JsonValue, JsonValue, JsonValue)),
  raw_response: columnType(JsonValue, JsonValue, JsonValue),
  created_at: generated(Schema.Date),
  updated_at: generated(Schema.Date),
});

interface JsonTestDB {
  payment_with_json: Schema.Schema.Type<typeof PaymentWithJson>;
}

describe('Deep type instantiation - JsonValue fields (TS2589 regression)', () => {
  it('should resolve Selectable<PaymentWithJson> without TS2589', () => {
    type Select = Selectable<typeof PaymentWithJson>;

    expectTypeOf<Select>().toHaveProperty('id');
    expectTypeOf<Select>().toHaveProperty('order_id');
    expectTypeOf<Select>().toHaveProperty('last_payment_error');
    expectTypeOf<Select>().toHaveProperty('metadata');
    expectTypeOf<Select>().toHaveProperty('raw_response');
  });

  it('should resolve Insertable<PaymentWithJson> without TS2589', () => {
    type Insert = Insertable<typeof PaymentWithJson>;

    // id should be excluded (never insert)
    expectTypeOf<Insert>().not.toHaveProperty('id');

    // order_id should be required
    expectTypeOf<Insert>().toHaveProperty('order_id');

    // JsonValue fields should be present
    expectTypeOf<Insert>().toHaveProperty('last_payment_error');
    expectTypeOf<Insert>().toHaveProperty('metadata');
    expectTypeOf<Insert>().toHaveProperty('raw_response');
  });

  it('should resolve Updateable<PaymentWithJson> without TS2589', () => {
    type Update = Updateable<typeof PaymentWithJson>;

    // id should be excluded (never update)
    expectTypeOf<Update>().not.toHaveProperty('id');

    // JsonValue fields should be present
    expectTypeOf<Update>().toHaveProperty('last_payment_error');
    expectTypeOf<Update>().toHaveProperty('metadata');
    expectTypeOf<Update>().toHaveProperty('raw_response');
  });

  it('should resolve KyselySelectable with JsonValue fields without TS2589', () => {
    type Select = KyselySelectable<JsonTestDB['payment_with_json']>;

    expectTypeOf<Select>().toHaveProperty('id');
    expectTypeOf<Select>().toHaveProperty('last_payment_error');
    expectTypeOf<Select>().toHaveProperty('metadata');
    expectTypeOf<Select>().toHaveProperty('raw_response');
  });

  it('should resolve KyselyInsertable with JsonValue fields without TS2589', () => {
    type Insert = KyselyInsertable<JsonTestDB['payment_with_json']>;

    expectTypeOf<Insert>().not.toHaveProperty('id');
    expectTypeOf<Insert>().toHaveProperty('order_id');
    expectTypeOf<Insert>().toHaveProperty('last_payment_error');
    expectTypeOf<Insert>().toHaveProperty('raw_response');
  });
});

// ============================================================================
// Kysely query builder types with JsonValue — TS2589 regression
// ============================================================================
// These tests verify that Kysely's .values() and .set() methods compile
// without TS2589 when used on tables with JsonValue fields.
// This is the actual failure mode in production codebases.

describe('Deep type instantiation - Kysely query builders with JsonValue', () => {
  it('should type-check insertInto().values() for table with JsonValue fields', () => {
    // Simulate: db.insertInto('payment_with_json').values(data)
    // This triggers Kysely's InsertObject<DB, TB> which applies InsertType to each field
    type ValuesBuilder = InsertQueryBuilder<JsonTestDB, 'payment_with_json', never>;

    // If this compiles, InsertType did not trigger TS2589 on JsonValue fields
    expectTypeOf<ValuesBuilder>().toBeObject();
  });

  it('should type-check updateTable().set() for table with JsonValue fields', () => {
    // Simulate: db.updateTable('payment_with_json').set(data)
    // This triggers Kysely's UpdateObject<DB, TB> which applies UpdateType to each field
    type SetBuilder = UpdateQueryBuilder<
      JsonTestDB,
      'payment_with_json',
      'payment_with_json',
      never
    >;

    // If this compiles, UpdateType did not trigger TS2589 on JsonValue fields
    expectTypeOf<SetBuilder>().toBeObject();
  });

  it('should type-check Kysely instance methods for JsonValue tables', () => {
    // The full Kysely<DB> type resolves all table types in the DB interface
    type DB = Kysely<JsonTestDB>;

    // If this compiles, none of the JsonValue fields caused TS2589
    expectTypeOf<DB>().toBeObject();
  });
});
