import type { AppRouter } from "@DCRM/api/routers/index";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { Link, router } from "expo-router";
import { Button, Card, Input, Label, Spinner, Surface, TextField, useToast } from "heroui-native";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";
import { SignIn } from "@/components/sign-in";
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

type Client = RouterOutputs["clients"]["list"][number];
type Project = RouterOutputs["projects"]["list"][number];
type Ticket = RouterOutputs["tickets"]["list"][number];
type Exchange = RouterOutputs["exchanges"]["timeline"][number];

type ClientInput = RouterInputs["clients"]["create"];
type ProjectInput = RouterInputs["projects"]["create"];
type TicketInput = RouterInputs["tickets"]["create"];
type ExchangeInput = RouterInputs["exchanges"]["create"];

const projectStatuses = ["planning", "active", "on_hold", "completed", "archived"] as const;
const ticketTypes = ["task", "issue", "bug", "feature", "question"] as const;
const ticketStatuses = ["open", "closed"] as const;
const ticketPriorities = ["normal", "urgent"] as const;
const exchangeTypes = ["note", "call", "meeting", "comment"] as const;

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/u, (letter) => letter.toUpperCase());
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "No date";
  }
  return new Date(value).toLocaleDateString();
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function useRequireSession() {
  const { data: session, isPending } = authClient.useSession();
  return { session, isPending, isSignedIn: Boolean(session?.user) };
}

export function ProtectedCrmScreen({ children }: { children: ReactNode }) {
  const { isPending, isSignedIn } = useRequireSession();

  if (isPending) {
    return (
      <Container className="p-6">
        <View className="flex-1 items-center justify-center gap-3">
          <Spinner />
          <Text className="text-muted">Checking your session…</Text>
        </View>
      </Container>
    );
  }

  if (!isSignedIn) {
    return (
      <Container className="p-6">
        <View className="mb-5 gap-2">
          <Text className="text-3xl font-bold text-foreground">Sign in to DCRM</Text>
          <Text className="text-muted">Mobile is focused on core CRM browsing and simple edits.</Text>
        </View>
        <SignIn />
      </Container>
    );
  }

  return <>{children}</>;
}

export function ScreenHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <View className="mb-5 flex-row items-start justify-between gap-4">
      <View className="flex-1 gap-1">
        <Text className="text-3xl font-bold text-foreground">{title}</Text>
        <Text className="text-muted">{description}</Text>
      </View>
      {action}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <TextField>
      <Label>{label}</Label>
      <Input value={value} onChangeText={onChangeText} placeholder={placeholder} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} className={multiline ? "min-h-24" : undefined} />
    </TextField>
  );
}

