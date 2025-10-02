import * as AST from 'effect/SchemaAST';
import * as S from 'effect/Schema';
import {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from 'kysely';

import { Effect, pipe } from 'effect';
import { NoResultError } from 'kysely';
import {
  DatabaseError,
  NotFoundError,
  QueryError,
  QueryParseError,
} from './error';

export const ColumnTypeId = Symbol.for('effect-kysely/ColumnTypeId');

interface ColumnTypeSchemas<SType, SEncoded, IType, IEncoded, UType, UEncoded> {
  selectSchema: S.Schema<SType, SEncoded>;
  insertSchema: S.Schema<IType, IEncoded>;
  updateSchema: S.Schema<UType, UEncoded>;
}

export const columnType = <SType, SEncoded, IType, IEncoded, UType, UEncoded>(
  selectSchema: S.Schema<SType, SEncoded>,
  insertSchema: S.Schema<IType, IEncoded>,
  updateSchema: S.Schema<UType, UEncoded>,
): S.Schema<
  ColumnType<SType, IType, UType>,
  ColumnType<SEncoded, IEncoded, UEncoded>
> => {
  const schemas: ColumnTypeSchemas<
    SType,
    SEncoded,
    IType,
    IEncoded,
    UType,
    UEncoded
  > = {
    selectSchema,
    insertSchema,
    updateSchema,
  };
  return S.make(AST.annotations(S.Never.ast, { [ColumnTypeId]: schemas }));
};

export const generated = <SType, SEncoded>(
  schema: S.Schema<SType, SEncoded>,
): S.Schema<Generated<SType>, Generated<SEncoded>> =>
  columnType(schema, S.Union(schema, S.Undefined), schema);

export const selectable = <Type, Encoded>(
  schema: S.Schema<Type, Encoded>,
): S.Schema<Selectable<Type>, Selectable<Encoded>> => {
  const { ast } = schema;
  if (!AST.isTypeLiteral(ast)) {
    return S.make(ast);
  }
  return S.make(
    new AST.TypeLiteral(
      extractParametersFromTypeLiteral(ast, 'selectSchema'),
      ast.indexSignatures,
      ast.annotations,
    ),
  );
};

export const insertable = <Type, Encoded>(
  schema: S.Schema<Type, Encoded>,
): S.Schema<Insertable<Type>, Insertable<Encoded>> => {
  const { ast } = schema;
  if (!AST.isTypeLiteral(ast)) {
    return S.make(ast);
  }

  const extracted = extractParametersFromTypeLiteral(ast, 'insertSchema');

  const res = new AST.TypeLiteral(
    extracted.map(
      (prop) =>
        new AST.PropertySignature(
          prop.name,
          prop.type,
          isOptionalType(prop.type),
          prop.isReadonly,
          prop.annotations,
        ),
    ),
    ast.indexSignatures,
    ast.annotations,
  );
  return S.make(res);
};

export const updateable = <Type, Encoded>(
  schema: S.Schema<Type, Encoded>,
): S.Schema<Updateable<Type>, Updateable<Encoded>> => {
  const { ast } = schema;
  if (!AST.isTypeLiteral(ast)) {
    return S.make(ast);
  }

  const extracted = extractParametersFromTypeLiteral(ast, 'updateSchema');

  const res = new AST.TypeLiteral(
    extracted.map(
      (prop) =>
        new AST.PropertySignature(
          prop.name,
          AST.Union.make([prop.type, new AST.UndefinedKeyword()]),
          true,
          prop.isReadonly,
          prop.annotations,
        ),
    ),
    ast.indexSignatures,
    ast.annotations,
  );

  return S.make(res);
};

export interface Schemas<Type, Encoded> {
  Selectable: S.Schema<Selectable<Type>, Selectable<Encoded>>;
  Insertable: S.Schema<Insertable<Type>, Insertable<Encoded>>;
  Updateable: S.Schema<Updateable<Type>, Updateable<Encoded>>;
}

export const getSchemas = <Type, Encoded>(
  baseSchema: S.Schema<Type, Encoded>,
): Schemas<Type, Encoded> => ({
  Selectable: selectable(baseSchema),
  Insertable: insertable(baseSchema),
  Updateable: updateable(baseSchema),
});

export interface GetTypes<T extends Schemas<unknown, unknown>> {
  Selectable: S.Schema.Type<T['Selectable']>;
  Insertable: S.Schema.Type<T['Insertable']>;
  Updateable: S.Schema.Type<T['Updateable']>;
}

type AnyColumnTypeSchemas = ColumnTypeSchemas<
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown
>;

const extractParametersFromTypeLiteral = (
  ast: AST.TypeLiteral,
  schemaType: keyof AnyColumnTypeSchemas,
): AST.PropertySignature[] => {
  return ast.propertySignatures
    .map((prop: AST.PropertySignature) => {
      if (!isColumnType(prop.type)) {
        return prop;
      }
      const schemas = prop.type.annotations[ColumnTypeId] as AnyColumnTypeSchemas;
      return new AST.PropertySignature(
        prop.name,
        schemas[schemaType].ast,
        prop.isOptional,
        prop.isReadonly,
        prop.annotations,
      );
    })
    .filter((prop: AST.PropertySignature) => prop.type._tag !== 'NeverKeyword');
};

interface ColumnTypeAST extends AST.Declaration {
  readonly annotations: {
    readonly [ColumnTypeId]: AnyColumnTypeSchemas;
  };
}

const isColumnType = (ast: AST.AST): ast is ColumnTypeAST =>
  ColumnTypeId in ast.annotations;

const isOptionalType = (ast: AST.AST): boolean => {
  if (!AST.isUnion(ast)) {
    return false;
  }

  return (
    ast.types.some((t: AST.AST) => AST.isUndefinedKeyword(t)) ||
    ast.types.some((t: AST.AST) => isNullType(t))
  );
};

const isNullType = (ast: AST.AST) =>
  AST.isLiteral(ast) &&
  Object.entries(ast.annotations).find(
    ([sym, value]) =>
      sym === AST.IdentifierAnnotationId.toString() && value === 'null',
  );

type QueryFn<I, O> = (input: I) => Promise<O>;

export const withEncoder =
  <IEncoded, IType, O>({
    encoder,
    query,
  }: {
    encoder: S.Schema<IType, IEncoded>;
    query: QueryFn<IEncoded, O>;
  }) =>
  (input: IType): Effect.Effect<O, DatabaseError, never> =>
    Effect.gen(function* () {
      const encoded: IEncoded = yield* encode(encoder, input);
      return yield* toEffect(query, encoded);
    });

export const withDecoder =
  <OEncoded, OType>({
    decoder,
    query,
  }: {
    decoder: S.Schema<OType, OEncoded>;
    query: QueryFn<undefined, OEncoded>;
  }) =>
  (): Effect.Effect<OType, DatabaseError, never> =>
    Effect.gen(function* () {
      const res: OEncoded = yield* toEffect(query, undefined);
      return yield* decode(decoder, res);
    });

export const withCodec =
  <IEncoded, IType, OEncoded, OType>({
    encoder,
    decoder,
    query,
  }: {
    encoder: S.Schema<IType, IEncoded>;
    decoder: S.Schema<OType, OEncoded>;
    query: QueryFn<IEncoded, OEncoded>;
  }) =>
  (input: IType): Effect.Effect<OType, DatabaseError, never> =>
    Effect.gen(function* () {
      const encoded: IEncoded = yield* encode(encoder, input);
      const res: OEncoded = yield* toEffect(query, encoded);
      return yield* decode(decoder, res);
    });

const toEffect = <I, O>(query: QueryFn<I, O>, input: I) =>
  Effect.tryPromise({
    try: () => query(input),
    catch: (error): DatabaseError => {
      if (error instanceof NoResultError) {
        return new NotFoundError();
      }

      if (error instanceof Error) {
        return new QueryError({ message: error.message, cause: error });
      }

      return new QueryError({ message: String(error), cause: error });
    },
  });

const encode = <IEncoded, IType>(
  inputSchema: S.Schema<IType, IEncoded>,
  input: IType,
) =>
  pipe(
    input,
    S.encode(inputSchema),
    Effect.mapError((parseError) => new QueryParseError({ parseError })),
  );

const decode = <OEncoded, OType>(
  outputSchema: S.Schema<OType, OEncoded>,
  encoded: OEncoded,
) =>
  pipe(
    encoded,
    S.decode(outputSchema),
    Effect.mapError((parseError) => new QueryParseError({ parseError })),
  );
