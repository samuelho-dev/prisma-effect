import { mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { EffectGenerator } from '../effect/generator.js';
import { KyselyGenerator } from '../kysely/generator.js';
import { readContract } from '../prisma/contract.js';
import { buildModelSet, type ContractModelSet, type TableField } from '../prisma/model.js';
import { detectLegacyEffectV3Syntax, parseCustomTypeAnnotations } from '../utils/annotations.js';
import { FileManager } from '../utils/file-manager.js';
import { toPascalCase } from '../utils/naming.js';

export interface GenerateOptions {
  contract: string;
  output: string;
  source?: string;
  multiDomain?: boolean;
}

function addImport(imports: Map<string, string[]>, specifier: string, name: string): void {
  const names = imports.get(specifier);
  if (names) {
    names.push(name);
  } else {
    imports.set(specifier, [name]);
  }
}

function bindImport(
  imports: Map<string, string[]>,
  bindings: Map<string, string>,
  usedNames: Set<string>,
  specifier: string,
  targetNamespace: string,
  importedName: string
): string {
  const key = `${specifier}\0${importedName}`;
  const existing = bindings.get(key);
  if (existing) return existing;

  let localName = importedName;
  if (usedNames.has(localName)) {
    const base = `${toPascalCase(targetNamespace)}${importedName}`;
    localName = base;
    let suffix = 2;
    while (usedNames.has(localName)) {
      localName = `${base}${suffix}`;
      suffix++;
    }
  }

  usedNames.add(localName);
  bindings.set(key, localName);
  addImport(
    imports,
    specifier,
    localName === importedName ? importedName : `${importedName} as ${localName}`
  );
  return localName;
}

function warnLegacyAnnotations(overrides: ReadonlyMap<string, string>): void {
  const warnings: string[] = [];
  for (const [field, override] of overrides) {
    for (const hint of detectLegacyEffectV3Syntax(override)) {
      warnings.push(`  ${field}: ${hint}`);
    }
  }
  if (warnings.length > 0) {
    console.warn(
      `[prisma-effect-kysely] @customType annotations use Effect 3 syntax that does not ` +
        `compile against Effect 4. Update them in your Prisma schema:\n${warnings.join('\n')}`
    );
  }
}

async function readOverrides(options: GenerateOptions): Promise<Map<string, string>> {
  const sourcePath = options.source ?? join(dirname(options.contract), 'contract.prisma');
  try {
    const overrides = parseCustomTypeAnnotations(await readFile(sourcePath, 'utf8'));
    warnLegacyAnnotations(overrides);
    return overrides;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      if (options.source !== undefined) {
        throw new Error(`Contract source not found at ${sourcePath}`, { cause: error });
      }
      return new Map();
    }
    throw error;
  }
}

async function writeGeneratedOutput(
  output: string,
  modelSet: ContractModelSet,
  imports: ReadonlyMap<string, readonly string[]>,
  references: ReadonlyMap<TableField, string>,
  overrides: ReadonlyMap<string, string>
): Promise<string[]> {
  const fileManager = new FileManager(output);
  const effectGenerator = new EffectGenerator(modelSet);
  const kyselyGenerator = new KyselyGenerator();
  const files: string[] = [];
  await fileManager.ensureDirectory();

  if (modelSet.enums.length > 0) {
    await fileManager.writeFile('enums.ts', effectGenerator.generateEnums());
    files.push(join(output, 'enums.ts'));
  } else {
    await rm(join(output, 'enums.ts'), { force: true });
  }

  let types = effectGenerator.generateTypesHeader(imports);
  const brandedIds = modelSet.models
    .map((model) => effectGenerator.generateBrandedIdSchema(model))
    .filter((schema): schema is string => schema !== null)
    .join('\n\n');
  if (brandedIds) {
    types += `\n\n// ===== Branded ID Schemas =====\n${brandedIds}`;
  }

  const valueObjects = effectGenerator.generateValueObjectSchemas(references);
  if (valueObjects) {
    types += `\n\n// ===== Value Object Schemas =====\n${valueObjects}`;
  }

  const modelSchemas = modelSet.models
    .map((model) => effectGenerator.generateModelSchema(model, overrides, references))
    .join('\n\n');
  types += `\n\n// ===== Model Schemas =====\n${modelSchemas}`;
  types += `\n\n${kyselyGenerator.generateDBInterface(modelSet.models)}`;
  await fileManager.writeFile('types.ts', types);
  files.push(join(output, 'types.ts'));

  await fileManager.writeFile(
    'index.ts',
    kyselyGenerator.generateIndexFile(modelSet.enums.length > 0)
  );
  files.push(join(output, 'index.ts'));
  return files;
}

