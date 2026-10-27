const {
  resolveLogicalDate,
  isValidDateString,
  addDays,
  diffDays,
  dayOfWeek,
  weekStart,
  toDbDate,
  fromDbDate,
} = require("../../src/utils/dateUtils");

describe("calendar helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-2-3")).toBe(false);
    expect(isValidDateString(undefined)).toBe(false);
  });

  it("adds and diffs days across month and year boundaries", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2025-12-30", "2026-01-02")).toBe(3);
  });

  it("uses 0 = Sunday and Monday-based weeks", () => {
    expect(dayOfWeek("2026-03-01")).toBe(0); // Sunday
    expect(weekStart("2026-03-01")).toBe("2026-02-23");
    expect(weekStart("2026-03-02")).toBe("2026-03-02");
  });

  it("round-trips through the DB date representation", () => {
    expect(fromDbDate(toDbDate("2026-07-04"))).toBe("2026-07-04");
  });
});

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
