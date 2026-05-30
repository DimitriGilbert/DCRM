import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
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

const TICKET_TYPES = ["task", "bug", "feature", "question"] as const;
const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export default function CreateTicket() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const { toast } = useToast();
  const muted = useThemeColor("muted");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    params.projectId ?? null,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ticketType, setTicketType] = useState<string>("task");
  const [priority, setPriority] = useState<string>("medium");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: projectsData } = useQuery(
    trpc.project.list.queryOptions({ limit: 100, status: "active" }),
  );
  const projects = projectsData?.items ?? [];

  async function handleSubmit() {
    if (!title.trim() || !selectedProjectId) return;
    try {
      setIsSubmitting(true);
      await trpcClient.ticket.create.mutate({
        title: title.trim(),
        projectId: selectedProjectId,
        description: description.trim() || undefined,
        type: ticketType as (typeof TICKET_TYPES)[number],
        priority: priority as (typeof TICKET_PRIORITIES)[number],
      });
      queryClient.invalidateQueries();
      router.back();
      toast.show({ variant: "success", label: "Ticket created" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create ticket";
      toast.show({ variant: "danger", label: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Surface className="flex-1 p-4">
      <Text className="text-foreground font-semibold text-lg mb-4">New Ticket</Text>

      {!selectedProjectId ? (
        <View>
          <Text className="text-muted text-sm mb-3">Select a project:</Text>
          {projects.length === 0 ? (
            <Text className="text-muted text-sm">
              No active projects. Create a project first.
            </Text>
          ) : (
            projects.map((project) => (
              <Pressable key={project.id} onPress={() => setSelectedProjectId(project.id)}>
                <Card variant="secondary" className="p-3 mb-2">
                  <Text className="text-foreground font-medium">{project.name}</Text>
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
            <Text className="text-muted text-sm">Project:</Text>
            <Pressable onPress={() => setSelectedProjectId(null)}>
              <Text className="text-primary text-sm font-medium">
                {projects.find((p) => p.id === selectedProjectId)?.name ?? "Change"}
              </Text>
            </Pressable>
          </View>

          <TextField>
            <Label>Title *</Label>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="Ticket title"
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

          <View>
            <Text className="text-muted text-xs mb-1.5">Type</Text>
            <View className="flex-row flex-wrap gap-2">
              {TICKET_TYPES.map((t) => (
                <Pressable key={t} onPress={() => setTicketType(t)}>
                  <View
                    className={`px-3 py-1.5 rounded-full border ${
                      ticketType === t
                        ? "bg-primary border-primary"
                        : "border-border"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        ticketType === t
                          ? "text-primary-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {t}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text className="text-muted text-xs mb-1.5">Priority</Text>
            <View className="flex-row flex-wrap gap-2">
              {TICKET_PRIORITIES.map((p) => (
                <Pressable key={p} onPress={() => setPriority(p)}>
                  <View
                    className={`px-3 py-1.5 rounded-full border ${
                      priority === p
                        ? "bg-primary border-primary"
                        : "border-border"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        priority === p
                          ? "text-primary-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {p}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="flex-row gap-3 mt-2">
            <Button variant="outline" className="flex-1" onPress={() => router.back()}>
              <Button.Label>Cancel</Button.Label>
            </Button>
            <Button
              className="flex-1"
              onPress={handleSubmit}
              isDisabled={isSubmitting || !title.trim()}
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
