/**
 * RFC 4180 CSV writer.
 *
 * Text that starts with = + - @ or a tab/CR is prefixed with a single quote:
 * spreadsheets would otherwise run it as a formula (CSV injection), e.g. a
 * habit titled "=HYPERLINK(...)". Numbers and booleans are left as they are.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function cell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return cell(JSON.stringify(value));
  if (typeof value !== "string") return String(value);

  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * @param {string[]} columns header row; also the keys read from each row
 * @param {object[]} rows
 * @returns {string} CRLF-separated, as RFC 4180 specifies
 */
function toCsv(columns, rows) {
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(row[column])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

module.exports = { toCsv };
