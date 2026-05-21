/**
 * Phase-5 output validity guard.
 *
 * Generates the Effect-schema output for the test fixture, writes it to a temp
 * directory, and type-checks the emitted code against the *installed* Effect
 * version. The unit tests only string-match the emitted output — this script is
 * the only thing that proves the generated code actually compiles.
 *
 * Run: bun run scripts/emit-compile-check.ts
 */
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import prismaInternals from '@prisma/internals';
import { EffectGenerator } from '../src/effect/generator.js';
import { generateDBInterface } from '../src/kysely/type.js';
import { PrismaGenerator } from '../src/prisma/generator.js';
import { detectImplicitManyToMany } from '../src/prisma/relation.js';

const { getDMMF } = prismaInternals;

const repoRoot = join(import.meta.dirname, '..');
const fixture = join(repoRoot, 'src/__tests__/fixtures/test.prisma');

async function main() {
  const datamodel = readFileSync(fixture, 'utf-8');
  const dmmf = await getDMMF({ datamodel });

  const gen = new EffectGenerator(dmmf);
  // Use the same field-selection the orchestrator uses in production, so the
  // emitted output (and this compile check) matches what `prisma generate`
  // actually produces — `getModelFields` filters out relation (`kind: 'object'`)
  // fields, which are not DB columns and must not appear in the schema.
  const prismaGen = new PrismaGenerator(dmmf);
  const models = dmmf.datamodel.models;
  const enums = dmmf.datamodel.enums;
  const joinTables = detectImplicitManyToMany(dmmf.datamodel.models);

  const hasEnums = enums.length > 0;

  // enums.ts
  const enumsFile = hasEnums ? gen.generateEnums(enums) : '';

  // types.ts: header + branded ids + model schemas + join tables + DB interface
  const parts: string[] = [gen.generateTypesHeader(hasEnums)];
  for (const model of models) {
    const fields = prismaGen.getModelFields(model);
    const branded = gen.generateBrandedIdSchema(model, fields);
    if (branded) parts.push(branded);
    parts.push(gen.generateModelSchema(model, fields));
  }
  if (joinTables.length > 0) parts.push(gen.generateJoinTableSchemas(joinTables));
  parts.push(generateDBInterface(models, joinTables));
  const typesFile = parts.join('\n\n');

  // Write to temp dir with a local alias so `prisma-effect-kysely` resolves to src.
  const dir = mkdtempSync(join(tmpdir(), 'pek-emit-'));
  const out = join(dir, 'generated');
  mkdirSync(out, { recursive: true });
  if (hasEnums) writeFileSync(join(out, 'enums.ts'), enumsFile);
  writeFileSync(join(out, 'types.ts'), typesFile);

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      exactOptionalPropertyTypes: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      ignoreDeprecations: '6.0',
      baseUrl: dir,
      paths: {
        'prisma-effect-kysely': [join(repoRoot, 'src/runtime/index.ts')],
        effect: [join(repoRoot, 'node_modules/effect/dist/index.d.ts')],
        'effect/*': [join(repoRoot, 'node_modules/effect/dist/*')],
      },
    },
    include: [join(out, '**/*.ts')],
  };
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  console.log('--- emitted types.ts ---\n' + typesFile + '\n');
  if (hasEnums) console.log('--- emitted enums.ts ---\n' + enumsFile + '\n');
  console.log('temp dir:', dir);

  try {
    execSync(`npx tsc --noEmit -p ${join(dir, 'tsconfig.json')}`, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    console.log('\n✅ emitted output type-checks against installed Effect');
  } catch {
    console.error('\n❌ emitted output FAILED to type-check');
    process.exit(1);
  }
}

void main();
