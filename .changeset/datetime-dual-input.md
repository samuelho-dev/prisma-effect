---
"prisma-effect-kysely": minor
---

feat: DateTime columns now map to `DateFromInput` (dual-boundary Date schema)

`DateTime` columns previously mapped to `Schema.DateFromSelf`
(`Encoded = Date`), which broke RPC/HTTP wire decode where JSON-parsed
input is a string. Now maps to a new exported `DateFromInput` schema:

- **Type** = `Date` (runtime — unchanged)
- **Encoded** = `Date | string` (was `Date`)

Defined as `Schema.Union(Schema.DateFromSelf, Schema.Date)`, so decode
accepts native `Date` instances (Kysely DA layer — pg driver returns Date)
AND ISO strings (RPC/HTTP wire layer — JSON.parse output). One primitive
serves both consumer boundaries; consumers no longer need parallel
schemas or `Schema.extend` overrides for date columns.

**Why minor (not major)**: existing public API behavior is preserved.
`Selectable<T>` / `Insertable<T>` / `Updateable<T>` Type sides unchanged.
Decode accepts MORE inputs (Date AND string), not fewer. Encode picks
the first union member (`DateFromSelf`, identity) so Kysely-bound
encode still produces Date instances — existing call sites keep working.

**Why the change**: `DateFromSelf` optimized for the in-memory Kysely
boundary; `Schema.Date` optimizes for the JSON wire boundary. Modern
apps cross both with the same generated schemas. Picking either single
primitive forced consumers to patch around it at one boundary.
`DateFromInput` accepts both encoded shapes natively. Mirrors the
`JsonValue` dual-boundary discipline already in this package
(`Schema<JsonValue, JsonValue>` is wire-safe by construction).

**Migration**: no code changes for typical consumers. If you imported
`Schema.DateFromSelf` directly from generated `types.ts` in a way that
depended on the literal symbol, switch to `DateFromInput` imported from
`prisma-effect-kysely`.

**Internal**: consolidated duplicated `PRISMA_TO_EFFECT_SCHEMA` /
`PRISMA_SCALAR_MAP` constants. `src/effect/type.ts` now imports the
canonical map from `src/utils/type-mappings.ts`.
