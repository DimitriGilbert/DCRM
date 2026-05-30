import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { ArrowRight, GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { formatStageLabel } from "./forms";
import { WEB_LEAD_STAGES } from "./constants";
import type { WebLeadStage } from "./constants";
import type { ClientListRecord, ClientRecord, LeadListRecord, LeadPipelineStage, LeadRecord } from "./types";

export function PageFrame({ children }: { readonly children: ReactNode }) {
  return (
    <main className="overflow-auto bg-muted/20">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { readonly eyebrow: string; readonly title: string; readonly description: string; readonly actions?: ReactNode }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="space-y-2">
        <span className="inline-flex h-5 w-fit items-center border px-2 text-xs font-medium text-muted-foreground">{eyebrow}</span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions}
    </section>
  );
}

export function LoadingCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading records">
      {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-44" />)}
    </div>
  );
}

export function EmptyState({ title, description, action }: { readonly title: string; readonly description: string; readonly action?: ReactNode }) {
  return (
    <div className="border border-dashed bg-background p-8 text-center">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title }: { readonly title: string }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Refresh the page or sign in again to reconnect to your CRM data.</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function ClientGrid({ clients }: { readonly clients: readonly ClientListRecord[] }) {
  if (clients.length === 0) {
    return <EmptyState title="No clients found" description="Create a client or adjust your search filters." action={<Button render={<a href="/clients/new" />}>New client</Button>} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => (
        <Card key={client.id}>
          <CardHeader>
            <CardTitle className="flex items-start justify-between gap-3">
              <span>{client.name}</span>
              {client.deletedAt ? <Badge variant="outline">Deleted</Badge> : null}
            </CardTitle>
            <CardDescription>{client.company ?? client.email ?? "Independent contact"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-2 text-xs">
              <Row label="Email" value={client.email ?? "—"} />
              <Row label="Phone" value={client.phone ?? "—"} />
              <Row label="Website" value={client.website ?? "—"} />
            </dl>
            <Button variant="outline" size="sm" render={<Link to="/clients/$clientId" params={{ clientId: client.id }} />}>
              View client <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function LeadGrid({ leads }: { readonly leads: readonly LeadListRecord[] }) {
  if (leads.length === 0) {
    return <EmptyState title="No leads found" description="Create a lead or adjust your pipeline filters." action={<Button render={<a href="/leads/new" />}>New lead</Button>} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
    </div>
  );
}

export function LeadCard({ lead }: { readonly lead: LeadListRecord | LeadRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-3">
          <span>{lead.name}</span>
          <Badge variant="outline">{formatStageLabel(lead.stage)}</Badge>
        </CardTitle>
        <CardDescription>{lead.company ?? lead.source ?? lead.email ?? "Prospect"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-xs">
          <Row label="Value" value={formatMoney(lead.estimatedValueAmount, lead.estimatedValueCurrency)} />
          <Row label="Email" value={lead.email ?? "—"} />
          <Row label="Converted" value={lead.convertedAt ? formatDate(lead.convertedAt) : "No"} />
        </dl>
        <Button variant="outline" size="sm" render={<Link to="/leads/$leadId" params={{ leadId: lead.id }} />}>
          View lead <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  );
}

export function ClientDetails({ client }: { readonly client: ClientRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{client.name}</CardTitle>
        <CardDescription>{client.company ?? "Client profile"}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Email" value={client.email ?? "—"} />
          <Row label="Phone" value={client.phone ?? "—"} />
          <Row label="Website" value={client.website ?? "—"} />
          <Row label="Created" value={formatDate(client.createdAt)} />
          <Row label="Notes" value={client.notes ?? "—"} wide />
        </dl>
      </CardContent>
    </Card>
  );
}

export function LeadDetails({ lead }: { readonly lead: LeadRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{lead.name}<Badge variant="outline">{formatStageLabel(lead.stage)}</Badge></CardTitle>
        <CardDescription>{lead.company ?? lead.source ?? "Lead profile"}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Email" value={lead.email ?? "—"} />
          <Row label="Phone" value={lead.phone ?? "—"} />
          <Row label="Website" value={lead.website ?? "—"} />
          <Row label="Source" value={lead.source ?? "—"} />
          <Row label="Estimated value" value={formatMoney(lead.estimatedValueAmount, lead.estimatedValueCurrency)} />
          <Row label="Converted" value={lead.convertedAt ? formatDate(lead.convertedAt) : "No"} />
          <Row label="Notes" value={lead.notes ?? "—"} wide />
        </dl>
      </CardContent>
    </Card>
  );
}

export function LeadKanban({ pipeline, onMove, movingLeadId }: { readonly pipeline: readonly LeadPipelineStage[]; readonly onMove: (leadId: string, stage: WebLeadStage) => void; readonly movingLeadId?: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
      {pipeline.map((column) => (
        <Card key={column.stage} className="min-h-80">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>{formatStageLabel(column.stage)}</span>
              <Badge variant="outline">{column.leads.length}</Badge>
            </CardTitle>
            <CardDescription>{column.leads.length} active lead{column.leads.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {column.leads.length > 0 ? column.leads.map((lead) => (
              <div key={lead.id} className="border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.company ?? lead.source ?? "Prospect"}</p>
                  </div>
                  <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="mt-3 grid gap-2">
                  <Button variant="outline" size="xs" render={<Link to="/leads/$leadId" params={{ leadId: lead.id }} />}>Open</Button>
                  <div className="grid grid-cols-2 gap-1" aria-label={`Move ${lead.name} to stage`}>
                    {WEB_LEAD_STAGES.filter((stage) => stage !== column.stage).map((stage) => (
                      <Button key={stage} variant="ghost" size="xs" disabled={movingLeadId === lead.id} onClick={() => onMove(lead.id, stage)}>
                        {formatStageLabel(stage)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )) : <p className="border border-dashed p-4 text-center text-xs text-muted-foreground">No leads in this stage.</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Row({ label, value, wide = false }: { readonly label: string; readonly value: string; readonly wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">{value}</dd>
    </div>
  );
}

function formatMoney(amount: string | null | undefined, currency: string | null | undefined): string {
  if (!amount) {
    return "—";
  }
  return currency ? `${amount} ${currency}` : amount;
}

function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
