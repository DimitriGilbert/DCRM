import { useQuery } from "@tanstack/react-query";
import { cn } from "@DCRM/ui/lib/utils";

import { useTRPC } from "@/utils/trpc";

interface TimelineProps {
  readonly clientId?: string;
  readonly projectId?: string;
  readonly ticketId?: string;
  readonly limit?: number;
}

interface TimelineEntry {
  readonly id: string;
  readonly type: string;
  readonly subject: string | null;
  readonly body: string | null;
  readonly direction: string;
  readonly isInternal: boolean;
  readonly createdAt: string | null;
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    email: "Email",
    note: "Internal Note",
    call: "Call",
    meeting: "Meeting",
    comment: "Comment",
  };
  return labels[type] ?? type;
}

function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    email: "✉",
    note: "🔒",
    call: "📞",
    meeting: "📅",
    comment: "💬",
  };
  return icons[type] ?? "●";
}

export function ExchangeTimeline({ clientId, projectId, ticketId, limit = 50 }: TimelineProps) {
  const trpc = useTRPC();

  const timelineQuery = useQuery(
    trpc.exchange.timeline.queryOptions({
      limit,
      clientId,
      projectId,
      ticketId,
    }),
  );

  if (timelineQuery.isLoading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (timelineQuery.isError) {
    return (
      <p className="py-8 text-center text-xs text-destructive">
        Failed to load activity. Please try again.
      </p>
    );
  }

  const items = timelineQuery.data ?? [];

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {items.map((item) => (
        <TimelineItem key={item.id} item={item} />
      ))}
    </div>
  );
}

function TimelineItem({ item }: { readonly item: TimelineEntry }) {
  const isNote = item.type === "note" || item.isInternal;

  return (
    <div
      className={cn(
        "flex gap-3 border-b py-3 last:border-b-0",
        isNote && "bg-muted/30 -mx-3 px-3 rounded",
      )}
    >
      <div className="flex shrink-0 pt-0.5 text-sm" aria-hidden="true">
        {typeIcon(item.type)}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{typeLabel(item.type)}</span>
          {isNote && (
            <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Internal
            </span>
          )}
          {item.direction === "incoming" && (
            <span className="text-[10px] text-muted-foreground">← incoming</span>
          )}
          {item.direction === "outgoing" && (
            <span className="text-[10px] text-muted-foreground">→ outgoing</span>
          )}
          {item.createdAt && (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {formatRelativeDate(item.createdAt)}
            </span>
          )}
        </div>
        {item.subject && (
          <p className="truncate text-xs font-medium">{item.subject}</p>
        )}
        {item.body && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground line-clamp-3">
            {item.body}
          </p>
        )}
      </div>
    </div>
  );
}

function formatRelativeDate(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}
