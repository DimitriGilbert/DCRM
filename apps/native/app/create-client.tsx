import { useForm } from "@tanstack/react-form";
import { router } from "expo-router";
import {
  Button,
  Input,
  Label,
  Spinner,
  Surface,
  TextField,
  useToast,
} from "heroui-native";
import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { queryClient, trpcClient } from "@/utils/trpc";

export default function CreateClient() {
  const { toast } = useToast();
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      website: "",
      notes: "",
    },
    onSubmit: async ({ value }) => {
      try {
        setIsSubmitting(true);
        await trpcClient.client.create.mutate({
          name: value.name.trim(),
          email: value.email.trim() || undefined,
          phone: value.phone.trim() || undefined,
          company: value.company.trim() || undefined,
          website: value.website.trim() || undefined,
          notes: value.notes.trim() || undefined,
        });
        queryClient.invalidateQueries();
        router.back();
        toast.show({ variant: "success", label: "Client created" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create client";
        toast.show({ variant: "danger", label: message });
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <Surface className="flex-1 p-4">
      <Text className="text-foreground font-semibold text-lg mb-4">New Client</Text>

      <View className="gap-3">
        <form.Field name="name">
          {(field) => (
            <TextField>
              <Label>Name *</Label>
              <Input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChangeText={field.handleChange}
                placeholder="Client name"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            </TextField>
          )}
        </form.Field>

        <form.Field name="email">
          {(field) => (
            <TextField>
              <Label>Email</Label>
              <Input
                ref={emailRef}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChangeText={field.handleChange}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => phoneRef.current?.focus()}
              />
            </TextField>
          )}
        </form.Field>

        <form.Field name="phone">
          {(field) => (
            <TextField>
              <Label>Phone</Label>
              <Input
                ref={phoneRef}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChangeText={field.handleChange}
                placeholder="+1 555 0123"
                keyboardType="phone-pad"
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </TextField>
          )}
        </form.Field>

        <form.Field name="company">
          {(field) => (
            <TextField>
              <Label>Company</Label>
              <Input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChangeText={field.handleChange}
                placeholder="Company name"
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </TextField>
          )}
        </form.Field>

        <form.Field name="website">
          {(field) => (
            <TextField>
              <Label>Website</Label>
              <Input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChangeText={field.handleChange}
                placeholder="https://example.com"
                keyboardType="url"
                autoCapitalize="none"
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </TextField>
          )}
        </form.Field>

        <form.Field name="notes">
          {(field) => (
            <TextField>
              <Label>Notes</Label>
              <Input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChangeText={field.handleChange}
                placeholder="Optional notes"
                multiline
                numberOfLines={3}
              />
            </TextField>
          )}
        </form.Field>

        <View className="flex-row gap-3 mt-2">
          <Button variant="outline" className="flex-1" onPress={() => router.back()}>
            <Button.Label>Cancel</Button.Label>
          </Button>
          <Button
            className="flex-1"
            onPress={form.handleSubmit}
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
