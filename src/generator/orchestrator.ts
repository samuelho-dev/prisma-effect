import type { GeneratorOptions } from '@prisma/generator-helper';
import { EffectGenerator } from '../effect/generator.js';
import { KyselyGenerator } from '../kysely/generator.js';
import { PrismaGenerator } from '../prisma/generator.js';
import { detectLegacyEffectV3Syntax, extractEffectTypeOverride } from '../utils/annotations.js';
import { FileManager } from '../utils/file-manager.js';
import {
  type GeneratorConfig,
  isMultiDomainEnabled,
  isScaffoldingEnabled,
  parseGeneratorConfig,
} from './config.js';
import { logScaffoldResults, scaffoldContractLibraries } from './contract-scaffolder.js';
import { type DomainInfo, detectDomains } from './domain-detector.js';

/**
 * Orchestrates the generation of Effect Schema types from Prisma schema
 * Uses domain-driven generators: Prisma → Effect → Kysely
 *
 * Supports two modes:
 * 1. Single output (default): All schemas in one directory
 * 2. Multi-domain: Separate contract libraries per domain
 */
export class GeneratorOrchestrator {
  private readonly config: GeneratorConfig;
  private readonly fileManager: FileManager;
  private readonly prismaGen: PrismaGenerator;
  private readonly effectGen: EffectGenerator;
  private readonly kyselyGen: KyselyGenerator;

  constructor(options: GeneratorOptions) {
    this.config = parseGeneratorConfig(options);

    this.fileManager = new FileManager(this.config.output);
    this.prismaGen = new PrismaGenerator(options.dmmf);
    this.effectGen = new EffectGenerator(options.dmmf);
    this.kyselyGen = new KyselyGenerator(options.dmmf);
  }

  /**
   * Main generation entry point
   * Orchestrates all generation steps
   *
   * Flow:
   * 1. Detect domains if multi-domain mode enabled
   * 2. Scaffold contract libraries if scaffolding enabled
   * 3. Generate schemas (single or per-domain)
   */
  async generate(options: GeneratorOptions) {
    this.logStart(options);
    this.warnLegacyAnnotations(options);

    // Check if multi-domain mode is enabled
    if (isMultiDomainEnabled(this.config)) {
      await this.generateMultiDomain(options);
    } else {
      await this.generateSingleOutput();
    }

    this.logComplete();
  }

  /**
   * Generate schemas in single-output mode (default)
   * All schemas in one directory
   */
  private async generateSingleOutput() {
    // Ensure output directory exists
    await this.fileManager.ensureDirectory();

    // Generate all files in parallel for better performance
    await Promise.all([this.generateEnums(), this.generateTypes(), this.generateIndex()]);
  }

  /**
   * Generate schemas in multi-domain mode
   * Separate contract libraries per domain
   */
  private async generateMultiDomain(options: GeneratorOptions) {
    // 1. Detect domains from schema structure
    const schemaPath = options.schemaPath;
    const domains = detectDomains(options.dmmf, schemaPath);

    // 2. Scaffold contract libraries if enabled
    if (isScaffoldingEnabled(this.config)) {
      const scaffoldResults = await scaffoldContractLibraries(domains, this.config);
      logScaffoldResults(scaffoldResults);
    }

    // 3. Generate schemas for each domain
    for (const domain of domains) {
      await this.generateForDomain(domain);
    }
  }

  /**
   * Generate schemas for a specific domain
   */
  private async generateForDomain(domain: DomainInfo) {
    const domainOutputPath = `${this.config.output}/${domain.name}/src/generated`;
    const domainFileManager = new FileManager(domainOutputPath);

    await domainFileManager.ensureDirectory();

    // Generate enums (shared across all domains for now)
    const enums = this.prismaGen.getEnums();
    if (enums.length > 0) {
      const enumsContent = this.effectGen.generateEnums(enums);
      await domainFileManager.writeFile('enums.ts', enumsContent);
    }

    // Generate types for this domain's models only
    const joinTables = this.prismaGen.getManyToManyJoinTables();
    const hasEnums = enums.length > 0;

    // Filter join tables to only those relevant to this domain
    const domainJoinTables = joinTables.filter((jt) =>
      domain.models.some((m) => m.name === jt.modelA || m.name === jt.modelB)
    );

    // Generate header with imports
    const header = this.effectGen.generateTypesHeader(hasEnums);

    // PHASE 1: Generate ALL branded ID schemas first (before any model structs)
    const allBrandedIdSchemas = domain.models
      .map((model) => {
        const fields = this.prismaGen.getModelFields(model);
        return this.effectGen.generateBrandedIdSchema(model, fields);
      })
      .filter((schema): schema is string => schema !== null)
      .join('\n\n');

    // PHASE 2: Generate model schemas (just User = Schema.Struct({...}))
    const modelSchemas = domain.models
      .map((model) => {
        const fields = this.prismaGen.getModelFields(model);
        return this.effectGen.generateModelSchema(model, fields);
      })
      .join('\n\n');

    // Generate join table schemas for this domain
    const joinTableSchemas =
      domainJoinTables.length > 0 ? this.effectGen.generateJoinTableSchemas(domainJoinTables) : '';

    // Generate DB interface for this domain (uses Selectable<Model> pattern)
    const dbInterface = this.kyselyGen.generateDBInterface(domain.models, domainJoinTables);

    // Assemble content with proper spacing
    let content = `${header}`;
    if (allBrandedIdSchemas) {
      content += `\n\n// ===== Branded ID Schemas =====\n${allBrandedIdSchemas}`;
    }
    content += `\n\n// ===== Model Schemas =====\n${modelSchemas}`;
    if (joinTableSchemas) {
      content += `\n\n${joinTableSchemas}`;
    }
    content += `\n\n${dbInterface}`;

    await domainFileManager.writeFile('types.ts', content);

    // Generate index file
    const indexContent = this.kyselyGen.generateIndexFile();
    await domainFileManager.writeFile('index.ts', indexContent);
  }

