import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generate } from '../generator/orchestrator';
import {
  collidingNamespaceContract,
  cyclicNamespaceContract,
  makeContract,
  twoNamespaceContract,
} from './helpers/contract-mocks';

// Mock prettier
vi.mock('../utils/templates', () => ({
  formatCode: vi.fn((code: string) => Promise.resolve(code)),
}));

describe('multi-domain contract generation', () => {
  let temporaryDirectory: string;
  let output: string;
  let auditTypes: string;
  let auditIndex: string;
  let publicTypes: string;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'prisma-effect-kysely-domains-'));
    const contract = join(temporaryDirectory, 'two-namespace.json');
    output = join(temporaryDirectory, 'generated');
    await writeFile(contract, JSON.stringify(twoNamespaceContract()));
    await generate({ contract, output, multiDomain: true });

    [auditTypes, auditIndex, publicTypes] = await Promise.all([
      readFile(join(output, 'audit/types.ts'), 'utf8'),
      readFile(join(output, 'audit/index.ts'), 'utf8'),
      readFile(join(output, 'public/types.ts'), 'utf8'),
    ]);
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('writes one output directory per namespace', () => {
    expect(existsSync(join(output, 'public'))).toBe(true);
    expect(existsSync(join(output, 'audit'))).toBe(true);
  });

  it('imports cross-namespace branded IDs and enums', () => {
    expect(auditTypes).toContain('import { UserId } from "../public/types.js";');
    expect(auditTypes).toContain('import { Role } from "../public/enums.js";');
    expect(publicTypes).not.toContain('../audit');
  });

  it('quotes namespace-qualified database keys', () => {
    expect(auditTypes).toContain('"audit.audit_log": Schema.Schema.Type<typeof AuditLogTable>');
  });

  it('does not emit or re-export an absent namespace enum file', () => {
    expect(existsSync(join(output, 'audit/enums.ts'))).toBe(false);
    expect(auditIndex).not.toContain('enums.js');
    expect(auditIndex).toContain('export * from "./types.js";');
  });

  it('aliases cross-namespace symbols that collide with local declarations', async () => {
    const contract = join(temporaryDirectory, 'colliding-namespace.json');
    const collisionOutput = join(temporaryDirectory, 'colliding-output');
    await writeFile(contract, JSON.stringify(collidingNamespaceContract()));
    await generate({ contract, output: collisionOutput, multiDomain: true });

    const types = await readFile(join(collisionOutput, 'audit/types.ts'), 'utf8');
    expect(types).toContain('import { UserId as PublicUserId } from "../public/types.js";');
    expect(types).toContain('import { Role as PublicRole } from "../public/enums.js";');
    expect(types).toContain('actorId: PublicUserId');
    expect(types).toContain('role: PublicRole');
  });

  it('rejects namespace names that escape the output directory', async () => {
    const contract = join(temporaryDirectory, 'unsafe-namespace.json');
    await writeFile(contract, JSON.stringify(makeContract({ namespaces: { '../outside': {} } })));

    await expect(
      generate({
        contract,
        output: join(temporaryDirectory, 'safe-output'),
        multiDomain: true,
      })
    ).rejects.toThrow('Contract namespace "../outside" is not a safe output directory name');
  });

  it('removes an obsolete enum file on regeneration', async () => {
    const contract = join(temporaryDirectory, 'enum-removal.json');
    const regenerationOutput = join(temporaryDirectory, 'regeneration-output');
    await writeFile(contract, JSON.stringify(twoNamespaceContract()));
    await generate({ contract, output: regenerationOutput, multiDomain: true });
    expect(existsSync(join(regenerationOutput, 'public/enums.ts'))).toBe(true);

    await writeFile(contract, JSON.stringify(makeContract({ namespaces: { public: {} } })));
    await generate({ contract, output: regenerationOutput, multiDomain: true });
    expect(existsSync(join(regenerationOutput, 'public/enums.ts'))).toBe(false);
    await expect(
      readFile(join(regenerationOutput, 'public/index.ts'), 'utf8')
    ).resolves.not.toContain('enums.js');
  });

  it('rejects cyclic cross-namespace branded-ID imports', async () => {
    const contract = join(temporaryDirectory, 'cyclic-namespace.json');
    await writeFile(contract, JSON.stringify(cyclicNamespaceContract()));

    await expect(
      generate({
        contract,
        output: join(temporaryDirectory, 'cyclic-output'),
        multiDomain: true,
      })
    ).rejects.toThrow(
      'Cross-namespace foreign keys form an import cycle (audit ↔ public); generate without --multi-domain'
    );
  });
});
