import { Schema } from 'effect';
import * as AST from 'effect/SchemaAST';
import type {
  Insertable as KyselyInsertable,
  Selectable as KyselySelectable,
  Updateable as KyselyUpdateable,
  ColumnType as KyselyColumnType,
  Generated as KyselyGenerated,
} from 'kysely';

/**
 * Runtime helpers for Kysely schema integration
 * These are imported by generated code
 *
 * ## Type Extraction Patterns
 *
 * For Effect Schemas (recommended - full type safety):
 * ```typescript
 * import { Selectable, Insertable, Updateable } from 'prisma-effect-kysely';
 * import { User } from './generated/types';
 *
 * type UserSelect = Selectable<User>;
 * type UserInsert = Insertable<User>;
 * type UserUpdate = Updateable<User>;
 * ```
 *
 * Note: This package exports branded versions of ColumnType and Generated that
 * are compatible with Effect Schema's type inference. These extend the base
 * select type (S) while carrying phantom insert/update type information.
 *
 * ## Effect 4 note
 *
 * Effect 4 reworked `effect/SchemaAST` (e.g. `PropertySignature` is now 2-arg,
 * structs are `Objects` nodes, `isTypeLiteral` is gone). Instead of rebuilding
 * AST nodes by hand, the Selectable/Insertable/Updateable functions now operate
 * on the public `Struct.fields` record and the per-field schemas that
 * `columnType()`/`generated()` attach as own properties. This avoids depending
 * on private AST constructors entirely.
 */

// Re-export Kysely's native type utilities with aliases for advanced use cases
export type {
  KyselySelectable,
  KyselyInsertable,
  KyselyUpdateable,
  KyselyColumnType,
  KyselyGenerated,
};

export const ColumnTypeId = Symbol.for('/ColumnTypeId');
export const GeneratedId = Symbol.for('/GeneratedId');

/**
 * Symbol for VariantMarker - used in mapped type pattern that survives declaration emit.
 */
export const VariantTypeId: unique symbol = Symbol.for('prisma-effect-kysely/VariantType');
export type VariantTypeId = typeof VariantTypeId;

// ============================================================================
// Branded Type Definitions (Override Kysely's types)
// ============================================================================
// These branded types extend S while carrying phantom insert/update information.
// Unlike Kysely's ColumnType<S,I,U> = { __select__: S, __insert__: I, __update__: U },
// our branded types ARE subtypes of S, so the schema's Type stays a subtype of S.

/**
 * Variant marker using mapped type pattern from Effect's Brand.
 *
 * TypeScript cannot simplify mapped types that depend on generic parameters.
 * This ensures the variant information survives declaration emit (.d.ts generation).
 *
 * Pattern derived from Effect's Brand<K>:
 * ```typescript
 * readonly [BrandTypeId]: { readonly [k in K]: K }  // Mapped type - cannot be simplified!
 * ```
 *
 * Our pattern uses a conditional type within the mapped type to encode both I and U:
 * ```typescript
 * readonly [VariantTypeId]: { readonly [K in "insert" | "update"]: K extends "insert" ? I : U }
 * ```
 */
export interface VariantMarker<in out I, in out U> {
  readonly [VariantTypeId]: {
    readonly [K in 'insert' | 'update']: K extends 'insert' ? I : U;
  };
}

/**
 * Branded ColumnType that extends S while carrying phantom insert/update type information.
 *
 * This replaces Kysely's ColumnType because:
 * 1. Kysely's ColumnType<S,I,U> = { __select__: S, __insert__: I, __update__: U } is NOT a subtype of S
 * 2. A schema whose Type is the struct (not S) breaks `S`-shaped inference
 * 3. Our ColumnType<S,I,U> = S & Brand IS a subtype of S, so the schema's Type stays compatible
 *
 * Includes Kysely's phantom properties (__select__, __insert__, __update__) so that:
 * 1. Kysely recognizes this as a ColumnType for INSERT/UPDATE operations
 * 2. WHERE clauses work with plain S values (not branded)
 *
 * Uses VariantMarker with mapped types to survive TypeScript declaration emit.
 *
 * Usage is identical to Kysely's ColumnType:
 * ```typescript
 * type IdField = ColumnType<string, never, never>;  // Read-only ID
 * type CreatedAt = ColumnType<Date, Date | undefined, Date>;  // Optional on insert
 * ```
 */