function assertSafeNamespaceIds(namespaceIds: readonly string[]): void {
  const seen = new Map<string, string>();
  for (const namespaceId of namespaceIds) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(namespaceId)) {
      throw new Error(
        `Contract namespace ${JSON.stringify(namespaceId)} is not a safe output directory name`
      );
    }
    const folded = namespaceId.toLowerCase();
    const previous = seen.get(folded);
    if (previous) {
      throw new Error(
        `Contract namespaces ${JSON.stringify(previous)} and ${JSON.stringify(namespaceId)} share an output directory on case-insensitive filesystems`
      );
    }
    seen.set(folded, namespaceId);
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error ? String(error.code) : undefined;
}

const GENERATED_FILE_NAMES = new Set(['types.ts', 'enums.ts', 'index.ts']);

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

async function generatedFilesIn(directory: string, prefix = ''): Promise<string[]> {
  try {
    if (!(await readFile(join(directory, 'types.ts'), 'utf8')).includes('DO NOT EDIT MANUALLY')) {
      return [];
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return [];
    throw error;
  }

  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && GENERATED_FILE_NAMES.has(entry.name))
    .map((entry) => join(prefix, entry.name));
}

async function collectGeneratedFiles(output: string): Promise<string[]> {
  const files = await generatedFilesIn(output);
  let entries;
  try {
    entries = await readdir(output, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...(await generatedFilesIn(join(output, entry.name), entry.name)));
    }
  }
  return files;
}

