import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generate } from '../generator/orchestrator';
import {
  collidingNamespaceContract,
  column,
  cyclicNamespaceContract,
  foreignKey,
  makeContract,
  model,
  scalar,
  twoNamespaceContract,
  valueObject,
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

  it('imports the inherited brand owner for cross-namespace variant references', async () => {
    const task = model('Task', {
      table: 'task',
      columns: { id: column('pg/uuid@1', 'uuid') },
      fields: { id: scalar('pg/uuid@1') },
      primaryKey: ['id'],
    });
    const bug = model('Bug', {
      table: 'bug',
      columns: { id: column('pg/uuid@1', 'uuid') },
      fields: {},
      primaryKey: ['id'],
      foreignKeys: [foreignKey('public', 'bug', 'id', 'public', 'task', 'id')],
    });
    const report = model('Report', {
      table: 'report',
      columns: {
        id: column('pg/uuid@1', 'uuid'),
        bugId: column('pg/uuid@1', 'uuid'),
      },
      fields: {
        id: scalar('pg/uuid@1'),
        bugId: scalar('pg/uuid@1'),
      },
      primaryKey: ['id'],
      foreignKeys: [foreignKey('audit', 'report', 'bugId', 'public', 'bug', 'id')],
    });
    const contract = join(temporaryDirectory, 'inherited-id.json');
    const inheritedOutput = join(temporaryDirectory, 'inherited-output');
    await writeFile(
      contract,
      JSON.stringify(
        makeContract({
          namespaces: {
            public: { models: [task, bug] },
            audit: { models: [report] },
          },
        })
      )
    );
    await generate({ contract, output: inheritedOutput, multiDomain: true });

    const types = await readFile(join(inheritedOutput, 'audit/types.ts'), 'utf8');
    expect(types).toContain('import { TaskId } from "../public/types.js";');
    expect(types).toContain('bugId: TaskId');
    expect(types).not.toContain('BugId');
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

  it('rejects namespace names that collide on case-insensitive filesystems', async () => {
    const contract = join(temporaryDirectory, 'case-collision.json');
    await writeFile(
      contract,
      JSON.stringify(makeContract({ namespaces: { Audit: {}, audit: {} } }))
    );

    await expect(
      generate({
        contract,
        output: join(temporaryDirectory, 'case-collision-output'),
        multiDomain: true,
      })
    ).rejects.toThrow(
      'Contract namespaces "Audit" and "audit" share an output directory on case-insensitive filesystems'
    );
  });

  it('removes an obsolete enum file on regeneration', async () => {
    const contract = join(temporaryDirectory, 'enum-removal.json');
    const regenerationOutput = join(temporaryDirectory, 'regeneration-output');
    await writeFile(contract, JSON.stringify(twoNamespaceContract()));
    await generate({ contract, output: regenerationOutput, multiDomain: true });
    expect(existsSync(join(regenerationOutput, 'public/enums.ts'))).toBe(true);

    const reference = (name: string) => ({
      nullable: false,
      type: { kind: 'valueObject' as const, name },
    });
    await writeFile(
      contract,
      JSON.stringify(
        makeContract({
          namespaces: {
            public: {
              valueObjects: [
                valueObject('A', { b: reference('B') }),
                valueObject('B', { a: reference('A') }),
              ],
            },
          },
        })
      )
    );
    await expect(
      generate({ contract, output: regenerationOutput, multiDomain: true })
    ).rejects.toThrow('Value object A forms a reference cycle');
    expect(existsSync(join(regenerationOutput, 'audit/types.ts'))).toBe(true);

    await writeFile(contract, JSON.stringify(makeContract({ namespaces: { public: {} } })));
    await generate({ contract, output: regenerationOutput, multiDomain: true });
    expect(existsSync(join(regenerationOutput, 'public/enums.ts'))).toBe(false);
    await expect(
      readFile(join(regenerationOutput, 'public/index.ts'), 'utf8')
    ).resolves.not.toContain('enums.js');
    expect(existsSync(join(regenerationOutput, 'audit'))).toBe(false);
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
