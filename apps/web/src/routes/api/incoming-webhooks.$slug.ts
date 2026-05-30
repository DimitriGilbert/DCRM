import { createContext } from "@DCRM/api/context";
import { createIncomingWebhookService } from "@DCRM/api/automation/incoming-webhook";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const Route = createFileRoute("/api/incoming-webhooks/$slug")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ctx = await createContext({ req: request });
        if (!ctx.automationRepository) {
          return jsonResponse({ error: "Incoming webhook repository unavailable." }, 503);
        }

        const parsedPayload = jsonObjectSchema.safeParse(await request.json());
        if (!parsedPayload.success) {
          return jsonResponse({ error: "Incoming webhook payload must be a JSON object." }, 400);
        }

        const service = createIncomingWebhookService({ automationRepository: ctx.automationRepository, eventService: ctx.eventService });
        try {
          const result = await service.receive({ slug: params.slug, token: extractIncomingWebhookToken(request), payload: parsedPayload.data });
          return jsonResponse(result, result.mode === "test" ? 202 : 200);
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : "Incoming webhook failed." }, 401);
        }
      },
    },
  },
});

function extractIncomingWebhookToken(request: Request): string | null {
  const headerToken = request.headers.get("x-dcrm-webhook-token")?.trim();
  if (headerToken) {
    return headerToken;
  }
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return new URL(request.url).searchParams.get("token");
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
