"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneratorOrchestrator = void 0;
const file_manager_1 = require("../utils/file-manager");
const generator_1 = require("../prisma/generator");
const generator_2 = require("../effect/generator");
const generator_3 = require("../kysely/generator");
/**
 * Orchestrates the generation of Effect Schema types from Prisma schema
 * Uses domain-driven generators: Prisma → Effect → Kysely
 */
class GeneratorOrchestrator {
    constructor(options) {
        const outputPath = this.validateOutputPath(options);
        this.fileManager = new file_manager_1.FileManager(outputPath);
        this.prismaGen = new generator_1.PrismaGenerator(options.dmmf);
        this.effectGen = new generator_2.EffectGenerator(options.dmmf);
        this.kyselyGen = new generator_3.KyselyGenerator(options.dmmf);
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
            this.generateEnums(),
            this.generateTypes(),
            this.generateIndex(),
        ]);
        this.logComplete();
    }
    /**
     * Generate enums.ts file
     */
    async generateEnums() {
        const enums = this.prismaGen.getEnums();
        const content = this.effectGen.generateEnums(enums);
        await this.fileManager.writeFile('enums.ts', content);
    }
    /**
     * Generate types.ts file
     */
    async generateTypes() {
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
            const operationalSchema = this.effectGen.generateOperationalSchemas(model);
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
    async generateIndex() {
        const content = this.kyselyGen.generateIndexFile();
        await this.fileManager.writeFile('index.ts', content);
    }
    /**
     * Log generation start with stats
     */
    logStart(options) {
        const modelCount = options.dmmf.datamodel.models.filter((m) => !m.name.startsWith('_')).length;
        const enumCount = options.dmmf.datamodel.enums.length;
        console.log('[Prisma Effect Kysely Generator] Starting generation...');
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