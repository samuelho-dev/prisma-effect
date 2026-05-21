---
'prisma-effect-kysely': patch
---

Fix: implicit M:N join tables now expose their physical `A`/`B` columns in the
Kysely `DB` interface.

Kysely uses `DB`-interface field names as literal SQL column identifiers. The
join-table entry was emitted as `Schema.Schema.Type<typeof JoinTable>`, whose
keys are the **decoded** semantic names (`product_id`, `product_tag_id`). But an
implicit many-to-many table's physical Postgres columns are `A`/`B` (Prisma's
convention), so a query like
`db.selectFrom('_product_tags').where('_product_tags.product_id', ...)` emitted
`WHERE product_id` against a table that only has `A`/`B` → runtime SQL error.

The join-table `DB` entry is now `Schema.Codec.Encoded<typeof JoinTable>`, whose
keys are the **encoded** physical columns `A`/`B` (carrying the branded
`columnType` values, so joins remain type-safe against the parent table's branded
id). The semantic-name mapping still lives only in the schema's
`Schema.encodeKeys`, used when decoding a raw DB row. Regular (non-join) model
tables are unchanged (`Schema.Schema.Type<typeof Model>`).
