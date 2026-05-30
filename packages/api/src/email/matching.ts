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
  const matched = authorizedEmails.find((record) => patternMatchesSender(record.pattern, normalizedSender));
  return matched ? { status: "matched", clientId: matched.clientId, pattern: matched.pattern } : { status: "unmatched", sender: normalizedSender };
}

function patternMatchesSender(pattern: string, normalizedSender: string): boolean {
  const normalizedPattern = normalizeAuthorizedEmailPattern(pattern);
  if (normalizedPattern.startsWith("*@")) {
    return normalizedSender.endsWith(normalizedPattern.slice(1));
  }
  return normalizedSender === normalizedPattern;
}
