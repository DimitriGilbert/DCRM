import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent } from "@DCRM/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@DCRM/ui/components/dialog";
import { Input } from "@DCRM/ui/components/input";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { leadFormSchema, leadFormFields, leadFormDefaultValues, toLeadFormInput, LEAD_STAGES } from "@/lib/forms/lead-form-schema";
import type { LeadFormValues, LeadStage } from "@/lib/forms/lead-form-schema";

export const Route = createFileRoute("/_authenticated/leads/")({
  component: LeadsPage,
});

const STAGE_COLUMNS: { key: LeadStage; label: string }[] = [
  { key: LEAD_STAGES.NEW, label: "New" },
  { key: LEAD_STAGES.CONTACTED, label: "Contacted" },
  { key: LEAD_STAGES.QUALIFIED, label: "Qualified" },
  { key: LEAD_STAGES.PROPOSAL, label: "Proposal" },
  { key: LEAD_STAGES.NEGOTIATION, label: "Negotiation" },
  { key: LEAD_STAGES.WON, label: "Won" },
  { key: LEAD_STAGES.LOST, label: "Lost" },
];

function LeadsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const listQuery = useQuery(
    trpc.lead.list.queryOptions({ limit: 100 }),
  );

  const searchQueryResult = useQuery(
    trpc.lead.search.queryOptions(
      { query: searchQuery, limit: 100 },
      { enabled: searchQuery.length > 0 },
    ),
  );

  const createMutation = useMutation(
    trpc.lead.create.mutationOptions({
      onSuccess: () => {
        toast.success("Lead created");
        queryClient.invalidateQueries(trpc.lead.list.queryFilter());
        setShowCreateDialog(false);
      },
      onError: (error) => {
        toast.error("Failed to create lead", {
          description: error.message,
        });
      },
    }),
  );

  const stageUpdateMutation = useMutation(
    trpc.lead.updateStage.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.lead.list.queryFilter());
      },
      onError: (error) => {
        toast.error("Failed to update stage", {
          description: error.message,
        });
      },
    }),
  );

  const leads = searchQuery.length > 0
    ? (searchQueryResult.data ?? [])
    : (listQuery.data?.items ?? []);

  const isLoading = searchQuery.length > 0
    ? searchQueryResult.isLoading
    : listQuery.isLoading;

  function handleStageChange(leadId: string, newStage: LeadStage) {
    stageUpdateMutation.mutate({ id: leadId, stage: newStage });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Input
            type="search"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-sm border">
            <Button
              variant={viewMode === "kanban" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("kanban")}
            >
              Kanban
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("list")}
            >
              List
            </Button>
          </div>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            New Lead
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "No leads match your search." : "No leads yet."}
          </p>
          {!searchQuery && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setShowCreateDialog(true)}
            >
              Create your first lead
            </Button>
          )}
        </div>
      ) : viewMode === "kanban" && !searchQuery ? (
        <KanbanView
          leads={leads}
          onStageChange={handleStageChange}
        />
      ) : (
        <ListView leads={leads} />
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Lead</DialogTitle>
            <DialogDescription>Add a new lead to your pipeline.</DialogDescription>
          </DialogHeader>
          <CreateLeadForm
            onSubmit={(values) => {
              createMutation.mutate(toLeadFormInput(values));
            }}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface LeadItem {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly company: string | null;
  readonly stage: string;
  readonly estimatedValue: number | null;
  readonly currency: string | null;
  readonly source: string | null;
  readonly convertedClientId: string | null;
}

function KanbanView({
  leads,
  onStageChange,
}: {
  readonly leads: readonly LeadItem[];
  readonly onStageChange: (leadId: string, stage: LeadStage) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-3 overflow-x-auto">
      {STAGE_COLUMNS.map((column) => {
        const columnLeads = leads.filter((l) => l.stage === column.key);
        return (
          <div key={column.key} className="min-w-[140px] space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium text-muted-foreground">
                {column.label}
              </p>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {columnLeads.length}
              </span>
            </div>
            <div className="space-y-2">
              {columnLeads.map((lead) => (
                <Link
                  key={lead.id}
                  to="/leads/$leadId"
                  params={{ leadId: lead.id }}
                >
                  <Card size="sm" className="cursor-pointer transition-colors hover:bg-muted/50">
                    <CardContent className="space-y-1">
                      <p className="truncate text-xs font-medium">
                        {lead.name}
                      </p>
                      {lead.company && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {lead.company}
                        </p>
                      )}
                      {lead.estimatedValue != null && (
                        <p className="text-[11px] text-muted-foreground">
                          {lead.currency ?? "USD"}{" "}
                          {lead.estimatedValue.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
              {column.key !== LEAD_STAGES.WON && column.key !== LEAD_STAGES.LOST && columnLeads.length > 0 && (
                <StageMoveButtons
                  currentStage={column.key}
                  onMove={(stage) => {
                    const firstLead = columnLeads[0];
                    if (firstLead) {
                      onStageChange(firstLead.id, stage);
                    }
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageMoveButtons({
  currentStage,
  onMove,
}: {
  readonly currentStage: LeadStage;
  readonly onMove: (stage: LeadStage) => void;
}) {
  const currentIndex = STAGE_COLUMNS.findIndex((c) => c.key === currentStage);
  const prev = currentIndex > 0 ? STAGE_COLUMNS[currentIndex - 1] : null;
  const next = currentIndex < STAGE_COLUMNS.length - 1 ? STAGE_COLUMNS[currentIndex + 1] : null;

  return (
    <div className="flex gap-1 px-1">
      {prev && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-[10px]"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            onMove(prev.key);
          }}
        >
          ← {prev.label}
        </Button>
      )}
      {next && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-[10px]"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            onMove(next.key);
          }}
        >
          {next.label} →
        </Button>
      )}
    </div>
  );
}

function ListView({ leads }: { readonly leads: readonly LeadItem[] }) {
  return (
    <div className="space-y-2">
      {leads.map((lead) => (
        <Link
          key={lead.id}
          to="/leads/$leadId"
          params={{ leadId: lead.id }}
        >
          <Card size="sm" className="transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{lead.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {lead.company ?? lead.email ?? lead.source ?? "No details"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {lead.estimatedValue != null && (
                  <span className="text-[11px] text-muted-foreground">
                    {lead.currency ?? "USD"}{" "}
                    {lead.estimatedValue.toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                  {lead.stage}
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function CreateLeadForm({
  onSubmit,
  isPending,
}: {
  readonly onSubmit: (values: LeadFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<LeadFormValues>({
    schema: leadFormSchema,
    fields: leadFormFields,
    formOptions: {
      defaultValues: leadFormDefaultValues,
      onSubmit: async ({ value }) => {
        onSubmit(value);
      },
    },
    submitLabel: "Create Lead",
    disabled: isPending,
  });

  return <Form className="space-y-4" />;
}
