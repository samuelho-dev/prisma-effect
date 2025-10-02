#!/usr/bin/env node
import { generatorHandler } from '@prisma/generator-helper';
import type { GeneratorOptions } from '@prisma/generator-helper';
import { GeneratorOrchestrator } from './orchestrator';
import pkg from '../../package.json';

const { version } = pkg;

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: '../generated',
      prettyName: 'Prisma Effect Kysely Schema Generator',
      requiresGenerators: ['prisma-client-js'],
    };
  },
  onGenerate: async (options: GeneratorOptions) => {
    const orchestrator = new GeneratorOrchestrator(options);
    await orchestrator.generate(options);
  },
});

// Re-export runtime helpers for generated code imports
export * from '../runtime/kysely-helpers';
export * from '../runtime/error';