export type ColumnType<S, I = S, U = S> = S &
  VariantMarker<I, U> & {
    /** Kysely extracts this type for SELECT and WHERE */
    readonly __select__: S;
    /** Kysely uses this for INSERT */
    readonly __insert__: I;
    /** Kysely uses this for UPDATE */
    readonly __update__: U;
  };

/**
 * Base Generated brand without Kysely phantom properties.
 * Used as the __select__ return type to preserve branding on SELECT.
 *
 * Uses VariantMarker<T | undefined, T> so that Generated fields are:
 * - Optional on insert (T | undefined) - can be provided or omitted
 * - Required on update (T) - must provide value if updating
 *
 * This differs from ColumnType<S, never, never> which completely excludes
 * the field from insert (used for auto-generated IDs).
 */
type GeneratedBrand<T> = T &
  VariantMarker<T | undefined, T> & {
    readonly [GeneratedId]: true;
  };

/**
 * Branded Generated type for database-generated fields.
 *
 * Follows @effect/sql Model.Generated pattern - the field is:
 * - Required on select (T) - Kysely returns the base type
 * - Optional on insert (T | undefined) - Kysely recognizes this
 * - Allowed on update (T)
 *
 * Includes Kysely's phantom properties (__select__, __insert__, __update__) so that:
 * 1. Kysely recognizes this as a ColumnType and makes it optional on INSERT
 * 2. WHERE clauses work with plain T values (not branded)
 *
 * The Selectable<T> type utility preserves the full Generated<T> type for schema alignment.
 * Kysely operations work with the underlying T type.
 *
 * Uses VariantMarker with mapped types to survive TypeScript declaration emit.
 */
export type Generated<T> = GeneratedBrand<T> & {
  /** Kysely extracts this type for SELECT and WHERE - base type for compatibility */
  readonly __select__: T;
  /** Kysely uses this for INSERT - optional */
  readonly __insert__: T | undefined;
  /** Kysely uses this for UPDATE */
  readonly __update__: T;
};

// ============================================================================
// Runtime Annotation Schemas
// ============================================================================

interface ColumnTypeSchemas {
  readonly selectSchema: Schema.Top;
  readonly insertSchema: Schema.Top;
  readonly updateSchema: Schema.Top;
}

/**
 * Interface for ColumnType schema - preserves type parameters in declaration emit.
 *
 * Named interfaces with type parameters are preserved by TypeScript in declaration files,
 * unlike anonymous intersection types which may be simplified.
 *
 * This follows the Schema.brand pattern from Effect which returns a named interface.
 */
export interface ColumnTypeSchema<S extends Schema.Top, IType, UType> extends Schema.Codec<
  ColumnType<Schema.Schema.Type<S>, IType, UType>,
  ColumnType<Schema.Codec.Encoded<S>, IType, UType>,
  Schema.Codec.DecodingServices<S>,
  Schema.Codec.EncodingServices<S>
> {
  /** The original select schema */
  readonly selectSchema: S;
  /** The insert-variant schema (stored for Insertable() to read at runtime) */
  readonly insertSchema: Schema.Top;
  /** The update-variant schema (stored for Updateable() to read at runtime) */
  readonly updateSchema: Schema.Top;
}

