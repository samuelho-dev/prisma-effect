/**
 * Domain Detection
 *
 * Detects domains from Prisma multi-file schema organization.
 * Supports Prisma's multi-file schema feature (v5.15.0+) where schemas
 * are organized in separate files per domain (e.g., user.prisma, product.prisma).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DMMF } from '@prisma/generator-helper';

/**
 * Information about a detected domain
 */
export interface DomainInfo {
  /**
   * Domain name (e.g., "user", "product")
   * Derived from schema file name
   */
  name: string;

  /**
   * Models belonging to this domain
   */
  models: readonly DMMF.Model[];

  /**
   * Source file path for this domain
   * @example "prisma/schemas/user.prisma"
   */
  sourceFile?: string;
}

/**
 * Detect domains from Prisma schema file structure
 *
 * Strategy:
 * 1. If multiSchema preview feature is enabled, use DMMF schema information
 * 2. Otherwise, scan prisma/schemas/ directory for *.prisma files
 * 3. Group models by domain based on file names
 * 4. Default domain is "shared" for models without explicit domain
 *
 * @param dmmf - Prisma DMMF (Data Model Meta Format)
 * @param schemaPath - Path to prisma schema directory
 * @returns Array of detected domains with their models
 */
export function detectDomains(dmmf: DMMF.Document, schemaPath?: string) {
  // Strategy 1: Use DMMF schema locations if available (Prisma 5.15.0+)
  const domainsByDmmf = detectDomainsFromDMMF(dmmf);
  if (domainsByDmmf.length > 0) {
    return domainsByDmmf;
  }

  // Strategy 2: Scan file system for schema files
  if (schemaPath) {
    const domainsByFiles = detectDomainsFromFiles(dmmf, schemaPath);
    if (domainsByFiles.length > 0) {
      return domainsByFiles;
    }
  }

  // Fallback: Single "shared" domain with all models
  return [
    {
      name: 'shared',
      models: dmmf.datamodel.models,
    },
  ];
}

/**
 * Detect domains from DMMF schema metadata (Prisma 5.15.0+)
 */
function detectDomainsFromDMMF(dmmf: DMMF.Document) {
  const domains = new Map<string, DMMF.Model[]>();

  // Check if models have schema location metadata (Prisma 5.15.0+, not always in DMMF types)
  for (const model of dmmf.datamodel.models) {
    const schemaLocation =
      'schemaLocation' in model && typeof model.schemaLocation === 'string'
        ? model.schemaLocation
        : undefined;

    if (schemaLocation) {
      const domainName = extractDomainFromPath(schemaLocation);
      const existing = domains.get(domainName) || [];
      domains.set(domainName, [...existing, model]);
    }
  }

  // Convert map to DomainInfo array
  return Array.from(domains.entries()).map(([name, models]) => ({
    name,
    models,
  }));
}

/**
 * Detect domains by scanning prisma/schemas/ directory
 */
function detectDomainsFromFiles(dmmf: DMMF.Document, schemaPath: string) {
  const schemasDir = path.join(path.dirname(schemaPath), 'schemas');

  // Check if schemas directory exists
  if (!fs.existsSync(schemasDir)) {
    return [];
  }

  const domainModels = new Map<string, DMMF.Model[]>();
  const domainSourceFiles = new Map<string, string>();

  // Read all .prisma files in schemas directory
  const schemaFiles = fs.readdirSync(schemasDir).filter((file) => file.endsWith('.prisma'));

  if (schemaFiles.length === 0) {
    return [];
  }

  // Create domain entries for each schema file
  for (const file of schemaFiles) {
    const domainName = path.basename(file, '.prisma');
    const sourceFile = path.join(schemasDir, file);

    domainModels.set(domainName, []);
    domainSourceFiles.set(domainName, sourceFile);
  }

  // Assign models to domains based on file content
  // For now, we rely on naming conventions or explicit comments
  // This is a heuristic - in practice, Prisma's DMMF should provide this
  for (const model of dmmf.datamodel.models) {
    const domainName = inferDomainFromModel(model, domainModels);
    const models = domainModels.get(domainName);

    if (models) {
      domainModels.set(domainName, [...models, model]);
    }
  }

  // Build final DomainInfo array
  return Array.from(domainModels.entries()).map(([name, models]) => {
    const sourceFile = domainSourceFiles.get(name);
    return {
      name,
      models: models,
      ...(sourceFile !== undefined && { sourceFile }),
    };
  });
}

/**
 * Extract domain name from schema file path
 *
 * @example
 * extractDomainFromPath("prisma/schemas/user.prisma") // "user"
 * extractDomainFromPath("schemas/product.prisma") // "product"
 */
function extractDomainFromPath(filePath: string) {
  const fileName = path.basename(filePath, '.prisma');
  return fileName.toLowerCase();
}

/**
 * Infer domain from model name using heuristics
 *
 * Strategy:
 * 1. Check if model name starts with domain name (UserProfile → user)
 * 2. Check for common prefixes (User, Product, Order, etc.)
 * 3. Fall back to "shared" domain
 */
function inferDomainFromModel(model: DMMF.Model, domainModels: Map<string, DMMF.Model[]>) {
  const modelName = model.name.toLowerCase();

  // Try exact domain prefix match
  for (const domainName of domainModels.keys()) {
    if (modelName.startsWith(domainName)) {
      return domainName;
    }
  }

  // Fall back to "shared" domain
  return domainModels.has('shared') ? 'shared' : Array.from(domainModels.keys())[0] || 'shared';
}

/**
 * Get all unique domain names from detected domains
 */
export function getDomainNames(domains: DomainInfo[]) {
  return domains.map((d) => d.name);
}

/**
 * Get models for a specific domain
 */
export function getModelsForDomain(domains: DomainInfo[], domainName: string) {
  const domain = domains.find((d) => d.name === domainName);
  return domain?.models || [];
}
