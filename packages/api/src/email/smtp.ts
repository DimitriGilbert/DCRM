import net from "node:net";
import tls from "node:tls";

import type { SmtpPlainTextClient, SmtpPlainTextMessage } from "./send.js";

type SmtpConnection = net.Socket | tls.TLSSocket;

type SmtpResponse = {
  readonly code: number;
  readonly lines: readonly string[];
};

const SMTP_TIMEOUT_MS = 30_000;

export function createNodeSmtpPlainTextClient(): SmtpPlainTextClient {
  return {
    async sendPlainText(input) {
      const connection = await openConnection(input.account.host, input.account.port);
      const reader = createSmtpReader(connection);
      try {
        await expectCode(await reader.readResponse(), [220]);
        const ehlo = await sendCommand(connection, reader, `EHLO ${clientHostname()}`, [250]);
        const capabilities = parseCapabilities(ehlo);
        let activeConnection = connection;
        let activeReader = reader;
        let encryptedConnection = isEncryptedConnection(activeConnection);

        if (shouldUpgradeWithStartTls(input.account.port, capabilities, hasSmtpCredentials(input.account.username, input.account.password))) {
          await sendCommand(activeConnection, activeReader, "STARTTLS", [220]);
          const tlsConnection = tls.connect({ socket: activeConnection, servername: input.account.host, rejectUnauthorized: true });
          tlsConnection.setTimeout(SMTP_TIMEOUT_MS);
          await waitForSecureConnect(tlsConnection);
          activeConnection = tlsConnection;
          activeReader = createSmtpReader(activeConnection);
          encryptedConnection = true;
          const tlsEhlo = await sendCommand(activeConnection, activeReader, `EHLO ${clientHostname()}`, [250]);
          await authenticate(activeConnection, activeReader, tlsEhlo, input.account.username, input.account.password);
        } else {
          assertSafeAuthenticationBoundary(encryptedConnection, capabilities, input.account.username, input.account.password);
          await authenticate(activeConnection, activeReader, ehlo, input.account.username, input.account.password);
        }

        await sendCommand(activeConnection, activeReader, `MAIL FROM:<${sanitizeAddress(input.account.fromEmail)}>`, [250]);
        for (const recipient of input.message.to) {
          await sendCommand(activeConnection, activeReader, `RCPT TO:<${sanitizeAddress(recipient)}>`, [250, 251]);
        }
        await sendCommand(activeConnection, activeReader, "DATA", [354]);
        const dataResponse = await sendData(activeConnection, activeReader, formatMessage(input.message), [250]);
        await sendCommand(activeConnection, activeReader, "QUIT", [221]).catch(() => undefined);
        activeConnection.end();
        return { messageId: extractQueuedMessageId(dataResponse) };
      } catch (error) {
        connection.destroy();
        throw error;
      }
    },
  };
}

async function openConnection(host: string, port: number): Promise<SmtpConnection> {
  const secure = port === 465;
  const connection = secure ? tls.connect({ host, port, servername: host, rejectUnauthorized: true }) : net.connect({ host, port });
  connection.setTimeout(SMTP_TIMEOUT_MS);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      connection.off("connect", onConnect);
      connection.off("secureConnect", onConnect);
      connection.off("error", onError);
      connection.off("timeout", onTimeout);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error("SMTP connection timed out."));
    };
    connection.once(secure ? "secureConnect" : "connect", onConnect);
    connection.once("error", onError);
    connection.once("timeout", onTimeout);
  });
  return connection;
}

function createSmtpReader(connection: SmtpConnection): { readonly readResponse: () => Promise<SmtpResponse> } {
  let buffer = "";
  const pending: Array<(response: SmtpResponse) => void> = [];
  const failures: Array<(error: Error) => void> = [];

  const rejectPending = (error: Error) => {
    const callbacks = failures.splice(0);
    pending.splice(0);
    for (const reject of callbacks) {
      reject(error);
    }
  };

  connection.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    flushResponses();
  });

  connection.on("error", (error) => {
    rejectPending(error);
  });

  connection.on("timeout", () => {
    rejectPending(new Error("SMTP response timed out."));
  });

  connection.on("end", () => {
    rejectPending(new Error("SMTP connection ended before a complete response was received."));
  });

  connection.on("close", () => {
    rejectPending(new Error("SMTP connection closed before a complete response was received."));
  });

  function flushResponses() {
    while (pending.length > 0) {
      const parsed = parseResponseFromBuffer(buffer);
      if (!parsed) {
        return;
      }
      buffer = parsed.remaining;
      const resolve = pending.shift();
      failures.shift();
      resolve?.(parsed.response);
    }
  }

  return {
    readResponse: () => new Promise<SmtpResponse>((resolve, reject) => {
      pending.push(resolve);
      failures.push(reject);
      flushResponses();
    }),
  };
}

function parseResponseFromBuffer(buffer: string): { readonly response: SmtpResponse; readonly remaining: string } | null {
  const end = buffer.indexOf("\r\n");
  if (end === -1) {
    return null;
  }
  const rawLines = buffer.slice(0, end).split("\r\n");
  let consumed = end + 2;
  let current = buffer.slice(consumed);
  while (rawLines.at(-1)?.[3] === "-") {
    const nextEnd = current.indexOf("\r\n");
    if (nextEnd === -1) {
      return null;
    }
    rawLines.push(current.slice(0, nextEnd));
    consumed += nextEnd + 2;
    current = buffer.slice(consumed);
  }
  const firstCode = Number.parseInt(rawLines[0]?.slice(0, 3) ?? "", 10);
  if (!Number.isInteger(firstCode)) {
    throw new Error("SMTP server returned an invalid response.");
  }
  return { response: { code: firstCode, lines: rawLines }, remaining: buffer.slice(consumed) };
}

