import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@DCRM/ui/components/dialog";
import { Input } from "@DCRM/ui/components/input";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { clientFormSchema, clientFormFields, clientFormDefaultValues } from "@/lib/forms/client-form-schema";
import type { ClientFormValues } from "@/lib/forms/client-form-schema";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsPage,
});

function ClientsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const listQuery = useQuery(
    trpc.client.list.queryOptions({ limit: 50 }),
  );

  const searchQueryResult = useQuery(
    trpc.client.search.queryOptions(
      { query: searchQuery, limit: 50 },
      { enabled: searchQuery.length > 0 },
    ),
  );

  const createMutation = useMutation(
    trpc.client.create.mutationOptions({
      onSuccess: () => {
        toast.success("Client created");
        queryClient.invalidateQueries(trpc.client.list.queryFilter());
        setShowCreateDialog(false);
      },
      onError: (error) => {
        toast.error("Failed to create client", {
          description: error.message,
        });
      },
    }),
  );

  const clients = searchQuery.length > 0
    ? (searchQueryResult.data ?? [])
    : (listQuery.data?.items ?? []);

  const isLoading = searchQuery.length > 0
    ? searchQueryResult.isLoading
    : listQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Input
            type="search"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          New Client
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "No clients match your search." : "No clients yet."}
          </p>
          {!searchQuery && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setShowCreateDialog(true)}
            >
              Create your first client
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              to="/clients/$clientId"
              params={{ clientId: client.id }}
              className="block"
            >
              <Card size="sm" className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="truncate text-sm">
                    {client.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {client.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {client.email}
                    </p>
                  )}
                  {client.company && (
                    <p className="truncate text-xs text-muted-foreground">
                      {client.company}
                    </p>
                  )}
                  {client.phone && (
                    <p className="truncate text-xs text-muted-foreground">
                      {client.phone}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Client</DialogTitle>
            <DialogDescription>Add a new client to your CRM.</DialogDescription>
          </DialogHeader>
          <CreateClientForm
            onSubmit={(values) => {
              createMutation.mutate(values);
            }}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateClientForm({
  onSubmit,
  isPending,
}: {
  readonly onSubmit: (values: ClientFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<ClientFormValues>({
    schema: clientFormSchema,
    fields: clientFormFields,
    formOptions: {
      defaultValues: clientFormDefaultValues,
      onSubmit: async ({ value }) => {
        onSubmit(value);
      },
    },
    submitLabel: "Create Client",
    disabled: isPending,
  });

  return <Form className="space-y-4" />;
}
