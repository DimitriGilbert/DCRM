import { useLocalSearchParams, router } from "expo-router";
import {
  Button,
  Input,
  Label,
  Spinner,
  Surface,
  TextField,
  useToast,
} from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { queryClient, trpcClient } from "@/utils/trpc";

const EXCHANGE_TYPES = ["email", "note", "call", "meeting", "comment"] as const;
const DIRECTIONS = ["incoming", "outgoing"] as const;

export default function CreateExchange() {
  const params = useLocalSearchParams<{
    clientId?: string;
    projectId?: string;
    ticketId?: string;
  }>();
  const { toast } = useToast();

  const [exchangeType, setExchangeType] = useState<string>(
    params.ticketId ? "comment" : "note",
  );
  const [direction, setDirection] = useState<string>("outgoing");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const contextLabel = params.ticketId
    ? "ticket"
    : params.projectId
      ? "project"
      : params.clientId
        ? "client"
        : null;

  async function handleSubmit() {
    try {
      setIsSubmitting(true);
      await trpcClient.exchange.create.mutate({
        type: exchangeType as (typeof EXCHANGE_TYPES)[number],
        direction: direction as (typeof DIRECTIONS)[number],
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
        clientId: params.clientId,
        projectId: params.projectId,
        ticketId: params.ticketId,
        isInternal: exchangeType === "note",
      });
      queryClient.invalidateQueries({ queryKey: ["exchange"] });
      router.back();
      toast.show({ variant: "success", label: "Exchange created" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create exchange";
      toast.show({ variant: "danger", label: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Surface className="flex-1 p-4">
      <Text className="text-foreground font-semibold text-lg mb-4">New Exchange</Text>

      <View className="gap-3">
        {contextLabel ? (
          <Text className="text-muted text-xs">Adding to {contextLabel}</Text>
        ) : null}

        <View>
          <Text className="text-muted text-xs mb-1.5">Type</Text>
          <View className="flex-row flex-wrap gap-2">
            {EXCHANGE_TYPES.map((t) => (
              <Pressable key={t} onPress={() => setExchangeType(t)}>
                <View
                  className={`px-3 py-1.5 rounded-full border ${
                    exchangeType === t
                      ? "bg-primary border-primary"
                      : "border-border"
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      exchangeType === t
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
          <Text className="text-muted text-xs mb-1.5">Direction</Text>
          <View className="flex-row gap-2">
            {DIRECTIONS.map((d) => (
              <Pressable key={d} onPress={() => setDirection(d)}>
                <View
                  className={`px-3 py-1.5 rounded-full border ${
                    direction === d
                      ? "bg-primary border-primary"
                      : "border-border"
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      direction === d
                        ? "text-primary-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {d}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <TextField>
          <Label>Subject</Label>
          <Input
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject line"
          />
        </TextField>

        <TextField>
          <Label>Body</Label>
          <Input
            value={body}
            onChangeText={setBody}
            placeholder="Exchange content"
            multiline
            numberOfLines={5}
          />
        </TextField>

        <View className="flex-row gap-3 mt-2">
          <Button variant="outline" className="flex-1" onPress={() => router.back()}>
            <Button.Label>Cancel</Button.Label>
          </Button>
          <Button
            className="flex-1"
            onPress={handleSubmit}
            isDisabled={isSubmitting}
          >
            {isSubmitting ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label>Create</Button.Label>
            )}
          </Button>
        </View>
      </View>
    </Surface>
  );
}
