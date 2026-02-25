import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import validateJsxNesting from "eslint-plugin-validate-jsx-nesting";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores (files not part of any tsconfig)
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "eslint.config.js",
      "playwright.config.ts",
      "vitest.config.ts",
      "e2e/**",
      "client/vite.config.ts",
      "server/drizzle.config.ts",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict type-checked rules
  ...tseslint.configs.strictTypeChecked,

  // TypeScript parser options for type-aware linting
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Shared rules for all TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      // Allow _prefixed unused vars (common for unused params)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow numbers and booleans in template literals
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      // Void returns in arrow functions are common in React callbacks
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Deprecated APIs should be warned, not blocked
      "@typescript-eslint/no-deprecated": "warn",
      // Allow void in union types (common in Hono middleware signatures)
      "@typescript-eslint/no-invalid-void-type": "off",
      // Destructured methods from libs (e.g., Hono) are intentional
      "@typescript-eslint/unbound-method": "off",
    },
  },

  // React-specific rules (client only)
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "validate-jsx-nesting": validateJsxNesting,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Detect invalid HTML element nesting (e.g. <button> inside <button>)
      "validate-jsx-nesting/no-invalid-jsx-nesting": "error",
      // New React hooks v7 rules — warn for existing code
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },

  // Test file overrides (relaxed rules)
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },

  // Prettier must be last to override formatting rules
  prettier,
);
