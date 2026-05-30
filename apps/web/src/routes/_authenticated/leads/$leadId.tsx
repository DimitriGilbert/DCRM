import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { LEAD_STAGES } from "@/lib/forms/lead-form-schema";
import type { LeadStage } from "@/lib/forms/lead-form-schema";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@DCRM/ui/components/dialog";
import { Skeleton } from "@DCRM/ui/components/skeleton";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  component: LeadDetailPage,
});

const STAGE_LABELS: Record<string, string> = {
  [LEAD_STAGES.NEW]: "New",
  [LEAD_STAGES.CONTACTED]: "Contacted",
  [LEAD_STAGES.QUALIFIED]: "Qualified",
  [LEAD_STAGES.PROPOSAL]: "Proposal",
  [LEAD_STAGES.NEGOTIATION]: "Negotiation",
  [LEAD_STAGES.WON]: "Won",
  [LEAD_STAGES.LOST]: "Lost",
};

function LeadDetailPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { leadId } = Route.useParams();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const leadQuery = useQuery(
    trpc.lead.read.queryOptions({ id: leadId }),
  );

  const softDeleteMutation = useMutation(
    trpc.lead.softDelete.mutationOptions({
      onSuccess: () => {
        toast.success("Lead deleted");
        queryClient.invalidateQueries(trpc.lead.list.queryFilter());
        navigate({ to: "/leads" });
      },
      onError: (error) => {
        toast.error("Failed to delete lead", {
          description: error.message,
        });
      },
    }),
  );

  const stageUpdateMutation = useMutation(
    trpc.lead.updateStage.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.lead.read.queryFilter({ id: leadId }));
        queryClient.invalidateQueries(trpc.lead.list.queryFilter());
      },
      onError: (error) => {
        toast.error("Failed to update stage", {
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

  const canConvert = lead.stage === LEAD_STAGES.WON && !lead.convertedClientId;

  function handleStageChange(stage: LeadStage) {
    stageUpdateMutation.mutate({ id: leadId, stage });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{lead.name}</h2>
          {lead.company && (
            <p className="text-xs text-muted-foreground">{lead.company}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canConvert && (
            <Link
              to="/leads/$leadId/convert"
              params={{ leadId: lead.id }}
            >
              <Button size="sm">Convert to Client</Button>
            </Link>
          )}
          <Link
            to="/leads/$leadId/edit"
            params={{ leadId: lead.id }}
          >
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Stage:</span>
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize">
              {STAGE_LABELS[lead.stage] ?? lead.stage}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(STAGE_LABELS).map(([key, label]) => (
              <Button
                key={key}
                variant={lead.stage === key ? "default" : "outline"}
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={lead.stage === key || stageUpdateMutation.isPending}
                onClick={() => handleStageChange(key as LeadStage)}
              >
                {label}
              </Button>
            ))}
          </div>
          {lead.estimatedValue != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Estimated Value:</span>
              <span className="text-xs font-medium">
                {lead.currency ?? "USD"}{" "}
                {lead.estimatedValue.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          )}
          {lead.source && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Source:</span>
              <span className="text-xs">{lead.source}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <DetailField label="Email" value={lead.email} />
            <DetailField label="Phone" value={lead.phone} />
            <DetailField label="Website" value={lead.website} />
            <DetailField label="Company" value={lead.company} />
          </dl>
        </CardContent>
      </Card>

      {lead.notes && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {lead.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {lead.convertedClientId && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Converted</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to="/clients/$clientId"
              params={{ clientId: lead.convertedClientId }}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              View converted client →
            </Link>
          </CardContent>
        </Card>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this lead? This action can be undone from the trash.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={softDeleteMutation.isPending}
              onClick={() => softDeleteMutation.mutate({ id: leadId })}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
