---
"prisma-effect-kysely": minor
---

feat: emit `XTable` (Kysely table) + bare `X` (Selectable SELECT row) per table

Each model now generates **two** schemas instead of one, following Kysely's own
`PersonTable` → `Person` naming convention:

- **`{Name}Table`** — the wrapper-laden struct (`columnType()`/`generated()`
  intact). It drives the Kysely `DB` interface, where its `ColumnType<>`/
  `Generated<>` brands give `.insertInto`/`.updateTable` their insert/update
  variance. Per Kysely's rule, this table type is never a query-result type.
- **`{Name}`** (bare) — the SELECT row, `Selectable({Name}Table)` with the
  wrappers stripped. This is the composable, value+type-merged schema that
  contracts, RPC outputs, and decode boundaries bind to. It is derived once by
  the generator, so consumers never re-wrap `Selectable(...)` themselves.

`export type {Name} = typeof {Name}.Type` (the SELECT row type). The `DB`
interface entry is `Schema.Schema.Type<typeof {Name}Table>` — referencing the
wrapper-laden table so Kysely query typing keeps working (gated by the
`kysely-values-type-inference` regression test).

**Why not `@effect/sql` `Model.Class`?** A type spike showed `Model.Class`
(which encodes insert/update variance in separate `.insert`/`.update` Effect
schemas) is incompatible with the Kysely `DB` interface: Kysely needs the
TS-level `ColumnType`/`Generated` wrappers on the table type, which `Model.Class`
abandons — `db.insertInto(...).values(...)` then demands generated columns. The
`Table` + bare-row split keeps both the Effect-schema and Kysely-query halves
working.

This resolves the table-vs-row name clash (bare `X` = row, `XTable` = table)
and eliminates per-consumer `Selectable(...)` repetition, with no `Model.Class`,
import aliases, namespace imports, or `*Schema` suffixes.

**Migration for consumers:** the bare `X` export flips from the wrapper-laden
table to the SELECT row. Replace `Selectable<X>` → `X`, `Selectable(X)` → `X`,
and `Insertable<X>`/`Updateable<X>` → `Insertable<typeof XTable>`/
`Updateable<typeof XTable>`. Join tables (no `XTable` emitted) keep
`Selectable<JoinTable>`.

Also: `domain-detector` replaces a `@ts-expect-error` with a
`'schemaLocation' in model` type guard; `JoinTableInfo[]` parameters are now
`readonly`.
