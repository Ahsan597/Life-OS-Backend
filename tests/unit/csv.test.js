const { toCsv } = require("../../src/utils/csv");

describe("toCsv", () => {
  it("writes a header and CRLF-terminated rows", () => {
    expect(toCsv(["id", "title"], [{ id: "1", title: "Read" }])).toBe("id,title\r\n1,Read\r\n");
  });

  it("quotes commas, quotes and newlines", () => {
    const csv = toCsv(["note"], [{ note: 'said "hi", then\nleft' }]);
    expect(csv).toBe('note\r\n"said ""hi"", then\nleft"\r\n');
  });

  it("neutralizes spreadsheet formulas in text, not in numbers", () => {
    const rows = [{ v: "=HYPERLINK(1)" }, { v: "+1" }, { v: "-x" }, { v: "@SUM(A1)" }, { v: -3 }];
    expect(toCsv(["v"], rows).split("\r\n").slice(1, 6)).toEqual([
      "'=HYPERLINK(1)",
      "'+1",
      "'-x",
      "'@SUM(A1)",
      "-3",
    ]);
  });

  it("formats empty values, booleans, dates and arrays", () => {
    const row = {
      a: null,
      b: undefined,
      c: false,
      d: new Date("2026-03-02T10:00:00Z"),
      e: [1, 3],
    };
    expect(toCsv(["a", "b", "c", "d", "e"], [row]).split("\r\n")[1]).toBe(
      ',,false,2026-03-02T10:00:00.000Z,"[1,3]"'
    );
  });
});
