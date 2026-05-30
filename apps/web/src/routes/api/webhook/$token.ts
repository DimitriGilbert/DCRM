import { receiveIncomingWebhook } from "@DCRM/api/routers/incoming-webhook/receiver";
import { createFileRoute } from "@tanstack/react-router";

function handler({ request, params }: { request: Request; params: Record<string, string> }) {
  const urlToken = params["token"];
  if (!urlToken) {
    return new Response(JSON.stringify({ error: "Missing webhook token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return (async () => {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("X-DCRM-Signature");

    const result = await receiveIncomingWebhook(urlToken, rawBody, signatureHeader);

    return new Response(JSON.stringify(result.body), {
      status: result.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  })();
}

export const Route = createFileRoute("/api/webhook/$token")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
