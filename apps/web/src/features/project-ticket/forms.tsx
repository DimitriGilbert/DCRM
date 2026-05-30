import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import type { ReactNode } from "react";
import { z } from "zod";

import { WEB_PROJECT_STATUSES, WEB_TICKET_PRIORITIES, WEB_TICKET_STATUSES, WEB_TICKET_TYPES } from "./constants";
import type { WebExchangeVisibility, WebProjectStatus, WebTicketPriority, WebTicketStatus, WebTicketType } from "./constants";
import type { ClientOptionRecord, ProjectListRecord, ProjectRecord, TicketRecord } from "./types";

const optionalMoneyFormSchema = z.string().trim().refine((value) => value.length === 0 || /^\d+(?:\.\d{1,2})?$/u.test(value), "Use a positive amount with up to 2 decimals.");
const optionalHoursFormSchema = z.string().trim().refine((value) => value.length === 0 || /^\d+(?:\.\d{1,2})?$/u.test(value), "Use a positive hour value with up to 2 decimals.");
const optionalCurrencyFormSchema = z.string().trim().refine((value) => value.length === 0 || /^[A-Za-z]{3}$/u.test(value), "Use a 3-letter currency code.");
const optionalDateFormSchema = z.string().trim().refine((value) => value.length === 0 || !Number.isNaN(new Date(value).getTime()), "Use a valid date.");

export const projectFormSchema = z.object({
  clientId: z.string().trim().min(1, "Client is required."),
  name: z.string().trim().min(1, "Project name is required."),
  description: z.string().trim(),
  status: z.enum(WEB_PROJECT_STATUSES),
  budgetAmount: optionalMoneyFormSchema,
  budgetCurrency: optionalCurrencyFormSchema,
  estimatedHours: optionalHoursFormSchema,
  actualHours: optionalHoursFormSchema,
  startsAt: optionalDateFormSchema,
  dueAt: optionalDateFormSchema,
  completedAt: optionalDateFormSchema,
});

export const ticketFormSchema = z.object({
  projectId: z.string().trim().min(1, "Project is required."),
  title: z.string().trim().min(1, "Ticket title is required."),
  description: z.string().trim(),
  type: z.enum(WEB_TICKET_TYPES),
  status: z.enum(WEB_TICKET_STATUSES),
  priority: z.enum(WEB_TICKET_PRIORITIES),
  dueAt: optionalDateFormSchema,
  closedAt: optionalDateFormSchema,
});

export const projectFilterFormSchema = z.object({
  search: z.string().trim(),
  status: z.enum(["all", ...WEB_PROJECT_STATUSES]),
  includeDeleted: z.boolean(),
});

export const ticketFilterFormSchema = z.object({
  search: z.string().trim(),
  status: z.enum(["all", ...WEB_TICKET_STATUSES]),
  priority: z.enum(["all", ...WEB_TICKET_PRIORITIES]),
  type: z.enum(["all", ...WEB_TICKET_TYPES]),
  includeDeleted: z.boolean(),
});

export const ticketCommentFormSchema = z.object({
  body: z.string().trim().min(1, "Comment text is required."),
  visibility: z.enum(["internal", "external"]),
});

export const internalNoteFormSchema = z.object({
  body: z.string().trim().min(1, "Internal note text is required."),
});

export type ProjectFormValues = Record<string, unknown> & z.infer<typeof projectFormSchema>;
export type TicketFormValues = Record<string, unknown> & z.infer<typeof ticketFormSchema>;
export type ProjectFilterValues = Record<string, unknown> & z.infer<typeof projectFilterFormSchema>;
export type TicketFilterValues = Record<string, unknown> & z.infer<typeof ticketFilterFormSchema>;
export type TicketCommentFormValues = Record<string, unknown> & z.infer<typeof ticketCommentFormSchema>;
export type InternalNoteFormValues = Record<string, unknown> & z.infer<typeof internalNoteFormSchema>;

