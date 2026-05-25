# Changelog

## 5.10.0

### Minor Changes

- be1a22e: fix: only treat `@db.Uuid` columns as UUIDs — drop field-name inference

  `isUuidField` previously had a third detection tier that inferred UUID from the
  field _name_ (`/^id$/`, `/_id$/`, `/^.*_uuid$/`, `/^uuid$/`) for any `String`
  column. UUID is a column _type_, not a naming convention, so this was a
  false-positive generator: every external-system identifier stored as text — most
  notably Stripe IDs (`acct_…`, `cus_…`, `sub_…`, `price_…`, `txn_…`, `ch_…`,
  `evt_…`), plus slugs and provider/session references — ends in `_id` without
  being a UUID. The generator emitted `Schema.String.check(Schema.isUUID())` for
  those columns, and decoding real data threw `Die`/`ParseError`
  ("Expected a UUID, got \"acct\_…\"") at runtime.

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

## 5.9.0

### Minor Changes

- 5f07c8f: fix: regular tables in DB interface use `Schema.Schema.Type`, join tables use `Schema.Schema.Encoded`

  5.7.0 flipped the DB interface to `Schema.Schema.Encoded` for **all** tables to fix the join-table column-name bug (`_product_tags.product_id` was decoded-name; SQL needs `A`). That was the right fix for join tables but accidentally **stripped branded IDs** for regular tables — `Schema.Schema.Encoded<typeof X>` strips `Schema.brand(...)` because brands live on the Type side.

  Concrete consequence: every Kysely consumer queried `result.seller_id: string` instead of `result.seller_id: string & Brand<"SellerId">`. Branded ID type safety silently disabled across the entire monorepo.

  Fix: the two table categories need different treatment.
  - **Regular tables**: `Schema.Schema.Type<typeof X>` — preserves branded IDs (`string & Brand<"SellerId">`) and the `ColumnType<S, I, U>` `__select__`/`__insert__`/`__update__` phantoms. Type === Encoded for column names anyway because regular tables don't use `Schema.fromKey`.
  - **Join tables**: `Schema.Schema.Encoded<typeof X>` — only join tables use `Schema.fromKey('A')` to remap DB columns `A`/`B` to semantic names. Type would expose the decoded names that Kysely passes to SQL verbatim → "column does not exist". Encoded preserves real column names.

  Effectively: pick the side that matches the _intended consumer view_. For non-`fromKey` tables, that's the Type side (richer info, brand info preserved). For `fromKey` tables, that's the Encoded side (matches DB).

  **Migration**: regular-table consumers regain `Brand<...>` IDs immediately. Join-table consumers (`_product_tags.A`/`B` queries) unchanged from 5.7.0 — those still expose real DB column names.

## 5.8.0

### Minor Changes

- ac42853: fix: DateTime maps back to `Schema.DateFromSelf` (Date ↔ Date) — Prisma+Kysely canonical

  Reverts the 5.6.0 change that mapped `DateTime` to `DateFromInput` (a
  `Schema.Union(DateFromSelf, Date)` with `Encoded = Date | string`).

  **Why revert**: the dual-input Union pushed the boundary problem onto
  DA-layer consumers. Kysely's pg driver returns native `Date` instances,
  but `Selectable<X>.created_at` typed as `Date | string` forced every DA
  mapper that copies `result.created_at` into a contract type to either
  narrow manually (no cast-free path) or wrap the read in
  `Schema.decode(Selectable(X))` (heavy refactor across hundreds of sites).

  **Why DateFromSelf is correct**:
  - **Prisma docs**: _"Prisma Client returns all DateTime values as native
    JavaScript Date objects. ... DateTime values must be passed as Date
    objects, not strings, to avoid runtime errors."_
  - **Kysely docs**: idiomatic DateTime column is
    `created_at: ColumnType<Date, string | undefined, never>` — SELECT
    yields `Date`. _"TypeScript is a compile-time concept and cannot
    alter runtime JavaScript types. If your TypeScript definition for a
    column differs from the database's actual return type, the runtime
    type will not change automatically."_
  - **Effect Schema docs (Doc 10944)**: _"schemas should be defined such
    that encode + decode return the original value"_ — one Type, one
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

## 5.7.0

### Minor Changes

- d272b99: fix: DB interface uses `Schema.Schema.Encoded` so Kysely sees real DB columns

  The generated `interface DB` previously emitted
  `<table>: Schema.Schema.Type<typeof X>`. For tables using `Schema.fromKey`
  (Prisma implicit M:N join tables, where TS field `product_id` maps to DB
  column `A`), the Type side has the **decoded** names. Kysely uses the TS
  interface as the SQL contract — it does not run the Effect schema decoder.
  So queries like `db.selectFrom('_product_tags').where('product_id', ...)`
  generated `WHERE product_id = ...` and Postgres rejected with
  `column _product_tags.product_id does not exist`.

  Fix: emit `Schema.Schema.Encoded<typeof X>` for every DB interface entry.
  Encoded is the on-the-wire / on-disk shape that matches Postgres. For
  regular tables `Type === Encoded`, no behavior change. For join tables,
  Kysely now sees `A`/`B` and emits valid SQL. Application code that wants
  the semantic field names runs the row through `Schema.decode(X)`.

  `ColumnType<S, I, U>` brand preserves `__select__`/`__insert__`/`__update__`
  phantoms on both sides, so `Insertable<X>`/`Updateable<X>` inference is
  unchanged.

  Adds `db-interface-sql-contract.test.ts` with three regression checks:
  1. String-grep — every DB entry uses Encoded, none use Type.
  2. Encoded-side preserves real Postgres column names for implicit M:N.
  3. Kysely SQL compile — emitted SQL references the real `"A"` column,
     not the `product_id` decoded name. This catches the original bug
     structurally without needing a live database.

  **Migration**: most consumers need no changes. If a consumer overrode
  the generated DB interface entry to expose `A`/`B` directly (workaround
  for this bug), the override can now be removed and the generator will
  do the right thing.

## 5.6.0

### Minor Changes

- bf7d87c: feat: DateTime columns now map to `DateFromInput` (dual-boundary Date schema)

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

## 5.5.0

### Minor Changes

- 52ccb28: Update all dependencies to latest versions and condense README/CLAUDE docs.

  Major bumps:
  - `typescript`: 5.9.3 → 6.0.3
  - `eslint`, `@eslint/js`: 9.x → 10.x
  - `@effect/vitest`: 0.27.0 → 0.29.0
  - `@changesets/changelog-github`: 0.5.x → 0.6.0

  Minor/patch bumps:
  - `@prisma/generator-helper`, `@prisma/internals`, `prisma`: 7.2.0 → 7.8.0
  - `prettier`: 3.7.4 → 3.8.3
  - `@changesets/cli`: 2.29.8 → 2.31.0
  - `@types/node`: 25.0.3 → 25.6.0
  - `@typescript-eslint/*`, `typescript-eslint`: 8.50.0 → 8.59.1
  - `@vitest/coverage-v8`, `vitest`: 4.0.16 → 4.1.5
  - `@vitest/eslint-plugin`: 1.5.4 → 1.6.16
  - `effect`: 3.19.14 → 3.21.2
  - `kysely`: 0.28.9 → 0.28.16
  - `lint-staged`: 16.2.7 → 16.4.0

## 5.4.0

### Minor Changes

- e1a7cbc: feat: use branded ID types in implicit M:N join table schemas

  Join table schemas now reference branded ID types (e.g., `ProductId`, `SellerId`) instead of raw `Schema.UUID`/`Schema.String`/`Schema.Number`. This means Kysely queries on implicit many-to-many join tables return properly branded types, eliminating the need for manual `Schema.decodeSync` workarounds at query sites.

  Before:

  ```typescript
  columnType(Schema.UUID, Schema.Never, Schema.Never);
  ```

  After:

  ```typescript
  columnType(ProductId, Schema.Never, Schema.Never);
  ```

  The branded ID schemas are guaranteed to exist in the generated output because they are emitted during model schema generation, which runs before join table generation.

## 5.3.5

### Patch Changes

- 167f816: fix: wrap Json fields with columnType to prevent Kysely TS2589

  Kysely's built-in `InsertType<T>` and `UpdateType<T>` are distributive conditional
  types that recursively expand `JsonValue` unions, causing TS2589 on `.values()` and
  `.set()` calls for tables with Json fields.

  By wrapping Json fields with `columnType(JsonValue, JsonValue, JsonValue)` in the
  generated output, Kysely's `InsertType` takes the ColumnType fast path (extracts via
  `infer`) instead of distributing over the recursive union.

## 5.3.4

### Patch Changes

- 8a01259: fix: use non-distributive conditional types to prevent TS2589 on JsonValue fields

  Replace distributive conditional types with non-distributive `[T] extends [...]` pattern
  in ExtractInsertType, ExtractUpdateType, StripGeneratedWrapper, and StripColumnTypeWrapper.
  This prevents TypeScript from distributing over recursive JsonValue unions (which triggers
  TS2589) while correctly unwrapping Generated<T> and ColumnType<S,I,U> types.

## 5.3.3

### Patch Changes

- Fix TS2589 "Type instantiation is excessively deep" for schemas with JsonValue fields

  Added short-circuit guards in `ExtractInsertType`, `ExtractUpdateType`, and `StripKyselyWrapper` type utilities to avoid expanding the recursive `JsonValue` type before evaluating conditional type checks. This fixes the TS2589 error when using `Selectable<T>`, `Insertable<T>`, or `Updateable<T>` on schemas containing `JsonValue | null` fields (e.g., Prisma `Json?` columns).

## 5.3.2

### Patch Changes

