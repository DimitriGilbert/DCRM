import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { Card, Spinner, Surface, useThemeColor, useToast } from "heroui-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { queryClient, trpc, trpcClient } from "@/utils/trpc";

import { DetailRow } from "@/components/detail-row";

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const muted = useThemeColor("muted");
  const { toast } = useToast();

  const { data: client, isLoading } = useQuery({
    ...trpc.client.read.queryOptions({ id: id ?? "" }),
    enabled: !!id,
  });

  if (!id) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Client not found</Text>
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

  if (!client) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Client not found</Text>
      </View>
    );
  }

  async function handleDelete() {
    if (!client) return;
    try {
      await trpcClient.client.softDelete.mutate({ id: client.id });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      router.back();
      toast.show({ variant: "success", label: "Client deleted" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete";
      toast.show({ variant: "danger", label: message });
    }
  }

  async function handleRestore() {
    if (!client) return;
    try {
      await trpcClient.client.restore.mutate({ id: client.id });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      toast.show({ variant: "success", label: "Client restored" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to restore";
      toast.show({ variant: "danger", label: message });
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Surface variant="secondary" className="p-4 rounded-lg mb-4">
          <Text className="text-foreground text-xl font-bold mb-1">{client.name}</Text>
          {client.deletedAt ? (
            <Text className="text-danger text-xs mb-2">Deleted</Text>
          ) : null}
          <DetailRow icon="mail-outline" label="Email" value={client.email} muted={muted} />
          <DetailRow icon="call-outline" label="Phone" value={client.phone} muted={muted} />
          <DetailRow
            icon="business-outline"
            label="Company"
            value={client.company}
            muted={muted}
          />
          <DetailRow
            icon="globe-outline"
            label="Website"
            value={client.website}
            muted={muted}
          />
          {client.notes ? (
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-muted text-xs mb-1">Notes</Text>
              <Text className="text-foreground text-sm">{client.notes}</Text>
            </View>
          ) : null}
        </Surface>

        <View className="flex-row gap-3 mb-4">
          <Pressable
            className="flex-1 flex-row items-center justify-center bg-primary py-2.5 rounded-lg active:opacity-70"
            onPress={() =>
              router.push({
                pathname: "/create-exchange",
                params: { clientId: client.id },
              })
            }
          >
            <Ionicons name="chatbubble-outline" size={16} color="#fff" />
            <Text className="text-primary-foreground font-medium ml-1.5 text-sm">
              Add Exchange
            </Text>
          </Pressable>
        </View>

        <View className="flex-row gap-3">
          {client.deletedAt ? (
            <Pressable
              className="flex-1 flex-row items-center justify-center bg-success py-2.5 rounded-lg active:opacity-70"
              onPress={handleRestore}
            >
              <Ionicons name="refresh-outline" size={16} color="#fff" />
              <Text className="text-success-foreground font-medium ml-1.5 text-sm">Restore</Text>
            </Pressable>
          ) : (
            <Pressable
              className="flex-1 flex-row items-center justify-center bg-danger py-2.5 rounded-lg active:opacity-70"
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text className="text-danger-foreground font-medium ml-1.5 text-sm">Delete</Text>
            </Pressable>
          )}
        </View>

        <ClientProjects clientId={client.id} />
        <ClientExchanges clientId={client.id} />
      </ScrollView>
    </View>
  );
}

function ClientProjects({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery(
    trpc.project.list.queryOptions({ limit: 10, clientId }),
  );

  if (isLoading) return <Spinner size="sm" className="mt-4" />;
  const projects = data?.items ?? [];
  if (!projects.length) return null;

  return (
    <View className="mt-6">
      <Text className="text-foreground font-semibold mb-2">Projects</Text>
      {projects.map((project) => (
        <Pressable
          key={project.id}
          onPress={() => router.push(`/project/${project.id}`)}
          className="active:opacity-70"
        >
          <Card variant="secondary" className="p-3 mb-2">
            <Text className="text-foreground font-medium">{project.name}</Text>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

function ClientExchanges({ clientId }: { clientId: string }) {
  const muted = useThemeColor("muted");
  const { data, isLoading } = useQuery(
    trpc.exchange.list.queryOptions({ limit: 10, clientId }),
  );

  if (isLoading) return <Spinner size="sm" className="mt-4" />;
  const exchanges = data?.items ?? [];
  if (!exchanges.length) return null;

  return (
    <View className="mt-4">
      <Text className="text-foreground font-semibold mb-2">Exchanges</Text>
      {exchanges.map((exchange) => (
        <Pressable
          key={exchange.id}
          onPress={() => router.push(`/exchange/${exchange.id}`)}
          className="active:opacity-70"
        >
          <Card variant="secondary" className="p-3 mb-2">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-2">
                <Text className="text-foreground text-sm" numberOfLines={1}>
                  {exchange.subject ?? exchange.type}
                </Text>
                <Text className="text-muted text-xs" numberOfLines={1}>
                  {exchange.body ?? "No content"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={muted} />
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