/**
 * Mark a field as having different types for select/insert/update
 * Used for ID fields with @default (read-only)
 *
 * The insert/update schemas are attached as own properties (and mirrored into a
 * symbol annotation) so the Insertable()/Updateable() functions can read which
 * variant to use for each field at runtime.
 *
 * Returns a ColumnTypeSchema which:
 * 1. Is a named interface (preserved in declaration emit)
 * 2. Contains the ColumnType<S, I, U> brand with Kysely phantom properties
 * 3. Includes the original schema via `selectSchema` property
 *
 * This enables Kysely to recognize fields with `__insert__: never` and omit them from INSERT.
 */
export const columnType = <S extends Schema.Top, I extends Schema.Top, U extends Schema.Top>(
  selectSchema: S,
  insertSchema: I,
  updateSchema: U
) => {
  const schemas: ColumnTypeSchemas = { selectSchema, insertSchema, updateSchema };
  // Store the variant sub-schemas in an AST annotation. The annotation rides on
  // the AST node, so it survives a consumer `.annotate()` (which rebuilds the
  // wrapper object and drops `Object.assign`'d own-properties). The own
  // properties are also kept because they are part of the `ColumnTypeSchema`
  // interface contract, but runtime detection reads the annotation (see
  // getColumnTypeSchemas).
  const annotated = selectSchema.annotate({ [ColumnTypeId]: schemas });
  return Object.assign(annotated, {
    selectSchema,
    insertSchema,
    updateSchema,
  }) as unknown as ColumnTypeSchema<S, Schema.Schema.Type<I>, Schema.Schema.Type<U>>;
};

/**
 * Interface for Generated schema - preserves type parameter in declaration emit.
 *
 * Named interfaces with type parameters are preserved by TypeScript in declaration files,
 * unlike anonymous intersection types which may be simplified.
 *
 * This follows the Schema.brand pattern from Effect which returns a named interface.
 */
export interface GeneratedSchema<S extends Schema.Top> extends Schema.Codec<
  Generated<Schema.Schema.Type<S>>,
  Generated<Schema.Codec.Encoded<S>>,
  Schema.Codec.DecodingServices<S>,
  Schema.Codec.EncodingServices<S>
> {
  /** The original schema before Generated wrapper */
  readonly from: S;
}

/**
 * Mark a field as database-generated (omitted from insert)
 * Used for fields with @default
 *
 * Follows @effect/sql Model.Generated pattern:
 * - Present in select and update schemas
 * - OMITTED from insert schema (not optional, completely absent)
 *
 * Returns a GeneratedSchema<S> which:
 * 1. Is a named interface (preserved in declaration emit)
 * 2. Contains the Generated<T> brand using VariantMarker (mapped types survive emit)
 * 3. Includes the original schema via `from` property
 *
 * This enables CustomInsertable to filter out generated fields at compile time.
 */
export const generated = <S extends Schema.Top>(schema: S) => {
  // Store the marker AND the base schema in an AST annotation. The annotation
  // rides on the AST node, so it survives a consumer `.annotate()` (which rebuilds
  // the wrapper object and drops `Object.assign`'d own-properties). The own `from`
  // property is also kept because it is part of the `GeneratedSchema<S>` interface
  // contract, but runtime detection reads the annotation (see getGeneratedFrom).
  const annotated = schema.annotate({ [GeneratedId]: { from: schema } });
  return Object.assign(annotated, {
    from: schema,
  }) as unknown as GeneratedSchema<S>;
};

// ============================================================================
// JsonValue Schema (recursive JSON type for Prisma Json fields)
// ============================================================================

