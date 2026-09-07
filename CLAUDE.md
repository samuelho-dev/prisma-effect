---
scope: project
updated: 2026-09-06
relates_to:
  - src/kysely/helpers.ts
  - src/effect/generator.ts
  - src/generator/orchestrator.ts
---

# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Overview

CLI and library emitting Effect Schema/Kysely types from Prisma 8 `contract.json`.

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

`src/generator/cli.ts` parses CLI arguments and delegates to the public
`generate` function in `src/generator/orchestrator.ts`.

- `src/prisma/contract.ts` — validates Prisma 8's JSON contract boundary
- `src/prisma/model.ts` — derives deterministic table, enum, and value-object models
- `src/effect/generator.ts` / `type.ts` / `enum.ts` — emit Effect 4 schemas
- `src/kysely/generator.ts` / `type.ts` — emit Kysely wrappers and the `DB` interface
- `src/utils/annotations.ts` — scans sibling `contract.prisma` custom type docs
- `src/utils/file-manager.ts` — formats and writes generated files

No Prisma package is used at runtime. Prisma 8 has no generator protocol or
implicit M2M tables; users emit `contract.json` before running this CLI.

## Output

Up to three files in the configured output directory:

- **enums.ts** — emitted only when enums exist; uses stored contract literals
- **types.ts** — branded IDs, value objects, table schemas, row schemas, and `DB`
- **index.ts** — always re-exports `types.ts`; re-exports `enums.ts` only when present

## Generated shape

```typescript
export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

export const Role = Schema.Literals(['ADMIN', 'USER']);
export type Role = typeof Role.Type;

export const UserTable = Schema.Struct({
  id: columnType(UserId, UserId, Schema.Never),
  email: Schema.String,
  role: Role,
  createdAt: generated(Schema.Date),
});

export const User = Selectable(UserTable);
export type User = typeof User.Type;

export interface DB {
  User: Schema.Schema.Type<typeof UserTable>;
}
```

Consumers use bare `User` as the SELECT row type and `Insertable<typeof UserTable>` /
`Updateable<typeof UserTable>` from `prisma-effect-kysely` for write shapes. Branded
IDs are imported directly. Enum values are plain strings (`"ADMIN"`), not TS enum
members (`Role.ADMIN`).

## Field behavior

- Non-primary-key storage defaults → `generated()`
- A storage-defaulted single-column PK → `columnType(Id, Schema.Never, Schema.Never)`
- Prisma-applied generators such as `uuid()` are insertable and immutable because they are not database defaults
- Optional → `Schema.NullOr(type)`
- Foreign keys → branded ID of the target model
- Composite primary-key columns fall through to their field types
- Explicit join models are ordinary tables; implicit join-table support is removed
- Output is sorted deterministically

## UUID detection

`pg/uuid@1` is authoritative. The contract codec controls UUID generation;
field-name inference is never used.

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
| Enum        | imported enum schema  | `Schema.Literals([...])` string literal union |

Arrays → `Schema.Array(t)`. Nullable → `Schema.NullOr(t)`.

## Type safety principles

- Contract JSON is validated with Effect Schema at the trust boundary
- Contract codecs and storage metadata drive all generated types
- The runtime `Selectable`/`Insertable`/`Updateable` helpers use `as unknown as`
  casts because dynamically rebuilt structs cannot preserve their shape statically;
  generated output contains no casts
- Strict TypeScript mode

## Package exports

| Entry         | Contents                                                                              |
| ------------- | ------------------------------------------------------------------------------------- |
| `.`           | `Selectable`, `Insertable`, `Updateable`, helpers                                     |
| `./generator` | Programmatic `generate` API                                                           |
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

- `bun run fixture:emit` refreshes the committed Prisma 8 contract fixture
- `bun run fixture:check` proves the committed contract is byte-identical to a fresh emit
- `bun run test:emit` generates from that fixture and type-checks the output
- `bun run test:integration` runs the pglite roundtrip
- The CLI reads `contract.json`; no `prisma generate` or generator block exists
- Generated headers include a timestamp and edit warning
- Direct exports only: `XTable`, `X = Selectable(XTable)`, and `type X`
- Effect targets `^4.0.0-beta`; inspect vendored Effect source for v4 APIs
- `@customType(...)` strings are emitted verbatim and legacy v3 patterns only warn
- Prisma 7 consumers remain on the 6.x release line
