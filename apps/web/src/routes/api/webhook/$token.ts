import { receiveIncomingWebhook } from "@DCRM/api/routers/incoming-webhook/receiver";
import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY_BYTES = 1_048_576;

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
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }
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
