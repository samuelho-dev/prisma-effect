---
"prisma-effect-kysely": minor
---

fix: DB interface uses `Schema.Schema.Encoded` so Kysely sees real DB columns

The generated `interface DB` previously emitted
`<table>: Schema.Schema.Type<typeof X>`. For tables using `Schema.fromKey`
(Prisma implicit M:N join tables, where TS field `product_id` maps to DB
column `A`), the Type side has the **decoded** names. Kysely uses the TS
interface as the SQL contract — it does not run the Effect schema decoder.
So queries like `db.selectFrom('_product_tags').where('product_id', ...)`
generated `WHERE product_id = ...` and Postgres rejected with
`column _product_tags.product_id does not exist`.

Fix: emit `Schema.Schema.Encoded<typeof X>` for every DB interface entry.
Encoded is the on-the-wire / on-disk shape that matches Postgres. For
regular tables `Type === Encoded`, no behavior change. For join tables,
Kysely now sees `A`/`B` and emits valid SQL. Application code that wants
the semantic field names runs the row through `Schema.decode(X)`.

`ColumnType<S, I, U>` brand preserves `__select__`/`__insert__`/`__update__`
phantoms on both sides, so `Insertable<X>`/`Updateable<X>` inference is
unchanged.

Adds `db-interface-sql-contract.test.ts` with three regression checks:
1. String-grep — every DB entry uses Encoded, none use Type.
2. Encoded-side preserves real Postgres column names for implicit M:N.
3. Kysely SQL compile — emitted SQL references the real `"A"` column,
   not the `product_id` decoded name. This catches the original bug
   structurally without needing a live database.

**Migration**: most consumers need no changes. If a consumer overrode
the generated DB interface entry to expose `A`/`B` directly (workaround
for this bug), the override can now be removed and the generator will
do the right thing.
