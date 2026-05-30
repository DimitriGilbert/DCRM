/**
 * Escapes a single CSV cell value per RFC 4180.
 */
export function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);

  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts an array of homogeneous objects to a CSV string.
 * Column order is determined by the keys of the first row.
 */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]!);
  const headerLine = headers.join(",");

  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvCell(row[h])).join(","),
  );

  return [headerLine, ...dataLines].join("\n");
}