function SelectChips<TValue extends string>({ label, options, value, onChange }: { label: string; options: readonly TValue[]; value: TValue; onChange: (value: TValue) => void }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable key={option} className={selected ? "rounded-full bg-primary px-3 py-2" : "rounded-full border border-border px-3 py-2"} onPress={() => onChange(option)}>
              <Text className={selected ? "text-primary-foreground text-sm font-medium" : "text-foreground text-sm"}>{formatLabel(option)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function EntitySelectChips<TValue extends string>({ label, options, value, onChange }: { label: string; options: readonly { value: TValue; label: string }[]; value: TValue; onChange: (value: TValue) => void }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <View className="gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable key={option.value} className={selected ? "rounded-xl bg-primary px-3 py-3" : "rounded-xl border border-border px-3 py-3"} onPress={() => onChange(option.value)}>
              <Text className={selected ? "text-primary-foreground font-medium" : "text-foreground"}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StateBlock({ title, description }: { title: string; description?: string }) {
  return (
    <Surface variant="secondary" className="rounded-xl p-5">
      <Text className="text-foreground font-semibold">{title}</Text>
      {description ? <Text className="mt-1 text-muted">{description}</Text> : null}
    </Surface>
  );
}

export function CrmDashboardScreen() {
  const dashboard = useQuery(trpc.dashboard.summary.queryOptions());
  const clients = useQuery(trpc.clients.list.queryOptions({ includeDeleted: false }));

  return (
    <ProtectedCrmScreen>
      <Container className="p-6">
        <ScreenHeader title="DCRM mobile" description="Core client, project, ticket, and exchange access for work on the go." />
        {dashboard.data ? (
          <View className="gap-4">
            <View className="flex-row gap-3">
              <MetricCard label="Clients" value={dashboard.data.metrics.activeClients} />
              <MetricCard label="Projects" value={dashboard.data.metrics.activeProjects} />
              <MetricCard label="Open tickets" value={dashboard.data.metrics.openTickets} />
            </View>
            <QuickActions hasClients={(clients.data?.length ?? 0) > 0} />
            <Card variant="secondary" className="p-4">
              <Card.Title>Recent activity</Card.Title>
              <View className="mt-3 gap-3">
                {dashboard.data.recentActivity.length > 0 ? dashboard.data.recentActivity.map((item) => (
                  <View key={item.id} className="border-b border-border pb-3">
                    <Text className="text-foreground font-medium">{item.title}</Text>
                    <Text className="text-muted text-xs">{formatLabel(item.kind)} · {formatDate(item.occurredAt)}</Text>
                  </View>
                )) : <Text className="text-muted">No recent exchanges yet.</Text>}
              </View>
            </Card>
          </View>
        ) : dashboard.isError ? <StateBlock title="Dashboard could not load" description="Check your connection and API session." /> : <Spinner />}
      </Container>
    </ProtectedCrmScreen>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="secondary" className="flex-1 p-4">
      <Text className="text-2xl font-bold text-foreground">{value}</Text>
      <Text className="text-muted text-xs">{label}</Text>
    </Card>
  );
}

function QuickActions({ hasClients }: { hasClients: boolean }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      <Link href="/clients/new" asChild><Pressable className="rounded-xl bg-primary px-4 py-3"><Text className="font-semibold text-primary-foreground">New client</Text></Pressable></Link>
      {hasClients ? <Link href="/projects/new" asChild><Pressable className="rounded-xl bg-secondary px-4 py-3"><Text className="font-semibold text-secondary-foreground">New project</Text></Pressable></Link> : null}
      <Link href="/tickets/new" asChild><Pressable className="rounded-xl bg-secondary px-4 py-3"><Text className="font-semibold text-secondary-foreground">New ticket</Text></Pressable></Link>
    </View>
  );
}

export function ClientsScreen() {
  const [search, setSearch] = useState("");
  const clients = useQuery(trpc.clients.list.queryOptions({ search: search.trim() || undefined, includeDeleted: false }));

  return (
    <ProtectedCrmScreen>
      <Container className="p-6">
        <ScreenHeader title="Clients" description="Browse and maintain the relationships that anchor your CRM." action={<IconLink href="/clients/new" icon="add" label="New" />} />
        <Field label="Search" value={search} onChangeText={setSearch} placeholder="Name, email, company, website" />
        <View className="mt-5 gap-3">{renderClientList(clients.data, clients.isError)}</View>
      </Container>
    </ProtectedCrmScreen>
  );
}

function renderClientList(clients: readonly Client[] | undefined, isError: boolean) {
  if (isError) return <StateBlock title="Clients could not load" />;
  if (!clients) return <Spinner />;
  if (clients.length === 0) return <StateBlock title="No clients yet" description="Create a client to unlock projects and tickets." />;
  return clients.map((client) => <ClientCard key={client.id} client={client} />);
}

function ClientCard({ client }: { client: Client }) {
  return (
    <Link href={`/clients/${client.id}`} asChild>
      <Pressable>
        <Card variant="secondary" className="p-4">
          <Text className="text-lg font-semibold text-foreground">{client.name}</Text>
          <Text className="text-muted">{client.company ?? client.email ?? "No company or email"}</Text>
        </Card>
      </Pressable>
    </Link>
  );
}

export function ClientDetailScreen({ clientId }: { clientId: string }) {
  const client = useQuery(trpc.clients.get.queryOptions({ id: clientId }));
  const projects = useQuery(trpc.projects.list.queryOptions({ clientId, includeDeleted: false }));
  const timeline = useQuery(trpc.exchanges.timeline.queryOptions({ clientId, includeDeleted: false }));

  return (
    <ProtectedCrmScreen>
      <Container className="p-6">
        <ScreenHeader title={client.data?.name ?? "Client"} description="Profile, related projects, and internal timeline." action={<IconLink href={`/clients/${clientId}/edit`} icon="create-outline" label="Edit" />} />
        {client.data ? <ClientDetails client={client.data} /> : client.isError ? <StateBlock title="Client could not load" /> : <Spinner />}
        <SectionTitle title="Projects" />
        <View className="gap-3">{projects.data?.length ? projects.data.map((project) => <ProjectCard key={project.id} project={project} />) : <StateBlock title="No projects for this client" />}</View>
        <SectionTitle title="Timeline" />
        <Timeline exchanges={timeline.data} isError={timeline.isError} />
      </Container>
    </ProtectedCrmScreen>
  );
}

function ClientDetails({ client }: { client: Client }) {
  return (
    <Card variant="secondary" className="gap-2 p-4">
      <Detail label="Email" value={client.email} />
      <Detail label="Phone" value={client.phone} />
      <Detail label="Company" value={client.company} />
      <Detail label="Website" value={client.website} />
      <Detail label="Notes" value={client.notes} />
    </Card>
  );
}

export function ClientFormScreen({ clientId }: { clientId?: string }) {
  const { toast } = useToast();
  const client = useQuery({ ...trpc.clients.get.queryOptions({ id: clientId ?? "" }), enabled: Boolean(clientId) });
  const createClient = useMutation(trpc.clients.create.mutationOptions());
  const updateClient = useMutation(trpc.clients.update.mutationOptions());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (client.data) {
      setName(client.data.name);
      setEmail(client.data.email ?? "");
      setPhone(client.data.phone ?? "");
      setCompany(client.data.company ?? "");
      setWebsite(client.data.website ?? "");
      setNotes(client.data.notes ?? "");
    }
  }, [client.data]);

  async function submit() {
    const input: ClientInput = { name: name.trim(), email: emptyToNull(email), phone: emptyToNull(phone), company: emptyToNull(company), website: emptyToNull(website), notes: emptyToNull(notes) };
    if (!input.name) {
      toast.show({ variant: "danger", label: "Client name is required" });
      return;
    }
    const saved = clientId ? await updateClient.mutateAsync({ id: clientId, ...input }) : await createClient.mutateAsync(input);
    await queryClient.invalidateQueries();
    toast.show({ variant: "success", label: clientId ? "Client updated" : "Client created" });
    router.replace(`/clients/${saved.id}`);
  }

  return (
    <ProtectedCrmScreen>
      <Container className="p-6">
        <ScreenHeader title={clientId ? "Edit client" : "New client"} description="Capture simple profile details from mobile." />
        <Surface variant="secondary" className="gap-4 rounded-xl p-4">
          <Field label="Name" value={name} onChangeText={setName} placeholder="Acme Studio" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="client@example.com" />
          <Field label="Phone" value={phone} onChangeText={setPhone} />
          <Field label="Company" value={company} onChangeText={setCompany} />
          <Field label="Website" value={website} onChangeText={setWebsite} placeholder="https://example.com" />
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
          <Button onPress={submit} isDisabled={createClient.isPending || updateClient.isPending}><Button.Label>{clientId ? "Save client" : "Create client"}</Button.Label></Button>
        </Surface>
      </Container>
    </ProtectedCrmScreen>
  );
}

