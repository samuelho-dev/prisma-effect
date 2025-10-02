import * as prettier from "prettier";

export async function formatCode(code: string) {
  try {
    return await prettier.format(code, {
      parser: "typescript",
      semi: true,
      singleQuote: true,
      trailingComma: "es5",
      tabWidth: 2,
      printWidth: 100,
    });
  } catch (error: unknown) {
    // If prettier fails, return the original code
    console.warn(
      "Prettier formatting failed, returning unformatted code:",
      error instanceof Error ? error.message : String(error),
    );
    return code;
  }
}
