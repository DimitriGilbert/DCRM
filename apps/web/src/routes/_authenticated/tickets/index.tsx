import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tickets/")({
  component: TicketsPage,
});

function TicketsPage() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-muted-foreground">Tickets coming soon.</p>
    </div>
  );
}
