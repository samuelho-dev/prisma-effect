import type { GeneratorOptions } from '@prisma/generator-helper';
import { FileManager } from '../utils/file-manager';
import { PrismaGenerator } from '../prisma/generator';
import { EffectGenerator } from '../effect/generator';
import { KyselyGenerator } from '../kysely/generator';

/**
 * Orchestrates the generation of Effect Schema types from Prisma schema
 * Uses domain-driven generators: Prisma → Effect → Kysely
 */
export class GeneratorOrchestrator {
  private readonly fileManager: FileManager;
  private readonly prismaGen: PrismaGenerator;
  private readonly effectGen: EffectGenerator;
  private readonly kyselyGen: KyselyGenerator;

  constructor(options: GeneratorOptions) {
    const outputPath = this.validateOutputPath(options);

    this.fileManager = new FileManager(outputPath);
    this.prismaGen = new PrismaGenerator(options.dmmf);
    this.effectGen = new EffectGenerator(options.dmmf);
    this.kyselyGen = new KyselyGenerator(options.dmmf);
  }

  /**
   * Validate and extract output path from generator options
   */
  private validateOutputPath(options: GeneratorOptions) {
    const outputPath = options.generator.output?.value;

    if (!outputPath) {
      throw new Error(
        'Prisma Effect Generator: output path not configured.\n' +
          'Add "output" to your generator block in schema.prisma',
      );
    }

    return outputPath;
  }

  /**
   * Main generation entry point
   * Orchestrates all generation steps
   */
  async generate(options: GeneratorOptions) {
    this.logStart(options);

    // Ensure output directory exists
    await this.fileManager.ensureDirectory();

    // Generate all files in parallel for better performance
    await Promise.all([
      this.generateEnums(),
      this.generateTypes(),
      this.generateIndex(),
    ]);

    this.logComplete();
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
    const hasEnums = this.prismaGen.getEnums().length > 0;

    // Generate header with imports
    const header = this.effectGen.generateTypesHeader(hasEnums);

    // Generate all model schemas
    const modelSchemas = models
      .map((model) => {
        const fields = this.prismaGen.getModelFields(model);
        const baseSchemaName = `_${model.name}`;

        // Generate base schema with Kysely fields
        const kyselyFields = this.kyselyGen.generateModelFields(fields);
        const baseSchema = `// ${model.name} Base Schema
export const ${baseSchemaName} = Schema.Struct({
${kyselyFields}
});`;

        // Generate operational schemas and type exports
        const operationalSchema =
          this.effectGen.generateOperationalSchemas(model);
        const typeExports = this.effectGen.generateTypeExports(model);

        return `${baseSchema}\n\n${operationalSchema}\n\n${typeExports}`;
      })
      .join('\n\n');

    // Generate DB interface
    const dbInterface = this.kyselyGen.generateDBInterface(models);

    const content = `${header}\n\n${modelSchemas}\n\n${dbInterface}`;
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
    const modelCount = options.dmmf.datamodel.models.filter(
      (m) => !m.name.startsWith('_'),
    ).length;
    const enumCount = options.dmmf.datamodel.enums.length;

    console.log('[Prisma Effect Kysely Generator] Starting generation...');
    console.log(
      `[Effect Generator] Processing ${modelCount} models, ${enumCount} enums`,
    );
  }

  /**
   * Log generation completion
   */
  private logComplete() {
    const outputPath = this.fileManager.getOutputPath();
    console.log(`[Effect Generator] ✓ Generated to ${outputPath}`);
    console.log(`[Effect Generator] Files: enums.ts, types.ts, index.ts`);
  }
}