export interface ProjectMutationInput {
  readonly clientId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly status?: WebProjectStatus;
  readonly budgetAmount?: string | null;
  readonly budgetCurrency?: string | null;
  readonly estimatedHours?: string | null;
  readonly actualHours?: string | null;
  readonly startsAt?: Date | null;
  readonly dueAt?: Date | null;
  readonly completedAt?: Date | null;
}

export interface TicketMutationInput {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly type?: WebTicketType;
  readonly status?: WebTicketStatus;
  readonly priority?: WebTicketPriority;
  readonly dueAt?: Date | null;
  readonly closedAt?: Date | null;
}

export interface InternalNoteMutationInput {
  readonly body: string;
  readonly visibility: "internal";
  readonly type: "note";
}

export interface TicketCommentMutationInput {
  readonly body: string;
  readonly visibility: WebExchangeVisibility;
}

export function ProjectForm({ project, clients, clientUnavailable, submitLabel, submitting, onSubmit }: { readonly project?: ProjectRecord; readonly clients: readonly ClientOptionRecord[]; readonly clientUnavailable?: boolean; readonly submitLabel: string; readonly submitting: boolean; readonly onSubmit: (input: ProjectMutationInput) => Promise<void> }) {
  const { Form } = useFormedible<ProjectFormValues>({
    schema: projectFormSchema,
    fields: projectFields(clients),
    formOptions: {
      defaultValues: projectToFormValues(project, clientUnavailable ?? false),
      onSubmit: async ({ value }) => onSubmit(projectFormValuesToInput(value)),
    },
    submitLabel,
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function TicketForm({ ticket, projects, projectUnavailable, submitLabel, submitting, onSubmit }: { readonly ticket?: TicketRecord; readonly projects: readonly ProjectListRecord[]; readonly projectUnavailable?: boolean; readonly submitLabel: string; readonly submitting: boolean; readonly onSubmit: (input: TicketMutationInput) => Promise<void> }) {
  const { Form } = useFormedible<TicketFormValues>({
    schema: ticketFormSchema,
    fields: ticketFields(projects),
    formOptions: {
      defaultValues: ticketToFormValues(ticket, projectUnavailable ?? false),
      onSubmit: async ({ value }) => onSubmit(ticketFormValuesToInput(value)),
    },
    submitLabel,
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function ProjectFilterForm({ onSubmit }: { readonly onSubmit: (values: ProjectFilterValues) => void }) {
  const { Form } = useFormedible<ProjectFilterValues>({
    schema: projectFilterFormSchema,
    fields: [
      { name: "search", type: "text", label: "Search", placeholder: "Project name or description" },
      { name: "status", type: "select", label: "Status", options: [{ value: "all", label: "All statuses" }, ...WEB_PROJECT_STATUSES.map((status) => ({ value: status, label: formatLabel(status) }))] },
      { name: "includeDeleted", type: "checkbox", label: "Include deleted" },
    ],
    formOptions: {
      defaultValues: { search: "", status: "all" as const, includeDeleted: false },
      onSubmit: ({ value }) => onSubmit(value),
    },
    submitLabel: "Apply filters",
  });

  return <Form className="grid gap-4 lg:grid-cols-[1fr_12rem_auto] lg:items-end" />;
}

export function TicketFilterForm({ onSubmit }: { readonly onSubmit: (values: TicketFilterValues) => void }) {
  const { Form } = useFormedible<TicketFilterValues>({
    schema: ticketFilterFormSchema,
    fields: [
      { name: "search", type: "text", label: "Search", placeholder: "Ticket title or description" },
      { name: "status", type: "select", label: "Status", options: [{ value: "all", label: "All statuses" }, ...WEB_TICKET_STATUSES.map((status) => ({ value: status, label: formatLabel(status) }))] },
      { name: "priority", type: "select", label: "Priority", options: [{ value: "all", label: "All priorities" }, ...WEB_TICKET_PRIORITIES.map((priority) => ({ value: priority, label: formatLabel(priority) }))] },
      { name: "type", type: "select", label: "Type", options: [{ value: "all", label: "All types" }, ...WEB_TICKET_TYPES.map((type) => ({ value: type, label: formatLabel(type) }))] },
      { name: "includeDeleted", type: "checkbox", label: "Include deleted" },
    ],
    formOptions: {
      defaultValues: { search: "", status: "all" as const, priority: "all" as const, type: "all" as const, includeDeleted: false },
      onSubmit: ({ value }) => onSubmit(value),
    },
    submitLabel: "Apply filters",
  });

  return <Form className="grid gap-4 xl:grid-cols-[1fr_10rem_10rem_10rem_auto] xl:items-end" />;
}

export function TicketCommentForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (input: TicketCommentMutationInput) => Promise<void> }) {
  const { Form } = useFormedible<TicketCommentFormValues>({
    schema: ticketCommentFormSchema,
    fields: [
      { name: "body", type: "textarea", label: "Ticket comment", description: "Comments are stored as exchanges in the ticket timeline.", textareaConfig: { rows: 4, maxLength: 2_000, showWordCount: true } },
      { name: "visibility", type: "select", label: "Visibility", options: [{ value: "internal", label: "Internal comment" }, { value: "external", label: "External-visible comment; email sending is not enabled here" }] },
    ],
    formOptions: {
      defaultValues: { body: "", visibility: "internal" as const },
      onSubmit: async ({ value }) => onSubmit({ body: value.body.trim(), visibility: value.visibility }),
    },
    submitLabel: "Add comment",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function InternalNoteForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (input: InternalNoteMutationInput) => Promise<void> }) {
  const { Form } = useFormedible<InternalNoteFormValues>({
    schema: internalNoteFormSchema,
    fields: [
      { name: "body", type: "textarea", label: "Internal note", description: "Internal notes are private timeline entries and are never presented as email-sendable.", textareaConfig: { rows: 4, maxLength: 2_000, showWordCount: true } },
    ],
    formOptions: {
      defaultValues: { body: "" },
      onSubmit: async ({ value }) => onSubmit({ body: value.body.trim(), visibility: "internal", type: "note" }),
    },
    submitLabel: "Add internal note",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function FormShell({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DeletedParentNotice({ title, description, children }: { readonly title: string; readonly description: string; readonly children?: ReactNode }) {
  return (
    <Card className="border-amber-300/50 bg-amber-500/10">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

export function BackButton({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <Button variant="outline" size="sm" render={<a href={href} />}>
      {label}
    </Button>
  );
}

function projectFields(clients: readonly ClientOptionRecord[]): readonly FormedibleFieldConfig<ProjectFormValues>[] {
  return [
    { name: "clientId", type: "select", label: "Client", options: clients.map((client) => ({ value: client.id, label: client.name })), required: true, section: { title: "Relationship", description: "Every project belongs to one client." } },
    { name: "name", type: "text", label: "Project name", required: true },
    { name: "description", type: "textarea", label: "Description", textareaConfig: { rows: 5, maxLength: 2_000, showWordCount: true } },
    { name: "status", type: "select", label: "Status", options: WEB_PROJECT_STATUSES.map((status) => ({ value: status, label: formatLabel(status) })), section: { title: "Planning", description: "Track status, budget, hours, and dates." } },
    { name: "budgetAmount", type: "text", label: "Budget amount" },
    { name: "budgetCurrency", type: "text", label: "Budget currency", placeholder: "USD" },
    { name: "estimatedHours", type: "text", label: "Estimated hours" },
    { name: "actualHours", type: "text", label: "Actual hours" },
    { name: "startsAt", type: "date", label: "Start date" },
    { name: "dueAt", type: "date", label: "Due date" },
    { name: "completedAt", type: "date", label: "Completed date" },
  ];
}

function ticketFields(projects: readonly ProjectListRecord[]): readonly FormedibleFieldConfig<TicketFormValues>[] {
  return [
    { name: "projectId", type: "select", label: "Project", options: projects.map((project) => ({ value: project.id, label: project.name })), required: true, section: { title: "Project scope", description: "Tickets live inside projects." } },
    { name: "title", type: "text", label: "Title", required: true },
    { name: "description", type: "textarea", label: "Description", textareaConfig: { rows: 5, maxLength: 2_000, showWordCount: true } },
    { name: "type", type: "select", label: "Type", options: WEB_TICKET_TYPES.map((type) => ({ value: type, label: formatLabel(type) })), section: { title: "Workflow", description: "Use fixed type, status, and priority values." } },
    { name: "status", type: "select", label: "Status", options: WEB_TICKET_STATUSES.map((status) => ({ value: status, label: formatLabel(status) })) },
    { name: "priority", type: "select", label: "Priority", options: WEB_TICKET_PRIORITIES.map((priority) => ({ value: priority, label: formatLabel(priority) })) },
    { name: "dueAt", type: "date", label: "Due date" },
    { name: "closedAt", type: "date", label: "Closed date" },
  ];
}

function projectToFormValues(project: ProjectRecord | undefined, clientUnavailable: boolean): ProjectFormValues {
  return {
    clientId: clientUnavailable ? "" : project?.clientId ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "planning",
    budgetAmount: project?.budgetAmount ?? "",
    budgetCurrency: project?.budgetCurrency ?? "USD",
    estimatedHours: project?.estimatedHours ?? "",
    actualHours: project?.actualHours ?? "",
    startsAt: dateInputValue(project?.startsAt),
    dueAt: dateInputValue(project?.dueAt),
    completedAt: dateInputValue(project?.completedAt),
  };
}

function ticketToFormValues(ticket: TicketRecord | undefined, projectUnavailable: boolean): TicketFormValues {
  return {
    projectId: projectUnavailable ? "" : ticket?.projectId ?? "",
    title: ticket?.title ?? "",
    description: ticket?.description ?? "",
    type: ticket?.type ?? "task",
    status: ticket?.status ?? "open",
    priority: ticket?.priority ?? "normal",
    dueAt: dateInputValue(ticket?.dueAt),
    closedAt: dateInputValue(ticket?.closedAt),
  };
}

function projectFormValuesToInput(value: ProjectFormValues): ProjectMutationInput {
  return {
    clientId: value.clientId,
    name: value.name.trim(),
    description: emptyToNull(value.description),
    status: value.status,
    budgetAmount: emptyToNull(value.budgetAmount),
    budgetCurrency: emptyToNull(value.budgetCurrency)?.toUpperCase() ?? null,
    estimatedHours: emptyToNull(value.estimatedHours),
    actualHours: emptyToNull(value.actualHours),
    startsAt: stringToDateOrNull(value.startsAt),
    dueAt: stringToDateOrNull(value.dueAt),
    completedAt: stringToDateOrNull(value.completedAt),
  };
}

function ticketFormValuesToInput(value: TicketFormValues): TicketMutationInput {
  const closedAt = normalizeTicketClosedAt(value.status, stringToDateOrNull(value.closedAt));
  return {
    projectId: value.projectId,
    title: value.title.trim(),
    description: emptyToNull(value.description),
    type: value.type,
    status: value.status,
    priority: value.priority,
    dueAt: stringToDateOrNull(value.dueAt),
    closedAt,
  };
}

function normalizeTicketClosedAt(status: WebTicketStatus, closedAt: Date | null): Date | null {
  if (status === "open") {
    return null;
  }
  return closedAt ?? new Date();
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringToDateOrNull(value: string): Date | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? new Date(trimmed) : null;
}

function dateInputValue(value: string | Date | null | undefined): string {
  if (!value) {
    return "";
  }
  return new Date(value).toISOString().slice(0, 10);
}

export function formatLabel(value: string): string {
  return value.replace(/_/gu, " ").replace(/^\w/u, (letter) => letter.toUpperCase());
}
