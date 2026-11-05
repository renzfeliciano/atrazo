import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * Module boundaries (see docs/ARCHITECTURE.md):
 * - Code outside a feature imports it only through its public entry: "@/features/<name>".
 * - Client code never imports "@/server/**"; server code never imports UI.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/switch-exhaustiveness-check": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*"],
              message: "Import a feature through its public entry: '@/features/<name>'.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**", "src/shared/ui/**", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*"],
              message: "Import a feature through its public entry: '@/features/<name>'.",
            },
            {
              group: ["@/server", "@/server/*"],
              message: "Client code must not import server modules. Call the API instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/features/*/ui", "@/features/*/ui/*", "@/shared/ui", "@/shared/ui/*", "react", "react-dom"], message: "Server code must not import UI." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", ".next-*/**", ".playwright-mcp/**", ".data/**", "out/**", "build/**", "next-env.d.ts", "design/**", "public/sw.js"]),
]);

export default eslintConfig;
