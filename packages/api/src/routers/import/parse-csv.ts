/**
 * RFC 4180 compliant CSV parser.
 * Handles quoted fields, embedded commas, newlines, and escaped quotes.
 *
 * @param csvData - Raw CSV string
 * @param skipHeader - Whether to skip the first row as a header
 * @returns Array of rows, each row an array of cell strings
 */
export function parseCsv(csvData: string, skipHeader: boolean): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;

  while (i < csvData.length) {
    const char = csvData[i];

    if (inQuotes) {
      if (char === '"') {
        // Peek ahead for escaped quote
        if (i + 1 < csvData.length && csvData[i + 1] === '"') {
          currentCell += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      currentCell += char;
      i++;
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ",") {
        currentRow.push(currentCell);
        currentCell = "";
        i++;
        continue;
      }
      if (char === "\r") {
        // Handle \r\n or lone \r
        currentRow.push(currentCell);
        currentCell = "";
        if (currentRow.length > 0 && currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        if (i < csvData.length && csvData[i] === "\n") {
          i++;
        }
        continue;
      }
      if (char === "\n") {
        currentRow.push(currentCell);
        currentCell = "";
        if (currentRow.length > 0 && currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      }
      currentCell += char;
      i++;
    }
  }

  // Flush last cell and row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (skipHeader && rows.length > 0) {
    rows.shift();
  }

  return rows;
}
