import type { GeneratorOptions } from '@prisma/generator-helper';
/**
 * Orchestrates the generation of Effect Schema types from Prisma schema
 */
export declare class GeneratorOrchestrator {
    private readonly fileManager;
    private readonly enumGenerator;
    private readonly typeGenerator;
    private readonly indexGenerator;
    constructor(options: GeneratorOptions);
    /**
     * Validate and extract output path from generator options
     */
    private validateOutputPath;
    /**
     * Main generation entry point
     * Orchestrates all generation steps
     */
    generate(options: GeneratorOptions): Promise<void>;
    /**
     * Generate enums.ts file
     */
    private generateEnums;
    /**
     * Generate types.ts file
     */
    private generateTypes;
    /**
     * Generate index.ts file
     */
    private generateIndex;
    /**
     * Log generation start with stats
     */
    private logStart;
    /**
     * Log generation completion
     */
    private logComplete;
}
//# sourceMappingURL=orchestrator.d.ts.map