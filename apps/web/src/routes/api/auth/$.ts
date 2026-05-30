import { auth, isOwnerBootstrapOpen } from "@DCRM/auth";
import { createFileRoute } from "@tanstack/react-router";

const SIGN_UP_PATH = "/api/auth/sign-up/email";

async function handler({ request }: { request: Request }) {
  if (request.method === "POST" && new URL(request.url).pathname === SIGN_UP_PATH) {
    const canCreateOwner = await isOwnerBootstrapOpen();

    if (!canCreateOwner) {
      return Response.json({ message: "Account creation is closed for this DCRM instance." }, { status: 403 });
    }
  }

  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