- ded3278: Fix TS2589 "Type instantiation is excessively deep" when using Insertable/Updateable with Kysely's .values() and .set()

  Replace recursive `DeepMutable<T>` from `effect/Types` with shallow `-readonly` mapped types
  in `CustomInsertable<T>` and `CustomUpdateable<T>`. `DeepMutable` recursively visits every
  nested property, which combined with Kysely's per-column `ValueExpression` type checking
  exceeds TypeScript's ~50-level depth limit on schemas with 20+ fields.

  Runtime array mutability is unaffected — `Schema.mutable()` already handles this in the
  `Insertable()` and `Updateable()` functions.

## 5.3.1

### Patch Changes

- 25b7d19: Fix Int/BigInt primary keys generating `Schema.String` instead of correct type

  Models with `Int @id` (e.g. autoincrement integer PKs) incorrectly generated
  `Schema.String.pipe(Schema.brand("TodoId"))`. Now correctly generates
  `Schema.Int.pipe(Schema.brand("TodoId"))` for Int PKs and
  `Schema.BigIntFromSelf.pipe(Schema.brand("CounterId"))` for BigInt PKs.

  UUID and String ID fields are unchanged.

  Closes #16. Related: #17.

## 5.3.0

### Minor Changes

- 6e4a65a: Add JsonValue schema type for Prisma Json fields
  - Add recursive `JsonValue` type and Effect Schema export to replace `Schema.Unknown` for Prisma `Json` fields
  - Fix `isNullType` to check literal value directly instead of missing annotation, making nullable fields correctly optional on insert
  - Update generator to emit `JsonValue` instead of `Schema.Unknown` and include it in the import line

  This prevents `Schema.NullOr(Schema.Unknown)` from collapsing to `unknown`, which caused the TS language server to hit depth limits resolving `Selectable<T>` types.

## 5.2.0

### Minor Changes

- Remove Selectable wrapper from generated DB interface to preserve Kysely phantom properties

  The DB interface now uses `Schema.Schema.Type<typeof Model>` instead of `Selectable<Model>`, which preserves the `__select__`, `__insert__`, and `__update__` phantom properties. This allows Kysely's type inference to correctly:
  - Exclude fields with `never` insert type (e.g., auto-generated IDs via `columnType`)
  - Make `Generated<T>` fields optional on insert
  - Eliminate the need for `as never` casts on `.values()` calls

## 5.1.1

### Patch Changes

- f002cc2: fix: Use **update** property for type extraction instead of VariantMarker

  The Updateable<T> and Insertable<T> types now use the **update** and **insert**
  phantom properties for type extraction instead of the VariantMarker interface
  with unique symbols.

  This fixes an issue where the type extraction would fail during cross-compilation
  when TypeScript compiles source files across module boundaries. The unique symbol
  approach caused type matching failures because each compilation context could
  create different symbol references.

  The new approach using **update** and **insert** properties is more reliable
  as these are standard object properties that TypeScript matches structurally.

## 5.1.0

### Minor Changes

- 50da9a3: fix(Insertable): Make @default and nullable fields optional instead of excluded

  **Breaking Change in Behavior (but type-compatible):**
  - Fields with `@default` in Prisma schema are now **optional on insert** instead of completely excluded
  - Fields with nullable types (`Schema.NullOr()`) are now **optional on insert** matching Kysely's behavior

  **Changes:**
  1. `Generated<T>` now uses `VariantMarker<T | undefined, T>` instead of `VariantMarker<never, T>`
     - This makes `@default` fields optional rather than impossible to provide
     - You can still omit them (database uses default) or provide a value
  2. `IsOptionalInsert<T>` now checks for both `null` and `undefined` in the insert type
     - Matches Kysely's `IfNullable` behavior: `undefined extends T ? K : null extends T ? K : never`
     - Nullable fields (`string | null`) are now optional on insert since omitting = NULL in database
  3. `CustomInsertable<T>` type updated to properly split required vs optional fields
     - Required: fields where insert type doesn't include null or undefined
     - Optional: fields where insert type includes null or undefined (with `?` modifier)

  **Example:**

  ```typescript
  // Before: status was excluded from Insertable<Product>
  // After: status is optional in Insertable<Product>
  const product: Insertable<Product> = {
    name: 'My Product',
    price: 100,
    // status?: PRODUCT_STATUS - optional, defaults to DRAFT
    // thumbnail?: string | null - optional, defaults to NULL
  };
  ```

## 5.0.1

### Patch Changes

- 6859405: Move `@prisma/generator-helper` from `dependencies` to `devDependencies`.

  ### Why

  The `@prisma/generator-helper` package uses Node.js internals (`node:child_process`, `node:readline`) that are only needed by the generator code, not by runtime helpers.

  ### Impact
  - **Generator code**: Still works - has access to `devDependencies` during `prisma generate`
  - **Runtime helpers** (`columnType`, `generated`, `Selectable`, `Insertable`, `Updateable`): No changes - they're pure TypeScript/Effect-TS and don't depend on `@prisma/generator-helper`
  - **Consumers**: Cleaner install when importing from `./kysely` or `./runtime` entry points - won't install unnecessary Node.js dependencies

  ### Technical Details

  Most files only use type-only imports (`import type { DMMF } from '@prisma/generator-helper'`), which don't load the package at runtime. Only `src/generator/index.ts` uses the actual `generatorHandler` function, which is only invoked during `prisma generate`.

## 5.0.0

### Major Changes

- c3783df: ## v5.0 - Direct Exports API

  This is a **breaking change** that simplifies the generated code structure and improves the developer experience.

  ### Breaking Changes

  **Generated Code Structure**:
  - Schemas are now exported directly: `export const User = Schema.Struct({...})`
  - Branded ID types are exported directly: `export const UserId = Schema.UUID.pipe(Schema.brand("UserId"))`
  - DB interface uses `Selectable<Model>` pattern: `User: Selectable<User>`
  - No more `_Model` underscore prefix or `getSchemas()` wrapper in generated code

  **Consumer API Changes**:
  - Import branded IDs directly: `import { UserId } from "./generated"`
  - Use type utilities for other types: `Selectable<typeof User>`, `Insertable<typeof User>`, `Updateable<typeof User>`
  - The `Id<typeof User>` utility is no longer needed - import `UserId` directly

  ### Migration Guide

  Before (v4.x):

  ```typescript
  import { Selectable, Insertable, Updateable, Id } from 'prisma-effect-kysely';
  import { User, DB } from './generated';

  type UserId = Id<typeof User>;
  type UserSelect = Selectable<typeof User>;
  ```

  After (v5.0):

  ```typescript
  import { Selectable, Insertable, Updateable } from 'prisma-effect-kysely';
  import { User, UserId, DB } from './generated';

  // UserId is now imported directly
  type UserSelect = Selectable<typeof User>;
  ```

  ### Improvements
  - Simpler generated code structure
  - Branded ID types are first-class exports
  - Better alignment with Effect Schema patterns
  - DB interface uses `Selectable<Model>` for clearer intent
  - Join tables use semantic snake_case field names with `Schema.fromKey` mapping

## 4.6.0

### Minor Changes

- fix: Use mapped type pattern to survive TypeScript declaration emit

  Previously, the `Generated<T>` type used static properties that TypeScript would inline/simplify during declaration emit (.d.ts generation). This caused the brand to be lost when consumers imported the types, making `CustomInsertable` unable to properly filter out generated fields.

  This release adopts Effect's proven `Brand<K>` pattern using mapped types:

  ```typescript
  // Effect's Brand pattern - mapped types cannot be simplified
  interface Brand<K> {
    readonly [BrandTypeId]: { readonly [k in K]: K };
  }

  // Our new VariantMarker pattern
  interface VariantMarker<I, U> {
    readonly [VariantTypeId]: {
      readonly [K in 'insert' | 'update']: K extends 'insert' ? I : U;
    };
  }
  ```

  Key changes:
  - Added `VariantMarker<I, U>` interface with mapped type that survives declaration emit
  - Updated `Generated<T>` to use `VariantMarker<never, T>`
  - Updated `ColumnType<S, I, U>` to use `VariantMarker<I, U>`
  - Added `GeneratedSchema<S>` named interface for `generated()` return type (named interfaces are preserved)
  - Updated type extractors to use `VariantMarker` for reliable type inference

  This is a **breaking change** for internal type structure but **not breaking** for consumers:
  - `Insertable<T>`, `Selectable<T>`, `Updateable<T>` work identically
  - Generated types must be regenerated after upgrading

## 4.5.4

### Patch Changes

- 2d2a0e9: Fix: properly brand `generated()` return type for type-level Insertable filtering

  The `generated()` function was returning `Schema<SType, ...>` instead of `Schema<Generated<SType>, ...>`, which meant the Generated brand was not present at the type level.

  Also fixed `Generated<T>` type to use `__insert__: never` (instead of `T | undefined`) to match the runtime behavior where `Insertable()` completely filters out generated fields rather than making them optional.

  This fixes type errors in consuming projects where `Insertable<T>` was including all fields instead of excluding generated ones.

## 4.5.3

### Patch Changes

- Fix FK branding to only apply when FK references target's ID field

  Foreign key fields are now only given branded ID schemas (e.g., `UserIdSchema`) when the FK actually references the target model's ID field. FKs that reference other unique fields (like enum fields) will use the appropriate field type instead of an incorrect branded ID schema.

  This fixes the issue where `product.market` (which references `market.code`, an enum field) was incorrectly typed as `MarketIdSchema` (a branded UUID) instead of `MarketTypeSchema` (the enum type).

## 4.4.1

### Patch Changes

