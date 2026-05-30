import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@DCRM/ui/components/dialog";
import { Skeleton } from "@DCRM/ui/components/skeleton";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_authenticated/leads/$leadId/convert")({
  component: ConvertLeadPage,
});

function ConvertLeadPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { leadId } = Route.useParams();
  const [showConfirmDialog, setShowConfirmDialog] = useState(true);

  const leadQuery = useQuery(
    trpc.lead.read.queryOptions({ id: leadId }),
  );

  const convertMutation = useMutation(
    trpc.lead.convert.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries(trpc.lead.list.queryFilter());
        queryClient.invalidateQueries(trpc.client.list.queryFilter());
        if (data?.client?.id) {
          toast.success("Lead converted to client");
          navigate({ to: "/clients/$clientId", params: { clientId: data.client.id } });
        } else {
          toast.error("Conversion succeeded but no client was created");
          navigate({ to: "/leads" });
        }
      },
      onError: (error) => {
        toast.error("Failed to convert lead", {
          description: error.message,
        });
      },
    }),
  );

  if (leadQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const lead = leadQuery.data;

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Lead not found.</p>
        <Link to="/leads" className="mt-3">
          <Button variant="outline" size="sm">Back to Leads</Button>
        </Link>
      </div>
    );
  }

  if (lead.stage !== "won") {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          Only leads in the "Won" stage can be converted to clients.
        </p>
        <Link to="/leads/$leadId" params={{ leadId }} className="mt-3">
          <Button variant="outline" size="sm">Back to Lead</Button>
        </Link>
      </div>
    );
  }

  if (lead.convertedClientId) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          This lead has already been converted.
        </p>
        <Link to="/clients/$clientId" params={{ clientId: lead.convertedClientId }} className="mt-3">
          <Button variant="outline" size="sm">View Client</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-sm font-medium">Convert Lead to Client</h2>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Lead Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DetailRow label="Name" value={lead.name} />
          <DetailRow label="Email" value={lead.email} />
          <DetailRow label="Phone" value={lead.phone} />
          <DetailRow label="Company" value={lead.company} />
          <DetailRow label="Website" value={lead.website} />
          <DetailRow label="Source" value={lead.source} />
          {lead.estimatedValue != null && (
            <DetailRow
              label="Estimated Value"
              value={`${lead.currency ?? "USD"} ${lead.estimatedValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
            />
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>What happens next?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>A new client will be created with the lead&apos;s contact information.</li>
            <li>The lead will be marked as converted and linked to the new client.</li>
            <li>Any attachments on the lead will be transferred to the client.</li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/leads/$leadId", params: { leadId } })}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => setShowConfirmDialog(true)}
        >
          Convert to Client
        </Button>
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Conversion</DialogTitle>
            <DialogDescription>
              Convert &quot;{lead.name}&quot; to a client? A new client record will be created with the lead&apos;s contact information.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={convertMutation.isPending}
              onClick={() => convertMutation.mutate({ id: leadId })}
            >
              {convertMutation.isPending ? "Converting..." : "Confirm Conversion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xs">{value}</span>
    </div>
  );
}
