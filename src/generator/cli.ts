#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { generate } from './orchestrator.js';

const USAGE =
  'Usage: prisma-effect-kysely --output <dir> [--contract ./prisma/contract.json] [--source ./prisma/contract.prisma] [--multi-domain]';

function printUsage(exitCode: number): never {
  console.error(USAGE);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        contract: { type: 'string', default: './prisma/contract.json' },
        output: { type: 'string' },
        source: { type: 'string' },
        'multi-domain': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    printUsage(1);
  }

  if (values.help) printUsage(0);
  if (!values.output) printUsage(1);

  try {
    await generate({
      contract: values.contract,
      output: values.output,
      ...(values.source ? { source: values.source } : {}),
      multiDomain: values['multi-domain'],
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
