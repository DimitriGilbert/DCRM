import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthorizedEmailForm, EmailAccountForm } from "@/features/email/forms";
import type { AuthorizedEmailFormValues, EmailAccountFormValues } from "@/features/email/forms";
import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/settings/email")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accounts = useQuery(trpc.email.listAccounts.queryOptions());
  const clients = useQuery(trpc.clients.list.queryOptions({ includeDeleted: false }));
  const upsertAccount = useMutation(trpc.email.upsertAccount.mutationOptions());
  const addAuthorizedEmail = useMutation(trpc.email.addClientAuthorizedEmail.mutationOptions());

  async function handleAccountSubmit(values: EmailAccountFormValues) {
    await upsertAccount.mutateAsync(values);
    await queryClient.invalidateQueries({ queryKey: trpc.email.listAccounts.queryKey() });
    toast.success("Email account saved", { description: "IMAP and SMTP credentials were encrypted before storage." });
  }

  async function handleAuthorizedEmailSubmit(values: AuthorizedEmailFormValues) {
    await addAuthorizedEmail.mutateAsync(values);
    toast.success("Authorized sender added", { description: "Exact addresses and wildcard domains can now match incoming mail." });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="Email" description="Configure encrypted mailbox credentials, IMAP sync, SMTP sending, and per-client authorized sender patterns." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Email account</CardTitle>
            <CardDescription>Store IMAP/SMTP connection details. Passwords are encrypted and never returned to the browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmailAccountForm submitting={upsertAccount.isPending} onSubmit={handleAccountSubmit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Configured accounts</CardTitle>
            <CardDescription>Safe metadata only; no decrypted credentials are exposed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(accounts.data ?? []).map((account) => (
              <div key={account.id} className="border p-3 text-sm">
                <div className="font-medium">{account.name}</div>
                <div className="text-muted-foreground">{account.emailAddress} · IMAP {account.imapHost}:{account.imapPort} · SMTP {account.smtpHost}:{account.smtpPort}</div>
                <div className="text-muted-foreground">Credentials encrypted: {account.hasImapPassword && account.hasSmtpPassword ? "yes" : "no"}</div>
              </div>
            ))}
            {accounts.data?.length === 0 ? <p className="text-muted-foreground text-sm">No email accounts configured yet.</p> : null}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Authorized sender patterns</CardTitle>
            <CardDescription>Attach exact addresses or wildcard domains to a client for incoming-email matching.</CardDescription>
          </CardHeader>
          <CardContent>
            <AuthorizedEmailForm clients={clients.data ?? []} submitting={addAuthorizedEmail.isPending} onSubmit={handleAuthorizedEmailSubmit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Matching and sync behavior</CardTitle>
            <CardDescription>IMAP sync imports matched client mail, stores unknown senders for triage, and SMTP sending marks DCRM-originated mail to prevent loops.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>Exact matches compare normalized sender addresses case-insensitively.</p>
            <p>Wildcard domains use the form *@company.com and match any mailbox at that domain.</p>
            <p>Unknown senders remain supported as unmatched mail for later inbox triage.</p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
