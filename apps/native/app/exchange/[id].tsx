import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Spinner, Surface } from "heroui-native";
import { ScrollView, Text, View } from "react-native";

import { StatusBadge } from "@/components/status-badge";
import { trpc } from "@/utils/trpc";

export default function ExchangeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: exchange, isLoading } = useQuery({
    ...trpc.exchange.read.queryOptions({ id: id ?? "" }),
    enabled: !!id,
  });

  if (!id) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Exchange not found</Text>
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

  if (!exchange) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Exchange not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Surface variant="secondary" className="p-4 rounded-lg">
          <View className="flex-row items-center gap-2 mb-3">
            <StatusBadge status={exchange.type} />
            <StatusBadge status={exchange.direction} />
            <Text className="text-muted text-xs">
              {new Date(exchange.createdAt).toLocaleDateString()}
            </Text>
          </View>

          {exchange.subject ? (
            <Text className="text-foreground text-lg font-semibold mb-2">
              {exchange.subject}
            </Text>
          ) : null}

          {exchange.body ? (
            <View className="mt-2 pt-2 border-t border-border">
              <Text className="text-foreground text-sm leading-5">{exchange.body}</Text>
            </View>
          ) : null}

          {exchange.isInternal ? (
            <View className="mt-3 flex-row items-center">
              <Text className="text-muted text-xs">Internal only</Text>
            </View>
          ) : null}
        </Surface>
      </ScrollView>
    </View>
  );
}
