# prisma-effect-kysely

CLI and library for generating Effect Schema types with Kysely-compatible column metadata from Prisma 8 contracts.

## Install

Version 7 targets Prisma 8 contracts and Effect 4. Prisma 7 projects stay on
the 6.x release line.

| Prisma | Effect | Install                                                                  |
| ------ | ------ | ------------------------------------------------------------------------ |
| 8      | 4      | `bun add --exact prisma-effect-kysely@next effect@4.0.0-beta.94`         |
| 7      | 4      | `bun add --exact prisma-effect-kysely@6.0.0-next.7 effect@4.0.0-beta.94` |

Version 7 has no runtime dependency on Prisma packages. Prisma is only needed
by your application toolchain to emit `contract.json`.

> **Pin exact prerelease versions.** `--exact` resolves the `next` tag once and
> records the resulting version instead of a mutable range.

## Setup

First emit Prisma 8's tool-facing contract, then run the generator CLI:

```bash
bunx prisma contract emit --config prisma.config.ts
bunx prisma-effect-kysely \
  --contract ./prisma/contract.json \
  --source ./prisma/contract.prisma \
  --output ./generated/effect
```

`--source` is optional. When omitted, the CLI scans `contract.prisma` beside
the contract when present. Use `--multi-domain` to emit one directory per
contract namespace.

## Output

Up to three files: `enums.ts` when enums exist, plus `types.ts` and `index.ts`.

`enums.ts` emits Effect-v4 finite-set schemas. No TypeScript enum is generated;
enum values are the stored literals from the contract.

```typescript
import { Schema } from 'effect';

export const Role = Schema.Literals(['ADMIN', 'GUEST', 'USER']);
export type Role = typeof Role.Type;
```

`types.ts` emits a wrapper-laden table schema for Kysely and a bare row schema
for application contracts and decode boundaries.

```typescript
import { Schema } from 'effect';
import { columnType, generated, Selectable } from 'prisma-effect-kysely';
import { Role } from './enums.js';

// Branded ID
export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

// Kysely table schema: keeps columnType/generated wrappers
export const UserTable = Schema.Struct({
  id: columnType(UserId, UserId, Schema.Never),
  email: Schema.String,
  role: Role,
  createdAt: generated(Schema.Date),
});

// Bare SELECT row schema
export const User = Selectable(UserTable);
export type User = typeof User.Type;

// Kysely DB interface
export interface DB {
  user: Schema.Schema.Type<typeof UserTable>;
}
```

`index.ts` re-exports with explicit `.js` extensions so generated code works in
NodeNext projects:

```typescript
export * from './enums.js';
export * from './types.js';
```

## Consumer Usage

```typescript
import type { Insertable, Updateable } from 'prisma-effect-kysely';
import { Kysely } from 'kysely';
import { UserTable, type DB, type User, type UserId } from './generated/index.js';

function getUser(id: UserId): Promise<User> { ... }

type UserInsert = Insertable<typeof UserTable>;
type UserUpdate = Updateable<typeof UserTable>;

const db = new Kysely<DB>({ ... });
```

Schema names are PascalCase regardless of Prisma model name (`session_preference` → `SessionPreference`).
Generated enum types are string literal unions; use `"ADMIN"` rather than
`Role.ADMIN`.

## Field Behavior

- Non-primary-key columns with database defaults (`now()` and literals) → `generated()`
- A single-column primary key with a database default → `columnType(Id, Schema.Never, Schema.Never)`
- A client-supplied or Prisma-applied primary key (for example `uuid()` or `cuid(2)`) → insertable, immutable
- Optional fields → `Schema.NullOr(type)`
- Foreign keys → branded ID type from the target model
- Explicit join models are emitted as ordinary tables; Prisma 8 has no implicit M2M tables

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
| Enum        | `Schema.Literals([...])`               |
| UUID        | `Schema.String.check(Schema.isUUID())` |

Arrays → `Schema.Array(t)`. Nullable → `Schema.NullOr(t)`.

## UUID Detection

A column is a UUID when the contract codec is `pg/uuid@1`. Prisma 8 emits this
for its native `Uuid` type. Names such as `userId` are never used to infer a
UUID, so text identifiers such as Stripe `acct_…` values remain strings.

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
Effect 4 syntax. The CLI does not rewrite them, but warns during generation
when it detects Effect 3 syntax and points at the v4 form.
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

## Relations

Foreign-key columns use the target model's branded ID. Explicit join models
are emitted like every other contract table. Implicit Prisma M2M join tables
are not supported because Prisma 8 contracts require explicit join models.

## Package Exports

| Entry                            | Contents                                           |
| -------------------------------- | -------------------------------------------------- |
| `prisma-effect-kysely`           | Type utilities + runtime helpers                   |
| `prisma-effect-kysely/generator` | Programmatic `generate` API                        |
| `prisma-effect-kysely/kysely`    | `columnType`, `generated`, `JsonValue`, type utils |
| `prisma-effect-kysely/error`     | `NotFoundError`, `QueryError`, `DatabaseError`     |
| `prisma-effect-kysely/runtime`   | All runtime utilities                              |

```typescript
import { generate } from 'prisma-effect-kysely/generator';

const { files } = await generate({
  contract: './prisma/contract.json',
  source: './prisma/contract.prisma', // optional
  output: './generated/effect',
  multiDomain: true, // optional
});
```

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

Keep `.changeset/` limited to active release state: `config.json`, `pre.json`
while the `next` branch is in pre mode, `README.md`, and any unconsumed
changeset files. Once a version commit has moved a changeset into
`CHANGELOG.md` and `pre.json`, remove the consumed markdown file.

## License

MIT
