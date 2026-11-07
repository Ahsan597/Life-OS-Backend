/**
 * Runs the background jobs once, now, instead of waiting for the scheduler:
 *
 *   npm run jobs:run                  # every job
 *   npm run jobs:run daily-reminders  # one job by name
 *
 * Handy to test reminders. Jobs are idempotent, so running one while the
 * server's scheduler is also running is safe.
 */
const prisma = require("../src/config/prisma");
const { jobs } = require("../src/jobs");

async function main() {
  const name = process.argv[2];
  const selected = name ? jobs.filter((j) => j.name === name) : jobs;
  if (selected.length === 0) {
    throw new Error(`Unknown job "${name}". Jobs: ${jobs.map((j) => j.name).join(", ")}`);
  }
  for (const job of selected) {
    console.log(job.name, await job.run());
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
