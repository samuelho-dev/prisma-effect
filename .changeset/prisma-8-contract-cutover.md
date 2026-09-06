---
'prisma-effect-kysely': major
---

Replace the Prisma 7 generator protocol with a Prisma 8 contract CLI and programmatic `generate` API. Generate from `contract.json` using `prisma-effect-kysely --contract <path> --output <dir>`; Prisma 7 generator blocks remain supported by the 6.x release line.

Prisma-applied ID generators such as `@default(uuid())` are now insertable in Kysely because Prisma 8 contracts correctly distinguish them from database defaults.
