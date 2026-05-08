/**
 * DB Interface SQL Contract Tests
 *
 * Regression tests for the bug where the generated DB interface used
 * `Schema.Schema.Type<typeof X>` instead of `Schema.Schema.Encoded<typeof X>`.
 *
 * The bug: for tables using `Schema.fromKey` mapping (Prisma implicit M:N
 * join tables, where TS field `product_id` maps to DB column `A`), the
 * Type side has the decoded names (`product_id`) while the Encoded side
 * has the real DB column names (`A`). Kysely uses the TS interface as
 * the SQL contract — it does NOT decode through the Effect schema.
 * So the interface MUST expose Encoded.
 *
 * Symptom that triggered this fix (2026-05-08):
 *   PostgresError: column _product_tags.product_tag_id does not exist
 *
 * Why string-grep tests didn't catch the original bug:
 * They asserted the schema was emitted (it was), they asserted fromKey
 * mapping was present (it was), but no test asserted the DB interface
 * exposed the actual SQL column names. This file fixes that gap.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GeneratorOptions } from '@prisma/generator-helper';
import prismaInternals from '@prisma/internals';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { Schema } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GeneratorOrchestrator } from '../generator/orchestrator';
import { columnType } from '../kysely/helpers';

const { getDMMF } = prismaInternals;

// Mock prettier to avoid dynamic import issues
vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

describe('DB interface — SQL contract', () => {
  // Schema with two M2M relations — one auto-generated implicit join,
  // one with a custom @relation name.
  const testSchema = `
    datasource db {
      provider = "postgresql"
    }

    generator effectSchemas {
      provider = "prisma-effect-kysely"
      output   = "./test-db-interface-sql-contract"
    }

    model Product {
      id   String       @id @db.Uuid
      tags ProductTag[]
    }

    model ProductTag {
      id       String    @id @db.Uuid
      products Product[]
    }

    model User {
      id        String     @id @db.Uuid
      following User[]     @relation("UserFollows")
      followers User[]     @relation("UserFollows")
    }
  `;

  const outputDir = path.join(import.meta.dirname, 'test-db-interface-sql-contract');

  beforeAll(async () => {
    const dmmf = await getDMMF({ datamodel: testSchema });
    const options: GeneratorOptions = {
      generator: { output: { value: outputDir } },
      dmmf,
    } as GeneratorOptions;
    const orchestrator = new GeneratorOrchestrator(options);
    await orchestrator.generate(options);
  });

  afterAll(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('uses Schema.Schema.Type for regular tables and Schema.Schema.Encoded for join tables', async () => {
    const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

    const dbBlock = typesContent.match(/export interface DB\s*\{([\s\S]+?)\n\}/);
    expect(dbBlock).toBeTruthy();
    const dbBody = dbBlock?.[1] ?? '';

    // Regular tables: Type preserves branded IDs (string & Brand<...>).
    // Encoded would strip the brand.
    expect(dbBody).toMatch(/Product:\s*Schema\.Schema\.Type<typeof Product>/);
    expect(dbBody).toMatch(/ProductTag:\s*Schema\.Schema\.Type<typeof ProductTag>/);
    expect(dbBody).toMatch(/User:\s*Schema\.Schema\.Type<typeof User>/);

    // Join tables: Encoded preserves real DB column names (A, B).
    // Type would expose Schema.fromKey-decoded names that Kysely would
    // pass to Postgres verbatim → "column does not exist".
    expect(dbBody).toMatch(
      /_ProductToProductTag:\s*Schema\.Schema\.Encoded<typeof ProductToProductTag>/
    );
  });

  it('exposes the real Postgres A/B columns for implicit M:N join tables', async () => {
    const typesContent = await fs.readFile(path.join(outputDir, 'types.ts'), 'utf-8');

    // The schema itself uses Schema.fromKey to map A→product_id, B→product_tag_id.
    // That mapping is correct for app-level decoding.
    expect(typesContent).toMatch(/Schema\.fromKey\("A"\)/);
    expect(typesContent).toMatch(/Schema\.fromKey\("B"\)/);

    // But the DB interface entry MUST go through Encoded so Kysely sees A/B.
    // (Schema.Schema.Type would expose product_id/product_tag_id, which Kysely
    // would pass to Postgres verbatim → "column does not exist".)
    expect(typesContent).toMatch(
      /_ProductToProductTag:\s*Schema\.Schema\.Encoded<typeof ProductToProductTag>/
    );
  });

  it('produces SQL referencing the real A/B columns (Kysely compile check)', () => {
    // Recreate the generated schema shape locally — this is what the codegen
    // emits for an implicit M:N join table. Validates that with our
    // generator's Encoded-side DB interface, Kysely emits SQL that targets
    // the actual Postgres columns ("A", "B"), not the Schema.fromKey-decoded
    // names ("product_id", "product_tag_id").
    const ProductToProductTag = Schema.Struct({
      product_id: Schema.propertySignature(
        columnType(Schema.UUID, Schema.Never, Schema.Never)
      ).pipe(Schema.fromKey('A')),
      product_tag_id: Schema.propertySignature(
        columnType(Schema.UUID, Schema.Never, Schema.Never)
      ).pipe(Schema.fromKey('B')),
    });

    interface DB {
      _ProductToProductTag: Schema.Schema.Encoded<typeof ProductToProductTag>;
    }

    const db = new Kysely<DB>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });

    // Realistic query that the wishlist / catalog services issue.
    const compiled = db
      .selectFrom('_ProductToProductTag')
      .where('A', '=', '00000000-0000-0000-0000-000000000000')
      .selectAll()
      .compile();

    // SQL must reference A — NOT product_id.
    expect(compiled.sql).toMatch(/"A"\s*=/);
    expect(compiled.sql).not.toMatch(/product_id/);
    expect(compiled.sql).not.toMatch(/product_tag_id/);
  });
});
