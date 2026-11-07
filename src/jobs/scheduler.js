/**
 * Minimal in-process job runner: each job runs every `intervalMs` (first run
 * after `initialDelayMs`) and never overlaps itself.
 *
 * Good enough for one server. Jobs are idempotent (they dedupe in the
 * database), so several servers running them is safe, just wasteful. Move to
 * a real queue (e.g. BullMQ + Redis) once jobs need retries, distribution or
 * exactly-once scheduling.
 */
const logger = require("../config/logger");

/**
 * @param {{name: string, intervalMs: number, initialDelayMs?: number, run: () => Promise<unknown>}[]} jobs
 * @returns {{stop: () => Promise<void>}} stop clears the timers and waits for running jobs
 */
function startScheduler(jobs) {
  const timers = [];
  const running = new Map();

  for (const job of jobs) {
    const tick = () => {
      if (running.has(job.name)) return;
      const started = Date.now();
      const run = job
        .run()
        .then((result) =>
          logger.info({ job: job.name, result, ms: Date.now() - started }, "Job done")
        )
        .catch((err) => logger.error({ err, job: job.name }, "Job failed"))
        .finally(() => running.delete(job.name));
      running.set(job.name, run);
    };

    // unref: pending timers alone never keep the process alive.
    timers.push(setTimeout(tick, job.initialDelayMs ?? 10_000).unref());
    timers.push(setInterval(tick, job.intervalMs).unref());
  }

  logger.info({ jobs: jobs.map((j) => j.name) }, "Scheduler started");

  return {
    async stop() {
      timers.forEach(clearTimeout);
      await Promise.all(running.values());
    },
  };
}

module.exports = { startScheduler };
