const path = require("path");
const dotenv = require("dotenv");

// Runs before any test file (Jest `setupFiles`) and in globalSetup, i.e.
// before anything requires src/config/env.
//
// .env.test values override a developer's .env, because dotenv itself never
// overrides. In CI, variables the pipeline sets explicitly win instead.
const fileVars = dotenv.config({
  path: path.join(__dirname, "../../.env.test"),
  processEnv: {},
  quiet: true,
}).parsed;

for (const [key, value] of Object.entries(fileVars)) {
  if (process.env.CI && process.env[key] !== undefined) continue;
  process.env[key] = value;
}

// Integration tests delete rows, so never run them against a non-test database.
const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to run tests against non-test database "${dbName}"`);
}
