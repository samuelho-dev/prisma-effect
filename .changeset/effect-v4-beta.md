---
'prisma-effect-kysely': major
---

Migrate to Effect 4 (beta).

**Breaking:** the `effect` peer dependency is now `^4.0.0-beta` (Effect 3 is no longer supported). Consumers must upgrade to `effect@^4.0.0-beta`.

What changed:

- **Runtime helpers** (`Selectable` / `Insertable` / `Updateable`) were reimplemented on Effect 4's public `Schema.Struct.fields` API instead of the removed `effect/SchemaAST` internals (Effect 4 reworked `SchemaAST`: `PropertySignature` is now 2-arg, structs are `Objects` nodes, `isTypeLiteral` is gone). Public signatures and the derived `Selectable<T>`/`Insertable<T>`/`Updateable<T>` types are unchanged.
- **Generated output** now emits Effect-4 schema source:
  - `DateTime` → `Schema.Date` (still native `Date` on both sides — Effect 4's `Schema.Date` no longer coerces to string, replacing Effect 3's `Schema.DateFromSelf`).
  - UUID fields → `Schema.String.check(Schema.isUUID())` (Effect 4 removed `Schema.UUID`).
  - BigInt → `Schema.BigInt` (native bigint encoding; replaces `Schema.BigIntFromSelf`).
  - Enums → `Schema.Enum(...)`; the internal native TS enum is suffixed with `Enum` when its name collides with the PascalCase const (Effect 4 forbids enum/const identifier merging).
  - `@map` / implicit-M:N `A`/`B` column renames → struct-level `Schema.encodeKeys({ tsName: "db_name" })` (Effect 4 removed `Schema.propertySignature(...).pipe(Schema.fromKey(...))`).
- Scaffolded contract libraries now declare `effect: ^4.0.0-beta` as their peer dependency.
- Added a generator-output compile guard (`bun run test:emit`) that type-checks the emitted code against the installed Effect version.