async function sendCommand(connection: SmtpConnection, reader: { readonly readResponse: () => Promise<SmtpResponse> }, command: string, expectedCodes: readonly number[]): Promise<SmtpResponse> {
  connection.write(`${command}\r\n`, "utf8");
  return expectCode(await reader.readResponse(), expectedCodes);
}

async function sendData(connection: SmtpConnection, reader: { readonly readResponse: () => Promise<SmtpResponse> }, data: string, expectedCodes: readonly number[]): Promise<SmtpResponse> {
  connection.write(`${data}\r\n.\r\n`, "utf8");
  return expectCode(await reader.readResponse(), expectedCodes);
}

function expectCode(response: SmtpResponse, expectedCodes: readonly number[]): SmtpResponse {
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP server rejected the request with code ${response.code}.`);
  }
  return response;
}

async function authenticate(connection: SmtpConnection, reader: { readonly readResponse: () => Promise<SmtpResponse> }, ehlo: SmtpResponse, username: string, password: string): Promise<void> {
  if (!hasSmtpCredentials(username, password)) {
    return;
  }
  const capabilities = parseCapabilities(ehlo);
  if (!capabilities.has("AUTH")) {
    throw new Error("SMTP server does not support a configured authentication mechanism.");
  }
  const authLine = capabilities.get("AUTH") ?? "";
  if (authLine.toUpperCase().includes("PLAIN")) {
    const token = Buffer.from(`\0${username}\0${password}`, "utf8").toString("base64");
    await sendCommand(connection, reader, `AUTH PLAIN ${token}`, [235]);
    return;
  }
  if (authLine.toUpperCase().includes("LOGIN")) {
    await sendCommand(connection, reader, "AUTH LOGIN", [334]);
    await sendCommand(connection, reader, Buffer.from(username, "utf8").toString("base64"), [334]);
    await sendCommand(connection, reader, Buffer.from(password, "utf8").toString("base64"), [235]);
    return;
  }
  throw new Error("SMTP server does not support a configured authentication mechanism.");
}

function parseCapabilities(response: SmtpResponse): ReadonlyMap<string, string> {
  const capabilities = new Map<string, string>();
  for (const line of response.lines) {
    const content = line.slice(4).trim();
    const [key, ...rest] = content.split(/\s+/u);
    if (key) {
      capabilities.set(key.toUpperCase(), rest.join(" "));
    }
  }
  return capabilities;
}

function assertSafeAuthenticationBoundary(encryptedConnection: boolean, capabilities: ReadonlyMap<string, string>, username: string, password: string): void {
  if (hasSmtpCredentials(username, password) && !encryptedConnection && !capabilities.has("STARTTLS")) {
    throw new Error("TLS or STARTTLS is required before SMTP authentication.");
  }
}

function hasSmtpCredentials(username: string, password: string): boolean {
  return username.trim().length > 0 || password.trim().length > 0;
}

function isEncryptedConnection(connection: SmtpConnection): boolean {
  return connection instanceof tls.TLSSocket && connection.encrypted === true;
}

function shouldUpgradeWithStartTls(port: number, capabilities: ReadonlyMap<string, string>, credentialsPresent: boolean): boolean {
  return capabilities.has("STARTTLS") && (credentialsPresent || port === 587);
}

async function waitForSecureConnect(connection: tls.TLSSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      connection.off("secureConnect", onSecureConnect);
      connection.off("error", onError);
    };
    const onSecureConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    connection.once("secureConnect", onSecureConnect);
    connection.once("error", onError);
  });
}

function formatMessage(message: SmtpPlainTextMessage): string {
  const headers = [
    ["From", sanitizeHeaderValue(message.from)],
    ["To", message.to.map(sanitizeHeaderValue).join(", ")],
    ["Subject", sanitizeHeaderValue(message.subject)],
    ["Message-ID", sanitizeHeaderValue(message.messageId)],
    ["MIME-Version", "1.0"],
    ["Content-Type", "text/plain; charset=utf-8"],
    ["Content-Transfer-Encoding", "8bit"],
    ...Object.entries(message.headers).map(([name, value]) => [sanitizeHeaderName(name), sanitizeHeaderValue(value)]),
  ];
  const headerText = headers.map(([name, value]) => `${name}: ${value}`).join("\r\n");
  return `${headerText}\r\n\r\n${dotStuff(normalizeLineEndings(message.text))}`;
}

function sanitizeHeaderName(value: string): string {
  const sanitized = value.replace(/[^!#$%&'*+.^_`|~0-9A-Za-z-]/gu, "");
  if (!sanitized) {
    throw new Error("SMTP message contains an invalid header name.");
  }
  return sanitized;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/gu, " ").trim();
}

function sanitizeAddress(value: string): string {
  return value.replace(/[\r\n<>]/gu, "").trim();
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r?\n/gu, "\r\n");
}

function dotStuff(value: string): string {
  return value.split("\r\n").map((line) => line.startsWith(".") ? `.${line}` : line).join("\r\n");
}

function clientHostname(): string {
  return "dcrm.local";
}

function extractQueuedMessageId(response: SmtpResponse): string | undefined {
  const joined = response.lines.join(" ");
  const match = /<[^\s<>]+@[^\s<>]+>/u.exec(joined);
  return match?.[0];
}
