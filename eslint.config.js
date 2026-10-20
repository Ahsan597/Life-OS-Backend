const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
  { ignores: ["node_modules/", "coverage/", "src/generated/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      // Express error handlers must keep the 4-arg signature even if `next` is unused.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "error",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
  {
    // CLI scripts report to the terminal; the app itself logs through pino.
    files: ["scripts/**/*.js"],
    rules: { "no-console": "off" },
  },
  // Must stay last: turns off rules that would fight Prettier's formatting.
  prettier,
];
