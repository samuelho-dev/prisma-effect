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
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from '../src/generator/orchestrator.js';

const repoRoot = join(import.meta.dirname, '..');
const fixture = join(repoRoot, 'src/__tests__/fixtures/prisma8/contract.json');

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'pek-emit-'));
  const out = join(dir, 'generated');
  await generate({ contract: fixture, output: out });

  const typesFile = readFileSync(join(out, 'types.ts'), 'utf-8');
  const enumsFile = readFileSync(join(out, 'enums.ts'), 'utf-8');

  // Type-check generated output with a local alias so the package resolves to src.
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
  console.log('--- emitted enums.ts ---\n' + enumsFile + '\n');
  console.log('temp dir:', dir);

  try {
    execSync(`npx tsc --noEmit -p ${join(dir, 'tsconfig.json')}`, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    console.log('\nemitted output type-checks against installed Effect');
  } catch {
    console.error('\nemitted output FAILED to type-check');
    process.exit(1);
  }
}

void main();
