import type { GeneratorOptions } from '@prisma/generator-helper';
import { FileManager } from './utils/file-manager';
import { EnumGenerator } from './generators/enum-generator';
import { TypeGenerator } from './generators/type-generator';
import { IndexGenerator } from './generators/index-generator';

/**
 * Orchestrates the generation of Effect Schema types from Prisma schema
 */
export class GeneratorOrchestrator {
  private readonly fileManager: FileManager;
  private readonly enumGenerator: EnumGenerator;
  private readonly typeGenerator: TypeGenerator;
  private readonly indexGenerator: IndexGenerator;

  constructor(options: GeneratorOptions) {
    const outputPath = this.validateOutputPath(options);

    this.fileManager = new FileManager(outputPath);
    this.enumGenerator = new EnumGenerator();
    this.typeGenerator = new TypeGenerator(options.dmmf);
    this.indexGenerator = new IndexGenerator();
  }

  /**
   * Validate and extract output path from generator options
   */
  private validateOutputPath(options: GeneratorOptions): string {
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
  async generate(options: GeneratorOptions): Promise<void> {
    this.logStart(options);

    // Ensure output directory exists
    await this.fileManager.ensureDirectory();

    // Generate all files in parallel for better performance
    await Promise.all([
      this.generateEnums(options),
      this.generateTypes(options),
      this.generateIndex(),
    ]);

    this.logComplete();
  }

  /**
   * Generate enums.ts file
   */
  private async generateEnums(options: GeneratorOptions): Promise<void> {
    const content = this.enumGenerator.generateFile(options.dmmf);
    await this.fileManager.writeFile('enums.ts', content);
  }

  /**
   * Generate types.ts file
   */
  private async generateTypes(options: GeneratorOptions): Promise<void> {
    const content = this.typeGenerator.generateFile(options.dmmf);
    await this.fileManager.writeFile('types.ts', content);
  }

  /**
   * Generate index.ts file
   */
  private async generateIndex(): Promise<void> {
    const content = this.indexGenerator.generateFile();
    await this.fileManager.writeFile('index.ts', content);
  }

  /**
   * Log generation start with stats
   */
  private logStart(options: GeneratorOptions): void {
    const modelCount = options.dmmf.datamodel.models.filter(
      (m) => !m.name.startsWith('_'),
    ).length;
    const enumCount = options.dmmf.datamodel.enums.length;

    console.log('[Effect Generator] Starting generation...');
    console.log(
      `[Effect Generator] Processing ${modelCount} models, ${enumCount} enums`,
    );
  }

  /**
   * Log generation completion
   */
  private logComplete(): void {
    const outputPath = this.fileManager.getOutputPath();
    console.log(`[Effect Generator] ✓ Generated to ${outputPath}`);
    console.log(`[Effect Generator] Files: enums.ts, types.ts, index.ts`);
  }
}
