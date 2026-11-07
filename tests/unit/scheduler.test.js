const { startScheduler } = require("../../src/jobs/scheduler");

describe("scheduler", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("runs each job after its initial delay and then on its interval", async () => {
    const run = jest.fn().mockResolvedValue({});
    const scheduler = startScheduler([{ name: "a", intervalMs: 1000, initialDelayMs: 100, run }]);

    await jest.advanceTimersByTimeAsync(99);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    await scheduler.stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never overlaps a job with itself, and stop waits for it", async () => {
    let finish;
    const run = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    const scheduler = startScheduler([{ name: "slow", intervalMs: 100, initialDelayMs: 0, run }]);

    await jest.advanceTimersByTimeAsync(350);
    expect(run).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = scheduler.stop().then(() => (stopped = true));
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("keeps running after a job fails", async () => {
    const run = jest.fn().mockRejectedValue(new Error("boom"));
    const scheduler = startScheduler([{ name: "bad", intervalMs: 100, initialDelayMs: 0, run }]);

    await jest.advanceTimersByTimeAsync(250);
    expect(run).toHaveBeenCalledTimes(3);
    await scheduler.stop();
  });
});
