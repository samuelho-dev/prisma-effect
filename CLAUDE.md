---
scope: project
updated: 2026-04-30
relates_to:
  - src/kysely/helpers.ts
  - src/effect/generator.ts
  - src/generator/orchestrator.ts
---

# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Overview

Prisma generator emitting Effect Schema types with Kysely-compatible column metadata, branded IDs, and UUID detection.

## Commands

Bun is the only package manager.

```bash
bun install
bun run build               # tsc -p tsconfig.lib.json
bun run test                # vitest run
bun run test src/__tests__/<file>.test.ts
bun run typecheck           # tsc --noEmit
bun run lint
bun run prepublishOnly      # lint + typecheck + test + build
```

## Architecture

Entry: `src/generator/index.ts` exposes the Prisma generator manifest and delegates to `GeneratorOrchestrator` (`src/generator/orchestrator.ts`), which validates output, runs generators in parallel, and logs progress.

Generators:

- `src/effect/generator.ts` — model schemas + branded IDs
- `src/effect/enum.ts` — Prisma enums → `Schema.Enum`
- `src/effect/join-table.ts` — implicit M2M join tables
- `src/kysely/generator.ts` — `DB` interface

Support: `src/utils/file-manager.ts` (FS), `src/utils/templates.ts` (Prettier formatting), `src/prisma/` (DMMF parsing, type utils, relation detection).

## Output

Three files in the configured output directory:

- **enums.ts** — `Schema.Enum` per Prisma enum (respects `@map`)
- **types.ts** — direct exports (no underscore prefix, no wrapper functions):
  - Branded ID schema + type per model
  - Model `Schema.Struct` + type alias
  - `DB` interface using `Schema.Schema.Type<typeof Model>` per table (preserves the `__select__/__insert__/__update__` brands Kysely needs; respects `@@map`)
- **index.ts** — re-exports

## Generated shape

```typescript
export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

export const User = Schema.Struct({
  id: columnType(UserId, Schema.Never, Schema.Never),
  email: Schema.String,
  createdAt: generated(Schema.Date),
});
export type User = typeof User;

export interface DB {
  User: Schema.Schema.Type<typeof User>;
}
```

Consumers use `Selectable<typeof User>` / `Insertable<typeof User>` / `Updateable<typeof User>` from `prisma-effect-kysely`. Branded IDs imported directly.

## Field behavior

- `@default` or `@updatedAt` → `generated()` (omitted from insert, optional in update)
- `@id` with `@default` → `columnType(type, Schema.Never, Schema.Never)` (read-only)
- Optional → `Schema.NullOr(type)` (optional on insert AND keeps `null` — explicit `null` is a valid insert value, matching Kysely)
- Foreign keys → branded ID of target model
- Relations excluded — only scalars + enums in schemas
- Models starting with `_` filtered out
- Output sorted alphabetically (deterministic)

## Implicit M2M join tables

Prisma stores `A`/`B` columns; we emit semantic snake_case fields on the struct, then map them to the DB columns with a struct-level `.pipe(Schema.encodeKeys({ <model_a>_id: "A", <model_b>_id: "B" }))`. FK columns are `columnType(Id, Id, Schema.Never)` — insertable (you supply both keys when linking) but read-only on update (composite-PK rows are inserted/deleted, not updated). Join tables get NO branded ID (composite key).

## UUID detection

`isUuidField()` in `src/prisma/type.ts`, priority order:

1. `field.nativeType[0] === 'Uuid'` (from `@db.Uuid`)
2. `field.documentation` includes `@db.Uuid`
3. Name regex: `id`, `*_id`, `*_uuid`, `uuid`

## Type mappings

| Prisma      | Effect                | Notes                                         |
| ----------- | --------------------- | --------------------------------------------- |
| String      | `Schema.String`       | UUID → `Schema.String.check(Schema.isUUID())` |
| Int / Float | `Schema.Number`       |                                               |
| BigInt      | `Schema.BigInt`       | native bigint encode (no string coercion)     |
| Decimal     | `Schema.String`       | precision                                     |
| Boolean     | `Schema.Boolean`      |                                               |
| DateTime    | `Schema.Date`         | native Date both sides (Effect 4)             |
| Json        | recursive `JsonValue` | from `prisma-effect-kysely`                   |
| Bytes       | `Schema.Uint8Array`   |                                               |
| Enum        | imported enum schema  | `Schema.Enum(...)`                            |

