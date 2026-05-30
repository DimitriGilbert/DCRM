import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Card, Spinner, useThemeColor } from "heroui-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { StatusBadge } from "@/components/status-badge";
import { trpc } from "@/utils/trpc";

export default function ProjectList() {
  const muted = useThemeColor("muted");

  const { data, isLoading } = useQuery(
    trpc.project.list.queryOptions({ limit: 50 }),
  );

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
            onPress={() => router.push("/create-project")}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text className="text-primary-foreground font-semibold ml-1">New Project</Text>
          </Pressable>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-8">
              <Spinner size="lg" />
            </View>
          ) : (
            <View className="items-center py-8">
              <Ionicons name="folder-outline" size={48} color={muted} />
              <Text className="text-muted mt-2">No projects yet</Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/project/${item.id}`)}
            className="active:opacity-70"
          >
            <Card variant="secondary" className="p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className="text-foreground font-semibold" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <StatusBadge status={item.status} />
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
