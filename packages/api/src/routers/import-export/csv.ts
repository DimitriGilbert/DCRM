type CsvRecord = Record<string, string>;

export function parseCsv(input: string): readonly CsvRecord[] {
  const rows = parseCsvRows(input);
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  if (header.length === 0 || header.every((cell) => cell.length === 0)) {
    return [];
  }
  return rows.slice(1).filter((row) => row.some((cell) => cell.trim().length > 0)).map((row) => rowToRecord(header, row));
}

export function stringifyCsv(records: readonly Record<string, unknown>[]): string {
  const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
  if (headers.length === 0) {
    return "";
  }
  return [headers, ...records.map((record) => headers.map((header) => formatCsvValue(record[header])))]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}

function parseCsvRows(input: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character) {
      cell += character;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function rowToRecord(header: readonly string[], row: readonly string[]): CsvRecord {
  return Object.fromEntries(header.map((key, index) => [key, row[index]?.trim() ?? ""]));
}

function formatCsvValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeCsvCell(value: string): string {
  const safeValue = escapeSpreadsheetFormula(value);
  return /[",\n\r]/u.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
}

function escapeSpreadsheetFormula(value: string): string {
  return /^[=+\-@\t\r\n]/u.test(value) ? `'${value}` : value;
}