- Fix: use getSchemas() for join tables instead of individual Selectable/Insertable/Updateable function calls

  Join tables were generating code that called Selectable(), Insertable(), Updateable() as functions but these were imported as types only, causing TypeScript compilation errors. Now join tables use getSchemas() like regular models.

## 4.4.0

### Minor Changes

- Fix type constraints for better TypeScript compatibility
  - Changed `Schemas` and `SchemasWithId` interfaces to use `Schema.Schema.All` constraint instead of `Schema<unknown, unknown, unknown>` to fix variance issues with struct schemas
  - Updated `getSchemas()` function overloads to use `Schema.Schema.All` constraint
  - Removed type assertions from `columnType()` and `generated()` functions - now return base types
  - Updated generator to use type annotation pattern instead of type assertion for better declaration emit

## 4.2.9

### Patch Changes

- Fix type stripping for branded ColumnType and Generated types

  The StripFieldBranding type utility now uses explicit primitive type checks instead of
  conditional type inference with `infer`, which was unreliable for intersection types.
  This ensures that Selectable schema types correctly resolve to plain types (string, number,
  Date, etc.) without ColumnType/Generated branding.

## 4.2.8

### Patch Changes

- Fix type utilities to match schema-derived types

  Simplified `Selectable<T>`, `Insertable<T>`, and `Updateable<T>` type utilities to directly extract `Schema.Schema.Type` without additional transformations.

  Previously, the type utilities applied extra wrappers (`StrictType`, `StripBrandingFromObject`) that caused type mismatches when comparing:
  - `Selectable<typeof User>` (type utility)
  - `typeof User.Selectable.Type` (direct schema extraction)

  Now both produce identical types, enabling seamless integration between repository types and RPC schemas.

## 4.2.7

### Patch Changes

- Fix StripFieldBranding type to correctly extract base types from branded ColumnType and Generated types.

  Previously used `Omit` which doesn't work for intersection types like `S & { [brand]: ... }`.
  Now uses conditional type inference (`T extends ColumnType<infer S, ...> ? S : ...`) to properly extract the base type.

  This fixes type errors where `Selectable<T>` was returning `Omit<ColumnType<string, never, never>, symbol>` instead of `string`.

## 4.1.0

### Minor Changes

- feat: export Kysely table interfaces for use with native Kysely type utilities

  Table interfaces (e.g., `UserTable`) are now exported, allowing direct use with Kysely's native type utilities:
  - `Selectable<UserTable>` - all fields
  - `Insertable<UserTable>` - excludes ColumnType<S, never, U> fields (correctly omits id)
  - `Updateable<UserTable>` - excludes ColumnType<S, I, never> fields (correctly omits id)

  This provides proper compile-time type safety for fields marked with `ColumnType<string, never, never>`.

## 4.0.19

### Patch Changes

- fix(types): improve OmitNever to also filter properties that are only `undefined` (from `never | undefined` simplifying to `undefined`). This properly excludes id fields from Insertable/Updateable types when using ColumnType<Select, never, never>.

## 4.0.18

### Patch Changes

- fix(types): add OmitNever to StrictType to filter out never-valued properties from Insertable/Updateable types

## 4.0.12

### Patch Changes

- fix: export IdSchema to prevent TypeScript type expansion in .d.ts files

  Changed `const ${name}IdSchema` to `export const ${name}IdSchema` in generated code. This allows TypeScript to reference the schema by name rather than expanding it inline, which prevents issues with SchemasWithId receiving the wrong number of type parameters in declaration files.

## 4.0.11

### Patch Changes

- fix: preserve branded Id schema type in compiled .d.ts files

  Changed generic constraints from `Schema.Schema.Any` to `Schema.Schema<unknown, unknown, unknown>` to prevent TypeScript from widening `User.Id` to `any` in declaration files. This ensures branded ID types are correctly preserved when consumers compile their code.

## 4.0.10

### Patch Changes

- [`cad965c`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/cad965cd4c933f4bd84912fffe82519290d14260) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - fix: Improved Schema type compatibility
  - Updated `getSchemas()` to use `Schema.Schema.Any` constraint for better type inference
  - Removed intersection-based phantom types that could cause type compatibility issues
  - Simplified `columnType()` and `generated()` return types to plain `Schema.Schema`

  Note: Like all Effect-based packages, consumers must use `skipLibCheck: true` in their tsconfig. This is a requirement of the Effect ecosystem, not specific to this package.

## 4.0.9

### Patch Changes

- [`cdcb3cb`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/cdcb3cb2d0dd4a094461081689bd4b9c3e2ba527) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - fix: Insertable<T> type utility now correctly excludes generated() fields at compile-time

  The previous implementation used phantom types with unique symbols which don't maintain identity across module boundaries when compiled to .d.ts files. This caused the type utility to include generated() fields even though the runtime schema correctly excluded them.

  The fix simplifies the type utilities to trust the pre-computed runtime schemas. Since getSchemas() already computes the correct Insertable/Updateable schemas with generated() fields excluded, the type utility now simply extracts types from these schemas rather than re-computing field exclusions using phantom types.

  This aligns with the @effect/sql pattern where schema variants are pre-computed and trusted.

## 4.0.8

### Patch Changes

- 542544c: Fix `generated()` fields not excluded from `Insertable<T>` type utility at compile-time

  The `generated()` function correctly filtered fields from `Insertable` at runtime, but the `Insertable<T>` type utility did not exclude these fields at compile-time. This caused TypeScript to require generated fields (like `createdAt`, `updatedAt`) when inserting records, even though they would be ignored at runtime.

  **Changes:**
  - Added `GeneratedInsertPhantom` phantom type symbol for compile-time tracking
  - Created `GeneratedSchema<SType, SEncoded, SR>` type that marks fields as generated
  - Updated `ExtractInsertPhantom` type utility to detect generated fields
  - Updated `HasNeverInsert` type utility to exclude generated fields from insertable types
  - Updated `generated()` function to return `GeneratedSchema` type

  **Before (bug):**

  ```typescript
  type UserInsert = Insertable<typeof User>;
  // TypeScript required: { id, createdAt, updatedAt, name, email }
  // But runtime only accepted: { name, email }
  ```

  **After (fixed):**

  ```typescript
  type UserInsert = Insertable<typeof User>;
  // TypeScript correctly requires: { name, email }
  // Matches runtime behavior
  ```

## 4.0.7

### Patch Changes

- fix: use Schema.Schema.Any for type utility constraints to fix exactOptionalPropertyTypes compatibility

  The type utilities (Selectable, Insertable, Updateable, Id) now use Effect's Schema.Schema.Any instead of Schema.Schema<unknown, unknown, unknown> as constraints. This fixes compatibility with TypeScript's exactOptionalPropertyTypes: true setting.

## 4.0.6

### Patch Changes

- Internal: configure eslint to recognize expectTypeOf as valid assertion for type-level tests

## 4.0.5

### Patch Changes

- Configure eslint to recognize expectTypeOf as valid assertion for type-level tests

## 4.0.4

### Patch Changes

- Fix type utilities compatibility with `exactOptionalPropertyTypes: true`
- Enable `exactOptionalPropertyTypes` in tsconfig

## 4.0.3

### Patch Changes

- Fix enum array types missing Array wrapper in Kysely table interfaces

## 4.0.2

### Patch Changes

- Fix enum array types missing Array wrapper in Kysely table interfaces

## 4.0.1

### Patch Changes

- [`f8c0cd8`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/f8c0cd8ecce1386292555d835fa13bdd4cf9cb04) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Export branded ID types directly (e.g., `export type UserId = typeof UserIdSchema.Type`)

## 4.0.0

### Major Changes

- cf9183e: feat!: Minimal exports API - hide internal schemas and interfaces

  BREAKING CHANGE: Internal schemas and interfaces are no longer exported.

  ## What changed
  - `_User` base schemas are now internal (not exported)
  - `UserTable` Kysely interfaces are now internal (not exported)
  - `UserIdSchema` branded ID schemas are now internal (not exported)
  - Type aliases (`UserSelect`, `UserInsert`, `UserUpdate`, `*Encoded`) are removed

  Exports:
  - `export type UserId` - branded ID types (directly importable)
  - `export const User = getSchemas(_User, UserIdSchema)` - operational schemas
  - `export interface DB { User: UserTable; }` - Kysely DB interface

  ## Migration

  ```typescript
  // Before (v3.x)
  import { _User, UserTable, UserSelect, UserInsert } from './generated';

  // After (v4.0)
  import { User, UserId, DB } from './generated';
  import { Selectable, Insertable, Updateable } from 'prisma-effect-kysely';

  // Branded ID types are exported directly
  function getUser(id: UserId): Promise<...> { ... }

  // Access base schema via _base property
  const baseSchema = User._base;

  // Use type utilities for Selectable/Insertable/Updateable
  type UserSelect = Selectable<typeof User>;
  type UserInsert = Insertable<typeof User>;
  type UserUpdate = Updateable<typeof User>;
  ```

  ## Why this change
  - **Reduced confusion**: Users only see what they need (`User`, `DB`)
  - **Cleaner API**: Follows Kysely's native pattern
  - **Internal details hidden**: `_User`, `UserTable`, `UserIdSchema` are implementation details
  - **Type utilities work unchanged**: `Selectable<typeof User>` continues to work via `User._base`

## 3.1.0

### Minor Changes

