const { resolveLogicalDate } = require("../../src/utils/dateUtils");

describe("resolveLogicalDate", () => {
  it("resolves an earlier calendar day for a timezone behind UTC", () => {
    // 2026-01-01T02:00:00Z is still Dec 31 evening in Los Angeles (UTC-8, winter)
    const instant = new Date("2026-01-01T02:00:00Z");
    expect(resolveLogicalDate(instant, "America/Los_Angeles")).toBe("2025-12-31");
  });

  it("resolves the same or later calendar day for a timezone ahead of UTC", () => {
    // Same instant is already Jan 1 morning in Karachi (UTC+5)
    const instant = new Date("2026-01-01T02:00:00Z");
    expect(resolveLogicalDate(instant, "Asia/Karachi")).toBe("2026-01-01");
  });

  it("shows the same instant can be two different calendar days depending on timezone", () => {
    const instant = new Date("2026-01-01T02:00:00Z");
    const laDate = resolveLogicalDate(instant, "America/Los_Angeles");
    const karachiDate = resolveLogicalDate(instant, "Asia/Karachi");
    expect(laDate).not.toBe(karachiDate);
  });
});
