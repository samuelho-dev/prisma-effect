import { Data } from 'effect';
import type { ParseError } from 'effect/ParseResult';

export class NotFoundError extends Data.TaggedError('NotFoundError')<{}> {}

export class QueryError extends Data.TaggedError('QueryError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class QueryParseError extends Data.TaggedError('QueryParseError')<{
  readonly parseError: ParseError;
}> {}

export type DatabaseError = NotFoundError | QueryError | QueryParseError;