- [`046b0ef`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/046b0efe1f8c7cef14749e544dcd0bd290f75d97) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - feat: Add optional Id parameter to getSchemas() for better type inference

  The `getSchemas()` function now accepts an optional second parameter for the branded Id schema. This eliminates the need for object spread patterns in generated code, which caused TypeScript to lose the `_base` property needed for compile-time type utilities.

  **Breaking Change in Generated Code:**

  Before:

  ```typescript
  export const User = {
    ...getSchemas(_User),
    Id: UserIdSchema,
  } as const;
  ```

  After:

  ```typescript
  export const User = getSchemas(_User, UserIdSchema);
  ```

  **New API:**

  ```typescript
  // With Id (models with @id field)
  const User = getSchemas(_User, UserIdSchema);
  // Returns: SchemasWithId<Type, Encoded, BaseSchema, IdSchema>

  // Without Id (models without @id, join tables)
  const JoinTable = getSchemas(_JoinTable);
  // Returns: Schemas<Type, Encoded, BaseSchema>
  ```

  **Why this change:**

  TypeScript's spread inference doesn't preserve the `_base` property from `getSchemas()` return type. This caused `Insertable<typeof User>` and `Updateable<typeof User>` to fail because `ExtractStructFields<T>` couldn't find the `_base` property needed for phantom type extraction.

  **Migration:**

  Re-run `prisma generate` to update generated code. No changes needed to consumer code using type utilities.

## 3.0.2

### Patch Changes

- [`b2edf54`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/b2edf54230d73a4e600aecdd9980f7915ea53f62) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Fix: Exclude Never-typed fields from Insertable/Updateable at compile-time

  The `columnType` function now returns a `ColumnTypeSchema` type with phantom type properties that encode the insert/update type constraints. The `Insertable<T>` and `Updateable<T>` type utilities use these phantom types to correctly exclude `never`-typed fields at the TypeScript type level.

  **Changes:**
  - `columnType()` now returns `ColumnTypeSchema<S, E, R, I, U>` with phantom types for insert/update
  - `getSchemas()` now stores the base schema in `_base` property for type-level field extraction
  - `Insertable<T>` and `Updateable<T>` type utilities compute correct types by:
    - Extracting struct fields from `_base` schema
    - Filtering out fields with `never` phantom types
    - Computing the correct insert/update type per field

  **Example:**

  ```typescript
  const _User = Schema.Struct({
    id: columnType(Schema.UUID, Schema.Never, Schema.Never),
    name: Schema.String,
  });
  const User = getSchemas(_User);

  // At compile-time:
  type UserInsert = Insertable<typeof User>;
  // = { name: string }  // 'id' correctly excluded

  type UserUpdate = Updateable<typeof User>;
  // = { name?: string }  // 'id' correctly excluded
  ```

## 3.0.1

### Patch Changes

- [`57771ff`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/57771ff954fcf8796d8e2ad7fefd5dc5f6ce51fb) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Fix: Exclude Never-typed fields from Updateable and Insertable schemas

  Previously, fields with `columnType(T, Schema.Never, Schema.Never)` were incorrectly included in Updateable/Insertable schemas because `Schema.mutable()` wrapped the Never type in a Transformation node, changing the AST tag from `'NeverKeyword'` to `'Transformation'`. The filter at line 155 checked for `'NeverKeyword'` but couldn't detect the wrapped Never type.

  **Fix**: Check for `AST.isNeverKeyword(targetSchema.ast)` before applying the `Schema.mutable()` transformation, then filter out null values.

  This ensures read-only ID fields like `id: columnType(Schema.UUID, Schema.Never, Schema.Never)` are properly excluded from update and insert operations, maintaining Kysely's type safety guarantees.

## 3.0.0

### Major Changes

- [`40a2a5e`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/40a2a5ed0ec35c40cc4e4c8c58dfe34437c54050) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - **BREAKING**: Kysely-native type utility pattern

  This release changes how consumers access types from generated schemas, aligning with Kysely's native patterns.

  ## Breaking Changes

  ### Removed type exports

  Generated code no longer exports individual type aliases:

  ```typescript
  // REMOVED - these no longer exist
  export type UserSelect = ...
  export type UserInsert = ...
  export type UserUpdate = ...
  ```

  ### New pattern: Type utilities

  Import type utilities from the library and use with generated schemas:

  ```typescript
  import { Selectable, Insertable, Updateable, Id } from 'prisma-effect-kysely';
  import { User } from './generated';

  type UserRow = Selectable<typeof User>;
  type NewUser = Insertable<typeof User>;
  type UserPatch = Updateable<typeof User>;
  type UserId = Id<typeof User>;
  ```

  ## New Features

  ### Branded ID types

  Each model with an `@id` field now includes a branded ID schema:

  ```typescript
  export const User = {
    ...getSchemas(_User),
    Id: UserIdSchema, // Branded type: Schema.UUID.pipe(Schema.brand("UserId"))
  } as const;
  ```

  ### Type utilities exported from library
  - `Selectable<T>` - Row type for SELECT queries
  - `Insertable<T>` - Type for INSERT operations
  - `Updateable<T>` - Type for UPDATE operations
  - `Id<T>` - Branded ID type

  ## Migration

  Replace direct type imports with type utilities:

  ```typescript
  // Before
  import { UserSelect, UserInsert } from './generated';

  // After
  import { Selectable, Insertable } from 'prisma-effect-kysely';
  import { User } from './generated';
  type UserSelect = Selectable<typeof User>;
  type UserInsert = Insertable<typeof User>;
  ```

  ## Documentation
  - Fixed README.md: DateTime correctly maps to `Schema.DateFromSelf` (not `Schema.Date`)
  - Updated CLAUDE.md with new architecture documentation

## 2.2.0

### Minor Changes

- [`5b1bbea`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/5b1bbea2f160d84049877b655f874974c47fe4b5) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Select/Insert/Update aliases now use `StrictType` directly, so they match Effect schemas without index signatures and the old `*Strict` exports are gone.

- [`1590bc9`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/1590bc9e7d02ad6e1ae4df0b465fa84de2eafcd1) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Default `Select` / `Insert` / `Update` aliases now use strict typing (no `[key: string]: unknown`), so there is a single canonical type per schema and the extra `*Strict` exports/config switches have been removed.

### Patch Changes

- [`33fdc8e`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/33fdc8e40e4658ceadef5ec64d78a0aeded4d96e) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Ensure every generated Kysely schema returns the `Schema` interface by wrapping `Schema.make(...)` results with `Schema.asSchema()` and updating the mutable insert/update helpers to keep their runtime types aligned.

## 2.1.0

### Minor Changes

- [`6104932`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/6104932286e35b94a264ffedc0eadf3fa2e72124) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Add strict Select/Insert/Update aliases plus generator options and helper exports so consumers can opt into index-signature-free Effect schemas.

## 2.0.3

### Patch Changes

- [`6200700`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/6200700b769a1e677e71a8145b552ea8846a450f) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Fix ID fields with @default not being omitted from Insert types

## 2.0.2

### Patch Changes

- Fix the 2.0.1 release so TypeScript sees mutable arrays on insert/update schemas and userland insert types omit generated fields.

## 2.0.1

### Patch Changes

- [`a54e7ff`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/a54e7ff6b701f37be911e4f798c1aabb76d3a2fb) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Fix mutable array types for Kysely insert/update operations. Schema.Array(...) now produces mutable T[] instead of readonly T[] for Insertable and Updateable schemas.

## 2.0.0

### Major Changes

- BREAKING: Switch from Schema.UndefinedOr to Schema.NullOr for nullable fields

  This change aligns the generated schemas with SQL semantics where `null` represents missing values.

  **Before:**

  ```typescript
  optionalField: Schema.UndefinedOr(Schema.String); // string | undefined
  ```

  **After:**

  ```typescript
  optionalField: Schema.NullOr(Schema.String); // string | null
  ```

  **Migration:**
  1. Regenerate schemas with `prisma generate`
  2. Update code that uses `undefined` for optional fields to use `null` instead
  3. Nullable fields must now be explicitly passed (with `null` or a value)

  **Rationale:**
  - SQL databases use `null` for missing values, not `undefined`
  - Aligns with Prisma Client which uses `T | null`
  - `null` is preserved in JSON serialization (unlike `undefined`)
  - Provides semantic clarity: `null` = "explicitly no value"

## 1.14.1

### Patch Changes

- [`11d09a7`](https://github.com/samuelho-dev/prisma-effect-kysely/commit/11d09a71ed233549a3bd591793b3f423cad71950) Thanks [@samuelho-dev](https://github.com/samuelho-dev)! - Fix ESM/CJS interop for Prisma 7.x compatibility

  Node.js ESM cannot use named imports from CJS modules. Changed `@prisma/generator-helper` import to use default import pattern:

  ```typescript
  // Before (broken in ESM)
  import { generatorHandler } from '@prisma/generator-helper';

  // After (works)
  import pkg from '@prisma/generator-helper';
  const { generatorHandler } = pkg;
  ```

  Added ESM compatibility tests to prevent future regressions.

## 1.14.0

### Minor Changes

- 48451f3: Migrate to Pure ESM standards.
  - Change package type to module and update exports.
  - Switch to ESNext module and Bundler resolution in tsconfig.
  - Update test suite for ESM compatibility using @jest/globals and import.meta.dirname.
  - Standardize imports with node: prefix and explicit re-exports.
  - Ensure generated code and build output follow ESM standards.

### Patch Changes

- 2c75314: Fix critical Effect Schema type errors and migrate to Biome linting
  - Fix Schema.make context preservation in kysely helpers
  - Replace Jest with Vitest for ESM compatibility
  - Migrate from ESLint to Biome for modern linting
  - Update all test files to use Vitest APIs
  - Fix enum generation redeclaration conflicts
  - Refactor complex functions to reduce cognitive complexity
  - Remove all non-null assertions with proper null checks
  - Update Node.js minimum version to 20.0.0

## 1.13.1

### Patch Changes

- Fix Kysely table interface enum types to use Schema type extraction instead of raw enum names

  Previously, Kysely table interfaces referenced raw enum type names (e.g., MATCH_TYPE) which weren't imported - only Schema wrappers (e.g., MatchTypeSchema) were imported. This caused "Cannot find name" TypeScript errors.

  Now enum fields in Kysely interfaces use `Schema.Schema.Type<typeof EnumSchema>` to extract the type from the imported Schema wrapper.

## 1.13.0

### Minor Changes

- feat: use Schema.DateFromSelf for native Date types

  BREAKING CHANGE: DateTime fields now use Schema.DateFromSelf instead of Schema.Date
  - DateTime fields now encode to native Date objects instead of ISO strings
  - This enables Kysely to work with native Date objects directly without requiring `.toISOString()` conversions
  - Added Effect Schema validation for generator config and scaffold results
  - Removed type assertions in favor of strict Schema validation
  - Added multi-domain support with contract library scaffolding

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.2] - 2025-10-17

