import { Effect, Schema } from 'effect';
import type { Kysely } from 'kysely';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../error/index.js';
import { columnType, generated, Insertable } from '../../kysely/helpers.js';
import { KyselyDb, makePgliteLayer } from '../helpers/pglite-db.js';

/**
 * End-to-end roundtrip: prove the shape this package emits actually works
 * against real Postgres semantics (via pglite).
 *
 * Hand-written `User` schema mirrors the canonical generator output documented
 * in CLAUDE.md — branded UUID id (read-only, server-generated), generated()
 * timestamp, and a plain string column. If this passes, the generated shape
 * passes by construction.
 */

const UserDDL = `
  CREATE TABLE "User" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" text NOT NULL UNIQUE,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  );
`;

const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

const User = Schema.Struct({
  id: columnType(UserId, Schema.Never, Schema.Never),
  email: Schema.String,
  createdAt: generated(Schema.Date),
});

// Kysely's DB interface stores the raw schema Type so its own ColumnType brands
// drive Kysely's Insertable/Updateable derivation. (Consumers of generated output
// typically use `Selectable<typeof User>` in DB — the choice here gives us tighter
// roundtrip coverage without changing the generator.)
interface DB {
  User: Schema.Schema.Type<typeof User>;
}

describe('pglite roundtrip', () => {
  it('inserts and selects through generated-shape schema', async () => {
    const program = Effect.gen(function* () {
      const db = (yield* KyselyDb) as Kysely<DB>;

      const inserted = yield* Effect.tryPromise({
        try: () =>
          db
            .insertInto('User')
            .values({ email: 'alice@example.com' })
            .returningAll()
            .executeTakeFirstOrThrow(),
        catch: (cause) => new Error(`insert failed: ${String(cause)}`),
      });

      const decoded = Schema.decodeUnknownSync(User)(inserted);

      const found = yield* Effect.tryPromise({
        try: () =>
          db.selectFrom('User').selectAll().where('id', '=', decoded.id).executeTakeFirst(),
        catch: (cause) => new Error(`select failed: ${String(cause)}`),
      });

      if (!found) {
        return yield* new NotFoundError({ table: 'User', criteria: { id: decoded.id } });
      }

      const foundDecoded = Schema.decodeUnknownSync(User)(found);
      return { inserted: decoded, found: foundDecoded };
    });

    const Live = makePgliteLayer<DB>(UserDDL);
    const result = await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(Live))));

    expect(result.inserted.email).toBe('alice@example.com');
    expect(result.inserted.createdAt).toBeInstanceOf(Date);
    expect(typeof result.inserted.id).toBe('string');
    expect(result.found.id).toBe(result.inserted.id);
  });

  it('null on missing row surfaces as NotFoundError tagged channel', async () => {
    const findOrNotFound: Effect.Effect<string, NotFoundError | Error, KyselyDb> = Effect.gen(
      function* () {
        const db = (yield* KyselyDb) as Kysely<DB>;
        const missing = yield* Effect.tryPromise({
          try: () =>
            db
              .selectFrom('User')
              .selectAll()
              .where('email', '=', 'nobody@example.com')
              .executeTakeFirst(),
          catch: (cause) => new Error(`select failed: ${String(cause)}`),
        });

        if (!missing) {
          return yield* Effect.fail(
            new NotFoundError({
              table: 'User',
              criteria: { email: 'nobody@example.com' },
            })
          );
        }
        return 'unreachable';
      }
    );

    const Live = makePgliteLayer<DB>(UserDDL);
    const recovered = findOrNotFound.pipe(
      Effect.catchTag('NotFoundError', (e) => Effect.succeed(`missing in ${e.table}`)),
      Effect.provide(Live),
      Effect.scoped
    );

    await expect(Effect.runPromise(recovered)).resolves.toBe('missing in User');
  });

  it('Insertable accepts an explicit NULL for a nullable column (roundtrips to DB)', async () => {
    const NoteDDL = `
      CREATE TABLE "Note" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "body" text
      );
    `;
    const NoteId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('NoteId'));
    const Note = Schema.Struct({
      id: columnType(NoteId, Schema.Never, Schema.Never),
      title: Schema.String,
      body: Schema.NullOr(Schema.String), // Prisma optional column
    });
    interface NoteDB {
      Note: Schema.Schema.Type<typeof Note>;
    }

    const program = Effect.gen(function* () {
      const db = (yield* KyselyDb) as Kysely<NoteDB>;

      // Explicit null must pass Insertable() decode and reach the DB as NULL.
      const insertValues = Schema.decodeUnknownSync(Insertable(Note))({ title: 'n', body: null });

      const inserted = yield* Effect.tryPromise({
        try: () =>
          db.insertInto('Note').values(insertValues).returningAll().executeTakeFirstOrThrow(),
        catch: (cause) => new Error(`insert failed: ${String(cause)}`),
      });

      return Schema.decodeUnknownSync(Note)(inserted);
    });

    const Live = makePgliteLayer<NoteDB>(NoteDDL);
    const row = await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(Live))));

    expect(row.title).toBe('n');
    expect(row.body).toBeNull();
  });

  it('implicit M:N join table is queryable by its physical A/B columns', async () => {
    // Regression: the Kysely DB-interface type for an implicit M:N join table must
    // use the ENCODED shape (physical Postgres columns A/B), because Kysely emits
    // DB-interface field names as literal SQL identifiers. The physical table only
    // has columns A/B; the semantic *_id names live solely in the Schema's
    // encodeKeys (decode) mapping. This test runs the exact query that previously
    // failed — `where('_product_tags.A', ...)` — against a real A/B table.
    const JoinDDL = `
      CREATE TABLE "_product_tags" (
        "A" uuid NOT NULL,
        "B" uuid NOT NULL,
        PRIMARY KEY ("A", "B")
      );
    `;
    const ProductId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ProductId'));
    const ProductTagId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ProductTagId'));
    const ProductTags = Schema.Struct({
      product_id: columnType(ProductId, ProductId, Schema.Never),
      product_tag_id: columnType(ProductTagId, ProductTagId, Schema.Never),
    }).pipe(Schema.encodeKeys({ product_id: 'A', product_tag_id: 'B' }));

    // The generator emits this exact DB-interface entry for join tables.
    interface JoinDB {
      _product_tags: Schema.Codec.Encoded<typeof ProductTags>;
    }

    // Branded values, as a real consumer would supply them — the encoded A/B
    // columns are branded (ProductId/ProductTagId), so the join stays type-safe.
    const pid = Schema.decodeUnknownSync(ProductId)('11111111-1111-4111-8111-111111111111');
    const tid = Schema.decodeUnknownSync(ProductTagId)('22222222-2222-4222-8222-222222222222');

    const program = Effect.gen(function* () {
      const db = (yield* KyselyDb) as Kysely<JoinDB>;

      yield* Effect.tryPromise({
        try: () => db.insertInto('_product_tags').values({ A: pid, B: tid }).execute(),
        catch: (cause) => new Error(`insert failed: ${String(cause)}`),
      });

      // The previously-broken query: reference the PHYSICAL column A.
      const found = yield* Effect.tryPromise({
        try: () =>
          db
            .selectFrom('_product_tags')
            .selectAll()
            .where('_product_tags.A', '=', pid)
            .executeTakeFirst(),
        catch: (cause) => new Error(`select failed: ${String(cause)}`),
      });

      // Decode the raw {A,B} row back to semantic names via the schema.
      return found ? Schema.decodeUnknownSync(ProductTags)(found) : undefined;
    });

    const Live = makePgliteLayer<JoinDB>(JoinDDL);
    const decoded = await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(Live))));

    expect(decoded).toEqual({ product_id: pid, product_tag_id: tid });
  });
});
