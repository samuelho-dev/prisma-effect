# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2025-10-03

### Note
**Temporary release due to npm 24-hour republish restriction.**
This version will be unpublished and superseded by v1.0.0 within 24 hours.

### Fixed
- Export configuration to allow importing runtime helpers from main package entry point
- Clean dependency tree with minimal deprecation warnings

## [1.0.0] - 2025-10-02

### Added

- Initial release of Prisma Effect Schema Generator
- Type-safe generation of Effect Schema types from Prisma models
- Intelligent UUID detection with 4-tier strategy:
  - Native type detection via `@db.Uuid`
  - Documentation-based detection
  - Default value pattern matching
  - Field name pattern matching
- Complete Prisma type mappings to Effect Schema equivalents
- Support for Prisma enums with `@map` annotations
- Deterministic output with alphabetical sorting
- Zero type coercion with exact DMMF types
- Automated file generation (enums.ts, types.ts, index.ts)
- Comprehensive test suite with 100% coverage paths
- TypeScript strict mode compliance
- Prettier code formatting

### Features

- ✅ All Prisma scalar types supported (String, Int, Float, BigInt, Decimal, Boolean, DateTime, Json, Bytes)
- ✅ Array and optional field support
- ✅ Relation field exclusion (only scalar and enum fields included)
- ✅ Internal model filtering (models starting with `_`)
- ✅ DBSchema interface generation for type-safe database operations

[1.0.0]: https://github.com/samuelho-dev/prisma-effect-kysely/releases/tag/v1.0.0
