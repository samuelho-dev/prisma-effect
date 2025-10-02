"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneratorOrchestrator = void 0;
const file_manager_1 = require("./utils/file-manager");
const enum_generator_1 = require("./generators/enum-generator");
const type_generator_1 = require("./generators/type-generator");
const index_generator_1 = require("./generators/index-generator");
/**
 * Orchestrates the generation of Effect Schema types from Prisma schema
 */
class GeneratorOrchestrator {
    constructor(options) {
        const outputPath = this.validateOutputPath(options);
        this.fileManager = new file_manager_1.FileManager(outputPath);
        this.enumGenerator = new enum_generator_1.EnumGenerator();
        this.typeGenerator = new type_generator_1.TypeGenerator(options.dmmf);
        this.indexGenerator = new index_generator_1.IndexGenerator();
    }
    /**
     * Validate and extract output path from generator options
     */
    validateOutputPath(options) {
        const outputPath = options.generator.output?.value;
        if (!outputPath) {
            throw new Error('Prisma Effect Generator: output path not configured.\n' +
                'Add "output" to your generator block in schema.prisma');
        }
        return outputPath;
    }
    /**
     * Main generation entry point
     * Orchestrates all generation steps
     */
    async generate(options) {
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
    async generateEnums(options) {
        const content = this.enumGenerator.generateFile(options.dmmf);
        await this.fileManager.writeFile('enums.ts', content);
    }
    /**
     * Generate types.ts file
     */
    async generateTypes(options) {
        const content = this.typeGenerator.generateFile(options.dmmf);
        await this.fileManager.writeFile('types.ts', content);
    }
    /**
     * Generate index.ts file
     */
    async generateIndex() {
        const content = this.indexGenerator.generateFile();
        await this.fileManager.writeFile('index.ts', content);
    }
    /**
     * Log generation start with stats
     */
    logStart(options) {
        const modelCount = options.dmmf.datamodel.models.filter((m) => !m.name.startsWith('_')).length;
        const enumCount = options.dmmf.datamodel.enums.length;
        console.log('[Effect Generator] Starting generation...');
        console.log(`[Effect Generator] Processing ${modelCount} models, ${enumCount} enums`);
    }
    /**
     * Log generation completion
     */
    logComplete() {
        const outputPath = this.fileManager.getOutputPath();
        console.log(`[Effect Generator] ✓ Generated to ${outputPath}`);
        console.log(`[Effect Generator] Files: enums.ts, types.ts, index.ts`);
    }
}
exports.GeneratorOrchestrator = GeneratorOrchestrator;
//# sourceMappingURL=orchestrator.js.map