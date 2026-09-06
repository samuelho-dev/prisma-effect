import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const fixtureDir = join(repoRoot, 'src/__tests__/fixtures/prisma8');
const committed = join(fixtureDir, 'contract.json');
const output = mkdtempSync(join(tmpdir(), 'pek-fixture-'));

try {
  const emitted = spawnSync(
    'bunx',
    [
      'prisma',
      'contract',
      'emit',
      '--config',
      join(fixtureDir, 'prisma.config.ts'),
      '--output-path',
      output,
    ],
    {
      cwd: fixtureDir,
      env: { ...process.env, CI: '1' },
      stdio: 'inherit',
    }
  );

  if (emitted.status !== 0) {
    process.exitCode = emitted.status ?? 1;
  } else {
    const generated = join(output, 'contract.json');
    if (!readFileSync(committed).equals(readFileSync(generated))) {
      console.error('\nPrisma fixture drift detected:');
      spawnSync('diff', ['-u', committed, generated], { stdio: 'inherit' });
      console.error('\nRun `bun run fixture:emit` and commit the updated contract.json.');
      process.exitCode = 1;
    } else {
      console.log('Prisma fixture is up to date.');
    }
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
