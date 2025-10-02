/**
 * Manages file system operations for the generator
 */
export declare class FileManager {
    private readonly outputPath;
    constructor(outputPath: string);
    /**
     * Ensure the output directory exists
     */
    ensureDirectory(): Promise<void>;
    /**
     * Write a file with automatic code formatting
     */
    writeFile(filename: string, content: string): Promise<void>;
    /**
     * Get the output path
     */
    getOutputPath(): string;
}
//# sourceMappingURL=file-manager.d.ts.map