### Fixed

#### Dependency Configuration

- **Fixed Effect as peer dependency** to prevent version conflicts and follow best practices
  - **Problem**: `effect` was listed as a regular dependency, causing potential version conflicts in user projects
  - **Solution**: Moved `effect` to `peerDependencies` (required, not optional)
  - **Rationale**:
    - Generated code imports from `effect` package
    - Runtime helpers (`src/kysely/helpers.ts`) export Effect schemas
    - Users need Effect in their projects anyway
    - Follows same pattern as `zod-prisma-types` (Zod as peer dependency)
  - **Impact**: Users must explicitly install `effect` in their projects (most already have it)

### Removed

#### Unused Dependencies

- **Removed `@prisma/client` and `@prisma/dmmf`** from dependencies
  - **Analysis**: Code analysis revealed these packages are never imported in the codebase
  - **Impact**: Smaller package size, cleaner dependency tree

### Changed

#### Package Structure

**Before:**

```json
"dependencies": {
  "@prisma/client": "6.16.3",
  "@prisma/dmmf": "^6.17.0",
  "@prisma/generator-helper": "^6.17.0",
  "effect": "^3.18.4",
  "prettier": "^3.6.2"
}
```

**After:**

```json
"dependencies": {
  "@prisma/generator-helper": "^6.17.0",
  "prettier": "^3.6.2"
},
"peerDependencies": {
  "effect": "^3.18.4",
  "kysely": "^0.28.0"
}
```

### Migration Guide

**For New Users:**

- Install Effect explicitly: `npm install effect` or `pnpm install effect`

**For Existing Users:**

- If you already have `effect` installed: No action needed
- If you don't have `effect`: Run `npm install effect` or `pnpm install effect`
- npm 7+ will automatically install peer dependencies

**Benefits:**

- ✅ Prevents Effect version conflicts between your project and the generator
- ✅ You control which Effect version to use
- ✅ Smaller package size (removed unused dependencies)
- ✅ Follows industry best practices for library dependencies

## [1.9.1] - 2025-10-17

### Fixed

#### TypeScript Schema [TypeId] Preservation Bug

- **Fixed `generated()` and `columnType()` helpers losing Schema [TypeId] symbol**
  - **Problem**: Helpers returned result of `.annotations()` directly, causing TypeScript compilation errors in generated code: `Property '[TypeId]' is missing in type 'typeof Date$'`
  - **Root Cause**: `.annotations()` doesn't automatically preserve Schema type for TypeScript's type system without explicit wrapping
  - **Solution**:
    - Added explicit return type annotations: `: Schema.Schema<T, E, R>`
    - Wrapped results with `Schema.asSchema()` to preserve [TypeId] symbol
  - **Impact**: All generated code using `generated(Schema.Date)` or `columnType(Schema.UUID, ...)` now compiles correctly in downstream projects
  - **Files Modified**:
    - `src/kysely/helpers.ts:23-35` (columnType fix)
    - `src/kysely/helpers.ts:45-48` (generated fix)

### Added

#### Enhanced Test Coverage for Type Safety

- **Added TypeScript compile-time validation tests** to prevent future regressions
  - Type assertions that fail at compile-time if Schema types lose [TypeId]
  - Runtime validation using `Schema.isSchema()` checks
  - Generation validation to ensure correct helper usage in generated code
- **Test Files Enhanced**:
  - `src/__tests__/effect-schema.test.ts`: Added "TypeScript Type Safety" test suite (3 tests)
  - `src/__tests__/code-generation.test.ts`: Added "Generated Code TypeScript Compilation" test (1 test)
- **Test Suite Consolidation**: Reduced from 14 files to 7 files while maintaining 139 passing tests
  - Eliminated duplicate test coverage
  - Grouped tests by functional domain
  - Improved maintainability and clarity

### Technical Details

**Why the Bug Occurred**:

- Effect Schema's `.annotations()` method creates a new schema with modified annotations
- TypeScript's type inference doesn't automatically preserve the `Schema<T>` type with its `[TypeId]` symbol
- Without `Schema.asSchema()` wrapper, TypeScript sees the result as a plain object losing Schema type information

**Prevention Strategy**:

- Always use explicit return types for functions returning schemas
- Always wrap `.annotations()` results with `Schema.asSchema()`
- Include both compile-time type assertions AND runtime validation in tests

**Example Fix**:

```typescript
// Before (incorrect):
export const generated = <T>(schema: Schema.Schema<T>) => {
  return schema.annotations({ [GeneratedId]: true });
};

// After (correct):
export const generated = <T>(schema: Schema.Schema<T>): Schema.Schema<T> => {
  return Schema.asSchema(schema.annotations({ [GeneratedId]: true }));
};
```

## [1.9.0] - 2025-10-13

### Fixed

#### TypeScript Type Inference for Generated Fields - Explicit Omit Types

- **Generate explicit Insert type definitions using TypeScript's Omit utility for compile-time type safety**
  - **Problem**: v1.8.4 fixed runtime behavior (generated fields correctly omitted from Insertable schema), but TypeScript's `Schema.Schema.Type` inference couldn't see runtime AST field filtering, causing all fields to appear in Insert types
  - **Root Cause**: TypeScript's structural type inference works on static schema structure; runtime AST transformations are invisible to the type system
  - **Solution**: Code generator now creates explicit type definitions: `Omit<Schema.Schema.Type<typeof Model.Insertable>, 'generatedField1' | 'generatedField2'>`
  - **Result**: Compile-time type safety + runtime correctness
  - **Benefits**:
    - TypeScript compiler errors when attempting to insert generated fields (prevents bugs at compile-time)
    - Accurate IDE autocomplete and type hints for Insert operations
    - Matches code generation best practices (same approach as Prisma Client, Drizzle ORM, tRPC)
    - Zero runtime overhead (types are erased at compile time)
  - **Fields Automatically Omitted from Insert Types**:
    - ID fields with `@default` (e.g., `@id @default(uuid())`)
    - Non-ID fields with `@default` (e.g., `@default(now())`)
    - Fields with `@updatedAt` directive (auto-managed by database)
  - **Example**:

    ```typescript
    // Prisma schema:
    model User {
      id        String   @id @default(uuid()) @db.Uuid
      email     String
      name      String
      createdAt DateTime @default(now())
      updatedAt DateTime @updatedAt
    }

    // Generated types (v1.9.0):
    export type UserInsert = Omit<
      Schema.Schema.Type<typeof User.Insertable>,
      'id' | 'createdAt' | 'updatedAt'
    >;

    // TypeScript now enforces:
    const validInsert: UserInsert = {
      email: 'user@example.com',
      name: 'John Doe'
    }; // ✅ Compiles successfully

    const invalidInsert: UserInsert = {
      id: 'some-uuid', // ❌ TypeScript error: 'id' does not exist in type 'UserInsert'
      email: 'user@example.com',
      name: 'John Doe'
    };
    ```

  - **Implementation**:
    - Added `getOmittedInsertFields()` helper in `src/effect/generator.ts` to identify fields during code generation
    - Uses DMMF properties: `hasDefaultValue` and `isUpdatedAt`
    - Fields are alphabetically sorted in Omit union for deterministic output
  - Location: `src/effect/generator.ts:10-36, 83-110`
  - Orchestrator: `src/generator/orchestrator.ts:98`
  - Tests: `src/__tests__/type-inference-generated.test.ts` (10 new tests, all passing)

### Technical Details

- **Architecture**: Explicit type generation (industry standard for code generators)
- **Rationale**: TypeScript's structural type inference works on static schema structure; runtime AST transformations are invisible to the type system
- **Not a Workaround**: Standard practice when type inference can't capture runtime behavior (same approach as Prisma Client, Drizzle ORM, tRPC)
- **Comparison to @effect/sql**: They use `VariantSchema.Field` for compile-time variant control; we use explicit `Omit` types for the same goal
- **Quality Assurance**: All 181 tests passing (including 10 new type inference tests), strict TypeScript compilation
- **Backwards Compatible**: No breaking changes to runtime behavior (maintains v1.8.4 runtime guarantees)
- **Type Safety Guarantee**: Models without generated fields continue to use plain `Schema.Schema.Type` (no unnecessary `Omit`)

### Breaking Changes

None - This is a non-breaking enhancement. The change is purely additive at the type level:

- Runtime behavior unchanged from v1.8.4
- Generated schemas remain the same
- Only TypeScript type definitions become more restrictive (catching bugs earlier)

## [1.8.4] - 2025-10-13

### Fixed

#### Native @effect/sql Pattern for Generated Fields