export function ProjectsScreen() {
  const projects = useQuery(trpc.projects.list.queryOptions({ includeDeleted: false }));
  return (
    <ProtectedCrmScreen>
      <Container className="p-6">
        <ScreenHeader title="Projects" description="Browse active work and deadlines." action={<IconLink href="/projects/new" icon="add" label="New" />} />
        <View className="gap-3">{projects.data ? projects.data.map((project) => <ProjectCard key={project.id} project={project} />) : projects.isError ? <StateBlock title="Projects could not load" /> : <Spinner />}</View>
      </Container>
    </ProtectedCrmScreen>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} asChild><Pressable><Card variant="secondary" className="p-4"><Text className="text-lg font-semibold text-foreground">{project.name}</Text><Text className="text-muted">{formatLabel(project.status)} · Due {formatDate(project.dueAt)}</Text></Card></Pressable></Link>
  );
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const tickets = useQuery(trpc.tickets.list.queryOptions({ projectId, includeDeleted: false }));
  const timeline = useQuery(trpc.exchanges.timeline.queryOptions({ projectId, includeDeleted: false }));
  return (
    <ProtectedCrmScreen><Container className="p-6"><ScreenHeader title={project.data?.name ?? "Project"} description="Project details, tickets, and exchanges." action={<IconLink href={`/projects/${projectId}/edit`} icon="create-outline" label="Edit" />} />{project.data ? <ProjectDetails project={project.data} /> : project.isError ? <StateBlock title="Project could not load" /> : <Spinner />}<SectionTitle title="Tickets" /><View className="gap-3">{tickets.data?.length ? tickets.data.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />) : <StateBlock title="No tickets for this project" />}</View><SectionTitle title="Timeline" /><Timeline exchanges={timeline.data} isError={timeline.isError} /></Container></ProtectedCrmScreen>
  );
}

