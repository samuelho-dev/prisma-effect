"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexGenerator = void 0;
/**
 * Generates index.ts that re-exports all generated types and enums
 */
class IndexGenerator {
    /**
     * Generate a simple index file that re-exports enums and types
     */
    generateFile() {
        return `export * from "./enums";
export * from "./types";`;
    }
}
exports.IndexGenerator = IndexGenerator;
//# sourceMappingURL=index-generator.js.map