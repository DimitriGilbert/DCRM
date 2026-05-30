import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/utils/trpc";

export function NotificationCenter() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const notifications = useQuery(trpc.notifications.list.queryOptions({ limit: 20 }));
  const markRead = useMutation(trpc.notifications.markRead.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>In-app notifications</CardTitle>
        <CardDescription>Important product events only. Hook failures stay in automation status instead of creating notification spam.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.data?.length ? notifications.data.map((notification) => (
          <div key={notification.id} className="flex items-start justify-between gap-3 border p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{notification.title}</p>
                {!notification.readAt ? <Badge variant="outline">Unread</Badge> : null}
              </div>
              {notification.body ? <p className="text-xs text-muted-foreground">{notification.body}</p> : null}
              <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</p>
            </div>
            {!notification.readAt ? <Button size="xs" variant="outline" disabled={markRead.isPending} onClick={() => markRead.mutate({ id: notification.id })}>Mark read</Button> : null}
          </div>
        )) : <p className="border border-dashed p-4 text-center text-xs text-muted-foreground">No notifications yet.</p>}
      </CardContent>
    </Card>
  );
}

export function HookStatusSummary() {
  const trpc = useTRPC();
  const failures = useQuery(trpc.automation.listFailedHookExecutions.queryOptions({ limit: 5 }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hook status</CardTitle>
        <CardDescription>Automation failures are reviewed here, not routed into in-app notifications.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {failures.isPending ? <p className="border border-dashed p-4 text-sm text-muted-foreground">Loading hook execution status…</p> : null}
        {failures.isError ? <p className="border border-destructive/40 p-4 text-sm text-destructive">Unable to load hook execution status.</p> : null}
        {failures.data?.length ? failures.data.map((failure) => (
          <div key={failure.id} className="space-y-2 border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{failure.hookName}</p>
              <Badge variant="destructive">Failed</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{failure.eventType} · attempt {failure.attempt} of {failure.maxAttempts}</p>
            <p className="text-xs text-muted-foreground">{formatHookError(failure.error)}</p>
            <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{new Date(failure.createdAt).toLocaleString()}</p>
          </div>
        )) : null}
        {!failures.isPending && !failures.isError && !failures.data?.length ? <p className="border border-dashed p-4 text-sm text-muted-foreground">No failed hook executions.</p> : null}
      </CardContent>
    </Card>
  );
}

function formatHookError(error: Record<string, unknown> | null): string {
  if (!error) {
    return "No error details recorded.";
  }
  const message = error.message;
  return typeof message === "string" && message.trim().length > 0 ? message : JSON.stringify(error);
}
