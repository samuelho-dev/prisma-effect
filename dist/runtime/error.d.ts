import type { ParseError } from 'effect/ParseResult';
declare const NotFoundError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "NotFoundError";
} & Readonly<A>;
export declare class NotFoundError extends NotFoundError_base<{}> {
}
declare const QueryError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryError";
} & Readonly<A>;
export declare class QueryError extends QueryError_base<{
    readonly message: string;
    readonly cause?: unknown;
}> {
}
declare const QueryParseError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryParseError";
} & Readonly<A>;
export declare class QueryParseError extends QueryParseError_base<{
    readonly parseError: ParseError;
}> {
}
export type DatabaseError = NotFoundError | QueryError | QueryParseError;
export {};
//# sourceMappingURL=error.d.ts.map