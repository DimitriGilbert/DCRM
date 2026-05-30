import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-muted-foreground">Settings coming soon.</p>
    </div>
  );
}
