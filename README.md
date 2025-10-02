# Prisma Effect Generator

A Prisma generator that creates Effect Schema types from Prisma schema definitions with exact type safety and intelligent UUID detection.

## Features

- ✅ **Type-Safe Generation**: Zero type coercion, complete type safety
- ✅ **Intelligent UUID Detection**: Via `@db.Uuid`, `nativeType`, or field name patterns
- ✅ **Enum Support**: Effect Schema enums with `@map` annotation support
- ✅ **Deterministic Output**: Alphabetically sorted for consistent results
- ✅ **Complete Type Mappings**: All Prisma types mapped to Effect Schema equivalents

## Installation

```bash
npm install prisma-effect-kysely
# or
pnpm add prisma-effect-kysely
# or
yarn add prisma-effect-kysely
```

## Usage

### 1. Add to schema.prisma

```prisma
generator effect_schemas {
  provider = "prisma-effect-kysely"
  output   = "./generated/effect"
}
```

### 2. Generate Effect Schemas

```bash
npx prisma generate
```

## Output

Generates three files in the configured output directory:

### enums.ts

Effect Schema enums from Prisma enums with exact literal types:

```typescript
export const UserRole = Schema.Literal('admin', 'user', 'guest');
export type UserRole = Schema.Schema.Type<typeof UserRole>;
```

### types.ts

Effect Schema structs from Prisma models:

```typescript
export const User = Schema.Struct({
  id: Schema.UUID,
  email: Schema.String,
  name: Schema.optional(Schema.String),
  role: UserRole,
  createdAt: Schema.Date,
});
export type User = Schema.Schema.Type<typeof User>;
```

### index.ts

Re-exports all generated types for easy importing

## Type Mappings

| Prisma Type | Effect Schema Type  | Notes                            |
| ----------- | ------------------- | -------------------------------- |
| String      | `Schema.String`     | `Schema.UUID` for id fields      |
| Int / Float | `Schema.Number`     | With `Schema.int()` for integers |
| BigInt      | `Schema.BigInt`     | Exact bigint type                |
| Decimal     | `Schema.String`     | String for precision             |
| Boolean     | `Schema.Boolean`    | -                                |
| DateTime    | `Schema.Date`       | -                                |
| Json        | `Schema.Unknown`    | Safe unknown type                |
| Bytes       | `Schema.Uint8Array` | -                                |
| Enum        | Enum Schema         | With `Schema.Literal` values     |

## UUID Detection

The generator intelligently detects UUID fields through multiple strategies (in order):

1. **Native Type**: `@db.Uuid` attribute (most reliable)
2. **Documentation**: `@db.Uuid` in field comments
3. **Default Value**: `dbgenerated("gen_random_uuid()")` or similar
4. **Field Name Patterns**: `id`, `*_id`, `*_uuid`, `uuid`

Example:

```prisma
model User {
  id        String @id @db.Uuid @default(dbgenerated("gen_random_uuid()"))
  userId    String @db.Uuid  // Detected via native type
  productId String           // Detected via field name pattern
}
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# Build
npm run build
```

## Architecture

### Type Safety

This generator uses **EXACT DMMF types** from Prisma and implements **zero type coercion**:

- Uses `FieldDefault` type matching Prisma's exact structure
- Type-safe validation with structural typing
- No `as` assertions or unsafe casts
- Complete TypeScript strict mode compliance

### Generated Code Quality

- **Alphabetically sorted** fields and models for consistency
- **Branded types** for UUIDs via `Schema.UUID`
- **Exact type inference** - no widening to `any` or `unknown`
- **Auto-generated headers** with timestamps and edit warnings

## Troubleshooting

### Generator Not Found

If you're developing the generator locally, make sure to build it first:

```bash
npm run build
```

Then reference it in your schema.prisma:

```prisma
generator effect_schemas {
  provider = "node ./path/to/dist/generator.js"
  output   = "./generated/effect"
}
```

### Wrong Types Generated

Check the generator output in console:

```
[Effect Generator] Starting generation...
[Effect Generator] Processing 15 models, 3 enums
[Effect Generator] ✓ Generated to ../../libs/types/storage/src/lib/effect
```

### UUID Not Detected

Add explicit `@db.Uuid` attribute:

```prisma
userId String @db.Uuid
```

## License

MIT
