import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Card, Spinner, useThemeColor } from "heroui-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

function ItemSeparator() {
  return <View className="h-2" />;
}

export default function ClientList() {
  const muted = useThemeColor("muted");
  const { data: session } = authClient.useSession();

  const { data, isLoading, error } = useQuery({
    ...trpc.client.list.queryOptions({ limit: 50 }),
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
            onPress={() => router.push("/create-client")}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text className="text-primary-foreground font-semibold ml-1">New Client</Text>
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
              <Text className="text-muted mt-2">Failed to load clients</Text>
            </View>
          ) : (
            <View className="items-center py-8">
              <Ionicons name="people-outline" size={48} color={muted} />
              <Text className="text-muted mt-2">No clients yet</Text>
            </View>
          )
        }
        ItemSeparatorComponent={ItemSeparator}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/client/${item.id}`)}
            className="active:opacity-70"
          >
            <Card variant="secondary" className="p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className="text-foreground font-semibold" numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.email ? (
                    <Text className="text-muted text-sm" numberOfLines={1}>
                      {item.email}
                    </Text>
                  ) : null}
                  {item.company ? (
                    <Text className="text-muted text-xs" numberOfLines={1}>
                      {item.company}
                    </Text>
                  ) : null}
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
