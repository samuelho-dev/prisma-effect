/**
 * Generates index.ts that re-exports all generated types and enums
 */
export class IndexGenerator {
  /**
   * Generate a simple index file that re-exports enums and types
   */
  generateFile(): string {
    return `export * from "./enums";
export * from "./types";`;
  }
}
