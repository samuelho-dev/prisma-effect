# AGENTS.md

Guidance for coding agents working in this repository. (See `CLAUDE.md` for the
full project reference — commands, architecture, the Effect 3→4 migration notes,
and the v4 API map. This file documents the vendored reference source.)

## Vendored reference source

This project vendors external source under `repos/` as **read-only reference
material** (via `git subtree`, not a submodule — no init needed).

- Use vendored source to learn idiomatic usage; never import from it or edit it.
- Prefer patterns from the vendored source over documentation or web search —
  the published Effect docs are for Effect 3 and are **wrong** for the Effect 4
  beta this project targets. The vendored source is the source of truth.
- `repos/` is excluded from TypeScript compilation, ESLint, Prettier, and the
  npm package (`files` allowlist). Do not add it to any `include`/`files` list.

For Schema work, start with the distilled cheat-sheet **`agent-patterns/effect-schema.md`**
(v4 constructors, filters, branding/`encodeKeys`, the v3→v4 traps, and this
package's `columnType`/`generated`/`Selectable` helpers), then drill into
`repos/effect` for exact signatures.

### `repos/effect/` — Effect v4 source (vendored from `Effect-TS/effect-smol`, branch `main`)

`effect@4.0.0-beta.x` is built from the `effect-smol` monorepo. When writing or
reviewing Effect code, inspect `repos/effect/packages/effect/src` (and
`.../test`) for real v4 API shapes, signatures, and idioms — do not infer them
from memory or v3 docs.

High-value files for this generator:

- `repos/effect/packages/effect/src/Schema.ts` — `Top`, `Bottom`, `Codec`,
  `Struct`, `brand`, `check`, `encodeKeys`, `Enum`, the `is*` filters. This is
  the file to consult for any `Schema.*` question. (`Top` is the structural base
  every schema must satisfy; `Bottom<...>` is its 15-param shape.)
- `repos/effect/packages/effect/src/SchemaAST.ts` — AST node types (`Objects`,
  `PropertySignature`, `resolve`, the `is*` guards). v4 reworked this heavily
  from v3.

### Effect 3 → 4 quick map (verified against the vendored source)

- `Schema.Schema<T,E,R>` → `Schema.Codec<T,E,RD,RE>`; `Schema.Schema.All` →
  `Schema.Top`; `Schema.Schema.Type<S>` → `Schema.Schema.Type<S>` (kept);
  `Schema.Codec.Encoded/DecodingServices/EncodingServices<S>` for the rest.
- `asSchema` → `revealCodec`; `.annotations({})` → `.annotate({})`.
- `Schema.DateFromSelf` → `Schema.Date`; `Schema.UUID` →
  `Schema.String.check(Schema.isUUID())`; `Schema.BigIntFromSelf` → `Schema.BigInt`.
- Filters moved under `.check(Schema.is*)` (e.g. `Schema.int()` →
  `Schema.check(Schema.isInt())`, `Schema.between(a,b)` →
  `Schema.check(Schema.isBetween({ minimum, maximum }))`).
- Variadic combinators take arrays: `Schema.Union(a,b)` → `Schema.Union([a,b])`,
  `Schema.Literal(a,b)` → `Schema.Literals([a,b])`, `Schema.Tuple(...)` → array.
- `Schema.Enums` → `Schema.Enum`; `Schema.propertySignature(...).pipe(Schema.fromKey(...))`
  → struct-level `Schema.encodeKeys({ tsName: "db_col" })`.

## Updating the vendored source

```bash
git subtree pull --prefix=repos/effect https://github.com/Effect-TS/effect-smol.git main --squash
```

Keep it roughly in sync with the `effect` beta the project pins (`devDependencies.effect`).
