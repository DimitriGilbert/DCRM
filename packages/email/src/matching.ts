/**
 * Email address matching for incoming email → client resolution.
 *
 * Supports:
 * - Exact email match (case-insensitive local + domain)
 * - Wildcard domain patterns: `*@example.com` matches any user at example.com
 * - Unmatched sender detection
 */

/** A single authorized address pattern associated with a client. */
export type AuthorizedPattern = {
  /** The pattern string. Either an exact email or `*@domain.com`. */
  readonly pattern: string;
  /** The client ID this pattern resolves to. */
  readonly clientId: string;
  /** Display name of the client (for matching result metadata). */
  readonly clientName?: string;
};

/** Result of matching a sender address against authorized patterns. */
export type MatchResult =
  | { matched: true; clientId: string; clientName?: string; pattern: string }
  | { matched: false };

/**
 * Normalizes an email address for comparison.
 * Trims whitespace and lowercases the entire address.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Checks if a pattern is a wildcard domain pattern.
 * Wildcard patterns start with `*@`.
 */
export function isWildcardPattern(pattern: string): boolean {
  return pattern.startsWith("*@");
}

/**
 * Extracts the domain from a wildcard pattern `*@domain.com`.
 * Returns null if not a wildcard pattern.
 */
export function extractWildcardDomain(pattern: string): string | null {
  if (!isWildcardPattern(pattern)) return null;
  const domain = pattern.slice(2);
  return domain.length > 0 ? domain.toLowerCase() : null;
}

/**
 * Extracts the domain portion of an email address.
 * Returns null if the email does not contain `@`.
 */
export function extractDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1 || atIndex === email.length - 1) return null;
  return email.slice(atIndex + 1).toLowerCase();
}

/**
 * Matches a sender email address against a list of authorized patterns.
 *
 * Priority:
 * 1. Exact email match (case-insensitive)
 * 2. Wildcard domain match (`*@domain.com`)
 *
 * If multiple exact matches exist, the first one wins.
 * If no exact match, the first wildcard match wins.
 * If no pattern matches, returns `{ matched: false }`.
 */
export function matchSender(
  senderEmail: string,
  patterns: readonly AuthorizedPattern[],
): MatchResult {
  const normalized = normalizeEmail(senderEmail);

  // 1. Try exact match first
  for (const p of patterns) {
    if (normalizeEmail(p.pattern) === normalized) {
      return {
        matched: true,
        clientId: p.clientId,
        clientName: p.clientName,
        pattern: p.pattern,
      };
    }
  }

  // 2. Try wildcard domain match
  const senderDomain = extractDomain(normalized);
  if (senderDomain !== null) {
    for (const p of patterns) {
      const wildcardDomain = extractWildcardDomain(p.pattern);
      if (wildcardDomain !== null && wildcardDomain === senderDomain) {
        return {
          matched: true,
          clientId: p.clientId,
          clientName: p.clientName,
          pattern: p.pattern,
        };
      }
    }
  }

  return { matched: false };
}

/**
 * Matches multiple sender addresses and returns all unique results.
 * Deduplicates by client ID — if two patterns match different senders
 * to the same client, that client appears once.
 */
export function matchSenders(
  senderEmails: readonly string[],
  patterns: readonly AuthorizedPattern[],
): readonly MatchResult[] {
  const seen = new Set<string>();
  const results: MatchResult[] = [];

  for (const email of senderEmails) {
    const result = matchSender(email, patterns);
    if (result.matched) {
      if (!seen.has(result.clientId)) {
        seen.add(result.clientId);
        results.push(result);
      }
    } else {
      results.push(result);
    }
  }

  return results;
}

/**
 * Validates an authorized address pattern.
 * Returns true if it is a valid exact email or a valid wildcard domain pattern.
 */
export function isValidPattern(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (trimmed.length === 0) return false;

  if (isWildcardPattern(trimmed)) {
    const domain = extractWildcardDomain(trimmed);
    return domain !== null && domain.length > 0 && domain.includes(".");
  }

  // Basic email validation: contains @ with non-empty parts
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return false;
  const domain = trimmed.slice(atIndex + 1);
  return domain.includes(".");
}