Arrays → `Schema.Array(t)`. Nullable → `Schema.NullOr(t)`.

## Type safety principles

- Zero coercion in DMMF→type mapping — exact DMMF types, no string parsing of types
- The runtime `Selectable`/`Insertable`/`Updateable` helpers use `as unknown as` casts (load-bearing: a dynamically-rebuilt `Schema.Struct` has no statically-checkable shape — see the note above the Schema Functions section in `helpers.ts`); generated OUTPUT contains no casts
- UUID detection from DMMF, not string parsing
- Field defaults validated via DMMF structure
- Strict mode (tsconfig)

## Package exports

| Entry         | Contents                                                                              |
| ------------- | ------------------------------------------------------------------------------------- |
| `.`           | `Selectable`, `Insertable`, `Updateable`, helpers                                     |
| `./generator` | Prisma generator binary entry                                                         |
| `./kysely`    | `columnType`, `generated`, `JsonValue`, `Selectable`/`Insertable`/`Updateable`, types |
| `./error`     | `NotFoundError`, `QueryError`, `DatabaseError`                                        |
| `./runtime`   | All runtime utilities                                                                 |

## Testing patterns

Three-tier canonical pattern:

1. Pure schema decode (`Schema.decodeUnknownSync`) for type-level coverage.
2. **pglite + `kysely-pglite-dialect`** for data-layer integration tests —
   default tier. See `src/__tests__/helpers/pglite-db.ts` for the
   `Layer.effect` boilerplate and `src/__tests__/integration/` for the
   roundtrip example. Run with `bun run test:integration`.
3. Testcontainers Postgres only when pglite can't host the feature
   (extensions, multi-process, etc.).

Errors raised from data-layer code should be one of `NotFoundError`,
`QueryError`, `DatabaseError` from `prisma-effect-kysely/error` so callers
can `Effect.catchTag` cleanly.

## Working in this repo

- Run `bun run test` (350 unit + DMMF tests) and `bun run test:integration` (pglite roundtrip) to baseline before changes
- Generator must be rebuilt before `prisma generate` picks up changes
- Test fixtures: `src/__tests__/fixtures/test.prisma`
- Generated headers include timestamp + edit warning
- Direct exports only — generated code exports schemas directly (`export const User = Schema.Struct(...)`); never reintroduce underscore prefixes or wrapper functions in the output
- Run `bun run test:emit` after touching any generator emit string — it generates against the fixture and type-checks the emitted code against the installed Effect (unit tests only string-match, they don't compile output)
- `effect` targets **4.x (beta)**, peer dep `^4.0.0-beta`, dev pin `4.0.0-beta.70`. `src/kysely/helpers.ts` uses the public `Schema.Struct.fields` API (not `effect/SchemaAST` internals — those were reworked in v4). Key v4 names: `Schema.Codec` (was `Schema.Schema`), `Schema.Top` (was `Schema.Schema.All`), `Schema.revealCodec` (was `asSchema`), `.annotate()` (was `.annotations()`), `Schema.Date` (was `DateFromSelf`), `Schema.Union([...])` (was variadic), `Schema.encodeKeys` (was `propertySignature(...).pipe(fromKey(...))`).
- `@customType(...)` strings are emitted verbatim and must be valid Effect 4 syntax. `detectLegacyEffectV3Syntax()` in `src/utils/annotations.ts` warns (never rewrites) on known v3 patterns at generate time. v3 filters → `.check(Schema.is*)`; variadic `Union`/`Tuple`/multi-`Literal` → array form.
- Consumers must pin the exact `6.0.0-next.x` version — a `"*"` range resolves to the stable `5.x` line (npm/pnpm exclude prereleases from ranges), which silently pulls the v3 types.
