import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/settings/ai-providers",
)({
  component: AIProvidersRedirect,
});

/**
 * Redirects to the main settings page which contains the AI providers section.
 * The settings hub links here for discoverability, but the actual AI provider
 * management lives in the unified settings page for now.
 */
function AIProvidersRedirect() {
  return <Navigate to="/settings" />;
}
