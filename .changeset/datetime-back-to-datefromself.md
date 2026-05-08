---
"prisma-effect-kysely": minor
---

fix: DateTime maps back to `Schema.DateFromSelf` (Date ↔ Date) — Prisma+Kysely canonical

Reverts the 5.6.0 change that mapped `DateTime` to `DateFromInput` (a
`Schema.Union(DateFromSelf, Date)` with `Encoded = Date | string`).

**Why revert**: the dual-input Union pushed the boundary problem onto
DA-layer consumers. Kysely's pg driver returns native `Date` instances,
but `Selectable<X>.created_at` typed as `Date | string` forced every DA
mapper that copies `result.created_at` into a contract type to either
narrow manually (no cast-free path) or wrap the read in
`Schema.decode(Selectable(X))` (heavy refactor across hundreds of sites).

**Why DateFromSelf is correct**:

- **Prisma docs**: *"Prisma Client returns all DateTime values as native
  JavaScript Date objects. ... DateTime values must be passed as Date
  objects, not strings, to avoid runtime errors."*
- **Kysely docs**: idiomatic DateTime column is
  `created_at: ColumnType<Date, string | undefined, never>` — SELECT
  yields `Date`. *"TypeScript is a compile-time concept and cannot
  alter runtime JavaScript types. If your TypeScript definition for a
  column differs from the database's actual return type, the runtime
  type will not change automatically."*
- **Effect Schema docs (Doc 10944)**: *"schemas should be defined such
  that encode + decode return the original value"* — one Type, one
  Encoded per schema. The dual-boundary problem (DA Date ↔ Date vs
  RPC string ↔ Date) is solved by **two schemas** (one per boundary),
  not one Union. Doc 4312 (`@effect/sql/Model.Class`) shows this
  canonical variant pattern (`select`/`insert`/`update` vs
  `json`/`jsonCreate`/`jsonUpdate`).

**For RPC/HTTP wire boundaries**: define a contract-layer schema that
overrides date columns with `Schema.Date` (Encoded = string) before the
RPC framework calls `Schema.decode`. This is the same pattern as
`@effect/sql`'s `json` variants — one schema per boundary.

**`DateFromInput` is still exported** from the package for consumers that
specifically want the dual-input behavior at a single call site. The
codegen just no longer auto-emits it for every DateTime column.

**The Schema.Schema.Encoded fix in 5.7.0 stays** — that's still correct
for join-table column exposure (`_product_tags.A`/`B`).

**Migration**: most consumers benefit immediately (DA mappers stop
seeing `Date | string`). For RPC contracts that previously didn't have
a Date override (because they relied on `DateFromInput`), re-add a
`Schema.extend` with `Schema.Date` overrides for date columns to keep
wire decode working.
