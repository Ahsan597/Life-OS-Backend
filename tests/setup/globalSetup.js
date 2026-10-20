const { execSync } = require("child_process");

// Bring the test database schema up to date once per run.
module.exports = async function globalSetup() {
  require("./loadTestEnv");
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });
};
