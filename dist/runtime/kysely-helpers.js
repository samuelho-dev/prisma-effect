"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.withCodec = exports.withDecoder = exports.withEncoder = exports.getSchemas = exports.updateable = exports.insertable = exports.selectable = exports.generated = exports.columnType = exports.ColumnTypeId = void 0;
const AST = __importStar(require("effect/SchemaAST"));
const S = __importStar(require("effect/Schema"));
const effect_1 = require("effect");
const kysely_1 = require("kysely");
const error_1 = require("./error");
exports.ColumnTypeId = Symbol.for('effect-kysely/ColumnTypeId');
const columnType = (selectSchema, insertSchema, updateSchema) => {
    const schemas = {
        selectSchema,
        insertSchema,
        updateSchema,
    };
    return S.make(AST.annotations(S.Never.ast, { [exports.ColumnTypeId]: schemas }));
};
exports.columnType = columnType;
const generated = (schema) => (0, exports.columnType)(schema, S.Union(schema, S.Undefined), schema);
exports.generated = generated;
const selectable = (schema) => {
    const { ast } = schema;
    if (!AST.isTypeLiteral(ast)) {
        return S.make(ast);
    }
    return S.make(new AST.TypeLiteral(extractParametersFromTypeLiteral(ast, 'selectSchema'), ast.indexSignatures, ast.annotations));
};
exports.selectable = selectable;
const insertable = (schema) => {
    const { ast } = schema;
    if (!AST.isTypeLiteral(ast)) {
        return S.make(ast);
    }
    const extracted = extractParametersFromTypeLiteral(ast, 'insertSchema');
    const res = new AST.TypeLiteral(extracted.map((prop) => new AST.PropertySignature(prop.name, prop.type, isOptionalType(prop.type), prop.isReadonly, prop.annotations)), ast.indexSignatures, ast.annotations);
    return S.make(res);
};
exports.insertable = insertable;
const updateable = (schema) => {
    const { ast } = schema;
    if (!AST.isTypeLiteral(ast)) {
        return S.make(ast);
    }
    const extracted = extractParametersFromTypeLiteral(ast, 'updateSchema');
    const res = new AST.TypeLiteral(extracted.map((prop) => new AST.PropertySignature(prop.name, AST.Union.make([prop.type, new AST.UndefinedKeyword()]), true, prop.isReadonly, prop.annotations)), ast.indexSignatures, ast.annotations);
    return S.make(res);
};
exports.updateable = updateable;
const getSchemas = (baseSchema) => ({
    Selectable: (0, exports.selectable)(baseSchema),
    Insertable: (0, exports.insertable)(baseSchema),
    Updateable: (0, exports.updateable)(baseSchema),
});
exports.getSchemas = getSchemas;
const extractParametersFromTypeLiteral = (ast, schemaType) => {
    return ast.propertySignatures
        .map((prop) => {
        if (!isColumnType(prop.type)) {
            return prop;
        }
        const schemas = prop.type.annotations[exports.ColumnTypeId];
        return new AST.PropertySignature(prop.name, schemas[schemaType].ast, prop.isOptional, prop.isReadonly, prop.annotations);
    })
        .filter((prop) => prop.type._tag !== 'NeverKeyword');
};
const isColumnType = (ast) => exports.ColumnTypeId in ast.annotations;
const isOptionalType = (ast) => {
    if (!AST.isUnion(ast)) {
        return false;
    }
    return (ast.types.some((t) => AST.isUndefinedKeyword(t)) ||
        ast.types.some((t) => isNullType(t)));
};
const isNullType = (ast) => AST.isLiteral(ast) &&
    Object.entries(ast.annotations).find(([sym, value]) => sym === AST.IdentifierAnnotationId.toString() && value === 'null');
const withEncoder = ({ encoder, query, }) => (input) => effect_1.Effect.gen(function* () {
    const encoded = yield* encode(encoder, input);
    return yield* toEffect(query, encoded);
});
exports.withEncoder = withEncoder;
const withDecoder = ({ decoder, query, }) => () => effect_1.Effect.gen(function* () {
    const res = yield* toEffect(query, undefined);
    return yield* decode(decoder, res);
});
exports.withDecoder = withDecoder;
const withCodec = ({ encoder, decoder, query, }) => (input) => effect_1.Effect.gen(function* () {
    const encoded = yield* encode(encoder, input);
    const res = yield* toEffect(query, encoded);
    return yield* decode(decoder, res);
});
exports.withCodec = withCodec;
const toEffect = (query, input) => effect_1.Effect.tryPromise({
    try: () => query(input),
    catch: (error) => {
        if (error instanceof kysely_1.NoResultError) {
            return new error_1.NotFoundError();
        }
        if (error instanceof Error) {
            return new error_1.QueryError({ message: error.message, cause: error });
        }
        return new error_1.QueryError({ message: String(error), cause: error });
    },
});
const encode = (inputSchema, input) => (0, effect_1.pipe)(input, S.encode(inputSchema), effect_1.Effect.mapError((parseError) => new error_1.QueryParseError({ parseError })));
const decode = (outputSchema, encoded) => (0, effect_1.pipe)(encoded, S.decode(outputSchema), effect_1.Effect.mapError((parseError) => new error_1.QueryParseError({ parseError })));
//# sourceMappingURL=kysely-helpers.js.map