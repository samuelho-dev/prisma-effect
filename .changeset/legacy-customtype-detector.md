---
'prisma-effect-kysely': patch
---

Warn on Effect 3 syntax in `@customType` annotations.

`@customType(...)` expressions are emitted verbatim, so an Effect 3 expression
(e.g. `Schema.Number.pipe(Schema.int(), Schema.between(1, 5))` or the variadic
`Schema.Union(A, B)`) compiles against Effect 3 but breaks against Effect 4. The
generator now scans `@customType` strings at `prisma generate` time and prints a
warning that names the field and the v4 replacement — for filters
(`Schema.int()` → `Schema.check(Schema.isInt())`, `Schema.between(a, b)` →
`Schema.check(Schema.isBetween({ minimum, maximum }))`, etc.), variadic
combinators (`Schema.Union(a, b)` → `Schema.Union([a, b])`), and removed schemas
(`Schema.UUID`, `Schema.DateFromSelf`). It only warns; it never rewrites the
expression (regex-transforming arbitrary user TypeScript is unsafe).

Also bumps the dev/test Effect pin to `4.0.0-beta.70` and documents that
consumers must pin the exact `6.0.0-next.x` version — a `"*"` range resolves to
the stable `5.x` line because npm/pnpm exclude prereleases from version ranges.
