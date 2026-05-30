import { z } from "zod";

import type { IncomingWebhookReceiveInput, IncomingWebhookReceiveResult } from "./incoming-webhook.js";
import { IncomingWebhookAuthenticationError, IncomingWebhookNotFoundError, IncomingWebhookPayloadMappingError } from "./incoming-webhook.js";

const jsonObjectSchema = z.record(z.string(), z.unknown());

export type IncomingWebhookReceiver = {
  receive(input: IncomingWebhookReceiveInput): Promise<IncomingWebhookReceiveResult>;
};

export async function handleIncomingWebhookPost(input: { readonly request: Request; readonly slug: string; readonly service: IncomingWebhookReceiver }): Promise<Response> {
  let body: unknown;
  try {
    body = await input.request.json();
  } catch {
    return jsonResponse({ error: "Incoming webhook payload must be a valid JSON object." }, 400);
  }

  const parsedPayload = jsonObjectSchema.safeParse(body);
  if (!parsedPayload.success) {
    return jsonResponse({ error: "Incoming webhook payload must be a JSON object." }, 400);
  }

  try {
    const result = await input.service.receive({ slug: input.slug, token: extractIncomingWebhookToken(input.request), payload: parsedPayload.data });
    return jsonResponse(result, result.mode === "test" ? 202 : 200);
  } catch (error) {
    return incomingWebhookErrorResponse(error);
  }
}

function extractIncomingWebhookToken(request: Request): string | null {
  const headerToken = request.headers.get("x-dcrm-webhook-token")?.trim();
  if (headerToken) {
    return headerToken;
  }
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return null;
}

function incomingWebhookErrorResponse(error: unknown): Response {
  if (error instanceof IncomingWebhookAuthenticationError) {
    return jsonResponse({ error: "Incoming webhook credentials are invalid." }, 401);
  }
  if (error instanceof IncomingWebhookNotFoundError) {
    return jsonResponse({ error: "Incoming webhook was not found." }, 404);
  }
  if (error instanceof IncomingWebhookPayloadMappingError || error instanceof z.ZodError) {
    return jsonResponse({ error: "Incoming webhook payload could not be processed." }, 400);
  }
  return jsonResponse({ error: "Incoming webhook delivery failed." }, 502);
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
