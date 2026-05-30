import { describe, it, expect } from "vitest";
import {
  matchSender,
  matchSenders,
  normalizeEmail,
  isWildcardPattern,
  extractWildcardDomain,
  extractDomain,
  isValidPattern,
  type AuthorizedPattern,
} from "../src/matching";

describe("normalizeEmail", () => {
  it("trims and lowercases an email", () => {
    expect(normalizeEmail("  John@Example.COM  ")).toBe("john@example.com");
  });

  it("handles already-normalized email", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });
});

describe("isWildcardPattern", () => {
  it("returns true for *@domain.com", () => {
    expect(isWildcardPattern("*@example.com")).toBe(true);
  });

  it("returns false for exact email", () => {
    expect(isWildcardPattern("user@example.com")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isWildcardPattern("")).toBe(false);
  });
});

describe("extractWildcardDomain", () => {
  it("extracts domain from wildcard", () => {
    expect(extractWildcardDomain("*@example.com")).toBe("example.com");
  });

  it("returns null for non-wildcard", () => {
    expect(extractWildcardDomain("user@example.com")).toBe(null);
  });

  it("returns null for bare *@", () => {
    expect(extractWildcardDomain("*@")).toBe(null);
  });
});

describe("extractDomain", () => {
  it("extracts domain from email", () => {
    expect(extractDomain("user@example.com")).toBe("example.com");
  });

  it("returns null for string without @", () => {
    expect(extractDomain("no-at-sign")).toBe(null);
  });

  it("returns null for trailing @", () => {
    expect(extractDomain("user@")).toBe(null);
  });
});

describe("isValidPattern", () => {
  it("accepts valid exact email", () => {
    expect(isValidPattern("user@example.com")).toBe(true);
  });

  it("accepts valid wildcard pattern", () => {
    expect(isValidPattern("*@example.com")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidPattern("")).toBe(false);
  });

  it("rejects string without @", () => {
    expect(isValidPattern("noemail")).toBe(false);
  });

  it("rejects wildcard without domain dot", () => {
    expect(isValidPattern("*@localhost")).toBe(false);
  });

  it("rejects bare @", () => {
    expect(isValidPattern("@")).toBe(false);
  });

  it("rejects leading @", () => {
    expect(isValidPattern("@example.com")).toBe(false);
  });
});

describe("matchSender", () => {
  const patterns: readonly AuthorizedPattern[] = [
    { pattern: "alice@example.com", clientId: "client-1", clientName: "Alice Corp" },
    { pattern: "*@widget.co", clientId: "client-2", clientName: "Widget Inc" },
    { pattern: "bob@another.org", clientId: "client-3", clientName: "Bob" },
  ];

  it("matches exact email case-insensitively", () => {
    const result = matchSender("Alice@Example.COM", patterns);
    expect(result).toEqual({
      matched: true,
      clientId: "client-1",
      clientName: "Alice Corp",
      pattern: "alice@example.com",
    });
  });

  it("matches wildcard domain pattern", () => {
    const result = matchSender("anyone@widget.co", patterns);
    expect(result).toEqual({
      matched: true,
      clientId: "client-2",
      clientName: "Widget Inc",
      pattern: "*@widget.co",
    });
  });

  it("prefers exact match over wildcard", () => {
    const mixed: readonly AuthorizedPattern[] = [
      { pattern: "*@example.com", clientId: "wildcard-client" },
      { pattern: "specific@example.com", clientId: "exact-client" },
    ];
    const result = matchSender("specific@example.com", mixed);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.clientId).toBe("exact-client");
    }
  });

  it("returns unmatched for unknown sender", () => {
    const result = matchSender("unknown@other.com", patterns);
    expect(result).toEqual({ matched: false });
  });

  it("returns unmatched for empty patterns", () => {
    const result = matchSender("user@example.com", []);
    expect(result).toEqual({ matched: false });
  });

  it("handles email with leading/trailing whitespace", () => {
    const result = matchSender("  alice@example.com  ", patterns);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.clientId).toBe("client-1");
    }
  });
});

describe("matchSenders", () => {
  const patterns: readonly AuthorizedPattern[] = [
    { pattern: "alice@example.com", clientId: "client-1" },
    { pattern: "*@widget.co", clientId: "client-2" },
  ];

  it("matches multiple senders to their respective clients", () => {
    const results = matchSenders(
      ["alice@example.com", "dev@widget.co", "unknown@other.com"],
      patterns,
    );

    expect(results).toHaveLength(3);
    expect(results[0]!.matched && results[0]!.clientId).toBe("client-1");
    expect(results[1]!.matched && results[1]!.clientId).toBe("client-2");
    expect(results[2]).toEqual({ matched: false });
  });

  it("deduplicates clients matched by different senders", () => {
    const results = matchSenders(
      ["a@widget.co", "b@widget.co"],
      patterns,
    );

    // Both match client-2, deduplicated to one match
    const matchedResults = results.filter((r) => r.matched);
    expect(matchedResults).toHaveLength(1);
    if (matchedResults[0]!.matched) {
      expect(matchedResults[0]!.clientId).toBe("client-2");
    }
  });

  it("returns empty array for empty senders", () => {
    const results = matchSenders([], patterns);
    expect(results).toEqual([]);
  });
});