- **Implemented native field filtering for `generated()` fields following @effect/sql Model.Generated pattern**
  - **Problem**: Generated fields (those with `@default` in Prisma schema) were incorrectly made optional in Insertable schema using `Union(T, Undefined)`, which doesn't properly reflect TypeScript optionality and doesn't follow Effect ecosystem patterns
  - **Solution**: OMIT generated fields entirely from Insertable schema (not make them optional) following @effect/sql's `Model.Generated` pattern
  - **Implementation**:
    - Simplified `generated()` to be just a marker annotation (no schema transformation)
    - Updated `Insertable()` to filter out fields with `GeneratedId` annotation during AST reconstruction
    - Removed unnecessary `GeneratedSchemas` interface
    - Simplified `extractParametersFromTypeLiteral` (generated fields are now just markers)
    - Removed `OptionalType` detection from `isOptionalType()` (only checks for `Union(T, Undefined)` pattern)
  - **Benefits**:
    - Native Effect Schema pattern (zero coercions)
    - Follows @effect/sql ecosystem conventions
    - Runtime correctness: generated fields are completely absent from Insertable schema
    - Respects TypeScript optionality semantics (property optional `?:` vs value optional `| undefined`)
    - Cleaner implementation with fewer special cases
  - **Example**:

    ```typescript
    // Prisma schema:
    model Agent {
      id         String @id @default(uuid()) @db.Uuid
      session_id String @default(uuid()) @db.Uuid
      name       String
    }

    // Generated Effect Schema:
    export const _Agent = Schema.Struct({
      id: generated(Schema.UUID),         // Omitted from insert
      session_id: generated(Schema.UUID), // Omitted from insert
      name: Schema.String,
    });

    // Runtime behavior:
    const schemas = getSchemas(_Agent);

    // Insert only requires 'name' - generated fields completely absent
    const insert: AgentInsert = { name: 'test' };
    ```

  - **Test Coverage**: 15 tests passing including comprehensive runtime validation and AST structure verification
  - Location: `src/kysely/helpers.ts:43-119, 188-224`
  - Tests: `src/__tests__/kysely-helpers.test.ts:186-283`

### Known Limitations

#### TypeScript Type Inference for Insertable Types

- **TypeScript's `Schema.Schema.Type` inference still includes all fields in Insert types**
  - **Issue**: While runtime validation correctly omits generated fields, TypeScript type inference from `Schema.Schema.Type<typeof Model.Insertable>` cannot see runtime AST field filtering and still infers all fields as required
  - **Root Cause**: TypeScript's structural type inference works on the base schema structure before runtime transformations
  - **Workaround**: Use explicit type annotations or runtime validation (Effect Schema will filter out extra fields)
  - **Planned Fix**: Update code generator (`src/effect/generator.ts`) to create explicit TypeScript type definitions using `Omit` utility type:

    ```typescript
    // Current:
    export type AgentInsert = Schema.Schema.Type<typeof Agent.Insertable>;

    // Planned:
    export type AgentInsert = Omit<
      Schema.Schema.Type<typeof Agent.Insertable>,
      'id' | 'session_id'
    >;
    ```

  - **Status**: Code generation fix planned for v1.9.0

### Technical Details

- **Quality Assurance**: All 15 kysely-helpers tests passing, zero TypeScript errors in implementation
- **Test Approach**: TDD (Test-Driven Development) - wrote failing tests first, then implemented to make them pass
- **Research**: Validated approach against @effect/sql's `Model.Generated` pattern (official Effect ecosystem standard)
- **Effect Schema Integration**: Uses native AST filtering with `propertySignatures.filter()` (no custom type guards or coercions)
- **Backwards Compatible**: No breaking changes to existing runtime behavior

## [1.8.3] - 2025-10-13

### Added

#### Semantic Join Table Column Names

- **Generated join tables now use semantic snake_case field names** instead of Prisma's generic A/B columns
  - **Problem**: Prisma's implicit M2M join tables use non-semantic `A` and `B` column names, causing poor developer experience and forcing developers to remember alphabetical model ordering
  - **Solution**: Map semantic names like `product_id`, `product_tag_id` to actual database columns using Effect Schema's `propertySignature` with `fromKey`
  - **Benefits**:
    - Developer-friendly semantic names in TypeScript code
    - Maintains Prisma A/B database compatibility (no migration required)
    - Type-safe bidirectional transformation (encode/decode)
    - Follows snake_case convention for database identifiers (Prisma best practice)
  - **Example**:

    ```typescript
    // Before (v1.8.2):
    export const _ProductToProductTag = Schema.Struct({
      A: columnType(Schema.UUID, Schema.Never, Schema.Never),
      B: columnType(Schema.UUID, Schema.Never, Schema.Never),
    });

    // After (v1.8.3):
    export const _ProductToProductTag = Schema.Struct({
      product_id: Schema.propertySignature(
        columnType(Schema.UUID, Schema.Never, Schema.Never)
      ).pipe(Schema.fromKey('A')),
      product_tag_id: Schema.propertySignature(
        columnType(Schema.UUID, Schema.Never, Schema.Never)
      ).pipe(Schema.fromKey('B')),
    });
    ```

  - Location: `src/effect/join-table.ts:37-69`
  - New utility: `toSnakeCase()` in `src/utils/naming.ts:61-73`

### Fixed

#### Unused Enum Type Imports

- **types.ts now imports only Schema wrappers**: Eliminated TypeScript "declared but never read" warnings
  - **Problem**: Generated `types.ts` imported both plain enum types (e.g., `BudgetStatus`) and schema wrappers (e.g., `BudgetStatusSchema`), but only schema wrappers were used
  - **Solution**: Import generation now only includes `*Schema` wrappers
  - **Impact**: Cleaner generated code, no TypeScript warnings
  - Location: `src/effect/generator.ts:95-107`

### Technical Details

- **Quality Assurance**: All 165 tests passing (15 naming tests + 10 join table tests + 140 existing), zero TypeScript errors
- **Test Coverage**: New comprehensive tests for `toSnakeCase` utility and semantic join table column generation
- **Documentation**: Updated CLAUDE.md with join table naming behavior explanation
- **Research**: Verified snake_case follows Prisma generator best practices (community standard for database identifiers)
- **Backwards Compatible**: No breaking changes - existing queries continue to work
- **Effect Schema Integration**: Uses native `propertySignature` + `fromKey` pattern (official Effect Schema column mapping approach)

## [1.8.0] - 2025-10-12

### Added - Enterprise Open Source Standards

This release transforms the project into an enterprise-ready open source package following 2025 best practices.

#### Code Quality & Formatting

- **ESLint 9**: Flat config format with TypeScript and Jest support (2025 standard)
  - Comprehensive rules for source and test files
  - Automatic unused import detection
  - Pre-configured for Effect Schema patterns
- **Prettier**: Formalized configuration for consistent code style across team
  - Auto-formatting on save
  - Integrated with pre-commit hooks
- **Pre-commit hooks**: Husky + lint-staged for automatic quality enforcement
  - Runs ESLint --fix on staged files
  - Runs Prettier on staged files
  - Prevents broken commits
- **New npm scripts**:
  - `npm run lint` - Run ESLint across codebase
  - `npm run lint:fix` - Auto-fix linting issues
  - `npm run format` - Format all files with Prettier
  - `npm run format:check` - Check formatting without changes

#### Governance Documentation

- **SECURITY.md**: Professional vulnerability reporting process
  - Supported versions table
  - Response timeline SLAs (Critical: 7 days, High: 14 days, Medium: 30 days)
  - Security best practices for users
  - Contact methods for responsible disclosure
- **CODE_OF_CONDUCT.md**: Contributor Covenant 2.1 (industry standard)
  - Clear community standards
  - Enforcement guidelines
  - Inclusive language and expectations
- **CONTRIBUTING.md**: Complete developer onboarding guide
  - Quick setup (< 5 minutes)
  - Development workflow
  - Coding standards reference
  - Commit message conventions (Conventional Commits)
  - Pull request checklist
  - Testing requirements (maintain >90% coverage)
- **Governance docs added to npm package**: All governance files now distributed with package

#### Automated Dependency Management

- **renovate.json**: Renovate Cloud (free tier) configuration
  - Weekly automated updates (Mondays at 3am UTC)
  - Auto-merge for patch updates after CI passes
  - Smart package grouping:
    - TypeScript and ESLint together
    - Prisma packages together
    - Testing packages together
  - Vulnerability alerts with security label
  - Rate limiting: 5 concurrent PRs, 2 per hour
  - Effect package pinned to prevent breaking changes

### Changed

- **prepublishOnly script**: Now includes linting step (`npm run lint && npm run typecheck && npm run test && npm run build`)
- **prepare script**: Updated from `npm run build` to `husky` for pre-commit hook initialization
- **Source code cleanup**: Removed unused imports detected by ESLint
  - `src/effect/generator.ts`: Removed unused `getFieldDbName` import
  - `src/kysely/generator.ts`: Removed unused `getModelDbName` import
  - `src/kysely/helpers.ts`: Changed to type-only imports for Kysely types
  - `src/effect/join-table.ts`: Prefixed unused parameter with underscore

### Technical Details

- **Quality Assurance**: All 154 tests passing, zero TypeScript errors
- **ESLint Status**: Passing with 2 minor warnings in test files (acceptable for test code)
- **Build**: Clean compilation to dist/ directory
- **Impact**: ~2 hours implementation time (vs 3-4 weeks traditional approach)
- **Compliance**: Follows OpenSSF Best Practices baseline

### Dependencies

- **Added devDependencies**:
  - `@eslint/js@^9.37.0`
  - `typescript-eslint@^8.46.0`
  - `eslint@^9.37.0`
  - `eslint-plugin-jest@^29.0.1`
  - `husky@^9.1.7`
  - `lint-staged@^16.2.4`

