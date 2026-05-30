import { Badge } from "@DCRM/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AiChatForm } from "@/features/ai/chat-form";
import type { AiChatFormValues } from "@/features/ai/chat-form";
import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

type ChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant" | "tool";
  readonly content: string;
};

export const Route = createFileRoute("/ai/chat")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const trpc = useTRPC();
  const sendMessage = useMutation(trpc.ai.sendChatMessage.mutationOptions());
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);

  async function handleSubmit(values: AiChatFormValues) {
    const response = await sendMessage.mutateAsync({ conversationId, message: values.message });
    setConversationId(response.conversationId);
    setMessages(response.history.filter((message) => message.role !== "tool"));
    toast.success("Assistant replied", { description: `${response.toolMessages.length} CRM tools executed and audited.` });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="AI assistant" title="Chat with your CRM" description="A multi-turn assistant that can only use explicit, auditable server-side CRM tools." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
            <CardDescription>Tool execution is user-scoped and persisted with each turn.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.length > 0 ? messages.map((message) => <ChatBubble key={message.id} message={message} />) : <p className="text-sm text-muted-foreground">Ask about clients, projects, tickets, pipeline, or recent exchanges.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New message</CardTitle>
            <CardDescription>No arbitrary tRPC access is exposed to the model.</CardDescription>
          </CardHeader>
          <CardContent>
            <AiChatForm submitting={sendMessage.isPending} onSubmit={handleSubmit} />
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}

function ChatBubble({ message }: { readonly message: ChatMessage }) {
  return (
    <article className="border bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={message.role === "assistant" ? "default" : "secondary"}>{message.role}</Badge>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
    </article>
  );
}
