import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { Card, Spinner, Surface, useThemeColor, useToast } from "heroui-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { StatusBadge } from "@/components/status-badge";
import { DetailRow } from "@/components/detail-row";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const muted = useThemeColor("muted");
  const { toast } = useToast();

  const { data: project, isLoading } = useQuery({
    ...trpc.project.read.queryOptions({ id: id ?? "" }),
    enabled: !!id,
  });

  if (!id) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Project not found</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner size="lg" />
      </View>
    );
  }

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Project not found</Text>
      </View>
    );
  }

  async function handleDelete() {
    if (!project) return;
    try {
      await trpcClient.project.softDelete.mutate({ id: project.id });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      router.back();
      toast.show({ variant: "success", label: "Project deleted" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete";
      toast.show({ variant: "danger", label: message });
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Surface variant="secondary" className="p-4 rounded-lg mb-4">
          <Text className="text-foreground text-xl font-bold mb-1">{project.name}</Text>
          <View className="flex-row gap-1.5 mt-1 mb-2">
            <StatusBadge status={project.status} />
          </View>
          {project.description ? (
            <Text className="text-muted text-sm mb-2">{project.description}</Text>
          ) : null}
          {project.budgetAmount != null ? (
            <DetailRow
              icon="cash-outline"
              label="Budget"
              value={`${project.budgetCurrency ?? "USD"} ${project.budgetAmount}`}
              muted={muted}
            />
          ) : null}
          {project.estimatedHours != null ? (
            <DetailRow
              icon="time-outline"
              label="Est. Hours"
              value={`${project.estimatedHours}h`}
              muted={muted}
            />
          ) : null}
          {project.actualHours != null ? (
            <DetailRow
              icon="construct-outline"
              label="Actual Hours"
              value={`${project.actualHours}h`}
              muted={muted}
            />
          ) : null}
          {project.startDate ? (
            <DetailRow
              icon="calendar-outline"
              label="Start"
              value={new Date(project.startDate).toLocaleDateString()}
              muted={muted}
            />
          ) : null}
          {project.endDate ? (
            <DetailRow
              icon="calendar-outline"
              label="End"
              value={new Date(project.endDate).toLocaleDateString()}
              muted={muted}
            />
          ) : null}
        </Surface>

        <View className="flex-row gap-3 mb-4">
          <Pressable
            className="flex-1 flex-row items-center justify-center bg-primary py-2.5 rounded-lg active:opacity-70"
            onPress={() =>
              router.push({
                pathname: "/create-ticket",
                params: { projectId: project.id, projectName: project.name },
              })
            }
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text className="text-primary-foreground font-medium ml-1.5 text-sm">
              New Ticket
            </Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center bg-secondary py-2.5 rounded-lg active:opacity-70"
            onPress={() =>
              router.push({
                pathname: "/create-exchange",
                params: { projectId: project.id },
              })
            }
          >
            <Ionicons name="chatbubble-outline" size={16} color="#fff" />
            <Text className="text-secondary-foreground font-medium ml-1.5 text-sm">
              Add Exchange
            </Text>
          </Pressable>
        </View>

        {!project.deletedAt ? (
          <Pressable
            className="flex-row items-center justify-center bg-danger py-2.5 rounded-lg mb-4 active:opacity-70"
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text className="text-danger-foreground font-medium ml-1.5 text-sm">Delete</Text>
          </Pressable>
        ) : null}

        <ProjectTickets projectId={project.id} />
      </ScrollView>
    </View>
  );
}

function ProjectTickets({ projectId }: { projectId: string }) {
  const muted = useThemeColor("muted");
  const { data, isLoading } = useQuery(
    trpc.ticket.list.queryOptions({ limit: 10, projectId }),
  );

  if (isLoading) return <Spinner size="sm" className="mt-4" />;
  const tickets = data?.items ?? [];
  if (!tickets.length) return null;

  return (
    <View className="mt-4">
      <Text className="text-foreground font-semibold mb-2">Tickets</Text>
      {tickets.map((ticket) => (
        <Pressable
          key={ticket.id}
          onPress={() => router.push(`/ticket/${ticket.id}`)}
          className="active:opacity-70"
        >
          <Card variant="secondary" className="p-3 mb-2">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-2">
                <Text className="text-foreground font-medium text-sm" numberOfLines={1}>
                  {ticket.title}
                </Text>
                <View className="flex-row gap-1 mt-1">
                  <StatusBadge status={ticket.status} />
                  <StatusBadge status={ticket.priority} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={14} color={muted} />
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
