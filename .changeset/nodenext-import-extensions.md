---
"prisma-effect-kysely": patch
---

Emit explicit `.js` extensions on the generated files' relative imports (`types.ts` importing
`./enums.js`, and the `index.ts` barrel re-exporting `./enums.js` / `./types.js`).

Without the extension, generated code only resolves under bundler-style module resolution. Under
`moduleResolution: "node16" | "nodenext"` (and especially with `verbatimModuleSyntax`), the bare
`./enums` specifier fails (TS2835), which left every imported enum schema typed as `any` and
collapsed `Selectable(...)` inference to `{ [x: string]: any }` across all table schemas. The
explicit extension is accepted by bundler/Node16/NodeNext alike, so the generated output now
type-checks under strict NodeNext projects.
