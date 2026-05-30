import { createContext } from "@DCRM/api/context";
import { createIncomingWebhookService } from "@DCRM/api/automation/incoming-webhook";
import { handleIncomingWebhookPost } from "@DCRM/api/automation/incoming-webhook-route-handler";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/incoming-webhooks/$slug")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ctx = await createContext({ req: request });
        if (!ctx.automationRepository) {
          return jsonResponse({ error: "Incoming webhook repository unavailable." }, 503);
        }

        const service = createIncomingWebhookService({ automationRepository: ctx.automationRepository, eventService: ctx.eventService });
        return handleIncomingWebhookPost({ request, slug: params.slug, service });
      },
    },
  },
});

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
