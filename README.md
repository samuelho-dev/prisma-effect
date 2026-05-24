# prisma-effect-kysely

Prisma generator producing Effect Schema types with Kysely-compatible column metadata, branded IDs, and intelligent UUID detection.

## Install

```bash
bun add prisma-effect-kysely
```

## Setup

```prisma
generator effect_schemas {
  provider = "prisma-effect-kysely"
  output   = "./generated/effect"
}
```

```bash
npx prisma generate
```

## Output

Three files: `enums.ts`, `types.ts`, `index.ts`.

```typescript
import { Schema } from "effect";
import { columnType, DateFromInput, generated, Selectable } from "prisma-effect-kysely";

// Branded ID
export const UserId = Schema.UUID.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

// Model schema
export const User = Schema.Struct({
  id: columnType(Schema.UUID, Schema.Never, Schema.Never),
  email: Schema.String,
  createdAt: generated(DateFromInput),
});
export type User = typeof User;

// Kysely DB interface
export interface DB {
  User: Selectable<User>;
}
```

## Consumer Usage

```typescript
import { Selectable, Insertable, Updateable } from "prisma-effect-kysely";
import { User, UserId, DB } from "./generated";

function getUser(id: UserId): Promise<User> { ... }

type UserSelect = Selectable<typeof User>;
type UserInsert = Insertable<typeof User>;
type UserUpdate = Updateable<typeof User>;

const db = new Kysely<DB>({ ... });
```

Schema names are PascalCase regardless of Prisma model name (`session_preference` → `SessionPreference`).

## Field Behavior

- `@default` / `@updatedAt` → `generated()` (omitted from insert, optional in update)
- `@id` with `@default` → `columnType(type, Never, Never)` (read-only)
- Optional fields → `Schema.NullOr(type)`
- Foreign keys → branded ID type from target model

## Type Mappings

| Prisma      | Effect Schema         |
| ----------- | --------------------- |
| String      | `Schema.String`       |
| Int / Float | `Schema.Number`       |
| BigInt      | `Schema.BigInt`       |
| Decimal     | `Schema.String`       |
| Boolean     | `Schema.Boolean`      |
| DateTime    | `DateFromInput`       |
| Json        | `JsonValue`           |
| Bytes       | `Schema.Uint8Array`   |
| Enum        | `Schema.Literal(...)` |
| UUID        | `Schema.UUID`         |

Arrays → `Schema.Array(t)`. Nullable → `Schema.NullOr(t)`. `DateFromInput` accepts `Date | string` on the encoded side; `JsonValue` is `Schema<JsonValue, JsonValue>`. Both are wire-safe (`JSON.parse` output decodes cleanly).

## UUID Detection

A column is treated as a UUID only when Prisma's type information says so:

1. Native type: `@db.Uuid`
2. Documentation: `@db.Uuid` in the field comment (`/// @db.Uuid`)

UUID is a column type, not a naming convention — a bare `String` maps to `text`,
so `@db.Uuid` always captures genuine UUID columns. Field-name inference
(`*_id`, `*_uuid`, …) is intentionally NOT used: external identifiers such as
Stripe IDs (`acct_…`, `cus_…`) are text but end in `_id`, and inferring UUID
from the name produced false `Schema.isUUID()` checks that crashed at decode
time. Mark a non-`@db.Uuid` column as a UUID explicitly via `/// @db.Uuid`, or
override its schema entirely with `@customType(...)`.

## Custom Type Overrides

Use `@customType` in field docs to override Effect Schema:

```prisma
model User {
  /// @customType(Schema.String.pipe(Schema.email()))
  email String @unique
  /// @customType(Schema.Number.pipe(Schema.positive()))
  age Int
}
```

Supported on all Prisma scalar types.

## Implicit M2M Join Tables

Prisma columns `A`/`B` map to semantic snake_case fields via `Schema.fromKey`:

```typescript
export const ProductToProductTag = Schema.Struct({
  product_id: Schema.propertySignature(
    columnType(Schema.UUID, Schema.Never, Schema.Never)
  ).pipe(Schema.fromKey("A")),
  product_tag_id: Schema.propertySignature(
    columnType(Schema.UUID, Schema.Never, Schema.Never)
  ).pipe(Schema.fromKey("B")),
});
```

## Package Exports

| Entry                            | Contents                                              |
| -------------------------------- | ----------------------------------------------------- |
| `prisma-effect-kysely`           | Type utilities + runtime helpers (default import)     |
| `prisma-effect-kysely/generator` | Prisma generator binary entry                         |
| `prisma-effect-kysely/kysely`    | `getSchemas`, `columnType`, `generated`, type utils   |
| `prisma-effect-kysely/error`     | `NotFoundError`, `QueryError`, `QueryParseError`, ... |
| `prisma-effect-kysely/runtime`   | All runtime utilities                                 |

## Development

```bash
bun install
bun run test
bun run typecheck
bun run build
bun run prepublishOnly  # lint + typecheck + test + build
```

## Releasing

Uses [Changesets](https://github.com/changesets/changesets).

```bash
bun changeset           # add changeset
git add .changeset/ && git commit -m "docs: changeset"
git push
```

CI opens a "Version Packages" PR. Merging it publishes to npm, tags, and creates a GitHub release. Requires `NPM_TOKEN` repo secret.

## License

MIT
