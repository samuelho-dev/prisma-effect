---
"prisma-effect-kysely": minor
---

Generate Prisma enums as `Schema.Literals` instead of `Schema.Enum`.

`Schema.Literals` is the canonical Effect-v4 way to model a finite string set: its Type AND Encoded
are the string literal union, so an enum column reads/writes as a plain string (Kysely-native, no
`MyEnum.member` juggling) and the domain type is a literal union. `Schema.Enum` (Type == the TS enum
object) is reserved for interop with a pre-existing TS enum and forced enum-member values in queries.
The generated output no longer emits a `TypeScript enum` — just `export const X = Schema.Literals([...])`
+ `export type X = typeof X.Type`.

BREAKING: consumers referencing the generated `XEnum` TS enum (e.g. `Status.ACTIVE`) must switch to
the string literal (`"ACTIVE"`).
