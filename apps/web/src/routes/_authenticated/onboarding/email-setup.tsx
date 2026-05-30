import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";

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

export const Route = createFileRoute(
  "/_authenticated/onboarding/email-setup",
)({
  component: OnboardingEmailSetupPage,
});

export default function OnboardingEmailSetupPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const settingsQuery = useQuery(
    trpc.settings.get.queryOptions(),
  );

  const onboardingCompleted = settingsQuery.data?.onboardingCompleted ?? false;

  useEffect(() => {
    if (onboardingCompleted) {
      void navigate({ to: "/dashboard" });
    }
  }, [onboardingCompleted, navigate]);

  if (onboardingCompleted) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <Link to="/onboarding">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Mail className="h-5 w-5 text-muted-foreground" />
            Email Setup
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect your email account. Credentials are encrypted at rest.
          </p>
        </div>
      </div>

      <EmailAccountsList onAddClick={() => setShowAddDialog(true)} />

      <div className="flex justify-end gap-2">
        <Link to="/onboarding/ai-setup">
          <Button variant="outline" size="sm">Back</Button>
        </Link>
        <Link to="/onboarding">
          <Button size="sm">Continue</Button>
        </Link>
      </div>

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

function EmailAccountsList({ onAddClick }: { readonly onAddClick: () => void }) {
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Email Accounts</CardTitle>
            <CardDescription>
              No email accounts configured yet.
            </CardDescription>
          </div>
          <Button size="sm" onClick={onAddClick}>
            Add Account
          </Button>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Email Accounts</h2>
        <Button size="sm" onClick={onAddClick}>Add Account</Button>
      </div>
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
