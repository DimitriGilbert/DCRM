import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Button,
  Card,
  Input,
  Label,
  Spinner,
  Surface,
  TextField,
  useThemeColor,
  useToast,
} from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { queryClient, trpc, trpcClient } from "@/utils/trpc";

export default function CreateProject() {
  const { toast } = useToast();
  const muted = useThemeColor("muted");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: clientsData } = useQuery(
    trpc.client.list.queryOptions({ limit: 100 }),
  );
  const clients = clientsData?.items ?? [];

  async function handleSubmit() {
    if (!name.trim() || !selectedClientId) return;
    try {
      setIsSubmitting(true);
      await trpcClient.project.create.mutate({
        name: name.trim(),
        clientId: selectedClientId,
        description: description.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      router.back();
      toast.show({ variant: "success", label: "Project created" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create project";
      toast.show({ variant: "danger", label: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Surface className="flex-1 p-4">
      <Text className="text-foreground font-semibold text-lg mb-4">New Project</Text>

      {!selectedClientId ? (
        <View>
          <Text className="text-muted text-sm mb-3">Select a client:</Text>
          {clients.length === 0 ? (
            <Text className="text-muted text-sm">
              No clients yet. Create a client first.
            </Text>
          ) : (
            clients.map((client) => (
              <Pressable key={client.id} onPress={() => setSelectedClientId(client.id)}>
                <Card variant="secondary" className="p-3 mb-2">
                  <Text className="text-foreground font-medium">{client.name}</Text>
                  {client.company ? (
                    <Text className="text-muted text-sm">{client.company}</Text>
                  ) : null}
                </Card>
              </Pressable>
            ))
          )}
          <Button variant="outline" className="mt-4" onPress={() => router.back()}>
            <Button.Label>Cancel</Button.Label>
          </Button>
        </View>
      ) : (
        <View className="gap-3">
          <View className="flex-row items-center justify-between py-2">
            <Text className="text-muted text-sm">Client:</Text>
            <Pressable onPress={() => setSelectedClientId(null)}>
              <Text className="text-primary text-sm font-medium">
                {clients.find((c) => c.id === selectedClientId)?.name ?? "Change"}
              </Text>
            </Pressable>
          </View>

          <TextField>
            <Label>Project Name *</Label>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="Project name"
            />
          </TextField>

          <TextField>
            <Label>Description</Label>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
              multiline
              numberOfLines={3}
            />
          </TextField>

          <View className="flex-row gap-3 mt-2">
            <Button variant="outline" className="flex-1" onPress={() => router.back()}>
              <Button.Label>Cancel</Button.Label>
            </Button>
            <Button
              className="flex-1"
              onPress={handleSubmit}
              isDisabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? (
                <Spinner size="sm" color="default" />
              ) : (
                <Button.Label>Create</Button.Label>
              )}
            </Button>
          </View>
        </View>
      )}
    </Surface>
  );
}
