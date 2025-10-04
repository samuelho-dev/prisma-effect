#!/usr/bin/env node
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generator = void 0;
const generator_helper_1 = require("@prisma/generator-helper");
const orchestrator_1 = require("./orchestrator");
// Re-export kysely helpers for generated code
__exportStar(require("../kysely/helpers"), exports);
exports.generator = (0, generator_helper_1.generatorHandler)({
    onManifest: () => ({
        version: '1.0.0',
        defaultOutput: './generated',
        prettyName: 'Prisma Effect Kysely Generator',
    }),
    onGenerate: async (options) => {
        const orchestrator = new orchestrator_1.GeneratorOrchestrator(options);
        await orchestrator.generate(options);
    },
});
//# sourceMappingURL=index.js.map