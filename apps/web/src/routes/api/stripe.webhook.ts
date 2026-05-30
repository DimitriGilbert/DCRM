import { createBillingService } from "@DCRM/api/billing/service";
import { createContext } from "@DCRM/api/context";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await createContext({ req: request });
        if (!ctx.billing) {
          return jsonResponse({ error: "Billing unavailable." }, 503);
        }
        const rawBody = await request.text();
        try {
          const result = await createBillingService({ config: ctx.billing.config, repository: ctx.billing.repository }).handleWebhook({ rawBody, signature: request.headers.get("stripe-signature"), now: new Date() });
          return jsonResponse(result, 200);
        } catch {
          return jsonResponse({ error: "Invalid Stripe webhook." }, 400);
        }
      },
    },
  },
});

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