function ProjectDetails({ project }: { project: Project }) {
  return <Card variant="secondary" className="gap-2 p-4"><Detail label="Status" value={formatLabel(project.status)} /><Detail label="Budget" value={project.budgetAmount ? `${project.budgetAmount} ${project.budgetCurrency ?? ""}` : null} /><Detail label="Estimated hours" value={project.estimatedHours} /><Detail label="Actual hours" value={project.actualHours} /><Detail label="Description" value={project.description} /></Card>;
}

export function ProjectFormScreen({ projectId }: { projectId?: string }) {
  const { toast } = useToast();
  const clients = useQuery(trpc.clients.list.queryOptions({ includeDeleted: false }));
  const project = useQuery({ ...trpc.projects.get.queryOptions({ id: projectId ?? "" }), enabled: Boolean(projectId) });
  const createProject = useMutation(trpc.projects.create.mutationOptions());
  const updateProject = useMutation(trpc.projects.update.mutationOptions());
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectInput["status"]>("active");

  useEffect(() => {
    if (project.data) {
      setClientId(project.data.clientId);
      setName(project.data.name);
      setDescription(project.data.description ?? "");
      setStatus(project.data.status);
    }
  }, [project.data]);

  async function submit() {
    const selectedClientId = clientId || clients.data?.[0]?.id;
    if (!selectedClientId || !name.trim()) {
      toast.show({ variant: "danger", label: "Project needs a client and name" });
      return;
    }
    const input: ProjectInput = { clientId: selectedClientId, name: name.trim(), description: emptyToNull(description), status };
    const saved = projectId ? await updateProject.mutateAsync({ id: projectId, ...input }) : await createProject.mutateAsync(input);
    await queryClient.invalidateQueries();
    toast.show({ variant: "success", label: projectId ? "Project updated" : "Project created" });
    router.replace(`/projects/${saved.id}`);
  }

  return <ProtectedCrmScreen><Container className="p-6"><ScreenHeader title={projectId ? "Edit project" : "New project"} description="Simple project capture for mobile." />{clients.data?.length ? <Surface variant="secondary" className="gap-4 rounded-xl p-4"><EntitySelectChips label="Client" options={clients.data.map((clientItem) => ({ value: clientItem.id, label: clientItem.name }))} value={clientId || (clients.data[0]?.id ?? "")} onChange={setClientId} /><Field label="Name" value={name} onChangeText={setName} /><SelectChips label="Status" options={projectStatuses} value={status ?? "active"} onChange={setStatus} /><Field label="Description" value={description} onChangeText={setDescription} multiline /><Button onPress={submit} isDisabled={createProject.isPending || updateProject.isPending}><Button.Label>{projectId ? "Save project" : "Create project"}</Button.Label></Button></Surface> : <StateBlock title="Create a client first" description="Projects must belong to a client." />}</Container></ProtectedCrmScreen>;
}

