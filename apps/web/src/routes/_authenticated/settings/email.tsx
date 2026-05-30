import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@DCRM/ui/components/dialog";
import { Badge } from "@DCRM/ui/components/badge";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import {
  emailAccountFormSchema,
  emailAccountFormFields,
  emailAccountFormDefaultValues,
} from "@/lib/forms/email-account-form-schema";
import type { EmailAccountFormValues } from "@/lib/forms/email-account-form-schema";

export const Route = createFileRoute("/_authenticated/settings/email")({
  component: EmailSettingsPage,
});

function EmailSettingsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Email Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure IMAP/SMTP accounts. Credentials are encrypted at rest.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          Add Account
        </Button>
      </div>

      <EmailAccountsList />

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Email Account</DialogTitle>
          </DialogHeader>
          <AddEmailAccountForm onSuccess={() => setShowAddDialog(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmailAccountsList() {
  const trpc = useTRPC();
  const query = useQuery(trpc.emailAccount.list.queryOptions());

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!query.data?.length) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No email accounts configured. Add one to enable email sync and matching.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {query.data.map((account) => (
        <EmailAccountCard key={account.id} account={account} />
      ))}
    </div>
  );
}

function EmailAccountCard({
  account,
}: {
  readonly account: {
    id: string;
    email: string;
    syncEnabled: boolean;
    syncInterval: number;
    lastSyncAt: string | null;
    createdAt: string;
  };
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation(
    trpc.emailAccount.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Email account removed");
        queryClient.invalidateQueries(trpc.emailAccount.list.queryFilter());
      },
      onError: (error) => {
        toast.error("Failed to remove account", { description: error.message });
      },
    }),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">{account.email}</CardTitle>
          <CardDescription className="text-xs">
            Sync every {account.syncInterval} min
            {account.lastSyncAt && (
              <> · Last sync: {new Date(account.lastSyncAt).toLocaleString()}</>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={account.syncEnabled ? "default" : "secondary"}>
            {account.syncEnabled ? "Sync On" : "Sync Off"}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteMutation.mutate({ id: account.id })}
            disabled={deleteMutation.isPending}
          >
            Remove
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

function AddEmailAccountForm({ onSuccess }: { readonly onSuccess: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createMutation = useMutation(
    trpc.emailAccount.create.mutationOptions({
      onSuccess: () => {
        toast.success("Email account added");
        queryClient.invalidateQueries(trpc.emailAccount.list.queryFilter());
        onSuccess();
      },
      onError: (error) => {
        toast.error("Failed to add account", { description: error.message });
      },
    }),
  );

  const { Form } = useFormedible<EmailAccountFormValues>({
    schema: emailAccountFormSchema,
    fields: emailAccountFormFields,
    formOptions: {
      defaultValues: emailAccountFormDefaultValues,
      onSubmit: async ({ value }) => {
        createMutation.mutate(value);
      },
    },
    submitLabel: "Add Account",
    disabled: createMutation.isPending,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        All IMAP and SMTP credentials are encrypted at rest using AES-256-GCM.
      </p>
      <Form className="space-y-4" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
