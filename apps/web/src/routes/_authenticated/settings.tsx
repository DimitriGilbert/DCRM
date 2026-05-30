import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Palette,
  Sparkles,
  Mail,
  Webhook,
  ArrowRight,
} from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const SETTINGS_SECTIONS = [
  {
    to: "/settings/appearance",
    title: "Appearance",
    description: "Theme and language preferences",
    icon: Palette,
  },
  {
    to: "/settings/ai-providers",
    title: "AI Providers",
    description: "Configure AI providers (BYOK). API keys are encrypted at rest.",
    icon: Sparkles,
  },
  {
    to: "/settings/email",
    title: "Email",
    description: "IMAP/SMTP accounts for email sync and matching.",
    icon: Mail,
  },
  {
    to: "/settings/incoming-webhooks",
    title: "Incoming Webhooks",
    description: "Receive data from external services via webhook endpoints.",
    icon: Webhook,
  },
] as const;

function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your preferences, integrations, and account configuration.
        </p>
      </div>

      <div className="grid gap-4">
        {SETTINGS_SECTIONS.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">{title}</CardTitle>
                    <CardDescription className="text-xs">
                      {description}
                    </CardDescription>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