async function installGeneratedOutput(
  staging: string,
  output: string,
  stagedFiles: readonly string[]
): Promise<string[]> {
  const expected = stagedFiles.map((file) => relative(staging, file));
  const existing = new Set(await collectGeneratedFiles(output));
  for (const file of expected) {
    if (await pathExists(join(output, file))) existing.add(file);
  }

  const backup = await mkdtemp(join(dirname(output), `.${basename(output)}-backup-`));
  const backedUp: string[] = [];
  const installed: string[] = [];
  try {
    for (const file of existing) {
      await mkdir(dirname(join(backup, file)), { recursive: true });
      await rename(join(output, file), join(backup, file));
      backedUp.push(file);
    }
    for (const file of expected) {
      await mkdir(dirname(join(output, file)), { recursive: true });
      await rename(join(staging, file), join(output, file));
      installed.push(file);
    }
  } catch (error) {
    try {
      await Promise.all(installed.map((file) => rm(join(output, file), { force: true })));
      for (const file of backedUp.reverse()) {
        await mkdir(dirname(join(output, file)), { recursive: true });
        await rename(join(backup, file), join(output, file));
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Generated output installation and rollback failed; backup retained at ${backup}`,
        { cause: rollbackError }
      );
    }
    await rm(backup, { recursive: true, force: true });
    throw error;
  }
  await rm(backup, { recursive: true, force: true });

  const expectedSet = new Set(expected);
  const obsoleteDirectories = new Set(
    [...existing]
      .filter((file) => !expectedSet.has(file))
      .map((file) => dirname(file))
      .filter((directory) => directory !== '.')
  );
  for (const directory of obsoleteDirectories) {
    try {
      await rmdir(join(output, directory));
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY'].includes(errorCode(error) ?? '')) throw error;
    }
  }
  return expected;
}

function assertNoCrossNamespaceCycles(modelSet: ContractModelSet): void {
  const graph = new Map<string, Set<string>>();
  for (const model of modelSet.models) {
    const targets = graph.get(model.namespaceId) ?? new Set<string>();
    graph.set(model.namespaceId, targets);
    for (const field of model.fields) {
      if (field.fkTarget && field.fkTarget.idNamespaceId !== model.namespaceId) {
        targets.add(field.fkTarget.idNamespaceId);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (namespaceId: string): void => {
    if (visited.has(namespaceId)) return;
    visiting.add(namespaceId);
    for (const target of [...(graph.get(namespaceId) ?? [])].sort()) {
      if (visiting.has(target)) {
        const [left, right] = [namespaceId, target].sort();
        throw new Error(
          `Cross-namespace foreign keys form an import cycle (${left} ↔ ${right}); generate without --multi-domain`
        );
      }
      visit(target);
    }
    visiting.delete(namespaceId);
    visited.add(namespaceId);
  };

  for (const namespaceId of [...graph.keys()].sort()) visit(namespaceId);
}

interface NamespaceReferences {
  imports: Map<string, string[]>;
  fields: Map<TableField, string>;
}

function collectNamespaceReferences(
  namespaceId: string,
  modelSet: ContractModelSet
): NamespaceReferences {
  const imports = new Map<string, string[]>();
  const fields = new Map<TableField, string>();
  const bindings = new Map<string, string>();
  const usedNames = new Set<string>();
  const models = modelSet.models.filter((model) => model.namespaceId === namespaceId);
  const enums = modelSet.enums.filter((enumModel) => enumModel.namespaceId === namespaceId);
  const valueObjects = modelSet.valueObjects.filter(
    (valueObject) => valueObject.namespaceId === namespaceId
  );

  for (const model of models) {
    usedNames.add(model.schemaName);
    usedNames.add(`${model.schemaName}Table`);
    if (model.brandedId) usedNames.add(`${model.schemaName}Id`);
  }
  for (const enumModel of enums) usedNames.add(enumModel.schemaName);
  for (const valueObject of valueObjects) usedNames.add(valueObject.schemaName);

  if (enums.length > 0) {
    imports.set(
      './enums.js',
      enums.map((enumModel) => enumModel.schemaName)
    );
  }

  for (const field of [
    ...models.flatMap((model) => model.fields),
    ...valueObjects.flatMap((valueObject) => valueObject.fields),
  ]) {
    if (field.kind.type === 'enum' && field.kind.namespaceId !== namespaceId) {
      fields.set(
        field,
        bindImport(
          imports,
          bindings,
          usedNames,
          `../${field.kind.namespaceId}/enums.js`,
          field.kind.namespaceId,
          toPascalCase(field.kind.enumName)
        )
      );
    }
    if (field.fkTarget && field.fkTarget.idNamespaceId !== namespaceId) {
      fields.set(
        field,
        bindImport(
          imports,
          bindings,
          usedNames,
          `../${field.fkTarget.idNamespaceId}/types.js`,
          field.fkTarget.idNamespaceId,
          `${toPascalCase(field.fkTarget.idModel)}Id`
        )
      );
    }
  }
  return { imports, fields };
}

export async function generate(options: GenerateOptions): Promise<{ files: string[] }> {
  const contract = await readContract(options.contract);
  const namespaceIds = Object.keys(contract.domain.namespaces).sort();
  if (options.multiDomain) assertSafeNamespaceIds(namespaceIds);
  const modelSet = buildModelSet(contract, options.multiDomain ?? false);
  const overrides = await readOverrides(options);
  if (options.multiDomain) assertNoCrossNamespaceCycles(modelSet);

  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(join(dirname(output), `.${basename(output)}-staging-`));
  let stagedFiles: string[] = [];

  try {
    if (!options.multiDomain) {
      const imports = new Map<string, string[]>();
      if (modelSet.enums.length > 0) {
        imports.set(
          './enums.js',
          modelSet.enums.map((enumModel) => enumModel.schemaName)
        );
      }
      stagedFiles = await writeGeneratedOutput(staging, modelSet, imports, new Map(), overrides);
    } else {
      for (const namespaceId of namespaceIds) {
        const namespaceSet: ContractModelSet = {
          models: modelSet.models.filter((model) => model.namespaceId === namespaceId),
          enums: modelSet.enums.filter((enumModel) => enumModel.namespaceId === namespaceId),
          valueObjects: modelSet.valueObjects.filter(
            (valueObject) => valueObject.namespaceId === namespaceId
          ),
        };
        const references = collectNamespaceReferences(namespaceId, modelSet);
        stagedFiles.push(
          ...(await writeGeneratedOutput(
            join(staging, namespaceId),
            namespaceSet,
            references.imports,
            references.fields,
            overrides
          ))
        );
      }
    }

    const files = (await installGeneratedOutput(staging, output, stagedFiles)).map((file) =>
      join(options.output, file)
    );
    console.log(`prisma-effect-kysely: wrote ${files.length} files to ${options.output}`);
    return { files };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