/**
 * Standard recursive JSON value type.
 *
 * Used instead of `Schema.Unknown` for Prisma `Json` fields because:
 * - `Schema.NullOr(Schema.Unknown)` resolves to `unknown` (null absorbed into unknown)
 * - This causes the TS language server to hit depth limits resolving Selectable<T>
 * - `Schema.NullOr(JsonValue)` stays concrete and resolvable
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

export const JsonValue: Schema.Codec<JsonValue, JsonValue> = Schema.suspend(
  (): Schema.Codec<JsonValue, JsonValue> =>
    Schema.Union([
      Schema.String,
      Schema.Number,
      Schema.Boolean,
      Schema.Null,
      Schema.Array(JsonValue),
      Schema.Record(Schema.String, JsonValue),
    ])
);

// ============================================================================
// Runtime field helpers (operate on Struct.fields entries, not raw AST)
// ============================================================================

/**
 * A schema entry as it appears in `Struct.fields`. The `columnType()`/`generated()`
 * markers may be present either as `Object.assign`'d own-properties (the common
 * path — they survive a field being placed into `Schema.Struct`) or, if a consumer
 * rebuilt the schema with `.annotate()` (which drops own-props), only in the AST
 * annotation. Detection checks own-props first, then falls back to the annotation.
 */
type FieldEntry = Schema.Top & {
  readonly selectSchema?: Schema.Top;
  readonly insertSchema?: Schema.Top;
  readonly updateSchema?: Schema.Top;
  readonly from?: Schema.Top;
};

/** Shape stored in the `GeneratedId` annotation by `generated()`. */
interface GeneratedAnnotation {
  readonly from: Schema.Top;
}

/**
 * Read a symbol-keyed annotation off a field schema.
 *
 * Uses `AST.resolve`, which returns the annotations of the last applied check
 * when the schema carries checks (e.g. `Schema.String.check(Schema.isUUID())` —
 * every UUID column), otherwise the base node's annotations. Reading
 * `ast.annotations` directly would miss the marker on checked schemas because
 * `.annotate()` writes onto the last check, not the base node.
 */
const readAnnotation = <T>(field: FieldEntry, key: symbol): T | undefined => {
  const resolved = AST.resolve(field.ast) as Record<symbol, unknown> | undefined;
  return resolved?.[key as never] as T | undefined;
};

/**
 * Resolve the ColumnType variant sub-schemas for a field: own-property first
 * (the path the generator emits), AST annotation as fallback (survives a
 * consumer `.annotate()`).
 */
const getColumnTypeSchemas = (field: FieldEntry): ColumnTypeSchemas | undefined => {
  if (
    field.selectSchema !== undefined &&
    field.insertSchema !== undefined &&
    field.updateSchema !== undefined &&
    field.from === undefined
  ) {
    return {
      selectSchema: field.selectSchema,
      insertSchema: field.insertSchema,
      updateSchema: field.updateSchema,
    };
  }
  return readAnnotation<ColumnTypeSchemas>(field, ColumnTypeId);
};

/** Resolve the base schema of a Generated field: own-property first, annotation fallback. */
const getGeneratedFrom = (field: FieldEntry): Schema.Top | undefined =>
  field.from ?? readAnnotation<GeneratedAnnotation>(field, GeneratedId)?.from;

const isGeneratedField = (field: FieldEntry): boolean => getGeneratedFrom(field) !== undefined;

const isNeverSchema = (schema: Schema.Top): boolean => AST.isNever(schema.ast);

const isArraySchema = (schema: Schema.Top): boolean => AST.isArrays(schema.ast);

/**
 * Detect `Union(T, Null)` (a NullOr) at the schema level via its members.
 * Optional-on-insert because omitting the column = NULL in the DB.
 */
const isNullableUnion = (
  schema: Schema.Top
): schema is Schema.Union<readonly [Schema.Top, Schema.Top]> => {
  const members = (schema as { members?: ReadonlyArray<Schema.Top> }).members;
  return Array.isArray(members) && members.some((m) => AST.isNull(m.ast));
};

/**
 * Strip null from a `NullOr` schema for Insertable fields.
 * For INSERT, omitting a field = NULL in the DB, so explicit null is unnecessary.
 * Returns the non-null member; otherwise returns the schema unchanged.
 */
const stripNull = (schema: Schema.Top): Schema.Top => {
  const members = (schema as { members?: ReadonlyArray<Schema.Top> }).members;
  if (!Array.isArray(members)) return schema;
  const nonNull = members.filter((m) => !AST.isNull(m.ast));
  if (nonNull.length === 1) return nonNull[0];
  if (nonNull.length > 1) return Schema.Union(nonNull);
  return schema;
};