export function TicketsScreen() {
  const tickets = useQuery(trpc.tickets.list.queryOptions({ includeDeleted: false }));
  return <ProtectedCrmScreen><Container className="p-6"><ScreenHeader title="Tickets" description="Track tasks, bugs, features, and questions." action={<IconLink href="/tickets/new" icon="add" label="New" />} /><View className="gap-3">{tickets.data ? tickets.data.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />) : tickets.isError ? <StateBlock title="Tickets could not load" /> : <Spinner />}</View></Container></ProtectedCrmScreen>;
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return <Link href={`/tickets/${ticket.id}`} asChild><Pressable><Card variant="secondary" className="p-4"><Text className="text-lg font-semibold text-foreground">{ticket.title}</Text><Text className="text-muted">{formatLabel(ticket.status)} · {formatLabel(ticket.priority)} · Due {formatDate(ticket.dueAt)}</Text></Card></Pressable></Link>;
}

export function TicketDetailScreen({ ticketId }: { ticketId: string }) {
  const ticket = useQuery(trpc.tickets.get.queryOptions({ id: ticketId }));
  const timeline = useQuery(trpc.exchanges.timeline.queryOptions({ ticketId, includeDeleted: false }));
  return <ProtectedCrmScreen><Container className="p-6"><ScreenHeader title={ticket.data?.title ?? "Ticket"} description="Ticket details and comments." action={<IconLink href={`/tickets/${ticketId}/edit`} icon="create-outline" label="Edit" />} />{ticket.data ? <TicketDetails ticket={ticket.data} /> : ticket.isError ? <StateBlock title="Ticket could not load" /> : <Spinner />}<SectionTitle title="Timeline" /><Timeline exchanges={timeline.data} isError={timeline.isError} /><ExchangeForm defaultTicketId={ticketId} /></Container></ProtectedCrmScreen>;
}

function TicketDetails({ ticket }: { ticket: Ticket }) {
  return <Card variant="secondary" className="gap-2 p-4"><Detail label="Status" value={formatLabel(ticket.status)} /><Detail label="Priority" value={formatLabel(ticket.priority)} /><Detail label="Type" value={formatLabel(ticket.type)} /><Detail label="Description" value={ticket.description} /></Card>;
}

export function TicketFormScreen({ ticketId }: { ticketId?: string }) {
  const { toast } = useToast();
  const projects = useQuery(trpc.projects.list.queryOptions({ includeDeleted: false }));
  const ticket = useQuery({ ...trpc.tickets.get.queryOptions({ id: ticketId ?? "" }), enabled: Boolean(ticketId) });
  const createTicket = useMutation(trpc.tickets.create.mutationOptions());
  const updateTicket = useMutation(trpc.tickets.update.mutationOptions());
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketInput["type"]>("task");
  const [status, setStatus] = useState<TicketInput["status"]>("open");
  const [priority, setPriority] = useState<TicketInput["priority"]>("normal");

  useEffect(() => {
    if (ticket.data) {
      setProjectId(ticket.data.projectId);
      setTitle(ticket.data.title);
      setDescription(ticket.data.description ?? "");
      setType(ticket.data.type);
      setStatus(ticket.data.status);
      setPriority(ticket.data.priority);
    }
  }, [ticket.data]);

  async function submit() {
    const selectedProjectId = projectId || projects.data?.[0]?.id;
    if (!selectedProjectId || !title.trim()) {
      toast.show({ variant: "danger", label: "Ticket needs a project and title" });
      return;
    }
    const input: TicketInput = { projectId: selectedProjectId, title: title.trim(), description: emptyToNull(description), type, status, priority };
    const saved = ticketId ? await updateTicket.mutateAsync({ id: ticketId, ...input }) : await createTicket.mutateAsync(input);
    await queryClient.invalidateQueries();
    toast.show({ variant: "success", label: ticketId ? "Ticket updated" : "Ticket created" });
    router.replace(`/tickets/${saved.id}`);
  }

  return <ProtectedCrmScreen><Container className="p-6"><ScreenHeader title={ticketId ? "Edit ticket" : "New ticket"} description="Simple ticket capture for mobile." />{projects.data?.length ? <Surface variant="secondary" className="gap-4 rounded-xl p-4"><EntitySelectChips label="Project" options={projects.data.map((projectItem) => ({ value: projectItem.id, label: projectItem.name }))} value={projectId || (projects.data[0]?.id ?? "")} onChange={setProjectId} /><Field label="Title" value={title} onChangeText={setTitle} /><SelectChips label="Type" options={ticketTypes} value={type ?? "task"} onChange={setType} /><SelectChips label="Status" options={ticketStatuses} value={status ?? "open"} onChange={setStatus} /><SelectChips label="Priority" options={ticketPriorities} value={priority ?? "normal"} onChange={setPriority} /><Field label="Description" value={description} onChangeText={setDescription} multiline /><Button onPress={submit} isDisabled={createTicket.isPending || updateTicket.isPending}><Button.Label>{ticketId ? "Save ticket" : "Create ticket"}</Button.Label></Button></Surface> : <StateBlock title="Create a project first" description="Tickets must belong to a project." />}</Container></ProtectedCrmScreen>;
}

