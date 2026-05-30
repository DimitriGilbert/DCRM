import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Card, Spinner, useThemeColor } from "heroui-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { StatusBadge } from "@/components/status-badge";
import { trpc } from "@/utils/trpc";

function ItemSeparator() {
  return <View className="h-2" />;
}

export default function TicketList() {
  const muted = useThemeColor("muted");
  const { data: session } = authClient.useSession();

  const { data, isLoading, error } = useQuery({
    ...trpc.ticket.list.queryOptions({ limit: 50 }),
    enabled: !!session?.user,
  });

  const items = data?.items ?? [];

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <Pressable
            className="flex-row items-center justify-center bg-primary py-3 rounded-lg mb-4 active:opacity-70"
            onPress={() => router.push("/create-ticket")}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text className="text-primary-foreground font-semibold ml-1">New Ticket</Text>
          </Pressable>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-8">
              <Spinner size="lg" />
            </View>
          ) : error ? (
            <View className="items-center py-8">
              <Ionicons name="alert-circle-outline" size={48} color={muted} />
              <Text className="text-muted mt-2">Failed to load tickets</Text>
            </View>
          ) : (
            <View className="items-center py-8">
              <Ionicons name="document-text-outline" size={48} color={muted} />
              <Text className="text-muted mt-2">No tickets yet</Text>
            </View>
          )
        }
        ItemSeparatorComponent={ItemSeparator}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/ticket/${item.id}`)}
            className="active:opacity-70"
          >
            <Card variant="secondary" className="p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className="text-foreground font-semibold" numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View className="flex-row gap-1.5 mt-1.5 flex-wrap">
                    <StatusBadge status={item.type} />
                    <StatusBadge status={item.status} />
                    <StatusBadge status={item.priority} />
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={muted} />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