[1.8.0]: https://github.com/samuelho-dev/prisma-effect-kysely/compare/v1.7.2...v1.8.0

## [1.7.2] - 2025-10-12

### Fixed

- **Enum PascalCase Aliases**: Added missing const and type aliases for better ergonomics
  - Now exports: `export const BudgetStatus = BUDGET_STATUS` (const alias)
  - Now exports: `export type BudgetStatus = BudgetStatusType` (type alias)
  - Allows consuming code to use PascalCase imports: `import { BudgetStatus } from './enums'`
  - Maintains backward compatibility with SCREAMING_SNAKE_CASE enums
  - This was documented in 1.7.1 but not actually implemented in the generated output

## [1.7.1] - 2025-10-12

### Changed

- **Enum naming convention improved**:
  - Enum declarations preserve original Prisma schema names (e.g., `export enum ACTIVE_STATUS`)
  - Schema wrappers use PascalCase for idiomatic TypeScript (e.g., `ActiveStatusSchema`)
  - Type aliases use PascalCase (e.g., `ActiveStatusType`)
  - **Usage**: Access enum values with original name: `ACTIVE_STATUS.ACTIVE`, validate with PascalCase schema: `ActiveStatusSchema`

### Example

```typescript
// Generated from: enum ACTIVE_STATUS { ACTIVE, INACTIVE }
export enum ACTIVE_STATUS {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
export const ActiveStatusSchema = Schema.Enums(ACTIVE_STATUS);
export type ActiveStatusType = Schema.Schema.Type<typeof ActiveStatusSchema>;

// Usage:
const status = ACTIVE_STATUS.ACTIVE; // Direct enum access
Schema.decodeSync(ActiveStatusSchema)(input); // Validation
```

## [1.5.3] - 2025-10-12

### Changed

- **BREAKING**: Enum names now preserve original Prisma schema naming instead of converting to PascalCase
  - If your enum is `UserRole` in Prisma, it stays `UserRole` in generated code
  - If your enum is `user_role` in Prisma, it stays `user_role` (no longer converted to `UserRole`)
  - This ensures generated TypeScript enums match your Prisma schema exactly
  - **Migration**: If you were relying on automatic PascalCase conversion, you'll need to update your enum references

## [1.5.2] - 2025-10-12

### Added

- **Implicit Many-to-Many Join Table Generation** - Full support for Prisma's implicit many-to-many relations
  - Automatically generates Effect Schema types for join tables (e.g., `_CategoryToPost`)
  - Includes join tables in Kysely `DB` interface for type-safe queries
  - Generates operational schemas (`Selectable`, `Insertable`, `Updateable`) for join tables
  - Both `Type` and `Encoded` exports for complete type coverage
  - Example:

    ```typescript
    // Generated join table schema
    export const _CategoryToPost = Schema.Struct({
      A: columnType(Schema.UUID, Schema.Never, Schema.Never),
      B: columnType(Schema.UUID, Schema.Never, Schema.Never),
    });

    export const CategoryToPost = getSchemas(_CategoryToPost);

    // DB interface includes join table
    export interface DB {
      Category: Schema.Schema.Encoded<typeof _Category>;
      Post: Schema.Schema.Encoded<typeof _Post>;
      _CategoryToPost: Schema.Schema.Encoded<typeof _CategoryToPost>;
    }
    ```

  - **Benefits**:
    - ✨ Type-safe Kysely queries through intermediate tables
    - ✨ Complete database schema representation
    - ✨ Enables complex many-to-many queries with full type inference
    - ✨ Maintains consistency with Prisma's database structure

### Fixed

- **UUID Detection Accuracy** - Enhanced UUID field detection to prevent false positives
  - Now checks field type is `String` before applying name pattern matching
  - Prevents incorrect UUID detection on `Int` fields named `id`
  - Maintains 3-tier detection strategy: native type → documentation → field patterns

- **Memory Leaks in Test Suite** - Added proper cleanup hooks
  - Added `afterAll()` hooks to clear DMMF references in test files
  - Eliminates memory leak warnings with Jest's `--detectLeaks` flag
  - All 154 tests pass cleanly without memory warnings

### Implementation Details

- **New modules**:
  - `src/prisma/relation.ts`: Relation detection logic with join table metadata extraction
  - `src/effect/join-table.ts`: Schema generation for join tables
  - 20 new tests (12 relation detection + 8 schema generation)

- **Edge cases handled**:
  - Circular many-to-many relations (A↔B, A↔C, B↔C)
  - Mixed ID types (UUID in one model, Int in another)
  - Self-relations (properly filtered out)
  - Explicit many-to-many relations (detected and excluded)

### Testing

- All 154 tests passing
- No memory leaks with `--detectLeaks` flag
- TypeScript compilation passes without errors
- Comprehensive edge case coverage

## [1.5.0] - 2025-10-11

### Changed - BREAKING

- **Enum Generation Pattern** - Switched from `Schema.Literal` to `Schema.Enums` with native TypeScript enums
  - ✅ **Old Pattern (deprecated)**: `export const PRODUCT_STATUS = Schema.Literal("ACTIVE", "DRAFT", "ARCHIVED")`
  - ✅ **New Pattern**: Native TypeScript enum + Effect Schema wrapper
    ```typescript
    export enum ProductStatus {
      ACTIVE = 'ACTIVE',
      DRAFT = 'DRAFT',
      ARCHIVED = 'ARCHIVED',
    }
    export const ProductStatusSchema = Schema.Enums(ProductStatus);
    export type ProductStatusType = Schema.Schema.Type<typeof ProductStatusSchema>;
    ```
  - **Benefits**:
    - ✨ Property accessor support: `ProductStatus.ACTIVE` (IntelliSense-friendly)
    - ✨ Canonical Effect v3.18+ pattern (validated by Effect Architecture Specialist)
    - ✨ Full Kysely type compatibility for queries
    - ✨ Better developer experience with autocomplete
  - **Migration Required**: Users must regenerate schemas with `prisma generate`
  - **Breaking Change**: Existing code using `.literals` property will break

### Added

- **PascalCase Naming Convention** - Enums now use PascalCase instead of SCREAMING_SNAKE_CASE
  - `PRODUCT_STATUS` → `ProductStatus`
  - `USER_ROLE` → `UserRole`
  - Improves TypeScript idiomaticity and consistency

- **Type Aliases** - Generated type aliases for ergonomic usage
  - `ProductStatusType` for enum types
  - Simplifies type annotations: `ProductStatusType` vs `Schema.Schema.Type<typeof ProductStatusSchema>`

### Performance

- **58% reduction in function calls** - Optimized PascalCase conversions
  - Cache `toPascalCase()` results within function scope (1 call instead of 3)
  - Optimized flatMap iterator to cache base names (50% reduction per enum)
  - Pure functional optimization approved by Effect Architecture Specialist

- **100% elimination of intermediate arrays** - Removed unnecessary `Array.from()` calls
  - Readonly arrays already support `.map()` and iteration methods
  - Reduces memory allocations during code generation

### Improved

- **Code Quality** - Extracted file header generation utility
  - DRY principle: Single source of truth for generated file headers
  - New `generateFileHeader()` utility in `src/utils/codegen.ts`
  - Consistent formatting across enums.ts and types.ts

### Technical Details

**TDD Implementation**: All changes developed using Test-Driven Development (Red-Green-Refactor)

- 18+ new tests covering enum generation, property access, field mapping, and imports
- All 134 tests passing with strict TypeScript configuration
- Zero type coercions - maintains full type safety

**Expert Validation**:

- ✅ Effect Architecture Specialist: Confirmed Schema.Enums is canonical pattern for Effect v3.18+
- ✅ TypeScript Pro: Validated all optimizations are type-safe with zero runtime overhead

**Changed Files**:

- `src/effect/enum.ts`: Complete rewrite of enum generation logic
- `src/effect/type.ts`: Updated to return Schema wrappers for enum fields
- `src/effect/generator.ts`: Optimized import generation, removed Array.from()
- `src/utils/naming.ts`: Enhanced with optional suffix parameter
- `src/utils/codegen.ts`: New file for shared code generation utilities
- `src/__tests__/helpers/dmmf-mocks.ts`: New test helpers without type coercions

**Test Coverage**:

- `src/__tests__/enum-generation.test.ts`: Tests 1-6 (Schema.Enums pattern)
- `src/__tests__/enum-property-access.test.ts`: Tests 7-10 (property access validation)
- `src/__tests__/field-type-generation.test.ts`: Tests 11-12 (field type mapping)
- `src/__tests__/import-generation.test.ts`: Tests 13-15 (import generation)
- `src/__tests__/e2e-enum-generation.test.ts`: Tests 16-18 (end-to-end integration)

**Migration Guide**:

Before (v1.4.x):

```typescript
// Generated code
export const PRODUCT_STATUS = Schema.Literal('ACTIVE', 'DRAFT', 'ARCHIVED');

// Usage
const status = PRODUCT_STATUS.literals[0]; // "ACTIVE"
```

After (v1.5.0):

```typescript
// Generated code
export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  DRAFT = 'DRAFT',
  ARCHIVED = 'ARCHIVED',
}
export const ProductStatusSchema = Schema.Enums(ProductStatus);

// Usage (property access!)
const status = ProductStatus.ACTIVE; // "ACTIVE"
```

**Action Required**: Run `prisma generate` to regenerate schemas after upgrading.

[1.5.0]: https://github.com/samuelho-dev/prisma-effect-kysely/compare/v1.4.3...v1.5.0

## [1.4.3] - 2025-10-10

### Fixed