export function ExchangesScreen() {
  const timeline = useQuery(trpc.exchanges.timeline.queryOptions({ includeDeleted: false }));
  return <ProtectedCrmScreen><Container className="p-6"><ScreenHeader title="Exchanges" description="Unified CRM timeline for notes, calls, meetings, and comments." /><SectionTitle title="Recent exchanges" /><Timeline exchanges={timeline.data} isError={timeline.isError} /></Container></ProtectedCrmScreen>;
}

function ExchangeForm({ defaultTicketId }: { defaultTicketId: string }) {
  const { toast } = useToast();
  const createExchange = useMutation(trpc.exchanges.create.mutationOptions());
  const [type, setType] = useState<ExchangeInput["type"]>("note");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function submit() {
    if (!body.trim()) {
      toast.show({ variant: "danger", label: "Exchange body is required" });
      return;
    }
    await createExchange.mutateAsync({ ticketId: defaultTicketId, type, visibility: "internal", subject: emptyToNull(subject), body: body.trim() });
    setSubject("");
    setBody("");
    await queryClient.invalidateQueries();
    toast.show({ variant: "success", label: "Exchange added" });
  }

  return <Surface variant="secondary" className="mb-5 gap-4 rounded-xl p-4"><Text className="text-lg font-semibold text-foreground">Add internal exchange</Text><SelectChips label="Type" options={exchangeTypes} value={type} onChange={setType} /><Field label="Subject" value={subject} onChangeText={setSubject} /><Field label="Body" value={body} onChangeText={setBody} multiline /><Button onPress={submit} isDisabled={createExchange.isPending}><Button.Label>Add exchange</Button.Label></Button></Surface>;
}

function Timeline({ exchanges, isError }: { exchanges: readonly Exchange[] | undefined; isError: boolean }) {
  if (isError) return <StateBlock title="Timeline could not load" />;
  if (!exchanges) return <Spinner />;
  if (exchanges.length === 0) return <StateBlock title="No exchanges yet" />;
  return <View className="gap-3">{exchanges.map((exchange) => <Card key={exchange.id} variant="secondary" className="p-4"><Text className="font-semibold text-foreground">{exchange.subject ?? formatLabel(exchange.type)}</Text><Text className="mt-1 text-foreground">{exchange.body}</Text><Text className="mt-2 text-muted text-xs">{formatLabel(exchange.type)} · {formatDate(exchange.occurredAt)}</Text></Card>)}</View>;
}

function SectionTitle({ title }: { title: string }) {
  return <Text className="mb-3 mt-6 text-xl font-bold text-foreground">{title}</Text>;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <View><Text className="text-muted text-xs uppercase tracking-wide">{label}</Text><Text className="text-foreground">{value?.trim() || "—"}</Text></View>;
}

function IconLink({ href, icon, label }: { href: string; icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return <Link href={href} asChild><Pressable className="flex-row items-center gap-1 rounded-full bg-primary px-3 py-2"><Ionicons name={icon} size={16} color="white" /><Text className="font-semibold text-primary-foreground">{label}</Text></Pressable></Link>;
}
