import * as S from 'effect/Schema';
import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';
import { Effect } from 'effect';
import { DatabaseError } from './error';
export declare const ColumnTypeId: unique symbol;
export declare const columnType: <SType, SEncoded, IType, IEncoded, UType, UEncoded>(selectSchema: S.Schema<SType, SEncoded>, insertSchema: S.Schema<IType, IEncoded>, updateSchema: S.Schema<UType, UEncoded>) => S.Schema<ColumnType<SType, IType, UType>, ColumnType<SEncoded, IEncoded, UEncoded>>;
export declare const generated: <SType, SEncoded>(schema: S.Schema<SType, SEncoded>) => S.Schema<Generated<SType>, Generated<SEncoded>>;
export declare const selectable: <Type, Encoded>(schema: S.Schema<Type, Encoded>) => S.Schema<Selectable<Type>, Selectable<Encoded>>;
export declare const insertable: <Type, Encoded>(schema: S.Schema<Type, Encoded>) => S.Schema<Insertable<Type>, Insertable<Encoded>>;
export declare const updateable: <Type, Encoded>(schema: S.Schema<Type, Encoded>) => S.Schema<Updateable<Type>, Updateable<Encoded>>;
export interface Schemas<Type, Encoded> {
    Selectable: S.Schema<Selectable<Type>, Selectable<Encoded>>;
    Insertable: S.Schema<Insertable<Type>, Insertable<Encoded>>;
    Updateable: S.Schema<Updateable<Type>, Updateable<Encoded>>;
}
export declare const getSchemas: <Type, Encoded>(baseSchema: S.Schema<Type, Encoded>) => Schemas<Type, Encoded>;
export interface GetTypes<T extends Schemas<unknown, unknown>> {
    Selectable: S.Schema.Type<T['Selectable']>;
    Insertable: S.Schema.Type<T['Insertable']>;
    Updateable: S.Schema.Type<T['Updateable']>;
}
type QueryFn<I, O> = (input: I) => Promise<O>;
export declare const withEncoder: <IEncoded, IType, O>({ encoder, query, }: {
    encoder: S.Schema<IType, IEncoded>;
    query: QueryFn<IEncoded, O>;
}) => (input: IType) => Effect.Effect<O, DatabaseError, never>;
export declare const withDecoder: <OEncoded, OType>({ decoder, query, }: {
    decoder: S.Schema<OType, OEncoded>;
    query: QueryFn<undefined, OEncoded>;
}) => () => Effect.Effect<OType, DatabaseError, never>;
export declare const withCodec: <IEncoded, IType, OEncoded, OType>({ encoder, decoder, query, }: {
    encoder: S.Schema<IType, IEncoded>;
    decoder: S.Schema<OType, OEncoded>;
    query: QueryFn<IEncoded, OEncoded>;
}) => (input: IType) => Effect.Effect<OType, DatabaseError, never>;
export {};
//# sourceMappingURL=kysely-helpers.d.ts.map