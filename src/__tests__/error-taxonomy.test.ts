import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { DatabaseError, NotFoundError, QueryError } from '../error/index.js';

describe('Error taxonomy', () => {
  describe('NotFoundError', () => {
    it('exposes _tag and payload', () => {
      const err = new NotFoundError({ table: 'User', criteria: { id: 'u1' } });
      expect(err._tag).toBe('NotFoundError');
      expect(err.table).toBe('User');
      expect(err.criteria).toEqual({ id: 'u1' });
    });

    it('is yieldable and catchable via Effect.catchTag', () => {
      const program = Effect.gen(function* () {
        return yield* new NotFoundError({ table: 'User', criteria: 'u1' });
      });

      const recovered = program.pipe(
        Effect.catchTag('NotFoundError', (e) => Effect.succeed(`missing in ${e.table}`))
      );

      expect(Effect.runSync(recovered)).toBe('missing in User');
    });
  });

  describe('QueryError', () => {
    it('captures cause + optional sql', () => {
      const cause = new Error('unique violation');
      const err = new QueryError({ cause, sql: 'INSERT INTO ...' });
      expect(err._tag).toBe('QueryError');
      expect(err.cause).toBe(cause);
      expect(err.sql).toBe('INSERT INTO ...');
    });

    it('sql is optional', () => {
      const err = new QueryError({ cause: 'boom' });
      expect(err.sql).toBeUndefined();
    });
  });

  describe('DatabaseError', () => {
    it('captures cause', () => {
      const cause = new Error('ECONNREFUSED');
      const err = new DatabaseError({ cause });
      expect(err._tag).toBe('DatabaseError');
      expect(err.cause).toBe(cause);
    });
  });

  describe('Discrimination across the union', () => {
    it('catchTag fires only on the matching tag', () => {
      const fail = (which: 'a' | 'b'): Effect.Effect<never, NotFoundError | QueryError> =>
        which === 'a'
          ? Effect.fail(new NotFoundError({ table: 'T', criteria: 1 }))
          : Effect.fail(new QueryError({ cause: 'x' }));

      const recover = (which: 'a' | 'b') =>
        fail(which).pipe(
          Effect.catchTag('NotFoundError', () => Effect.succeed('not-found')),
          Effect.catchTag('QueryError', () => Effect.succeed('query'))
        );

      expect(Effect.runSync(recover('a'))).toBe('not-found');
      expect(Effect.runSync(recover('b'))).toBe('query');
    });
  });
});
