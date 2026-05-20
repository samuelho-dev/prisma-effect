import { Data } from 'effect';

/**
 * Tagged errors for data-layer code that consumes generated schemas.
 *
 * Each class extends `Data.TaggedError`, which produces a yieldable error
 * with a `_tag` discriminant suitable for `Effect.catchTag`.
 *
 * ```ts
 * import { Effect, pipe } from 'effect';
 * import { NotFoundError } from 'prisma-effect-kysely/error';
 *
 * pipe(
 *   findUser(id),
 *   Effect.catchTag('NotFoundError', (e) => Effect.succeed(defaultUser(e.table)))
 * );
 * ```
 */

/**
 * Raised when a query that expects a row returns zero rows.
 *
 * `criteria` is the input that produced the empty result (id, filter object,
 * raw SQL params — kept as `unknown` so any shape can be attached).
 */
export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly table: string;
  readonly criteria: unknown;
}> {}

/**
 * Raised when a query rejects with a SQL- or constraint-level error
 * (FK violations, unique violations, type errors, etc.).
 */
export class QueryError extends Data.TaggedError('QueryError')<{
  readonly cause: unknown;
  readonly sql?: string;
}> {}

/**
 * Raised when the underlying driver / connection / pool fails
 * (connection refused, transport error, pool exhausted, transaction aborted).
 */
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly cause: unknown;
}> {}
