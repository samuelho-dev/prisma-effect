"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryParseError = exports.QueryError = exports.NotFoundError = void 0;
const effect_1 = require("effect");
class NotFoundError extends effect_1.Data.TaggedError('NotFoundError') {
}
exports.NotFoundError = NotFoundError;
class QueryError extends effect_1.Data.TaggedError('QueryError') {
}
exports.QueryError = QueryError;
class QueryParseError extends effect_1.Data.TaggedError('QueryParseError') {
}
exports.QueryParseError = QueryParseError;
//# sourceMappingURL=error.js.map