/** Apply `Schema.mutable` only to array fields (it throws on scalars in v4). */
const mutableIfArray = (schema: Schema.Top): Schema.Top =>
  isArraySchema(schema)
    ? Schema.mutable(schema as Schema.Top & { readonly ast: AST.Arrays })
    : schema;

/** Strip the Generated marker so the underlying base schema is used. */
const unwrapGenerated = (field: FieldEntry): Schema.Top => getGeneratedFrom(field) ?? field;

type Fields = Record<string, Schema.Top>;

// ============================================================================
// Custom Type Utilities for Insert/Update
// ============================================================================
// Kysely's Insertable/Updateable don't properly omit fields with `never` insert types.
// These custom types handle ColumnType and Generated correctly.

/**
 * Extract the insert type from a field using the __insert__ phantom property:
 * - ColumnType<S, I, U> -> I (via __insert__)
 * - Generated<T> -> T | undefined (via __insert__)
 * - Other types -> as-is
 *
 * Uses the __insert__ property which is always present on ColumnType and Generated.
 * This approach is more reliable across module boundaries than using VariantMarker
 * with unique symbols, which can cause type matching failures when TypeScript
 * compiles from source files with different symbol references.
 */
type ExtractInsertType<T> = [T] extends [{ readonly __insert__: infer I }] ? I : T;

/**
 * Check if a type is nullable (includes null or undefined).
 * Matches Kysely's IfNullable behavior:
 *   type IfNullable<T, K> = undefined extends T ? K : null extends T ? K : never;
 *
 * A field is optional for insert if its InsertType can be null or undefined.
 */
type IsOptionalInsert<T> =
  undefined extends ExtractInsertType<T> ? true : null extends ExtractInsertType<T> ? true : false;

/**
 * Extract the base type without null/undefined for optional fields.
 * Keeps the type as-is (including null) for the property type,
 * since the optionality is expressed via `?` not the type itself.
 */
type ExtractInsertBaseType<T> = ExtractInsertType<T>;

/**
 * Extract the update type from a field using the __update__ phantom property:
 * - ColumnType<S, I, U> -> U (via __update__)
 * - Generated<T> -> T (via __update__)
 * - Other types -> as-is
 *
 * Uses the __update__ property which is always present on ColumnType and Generated.
 * This approach is more reliable across module boundaries than using VariantMarker
 * with unique symbols, which can cause type matching failures when TypeScript
 * compiles from source files with different symbol references.
 */
type ExtractUpdateType<T> = [T] extends [{ readonly __update__: infer U }] ? U : T;

/**
 * Custom Insertable type that:
 * - Omits fields with `never` insert type (read-only IDs)
 * - Makes fields with `T | undefined` insert type optional with type T
 * - Keeps other fields required
 */
type CustomInsertable<T> =
  // Required fields (insert type doesn't include undefined)
  {
    -readonly [K in keyof T as ExtractInsertType<T[K]> extends never
      ? never
      : IsOptionalInsert<T[K]> extends true
        ? never
        : K]: ExtractInsertType<T[K]>;
  } & {
    // Optional fields (insert type includes undefined)
    -readonly [K in keyof T as ExtractInsertType<T[K]> extends never
      ? never
      : IsOptionalInsert<T[K]> extends true
        ? K
        : never]?: ExtractInsertBaseType<T[K]>;
  };

/**
 * Custom Updateable type that properly omits fields with `never` update types.
 */
type CustomUpdateable<T> = {
  -readonly [K in keyof T as ExtractUpdateType<T[K]> extends never ? never : K]?: ExtractUpdateType<
    T[K]
  >;
};

// Legacy aliases for backwards compatibility
type MutableInsert<Type> = CustomInsertable<Type>;
type MutableUpdate<Type> = CustomUpdateable<Type>;

