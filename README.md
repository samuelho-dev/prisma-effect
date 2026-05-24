# prisma-effect-kysely

Prisma generator producing Effect Schema types with Kysely-compatible column metadata, branded IDs, and intelligent UUID detection.

## Install

This package's major version tracks the major version of its `effect` peer
dependency. Pick the line that matches your Effect version:

| Your Effect version | Install                             | npm dist-tag |
| ------------------- | ----------------------------------- | ------------ |
| Effect 3 (stable)   | `bun add prisma-effect-kysely`      | `latest`     |
| Effect 4 (beta)     | `bun add prisma-effect-kysely@next` | `next`       |

```bash
# Effect 3 (current stable line)
bun add prisma-effect-kysely

# Effect 4 beta — opt-in pre-release
bun add prisma-effect-kysely@next effect@beta
```

> **Effect 4 support is a pre-release.** It requires `effect@^4.0.0-beta` and is
> published under the `next` dist-tag, not `latest`. It is **tested against
> `effect@4.0.0-beta.70`**; later betas may introduce breaking Schema changes. A
> generator-output compile check (`bun run test:emit`) guards the emitted code
> against the installed Effect, but pin `effect` if you need stability during the
> beta. The `next` line will be promoted to `latest` when Effect 4 goes stable.
>
> **Pin the exact version — do not use `"*"` or `"latest"`.** A `"prisma-effect-kysely": "*"`
> (or any range) dependency resolves to the **stable** `5.x` line, NOT the
> pre-release, because npm/pnpm semver excludes prereleases from ranges. In a
> workspace, depend on `"6.0.0-next.x"` exactly (or add a `pnpm.overrides` /
> `resolutions` entry). Symptom of getting this wrong: the v3 `5.x` types resolve
> and consumers see cascading `Schema.Top` / `unknown` type errors.
>
> Effect 4 and Effect 3 are not interchangeable: the generated output uses
> Effect-4-only Schema APIs (`Schema.Date`, `Schema.String.check(Schema.isUUID())`,
> `Schema.encodeKeys`, `Schema.Enum`, …). Stay on the `latest` line if you are on
> Effect 3.

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
import { Schema } from 'effect';
import { columnType, generated, Selectable } from 'prisma-effect-kysely';

// Branded ID
export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

// Model schema
export const User = Schema.Struct({
  id: columnType(UserId, Schema.Never, Schema.Never),
  email: Schema.String,
  createdAt: generated(Schema.Date),
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

| Prisma      | Effect Schema                          |
| ----------- | -------------------------------------- |
| String      | `Schema.String`                        |
| Int / Float | `Schema.Number`                        |
| BigInt      | `Schema.BigInt`                        |
| Decimal     | `Schema.String`                        |
| Boolean     | `Schema.Boolean`                       |
| DateTime    | `Schema.Date`                          |
| Json        | recursive `JsonValue`                  |
| Bytes       | `Schema.Uint8Array`                    |
| Enum        | `Schema.Enum(...)`                     |
| UUID        | `Schema.String.check(Schema.isUUID())` |

Arrays → `Schema.Array(t)`. Nullable → `Schema.NullOr(t)`.

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
  /// @customType(Schema.String.check(Schema.isMinLength(3)))
  email String @unique
  /// @customType(Schema.Number.check(Schema.isGreaterThan(0)))
  age Int
}
```

Supported on all Prisma scalar types.

`@customType(...)` expressions are emitted **verbatim** — they must be valid
Effect 4 syntax. The generator does not rewrite them, but it **warns** at
`prisma generate` time when it detects Effect 3 syntax, pointing at the v4 form.
Effect 4 moved all filters under `.check(Schema.is*)` and made the variadic
combinators take an array:

| Effect 3 (`@customType`)              | Effect 4                                                               |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `Schema.Number.pipe(Schema.int())`    | `Schema.Number.pipe(Schema.check(Schema.isInt()))`                     |
| `Schema.positive()`                   | `Schema.check(Schema.isGreaterThan(0))`                                |
| `Schema.between(1, 5)`                | `Schema.check(Schema.isBetween({ minimum: 1, maximum: 5 }))`           |
| `Schema.minLength(3)`                 | `Schema.check(Schema.isMinLength(3))`                                  |
| `Schema.Union(A, B)`                  | `Schema.Union([A, B])`                                                 |
| `Schema.Literal('a', 'b')`            | `Schema.Literals(['a', 'b'])` (single `Schema.Literal('x')` unchanged) |
| `Schema.UUID` / `Schema.DateFromSelf` | `Schema.String.check(Schema.isUUID())` / `Schema.Date`                 |

## Implicit M2M Join Tables

Prisma columns `A`/`B` map to semantic snake_case fields via `Schema.encodeKeys`:

```typescript
export const ProductToProductTag = Schema.Struct({
  product_id: columnType(ProductId, ProductId, Schema.Never),
  product_tag_id: columnType(ProductTagId, ProductTagId, Schema.Never),
}).pipe(Schema.encodeKeys({ product_id: 'A', product_tag_id: 'B' }));
```

In the Kysely `DB` interface the join table is typed by its **encoded** shape
(`Schema.Codec.Encoded<typeof ProductToProductTag>` → `{ A, B }`), so you query
the physical columns directly: `db.selectFrom('_product_tags').where('_product_tags.A', '=', productId)`.
`Schema.decode` of a raw row maps `A`/`B` back to `product_id`/`product_tag_id`.

## Package Exports

| Entry                            | Contents                                           |
| -------------------------------- | -------------------------------------------------- |
| `prisma-effect-kysely`           | Type utilities + runtime helpers (default import)  |
| `prisma-effect-kysely/generator` | Prisma generator binary entry                      |
| `prisma-effect-kysely/kysely`    | `columnType`, `generated`, `JsonValue`, type utils |
| `prisma-effect-kysely/error`     | `NotFoundError`, `QueryError`, `DatabaseError`     |
| `prisma-effect-kysely/runtime`   | All runtime utilities                              |

## Development

```bash
bun install
bun run test
bun run typecheck
bun run build
bun run prepublishOnly  # lint + typecheck + test + build
```

## Releasing

Uses [Changesets](https://github.com/changesets/changesets). Two lines run in
parallel:

- **Stable (`latest`)** — from `main`. Normal flow:

  ```bash
  bun changeset           # add changeset
  git add .changeset/ && git commit -m "docs: changeset"
  git push                # CI opens a "Version Packages" PR; merging publishes
  ```

- **Pre-release (`next`)** — from the `release/next` branch, which carries
  `.changeset/pre.json` (changesets pre mode, tag `next`). Pushing there versions
  as `X.Y.Z-next.N` and `changeset publish` auto-routes those to the `next`
  dist-tag (never `latest`). This is where Effect 4 support lives until Effect 4
  is stable. When it stabilizes: run `changeset pre exit` on `release/next`,
  merge into `main`, and the next release promotes it to `latest`.

The CI workflow (`.github/workflows/release.yml`) triggers on both branches and
uses the changesets action's `version` + `publish` inputs; `changeset publish`
selects the dist-tag from pre mode. Requires the `NPM_TOKEN` repo secret. Do not
enter pre mode on `main` — it blocks stable releases until you exit.

## License

MIT