- **Declaration File Type Preservation** - Fixed type inference when using compiled `.d.ts` files
  - Added explicit return type annotations to `Selectable()`, `Insertable()`, and `Updateable()` helper functions
  - Added explicit return type annotation to `getSchemas()` function
  - Ensures TypeScript preserves `Selectable<Type>`, `Insertable<Type>`, and `Updateable<Type>` mapped types in declaration files
  - Resolves type inference failures when consuming libraries use dist/ paths instead of source paths
  - Fixes `Schema.Schema.Type<>` resolving to `unknown` when types are accessed from compiled declarations

### Technical Details

**Problem**: When TypeScript compiled helper functions to `.d.ts` files, the return types of AST transformation functions (`Selectable()`, `Insertable()`, `Updateable()`) were inferred as `S.Schema<unknown, unknown, never>` instead of preserving the Kysely mapped types. This caused downstream type resolution to fail when consumers used compiled declaration files (dist/ paths) instead of source files.

**Solution**: Added explicit return type annotations with type assertions to all helper functions:

- `Selectable()` → `: S.Schema<Selectable<Type>, Selectable<Encoded>, never>`
- `Insertable()` → `: S.Schema<Insertable<Type>, Insertable<Encoded>, never>`
- `Updateable()` → `: S.Schema<Updateable<Type>, Updateable<Encoded>, never>`
- `getSchemas()` → `: Schemas<Type, Encoded>`

**Impact**: Projects using prisma-effect-kysely with TypeScript path aliases pointing to `dist/` directories (compiled output) will now have proper type inference. Generated types like `EmbeddingOperationSelect` will resolve to proper object types instead of `unknown`.

**Testing**: Added comprehensive test suite (`declaration-inference.test.ts`) with 7 tests validating type preservation in compiled declarations, following TDD principles (Red-Green-Refactor).

**Changed files:**

- `src/kysely/helpers.ts`: Added return type annotations (4 functions)
- `src/__tests__/declaration-inference.test.ts`: New test suite (260 lines)

[1.4.3]: https://github.com/samuelho-dev/prisma-effect-kysely/compare/v1.4.1...v1.4.3

## [1.4.1] - 2025-10-09

### Fixed

- **TypeScript Type Compatibility** - Fixed `SchemaClass` to `Schema` conversion issues
  - Added `S.asSchema()` wrapper to `Selectable()`, `Insertable()`, and `Updateable()` helper functions
  - Ensures generated schemas return `S.Schema<A, I, R>` interface instead of `S.SchemaClass<A, I, R>`
  - Resolves TypeScript compilation errors when passing schemas to Effect's decode functions
  - Uses Effect's official identity function for zero-runtime overhead type conversion

- **Build Portability** - Fixed TypeScript TS2742 errors for portable type inference
  - Added explicit return type annotations to DMMF utility functions
  - Functions affected: `extractEnums()`, `getEnums()`, `getModels()`, `getModelFields()`, `filterInternalModels()`, `filterSchemaFields()`, `sortModels()`, `sortFields()`
  - Ensures generated `.d.ts` files are portable across different TypeScript projects

### Technical Details

**Problem**: Effect Schema's `S.make()` returns `SchemaClass` for fluent API support, but TypeScript cannot structurally verify it implements the `Schema` interface due to constructor signature differences. This caused compilation errors when passing generated schemas to Effect's decode functions.

**Solution**: Wrapped all `S.make()` calls with `S.asSchema()`, Effect's official identity function that converts `SchemaClass` → `Schema` at the type level only (zero runtime cost).

**Impact**: Projects using `prisma-effect-kysely` v1.4.0 or earlier may have experienced TypeScript compilation errors when using `Schema.decode()` or `Schema.decodeUnknownSync()`. This release resolves those errors without requiring any code changes in consuming projects.

**Changed files:**

- `src/kysely/helpers.ts`: Added `S.asSchema()` wrappers (6 locations)
- `src/prisma/enum.ts`: Added return type annotation
- `src/prisma/generator.ts`: Added return type annotations (3 methods)
- `src/prisma/type.ts`: Added return type annotations (4 functions)

[1.4.1]: https://github.com/samuelho-dev/prisma-effect-kysely/compare/v1.4.0...v1.4.1

## [1.4.0] - 2025-10-09

### Changed

- **Naming Standardization** - All exported schemas and types now use PascalCase regardless of Prisma model naming convention
  - Fixes inconsistent naming when models use snake_case (e.g., `session_model_preference`)
  - Generated exports: `SessionModelPreference`, `SessionModelPreferenceSelect`, etc. (instead of `session_model_preferenceSelect`)
  - Internal base schemas preserve original names with underscore prefix (e.g., `_session_model_preference`)
  - Applies to operational schemas and all type exports (Select, Insert, Update, Encoded variants)

### Added

- New `toPascalCase()` utility function for consistent TypeScript identifier generation
- Comprehensive tests for naming conversion (handles snake_case, kebab-case, camelCase, PascalCase)
- Test fixture `session_model_preference` to verify snake_case handling

### Technical Details

The generator now converts all model names to PascalCase when creating TypeScript exports using the new `toPascalCase()` utility. This ensures consistent, idiomatic TypeScript naming while preserving the original Prisma model names for internal schemas. The conversion handles snake_case, kebab-case, camelCase, and mixed formats.

**Impact**: Projects using snake_case model names will see different export names (breaking change for those projects). Projects using PascalCase models (recommended Prisma convention) will see no changes.

**Changed files:**

- `src/utils/naming.ts`: New naming utility
- `src/effect/generator.ts`: Updated to use PascalCase for all exports
- `src/__tests__/fixtures/test.prisma`: Added snake_case test model
- `src/__tests__/naming.test.ts`: New tests for naming utility
- `src/__tests__/generator.test.ts`: Added naming standardization tests

[1.4.0]: https://github.com/samuelho-dev/prisma-effect-kysely/compare/v1.3.1...v1.4.0

## [1.3.0] - 2025-01-09

### Added

- **Encoded type exports** - Generator now exports database-encoded types alongside application types
  - `{Model}SelectEncoded` - Database-encoded type for `Schema.Schema.Encoded<typeof Model.Selectable>`
  - `{Model}InsertEncoded` - Database-encoded type for `Schema.Schema.Encoded<typeof Model.Insertable>`
  - `{Model}UpdateEncoded` - Database-encoded type for `Schema.Schema.Encoded<typeof Model.Updateable>`
- Comprehensive test coverage for Encoded type exports

### Changed

- `generateTypeExports()` method now generates both Application and Encoded type exports
- Queries layer can now use proper Encoded types instead of `any` workarounds

### Why This Matters

Effect Schema has bidirectional transformations:

- **Application types** (`Schema.Schema.Type`) - Decoded types with `Date` objects (for repository layer)
- **Database types** (`Schema.Schema.Encoded`) - Encoded types with ISO strings (for queries layer)

Previously, only Application types were exported, forcing queries to use `any` types. Now both sides of the transformation are properly typed.

**Example Usage:**

```typescript
import { agentInsertEncoded } from '@libs/types';

// Queries layer - uses Encoded types (ISO strings)
insert: (rowData: agentInsertEncoded) => db.insertInto('agent').values(rowData);

// Repository layer - uses Application types (Date objects)
const input: CreateAgentInput = {
  /* ... Date objects ... */
};
const encoded = Schema.encode(AgentSchemas.Insertable)(input); // Encoded to ISO strings
```

[1.3.0]: https://github.com/samuelho-dev/prisma-effect-kysely/compare/v1.2.1...v1.3.0

## [1.2.1] - 2025-10-08

- Bump prisma 6.17

## [1.2.0] - 2025-10-08

### Changed

- Updated peer dependency to support Kysely ^0.28.0 (0.28.x versions)
- Updated dev dependency to Kysely 0.28.7 for testing
- No breaking changes to generated code or exported API

### Technical Details

- All Kysely imports are type-only (`ColumnType`, `Generated`, `Selectable`, `Insertable`, `Updateable`)
- No runtime Kysely code usage ensures compatibility across versions
- Comprehensive test suite validates compatibility with Kysely 0.28.x

[1.2.0]: https://github.com/samuelho-dev/prisma-effect-kysely/compare/v1.1.0...v1.2.0

## [1.0.2] - 2025-10-03

### Note

**Temporary release due to npm 24-hour republish restriction.**
This version will be unpublished and superseded by v1.0.0 within 24 hours.

### Fixed

- Export configuration to allow importing runtime helpers from main package entry point
- Clean dependency tree with minimal deprecation warnings

## [1.0.0] - 2025-10-02

### Added

- Initial release of Prisma Effect Schema Generator
- Type-safe generation of Effect Schema types from Prisma models
- Intelligent UUID detection with 4-tier strategy:
  - Native type detection via `@db.Uuid`
  - Documentation-based detection
  - Default value pattern matching
  - Field name pattern matching
- Complete Prisma type mappings to Effect Schema equivalents
- Support for Prisma enums with `@map` annotations
- Deterministic output with alphabetical sorting
- Zero type coercion with exact DMMF types
- Automated file generation (enums.ts, types.ts, index.ts)
- Comprehensive test suite with 100% coverage paths
- TypeScript strict mode compliance
- Prettier code formatting

### Features

- ✅ All Prisma scalar types supported (String, Int, Float, BigInt, Decimal, Boolean, DateTime, Json, Bytes)
- ✅ Array and optional field support
- ✅ Relation field exclusion (only scalar and enum fields included)
- ✅ Internal model filtering (models starting with `_`)
- ✅ DBSchema interface generation for type-safe database operations

[1.0.0]: https://github.com/samuelho-dev/prisma-effect-kysely/releases/tag/v1.0.0