  /**
   * Generate enums.ts file
   */
  private async generateEnums() {
    const enums = this.prismaGen.getEnums();
    const content = this.effectGen.generateEnums(enums);
    await this.fileManager.writeFile('enums.ts', content);
  }

  /**
   * Generate types.ts file
   */
  private async generateTypes() {
    const models = this.prismaGen.getModels();
    const joinTables = this.prismaGen.getManyToManyJoinTables();
    const hasEnums = this.prismaGen.getEnums().length > 0;

    // Generate header with imports
    const header = this.effectGen.generateTypesHeader(hasEnums);

    // PHASE 1: Generate ALL branded ID schemas first (before any model structs)
    // This ensures FK references can find their target ID schemas
    const allBrandedIdSchemas = models
      .map((model) => {
        const fields = this.prismaGen.getModelFields(model);
        return this.effectGen.generateBrandedIdSchema(model, fields);
      })
      .filter((schema): schema is string => schema !== null)
      .join('\n\n');

    // PHASE 2: Generate model schemas (just User = Schema.Struct({...}))
    // Package's type utilities derive Insertable<User>, Selectable<User>
    const modelSchemas = models
      .map((model) => {
        const fields = this.prismaGen.getModelFields(model);
        return this.effectGen.generateModelSchema(model, fields);
      })
      .join('\n\n');

    // Generate join table schemas
    const joinTableSchemas =
      joinTables.length > 0 ? this.effectGen.generateJoinTableSchemas(joinTables) : '';

    // Generate DB interface with join tables (uses Selectable<Model> pattern)
    const dbInterface = this.kyselyGen.generateDBInterface(models, joinTables);

    // Assemble content with proper spacing
    // Order: header → branded ID schemas → model schemas → join tables → DB interface
    let content = `${header}`;
    if (allBrandedIdSchemas) {
      content += `\n\n// ===== Branded ID Schemas =====\n${allBrandedIdSchemas}`;
    }
    content += `\n\n// ===== Model Schemas =====\n${modelSchemas}`;
    if (joinTableSchemas) {
      content += `\n\n${joinTableSchemas}`;
    }
    content += `\n\n${dbInterface}`;

    await this.fileManager.writeFile('types.ts', content);
  }

  /**
   * Generate index.ts file
   */
  private async generateIndex() {
    const content = this.kyselyGen.generateIndexFile();
    await this.fileManager.writeFile('index.ts', content);
  }

  /**
   * Log generation start with stats
   */
  private logStart(options: GeneratorOptions) {
    const _modelCount = options.dmmf.datamodel.models.filter((m) => !m.name.startsWith('_')).length;
    const _enumCount = options.dmmf.datamodel.enums.length;

    if (isMultiDomainEnabled(this.config)) {
      if (isScaffoldingEnabled(this.config)) {
        // Scaffolding logic would go here if needed
      }
    }
  }

  /**
   * Scan every field's `@customType(...)` annotation for Effect 3 syntax and warn
   * (to stderr, which Prisma surfaces to the user). `@customType` strings are
   * emitted verbatim, so a v3 expression silently breaks once compiled against
   * Effect 4. We never rewrite — only point at the v4 replacement.
   */
  private warnLegacyAnnotations(options: GeneratorOptions) {
    const warnings: string[] = [];
    for (const model of options.dmmf.datamodel.models) {
      for (const field of model.fields) {
        const override = extractEffectTypeOverride(field);
        if (!override) continue;
        for (const hint of detectLegacyEffectV3Syntax(override)) {
          warnings.push(`  ${model.name}.${field.name}: ${hint}`);
        }
      }
    }

    if (warnings.length > 0) {
      console.warn(
        `[prisma-effect-kysely] @customType annotations use Effect 3 syntax that does not ` +
          `compile against Effect 4. Update them in your Prisma schema:\n${warnings.join('\n')}`
      );
    }
  }

  /**
   * Log generation completion
   */
  private logComplete() {
    const _outputPath = this.fileManager.getOutputPath();

    if (isMultiDomainEnabled(this.config)) {
      // Multi-domain logic would go here if needed
    } else {
      // Single-domain logic would go here if needed
    }
  }
}
