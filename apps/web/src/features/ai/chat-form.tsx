import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

export const aiChatFormSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export type AiChatFormValues = Record<string, unknown> & z.infer<typeof aiChatFormSchema>;

export function AiChatForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (values: AiChatFormValues) => Promise<void> }) {
  const fields = [
    {
      name: "message",
      type: "textarea",
      label: "Ask the assistant",
      description: "The assistant can search clients, summarize projects, list open tickets, inspect pipeline state, and review recent exchanges.",
      textareaConfig: { rows: 4, maxLength: 4000, showWordCount: true },
    },
  ] satisfies readonly FormedibleFieldConfig<AiChatFormValues>[];

  const { Form } = useFormedible<AiChatFormValues>({
    schema: aiChatFormSchema,
    fields,
    formOptions: {
      defaultValues: { message: "" },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Send message",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}
