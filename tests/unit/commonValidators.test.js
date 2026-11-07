const { text, timezone } = require("../../src/validators/common.validators");
const { resolveLocalTime } = require("../../src/utils/dateUtils");

const BELL = String.fromCharCode(7);
const NUL = String.fromCharCode(0);
// "e" + combining acute accent; NFC turns it into the single character "é".
const DECOMPOSED_E = "e" + String.fromCharCode(0x301);

describe("text()", () => {
  const field = text({ min: 1, max: 5, message: "Required" });

  it("strips control characters, keeps newlines and tabs, and trims", () => {
    expect(field.parse(`  a${BELL}b${NUL}  `)).toBe("ab");
    expect(text({ max: 20 }).parse("line 1\n\tline 2")).toBe("line 1\n\tline 2");
  });

  it("normalizes to NFC before checking length", () => {
    const value = field.parse(DECOMPOSED_E);
    expect(value).toBe(String.fromCharCode(0xe9));
    expect(value).toHaveLength(1);
  });

  it("applies min/max to the cleaned value", () => {
    expect(field.safeParse(`  ${BELL} `).error.issues[0].message).toBe("Required");
    expect(field.safeParse("abcdef").success).toBe(false);
  });
});

describe("timezone", () => {
  it("accepts IANA names only", () => {
    expect(timezone.safeParse("Asia/Karachi").success).toBe(true);
    expect(timezone.safeParse("Mars/Base").success).toBe(false);
  });
});

describe("resolveLocalTime", () => {
  it("gives the 24h wall-clock time in the timezone", () => {
    const instant = new Date("2026-10-27T19:05:00Z");
    expect(resolveLocalTime(instant, "Asia/Karachi")).toBe("00:05");
    expect(resolveLocalTime(instant, "UTC")).toBe("19:05");
    expect(resolveLocalTime(new Date("2026-10-27T00:00:00Z"), "UTC")).toBe("00:00");
  });
});
