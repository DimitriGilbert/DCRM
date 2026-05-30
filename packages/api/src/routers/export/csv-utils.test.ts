import { describe, it, expect, vi, beforeEach } from "vitest";

import { rowsToCsv, escapeCsvCell } from "./csv-utils";

describe("escapeCsvCell", () => {
  it("returns empty string for null", () => {
    expect(escapeCsvCell(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("returns plain string unchanged", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
  });

  it("escapes cells with commas", () => {
    expect(escapeCsvCell("hello, world")).toBe('"hello, world"');
  });

  it("escapes cells with quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("escapes cells with newlines", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("converts numbers to strings", () => {
    expect(escapeCsvCell(42)).toBe("42");
  });
});

describe("rowsToCsv", () => {
  it("converts rows to CSV with headers", () => {
    const rows = [
      { name: "John", email: "john@test.com", company: "Acme" },
      { name: "Jane", email: "jane@test.com", company: "Globex" },
    ];

    const csv = rowsToCsv(rows);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("name,email,company");
    expect(lines[1]).toBe("John,john@test.com,Acme");
    expect(lines[2]).toBe("Jane,jane@test.com,Globex");
  });

  it("returns empty string for empty rows", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("handles special characters in values", () => {
    const rows = [{ name: 'John, Jr.', notes: 'He said "hello"' }];
    const csv = rowsToCsv(rows);
    const lines = csv.split("\n");

    expect(lines[1]).toBe('"John, Jr.","He said ""hello"""');
  });
});
