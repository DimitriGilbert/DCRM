import type { ClientAuthorizedEmailRecord } from "../crm/types.js";

export type EmailSenderMatch =
  | { readonly status: "matched"; readonly clientId: string; readonly pattern: string }
  | { readonly status: "unmatched"; readonly sender: string };

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeAuthorizedEmailPattern(value: string): string {
  return normalizeEmailAddress(value);
}

export function matchAuthorizedEmailSender(sender: string, authorizedEmails: readonly ClientAuthorizedEmailRecord[]): EmailSenderMatch {
  const normalizedSender = normalizeEmailAddress(sender);
  const matched = authorizedEmails
    .filter((record) => patternMatchesSender(record.pattern, normalizedSender))
    .toSorted(compareAuthorizedEmailMatches)[0];
  return matched ? { status: "matched", clientId: matched.clientId, pattern: matched.pattern } : { status: "unmatched", sender: normalizedSender };
}

export function authorizedEmailPatternsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeAuthorizedEmailPattern(left);
  const normalizedRight = normalizeAuthorizedEmailPattern(right);
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  const leftDomain = wildcardDomain(normalizedLeft);
  const rightDomain = wildcardDomain(normalizedRight);
  if (leftDomain && rightDomain) {
    return leftDomain === rightDomain || leftDomain.endsWith(`.${rightDomain}`) || rightDomain.endsWith(`.${leftDomain}`);
  }
  if (leftDomain) {
    return normalizedRight.endsWith(`@${leftDomain}`);
  }
  if (rightDomain) {
    return normalizedLeft.endsWith(`@${rightDomain}`);
  }
  return false;
}

function compareAuthorizedEmailMatches(left: ClientAuthorizedEmailRecord, right: ClientAuthorizedEmailRecord): number {
  const leftScore = patternSpecificityScore(left.pattern);
  const rightScore = patternSpecificityScore(right.pattern);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  const leftPattern = normalizeAuthorizedEmailPattern(left.pattern);
  const rightPattern = normalizeAuthorizedEmailPattern(right.pattern);
  const patternOrder = leftPattern.localeCompare(rightPattern);
  if (patternOrder !== 0) {
    return patternOrder;
  }
  const createdOrder = left.createdAt.getTime() - right.createdAt.getTime();
  if (createdOrder !== 0) {
    return createdOrder;
  }
  return left.id.localeCompare(right.id);
}

function patternSpecificityScore(pattern: string): number {
  const normalizedPattern = normalizeAuthorizedEmailPattern(pattern);
  if (!normalizedPattern.startsWith("*@")) {
    return 1_000_000 + normalizedPattern.length;
  }
  return wildcardDomain(normalizedPattern)?.length ?? 0;
}

function wildcardDomain(pattern: string): string | null {
  return pattern.startsWith("*@") ? pattern.slice(2) : null;
}

function patternMatchesSender(pattern: string, normalizedSender: string): boolean {
  const normalizedPattern = normalizeAuthorizedEmailPattern(pattern);
  if (normalizedPattern.startsWith("*@")) {
    return normalizedSender.endsWith(normalizedPattern.slice(1));
  }
  return normalizedSender === normalizedPattern;
}
