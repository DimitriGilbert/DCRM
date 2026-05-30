import { useState } from "react";
import { Bell } from "lucide-react";

import { Button } from "@DCRM/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverTitle,
  PopoverDescription,
  PopoverHeader,
} from "@DCRM/ui/components/popover";
import { Separator } from "@DCRM/ui/components/separator";
import { cn } from "@DCRM/ui/lib/utils";

/**
 * Shape of an in-app notification.
 */
export type Notification = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly read: boolean;
  readonly createdAt: Date | string;
};

type NotificationBellProps = {
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  loading?: boolean;
};

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationBell({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  loading = false,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />

      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <PopoverHeader className="flex flex-row items-center justify-between p-3">
          <PopoverTitle className="text-sm font-semibold">
            Notifications
          </PopoverTitle>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </PopoverHeader>

        <Separator />

        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading...
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No notifications
            </div>
          )}

          {!loading &&
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) onMarkRead(n.id);
                }}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors",
                  !n.read && "bg-muted/30",
                )}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="text-sm font-medium leading-none">
                    {n.title}
                  </span>
                  {!n.read && (
                    <span className="size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
                <PopoverDescription className="text-xs">
                  {n.message}
                </PopoverDescription>
                <span className="mt-1 text-[10px] text-muted-foreground">
                  {formatRelativeTime(n.createdAt)}
                </span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
