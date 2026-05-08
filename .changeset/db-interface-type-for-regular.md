---
"prisma-effect-kysely": minor
---

fix: regular tables in DB interface use `Schema.Schema.Type`, join tables use `Schema.Schema.Encoded`

5.7.0 flipped the DB interface to `Schema.Schema.Encoded` for **all** tables to fix the join-table column-name bug (`_product_tags.product_id` was decoded-name; SQL needs `A`). That was the right fix for join tables but accidentally **stripped branded IDs** for regular tables — `Schema.Schema.Encoded<typeof X>` strips `Schema.brand(...)` because brands live on the Type side.

Concrete consequence: every Kysely consumer queried `result.seller_id: string` instead of `result.seller_id: string & Brand<"SellerId">`. Branded ID type safety silently disabled across the entire monorepo.

Fix: the two table categories need different treatment.

- **Regular tables**: `Schema.Schema.Type<typeof X>` — preserves branded IDs (`string & Brand<"SellerId">`) and the `ColumnType<S, I, U>` `__select__`/`__insert__`/`__update__` phantoms. Type === Encoded for column names anyway because regular tables don't use `Schema.fromKey`.
- **Join tables**: `Schema.Schema.Encoded<typeof X>` — only join tables use `Schema.fromKey('A')` to remap DB columns `A`/`B` to semantic names. Type would expose the decoded names that Kysely passes to SQL verbatim → "column does not exist". Encoded preserves real column names.

Effectively: pick the side that matches the *intended consumer view*. For non-`fromKey` tables, that's the Type side (richer info, brand info preserved). For `fromKey` tables, that's the Encoded side (matches DB).

**Migration**: regular-table consumers regain `Brand<...>` IDs immediately. Join-table consumers (`_product_tags.A`/`B` queries) unchanged from 5.7.0 — those still expose real DB column names.
