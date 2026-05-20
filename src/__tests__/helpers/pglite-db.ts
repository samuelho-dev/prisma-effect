import { PGlite } from '@electric-sql/pglite';
import { Context, Effect, Layer } from 'effect';
import { Kysely } from 'kysely';
import { PGliteDialect } from 'kysely-pglite-dialect';

/**
 * Test-only Effect Layer that boots a fresh pglite (Postgres-in-WASM) instance,
 * applies user-supplied DDL, and hands out a typed `Kysely<DB>`.
 *
 * Scope teardown destroys the Kysely client and closes pglite, so each
 * `it.layer(...)` block gets a clean DB.
 *
 * Consumers parameterize on their generated `DB` interface:
 *
 * ```ts
 * import type { DB } from './generated/types';
 * import { makePgliteLayer, KyselyDb } from 'prisma-effect-kysely/.../pglite-db';
 *
 * const ddl = `CREATE TABLE "User" (id uuid PRIMARY KEY, email text NOT NULL);`;
 * const Live = makePgliteLayer<DB>(ddl);
 * ```
 */

export class KyselyDb extends Context.Service<KyselyDb, Kysely<unknown>>()(
  'prisma-effect-kysely/test/KyselyDb'
) {}

export const makePgliteLayer = <DB>(ddl: string): Layer.Layer<KyselyDb, Error> =>
  // Effect 4: Layer.effect accepts a scoped effect (acquireRelease provides the
  // Scope), replacing Effect 3's Layer.scoped.
  Layer.effect(
    KyselyDb,
    Effect.acquireRelease(
      Effect.tryPromise({
        try: async () => {
          const pglite = new PGlite();
          await pglite.exec(ddl);
          const db = new Kysely<DB>({ dialect: new PGliteDialect(pglite) });
          return { db, pglite } as const;
        },
        catch: (cause) => new Error(`Failed to boot pglite: ${String(cause)}`),
      }),
      ({ db }) =>
        // Kysely's destroy() closes the underlying pglite as part of dialect teardown.
        Effect.promise(() => db.destroy())
    ).pipe(Effect.map(({ db }) => db as Kysely<unknown>))
  );
