---
'prisma-effect-kysely': patch
---

Fix Insertable/Updateable semantics surfaced by validation of the Effect 4 beta line:

- **`Insertable` now accepts an explicit `null` for nullable columns.** A
  `Schema.NullOr(T)` field is optional on insert and retains `null` in its type,
  so `{ col: null }` (set the column to NULL) decodes successfully — matching SQL
  and Kysely's `Insertable`, which permit omit / value / explicit null. Previously
  `null` was stripped and an explicit `null` was rejected at decode.
- **Implicit many-to-many join-table FK columns are now insertable.** They emit
  `columnType(Id, Id, Never)` instead of `columnType(Id, Never, Never)`: the
  foreign keys are provided on INSERT (you supply both keys when linking a row)
  and read-only on UPDATE (a composite-PK join row is inserted/deleted, not
  updated). Previously `Insertable<JoinTable>` resolved to an empty `{}`, making
  join rows impossible to insert through the generated types.
- **Internal robustness:** Generated-field detection is gated on the `GeneratedId`
  annotation rather than a bare `.from` property, so a `Schema.encodeKeys(...)`
  transform nested as a struct field (which also exposes `.from`) is no longer
  misclassified as a generated field.
