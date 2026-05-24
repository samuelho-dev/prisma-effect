---
"prisma-effect-kysely": minor
---

fix: only treat `@db.Uuid` columns as UUIDs — drop field-name inference

`isUuidField` previously had a third detection tier that inferred UUID from the
field *name* (`/^id$/`, `/_id$/`, `/^.*_uuid$/`, `/^uuid$/`) for any `String`
column. UUID is a column *type*, not a naming convention, so this was a
false-positive generator: every external-system identifier stored as text — most
notably Stripe IDs (`acct_…`, `cus_…`, `sub_…`, `price_…`, `txn_…`, `ch_…`,
`evt_…`), plus slugs and provider/session references — ends in `_id` without
being a UUID. The generator emitted `Schema.String.check(Schema.isUUID())` for
those columns, and decoding real data threw `Die`/`ParseError`
("Expected a UUID, got \"acct_…\"") at runtime.

Prisma always records a genuine `uuid` column via the `@db.Uuid` native type (a
bare `String` maps to `text`), so the native-type and `@db.Uuid`-documentation
checks already capture 100% of real UUID columns. The name-pattern tier only
ever contradicted that authoritative information, so it has been removed.

`isUuidField` now returns true only when:

1. `field.nativeType[0] === 'Uuid'` (a `@db.Uuid` column), or
2. the field documentation includes `@db.Uuid`.

**Migration:** columns that are genuinely UUID-typed are unaffected (they carry
`@db.Uuid`). Columns that were relying on name inference to get UUID validation
lose it — which is the fix, since they were text. To keep an explicit UUID check
on a non-`@db.Uuid` column, add `/// @db.Uuid` to the field, or override its
schema with `/// @customType(...)`.
