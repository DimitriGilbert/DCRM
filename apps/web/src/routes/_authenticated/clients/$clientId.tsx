import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Skeleton } from "@DCRM/ui/components/skeleton";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { clientId } = Route.useParams();

  const clientQuery = useQuery(
    trpc.client.read.queryOptions({ id: clientId }),
  );

  const softDeleteMutation = useMutation(
    trpc.client.softDelete.mutationOptions({
      onSuccess: () => {
        toast.success("Client deleted");
        queryClient.invalidateQueries(trpc.client.list.queryFilter());
        navigate({ to: "/clients" });
      },
      onError: (error) => {
        toast.error("Failed to delete client", {
          description: error.message,
        });
      },
    }),
  );

  if (clientQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const client = clientQuery.data;

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Client not found.</p>
        <Link to="/clients" className="mt-3">
          <Button variant="outline" size="sm">Back to Clients</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{client.name}</h2>
          {client.company && (
            <p className="text-xs text-muted-foreground">{client.company}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            to="/clients/$clientId/edit"
            params={{ clientId: client.id }}
          >
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => softDeleteMutation.mutate({ id: client.id })}
            disabled={softDeleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <DetailField label="Email" value={client.email} />
            <DetailField label="Phone" value={client.phone} />
            <DetailField label="Website" value={client.website} />
            <DetailField label="Company" value={client.company} />
          </dl>
        </CardContent>
      </Card>

      {client.notes && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {client.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {client.socialLinks && Object.keys(client.socialLinks).length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Social Links</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {Object.entries(client.socialLinks).map(([key, value]) => (
                <DetailField key={key} label={key} value={value} />
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {client.address && Object.keys(client.address).length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {Object.values(client.address).filter(Boolean).join(", ")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-xs">{value}</dd>
    </div>
  );
}
