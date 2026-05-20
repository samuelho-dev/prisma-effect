/**
 * Generator Configuration
 *
 * Defines configuration options for prisma-effect-kysely generator
 * with support for multi-domain organization and library scaffolding.
 * Uses Effect Schema for strict validation.
 */

import type { GeneratorOptions } from '@prisma/generator-helper';
import { Schema } from 'effect';

/**
 * Boolean string schema - strictly validates 'true' or 'false'
 */
const BooleanString = Schema.Literals(['true', 'false']);

/**
 * Generator configuration schema
 */
const GeneratorConfigSchema = Schema.Struct({
  /**
   * Output directory for generated Effect schemas
   */
  output: Schema.String,

  /**
   * Enable multi-domain detection from schema file structure
   */
  multiFileDomains: BooleanString,

  /**
   * Automatically scaffold contract libraries for detected domains
   */
  scaffoldLibraries: BooleanString,

  /**
   * Path to monorepo-library-generator for library scaffolding
   */
  libraryGenerator: Schema.optional(Schema.String),

  /**
   * Preview features to enable
   */
  previewFeatures: Schema.Array(Schema.String),
});

/**
 * Generator configuration type derived from schema
 */
export type GeneratorConfig = Schema.Schema.Type<typeof GeneratorConfigSchema>;

/**
 * Parse and validate generator configuration from Prisma options
 */
export function parseGeneratorConfig(options: GeneratorOptions) {
  const { generator } = options;

  // Validate required output path
  const output = generator.output?.value;
  if (!output) {
    throw new Error(
      'Prisma Effect Generator: output path not configured.\n' +
        'Add "output" to your generator block in schema.prisma'
    );
  }

  // Extract configuration values
  const config = generator.config || {};
  const rawConfig = {
    output,
    multiFileDomains: getStringValue(config, 'multiFileDomains') ?? 'false',
    scaffoldLibraries: getStringValue(config, 'scaffoldLibraries') ?? 'false',
    libraryGenerator: getStringValue(config, 'libraryGenerator'),
    previewFeatures: getArrayValue(config, 'previewFeatures'),
  };

  // Validate with Effect Schema - throws on invalid input
  return Schema.decodeUnknownSync(GeneratorConfigSchema)(rawConfig);
}

/**
 * Extract string value from config
 */
function getStringValue(config: { [key: string]: string | string[] | undefined }, key: string) {
  const value = config[key];
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

/**
 * Extract array value from config
 */
function getArrayValue(config: { [key: string]: string | string[] | undefined }, key: string) {
  const value = config[key];
  if (!value) return [];

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((v) => v.trim());
    }
  }

  return [];
}

/**
 * Check if multi-domain mode is enabled
 */
export function isMultiDomainEnabled(config: GeneratorConfig) {
  return config.multiFileDomains === 'true';
}

/**
 * Check if library scaffolding is enabled
 */
export function isScaffoldingEnabled(config: GeneratorConfig) {
  return config.scaffoldLibraries === 'true' && isMultiDomainEnabled(config);
}
