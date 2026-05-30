export function parseSafeOutgoingWebhookUrl(value: string): URL {
  const url = new URL(value);
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error("Outgoing webhook URL must not include embedded credentials.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Outgoing webhook URL must use HTTP or HTTPS.");
  }
  if (isUnsafeHost(url.hostname)) {
    throw new Error("Outgoing webhook URL host is not allowed.");
  }
  return url;
}

function isUnsafeHost(hostname: string): boolean {
  const lower = normalizeHostname(hostname);
  return lower === "localhost" || lower === "::1" || lower.endsWith(".localhost") || isPrivateIpv4Host(lower);
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
}

function isPrivateIpv4Host(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = octets;
  if (first === undefined || second === undefined) {
    return false;
  }
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