// ============================================================================
// Stripping Type Utilities (needed for Selectable function return type)
// ============================================================================

/**
 * Strip Generated<T> wrapper, returning the underlying type T.
 * For non-Generated types, returns as-is.
 * Preserves branded foreign keys (UserId, ProductId, etc.).
 */
type StripGeneratedWrapper<T> = [T] extends [GeneratedBrand<infer U>] ? U : T;

/**
 * Strip ColumnType wrapper, extracting the select type S.
 * Must check AFTER Generated because Generated<T> also has __select__.
 * Uses __insert__ existence to differentiate ColumnType from other types.
 */
type StripColumnTypeWrapper<T> = [T] extends [
  {
    readonly __select__: infer S;
    readonly __insert__: unknown;
  },
]
  ? S
  : T;

/**
 * Strip all Kysely wrappers (Generated, ColumnType) from a field type.
 * Order matters: check Generated first, then ColumnType.
 * Preserves branded foreign keys (UserId, ProductId, etc.).
 */
type StripKyselyWrapper<T> = StripColumnTypeWrapper<StripGeneratedWrapper<T>>;

/**
 * Strip Kysely wrappers from all fields in a type.
 * Preserves branded foreign keys (UserId, ProductId, etc.).
 */
type StripKyselyWrappersFromObject<T> = {
  readonly [K in keyof T]: StripKyselyWrapper<T[K]>;
};

// ============================================================================
// Schema Functions
// ============================================================================

/**
 * Read the public `Struct.fields` record from a schema, or null when the schema
 * is not a struct (Effect 4 exposes `fields` only on Struct schemas).
 *
 * Transformation schemas produced by `Schema.encodeKeys` (used for implicit
 * many-to-many join tables, which rename semantic field names to the DB `A`/`B`
 * columns) do not expose `fields` directly. They are `decodeTo<To, From>` nodes
 * where `.to` is the DECODED (semantic) struct and `.from` is the ENCODED struct
 * with the renamed DB-column keys. Reach through `.to` so wrapper-stripping
 * preserves the semantic field names (e.g. `product_id`), not the DB columns
 * (`A`/`B`).
 */
const getStructFields = (schema: Schema.Top): Fields | null => {
  const direct = (schema as { fields?: Fields }).fields;
  if (direct && typeof direct === 'object') return direct;
  const to = (schema as { to?: Schema.Top }).to;
  if (to) {
    const inner = (to as { fields?: Fields }).fields;
    if (inner && typeof inner === 'object') return inner;
  }
  return null;
};

export function Selectable<Type, Encoded>(
  schema: Schema.Codec<Type, Encoded>
): Schema.Codec<
  StripKyselyWrappersFromObject<Type>,
  StripKyselyWrappersFromObject<Encoded>,
  never,
  never
> {
  const fields = getStructFields(schema);
  if (fields === null) {
    // Non-struct schemas: identity. The return-type annotation drives declaration emit.
    return schema as unknown as Schema.Codec<
      StripKyselyWrappersFromObject<Type>,
      StripKyselyWrappersFromObject<Encoded>,
      never,
      never
    >;
  }

  // Strip Generated/ColumnType wrappers to match what Kysely returns from queries.
  // Branded foreign keys (UserId, ProductId) are preserved.
  const selectFields: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    const field = value as FieldEntry;
    const columnSchemas = getColumnTypeSchemas(field);
    if (columnSchemas) {
      selectFields[key] = columnSchemas.selectSchema;
    } else if (isGeneratedField(field)) {
      selectFields[key] = unwrapGenerated(field);
    } else {
      selectFields[key] = field;
    }
  }

  return Schema.Struct(selectFields) as unknown as Schema.Codec<
    StripKyselyWrappersFromObject<Type>,
    StripKyselyWrappersFromObject<Encoded>,
    never,
    never
  >;
}

