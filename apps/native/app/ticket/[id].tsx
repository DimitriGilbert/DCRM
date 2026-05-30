import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { Card, Spinner, Surface, useThemeColor, useToast } from "heroui-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { StatusBadge } from "@/components/status-badge";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const muted = useThemeColor("muted");
  const { toast } = useToast();

  const { data: ticket, isLoading } = useQuery(
    trpc.ticket.read.queryOptions({ id: id ?? "" }),
  );

  if (!id) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Ticket not found</Text>
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

  if (!ticket) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Ticket not found</Text>
      </View>
    );
  }

  async function handleDelete() {
    if (!ticket) return;
    try {
      await trpcClient.ticket.softDelete.mutate({ id: ticket.id });
      queryClient.invalidateQueries();
      router.back();
      toast.show({ variant: "success", label: "Ticket deleted" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete";
      toast.show({ variant: "danger", label: message });
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Surface variant="secondary" className="p-4 rounded-lg mb-4">
          <Text className="text-foreground text-xl font-bold mb-2">{ticket.title}</Text>
          <View className="flex-row gap-1.5 flex-wrap mb-2">
            <StatusBadge status={ticket.type} />
            <StatusBadge status={ticket.status} />
            <StatusBadge status={ticket.priority} />
          </View>
          {ticket.description ? (
            <View className="mt-2 pt-2 border-t border-border">
              <Text className="text-muted text-xs mb-1">Description</Text>
              <Text className="text-foreground text-sm">{ticket.description}</Text>
            </View>
          ) : null}
          {ticket.dueDate ? (
            <View className="flex-row items-center mt-2">
              <Ionicons name="calendar-outline" size={16} color={muted} />
              <Text className="text-muted text-sm ml-2">
                Due: {new Date(ticket.dueDate).toLocaleDateString()}
              </Text>
            </View>
          ) : null}
        </Surface>

        <View className="flex-row gap-3 mb-4">
          <Pressable
            className="flex-1 flex-row items-center justify-center bg-primary py-2.5 rounded-lg active:opacity-70"
            onPress={() =>
              router.push({
                pathname: "/create-exchange",
                params: { ticketId: ticket.id },
              })
            }
          >
            <Ionicons name="chatbubble-outline" size={16} color="#fff" />
            <Text className="text-primary-foreground font-medium ml-1.5 text-sm">
              Add Comment
            </Text>
          </Pressable>
        </View>

        {!ticket.deletedAt ? (
          <Pressable
            className="flex-row items-center justify-center bg-danger py-2.5 rounded-lg mb-4 active:opacity-70"
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text className="text-danger-foreground font-medium ml-1.5 text-sm">Delete</Text>
          </Pressable>
        ) : null}

        <TicketExchanges ticketId={ticket.id} />
      </ScrollView>
    </View>
  );
}

function TicketExchanges({ ticketId }: { ticketId: string }) {
  const { data, isLoading } = useQuery(
    trpc.exchange.list.queryOptions({ limit: 20, ticketId }),
  );

  if (isLoading) return <Spinner size="sm" className="mt-4" />;
  const exchanges = data?.items ?? [];
  if (!exchanges.length) return null;

  return (
    <View className="mt-4">
      <Text className="text-foreground font-semibold mb-2">{"Comments & History"}</Text>
      {exchanges.map((exchange) => (
        <Card key={exchange.id} variant="secondary" className="p-3 mb-2">
          <View className="flex-row items-center mb-1">
            <StatusBadge status={exchange.type} />
            <Text className="text-muted text-xs ml-2">
              {new Date(exchange.createdAt).toLocaleDateString()}
            </Text>
          </View>
          {exchange.subject ? (
            <Text className="text-foreground text-sm font-medium">{exchange.subject}</Text>
          ) : null}
          {exchange.body ? (
            <Text className="text-muted text-sm mt-0.5" numberOfLines={4}>
              {exchange.body}
            </Text>
          ) : null}
        </Card>
      ))}
    </View>
  );
}
