import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Card, Spinner, Surface, useThemeColor } from "heroui-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

export default function Dashboard() {
  const { data: session } = authClient.useSession();
  const fg = useThemeColor("foreground");
  const muted = useThemeColor("muted");

  const clients = useQuery({
    ...trpc.client.list.queryOptions({ limit: 100 }),
    enabled: !!session?.user,
  });
  const projects = useQuery({
    ...trpc.project.list.queryOptions({ limit: 100, status: "active" }),
    enabled: !!session?.user,
  });
  const tickets = useQuery({
    ...trpc.ticket.list.queryOptions({ limit: 100, status: "open" }),
    enabled: !!session?.user,
  });
  const exchanges = useQuery({
    ...trpc.exchange.list.queryOptions({ limit: 5 }),
    enabled: !!session?.user,
  });

  if (!session?.user) {
    return (
      <View className="flex-1 bg-background p-6">
        <View className="py-4 mb-6">
          <Text className="text-4xl font-bold text-foreground mb-2">DCRM</Text>
          <Text className="text-muted">Micro CRM for independent contractors</Text>
        </View>
        <SignIn />
        <SignUp />
      </View>
    );
  }

  const isLoading = clients.isLoading || projects.isLoading || tickets.isLoading;

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="mb-6">
          <Text className="text-foreground text-lg font-semibold">
            Welcome back, {session.user.name ?? "there"}
          </Text>
        </View>

        {isLoading ? (
          <View className="items-center py-8">
            <Spinner size="lg" />
          </View>
        ) : (
          <>
            <View className="flex-row gap-3 mb-6">
              <StatCard
                title="Clients"
                value={clients.data?.items.length ?? 0}
                icon="people"
                color={fg}
              />
              <StatCard
                title="Active Projects"
                value={projects.data?.items.length ?? 0}
                icon="folder"
                color={fg}
              />
              <StatCard
                title="Open Tickets"
                value={tickets.data?.items.length ?? 0}
                icon="document-text"
                color={fg}
              />
            </View>

            <View className="flex-row gap-3 mb-6 flex-wrap">
              <QuickAction label="New Client" onPress={() => router.push("/create-client")} />
              <QuickAction label="New Project" onPress={() => router.push("/create-project")} />
              <QuickAction label="New Ticket" onPress={() => router.push("/create-ticket")} />
            </View>

            <Surface variant="secondary" className="p-4 rounded-lg">
              <Text className="text-foreground font-semibold mb-3">Recent Exchanges</Text>
              {!exchanges.data?.items?.length ? (
                <Text className="text-muted text-sm">No exchanges yet</Text>
              ) : (
                exchanges.data.items.map((exchange) => (
                  <Pressable
                    key={exchange.id}
                    className="py-2 border-b border-border last:border-b-0"
                    onPress={() => router.push(`/exchange/${exchange.id}`)}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 mr-2">
                        <Text className="text-foreground text-sm" numberOfLines={1}>
                          {exchange.subject ?? exchange.type}
                        </Text>
                        <Text className="text-muted text-xs" numberOfLines={1}>
                          {exchange.body ?? "No content"}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={muted} />
                    </View>
                  </Pressable>
                ))
              )}
            </Surface>

            <Pressable
              className="mt-4 items-center"
              onPress={async () => {
                await authClient.signOut();
                queryClient.invalidateQueries();
              }}
            >
              <Text className="text-danger text-sm">Sign Out</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <Surface variant="secondary" className="flex-1 p-3 rounded-lg">
      <Ionicons name={icon as "people"} size={20} color={color} />
      <Text className="text-foreground text-2xl font-bold mt-1">{value}</Text>
      <Text className="text-muted text-xs">{title}</Text>
    </Surface>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-primary px-4 py-2 rounded-full active:opacity-70"
    >
      <Text className="text-primary-foreground text-sm font-medium">{label}</Text>
    </Pressable>
  );
}
