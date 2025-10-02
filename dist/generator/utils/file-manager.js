"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileManager = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const templates_1 = require("./templates");
/**
 * Manages file system operations for the generator
 */
class FileManager {
    constructor(outputPath) {
        this.outputPath = outputPath;
    }
    /**
     * Ensure the output directory exists
     */
    async ensureDirectory() {
        await (0, promises_1.mkdir)(this.outputPath, { recursive: true });
    }
    /**
     * Write a file with automatic code formatting
     */
    async writeFile(filename, content) {
        const formatted = await (0, templates_1.formatCode)(content);
        const filePath = (0, path_1.join)(this.outputPath, filename);
        await (0, promises_1.writeFile)(filePath, formatted);
    }
    /**
     * Get the output path
     */
    getOutputPath() {
        return this.outputPath;
    }
}
exports.FileManager = FileManager;
//# sourceMappingURL=file-manager.js.map