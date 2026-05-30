import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type OutgoingWebhookAddressResolver = (hostname: string) => Promise<readonly { readonly address: string }[]>;

export type OutgoingWebhookConnectionTarget = {
  readonly address: string;
  readonly family: 4 | 6;
};

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

export async function validateOutgoingWebhookDestination(url: URL, resolver: OutgoingWebhookAddressResolver = resolveHostnameAddresses): Promise<void> {
  await resolveOutgoingWebhookConnectionTarget(url, resolver);
}

export async function resolveOutgoingWebhookConnectionTarget(url: URL, resolver: OutgoingWebhookAddressResolver = resolveHostnameAddresses): Promise<OutgoingWebhookConnectionTarget> {
  if (isUnsafeHost(url.hostname)) {
    throw new Error("Outgoing webhook URL host is not allowed.");
  }
  const literalFamily = isIP(normalizeHostname(url.hostname));
  if (literalFamily === 4 || literalFamily === 6) {
    return { address: normalizeHostname(url.hostname), family: literalFamily };
  }
  const addresses = await resolver(url.hostname);
  if (addresses.length === 0) {
    throw new Error("Outgoing webhook URL host could not be resolved.");
  }
  const resolved = addresses.map((address) => ({ address: normalizeHostname(address.address), family: isIP(normalizeHostname(address.address)) }));
  if (resolved.some((address) => address.family !== 4 && address.family !== 6)) {
    throw new Error("Outgoing webhook URL resolved to an invalid address.");
  }
  if (resolved.some((address) => isUnsafeIpAddress(address.address))) {
    throw new Error("Outgoing webhook URL resolves to a host that is not allowed.");
  }
  const [target] = resolved;
  if (!target || (target.family !== 4 && target.family !== 6)) {
    throw new Error("Outgoing webhook URL host could not be resolved.");
  }
  return { address: target.address, family: target.family };
}

function isUnsafeHost(hostname: string): boolean {
  const lower = normalizeHostname(hostname);
  return lower === "localhost" || lower.endsWith(".localhost") || isUnsafeIpAddress(lower);
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
  return first === 0 || first === 10 || first === 127 || first >= 224 || (first === 100 && second >= 64 && second <= 127) || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

async function resolveHostnameAddresses(hostname: string): Promise<readonly { readonly address: string }[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

function isUnsafeIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  if (isPrivateIpv4Host(normalized)) {
    return true;
  }
  const ipv6Bytes = parseIpv6Bytes(normalized);
  if (!ipv6Bytes) {
    return false;
  }
  const mappedIpv4 = ipv4FromMappedIpv6(ipv6Bytes);
  if (mappedIpv4 && isPrivateIpv4Host(mappedIpv4)) {
    return true;
  }
  return isUnsafeIpv6Bytes(ipv6Bytes);
}

function isUnsafeIpv6Bytes(bytes: readonly number[]): boolean {
  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  return allZero || loopback || bytes[0] === 0xff || (bytes[0] === 0xfc || bytes[0] === 0xfd) || (bytes[0] === 0xfe && (bytes[1] ?? 0) >= 0x80 && (bytes[1] ?? 0) <= 0xbf);
}

function ipv4FromMappedIpv6(bytes: readonly number[]): string | undefined {
  const isMapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (!isMapped) {
    return undefined;
  }
  const [first, second, third, fourth] = bytes.slice(12, 16);
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return undefined;
  }
  return `${first}.${second}.${third}.${fourth}`;
}

function parseIpv6Bytes(address: string): readonly number[] | undefined {
  if (isIP(address) !== 6) {
    return undefined;
  }
  const withoutZone = address.split("%")[0] ?? address;
  const [head = "", tail = ""] = withoutZone.split("::", 2);
  const hasCompression = withoutZone.includes("::");
  const headGroups = parseIpv6Groups(head);
  const tailGroups = parseIpv6Groups(tail);
  if (!headGroups || !tailGroups) {
    return undefined;
  }
  const missingGroups = hasCompression ? 8 - headGroups.length - tailGroups.length : 0;
  if (missingGroups < 0 || (!hasCompression && headGroups.length + tailGroups.length !== 8)) {
    return undefined;
  }
  const groups = [...headGroups, ...Array.from({ length: missingGroups }, () => 0), ...tailGroups];
  if (groups.length !== 8) {
    return undefined;
  }
  return groups.flatMap((group) => [(group >> 8) & 0xff, group & 0xff]);
}

function parseIpv6Groups(value: string): readonly number[] | undefined {
  if (value.length === 0) {
    return [];
  }
  const parts = value.split(":");
  const groups: number[] = [];
  for (const part of parts) {
    if (part.includes(".")) {
      const ipv4Groups = parseIpv4AsIpv6Groups(part);
      if (!ipv4Groups) {
        return undefined;
      }
      groups.push(...ipv4Groups);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) {
      return undefined;
    }
    groups.push(Number.parseInt(part, 16));
  }
  return groups;
}

function parseIpv4AsIpv6Groups(value: string): readonly number[] | undefined {
  const octets = value.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  const [first, second, third, fourth] = octets;
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return undefined;
  }
  return [(first << 8) + second, (third << 8) + fourth];
}