/**
 * Create Insertable schema from base schema
 * Generated fields (@default) are made optional, not excluded
 */
export function Insertable<Type, Encoded>(schema: Schema.Codec<Type, Encoded>) {
  const fields = getStructFields(schema);
  if (fields === null) {
    return schema as unknown as Schema.Codec<
      MutableInsert<Type>,
      MutableInsert<Encoded>,
      never,
      never
    >;
  }

  const insertFields: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    const field = value as FieldEntry;

    const columnSchemas = getColumnTypeSchemas(field);
    if (columnSchemas) {
      const insert = columnSchemas.insertSchema;
      // `never` insert type (read-only IDs) -> omit the field entirely.
      if (isNeverSchema(insert)) continue;
      insertFields[key] = mutableIfArray(insert);
      continue;
    }

    if (isGeneratedField(field)) {
      // Generated -> optional on insert, using the underlying base schema.
      insertFields[key] = Schema.optional(mutableIfArray(unwrapGenerated(field)));
      continue;
    }

    if (isNullableUnion(field)) {
      // Union(T, null) -> optional, with null stripped from the type (omitting = NULL).
      insertFields[key] = Schema.optional(stripNull(field));
      continue;
    }

    insertFields[key] = mutableIfArray(field);
  }

  return Schema.Struct(insertFields) as unknown as Schema.Codec<
    MutableInsert<Type>,
    MutableInsert<Encoded>,
    never,
    never
  >;
}

/**
 * Create Updateable schema from base schema
 */
export function Updateable<Type, Encoded>(schema: Schema.Codec<Type, Encoded>) {
  const fields = getStructFields(schema);
  if (fields === null) {
    return schema as unknown as Schema.Codec<
      MutableUpdate<Type>,
      MutableUpdate<Encoded>,
      never,
      never
    >;
  }

  const updateFields: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    const field = value as FieldEntry;

    let target: Schema.Top;
    const columnSchemas = getColumnTypeSchemas(field);
    if (columnSchemas) {
      const update = columnSchemas.updateSchema;
      // `never` update type -> omit the field entirely.
      if (isNeverSchema(update)) continue;
      target = update;
    } else if (isGeneratedField(field)) {
      target = unwrapGenerated(field);
    } else {
      target = field;
    }

    // Every updateable field is optional.
    updateFields[key] = Schema.optional(mutableIfArray(target));
  }

  return Schema.Struct(updateFields) as unknown as Schema.Codec<
    MutableUpdate<Type>,
    MutableUpdate<Encoded>,
    never,
    never
  >;
}

// ============================================================================
// Type Utilities (Work directly with Schema types)
// Usage: Selectable<User>, Insertable<User>, Updateable<User>
// Note: Stripping types are defined earlier in the file (before schema functions)
// ============================================================================

/**
 * Extract SELECT type from schema.
 * - Preserves branded foreign keys (UserId, ProductId, etc.)
 * - Strips Generated<T> and ColumnType<S,I,U> wrappers to match what Kysely returns
 *
 * Kysely extracts __select__ for SELECT results.
 * Generated<T>/ColumnType remain in the DB interface for INSERT recognition,
 * but Selectable<T> gives you the clean type matching query results.
 *
 * @example type UserSelect = Selectable<User>;
 */
export type Selectable<T extends Schema.Top> = StripKyselyWrappersFromObject<Schema.Schema.Type<T>>;

/**
 * Extract INSERT type from schema.
 * Omits fields with `never` insert type (read-only IDs, generated fields).
 * @example type UserInsert = Insertable<User>;
 */
export type Insertable<T extends Schema.Top> = CustomInsertable<Schema.Schema.Type<T>>;

/**
 * Extract UPDATE type from schema.
 * Omits fields with `never` update type, makes all fields optional.
 * @example type UserUpdate = Updateable<User>;
 */
export type Updateable<T extends Schema.Top> = CustomUpdateable<Schema.Schema.Type<T>>;
