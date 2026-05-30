import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Send, Trash2, Bot, User, Loader2 } from "lucide-react";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_authenticated/ai-chat")({
  component: AIChatPage,
});

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string | null;
}

function AIChatPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useQuery(
    trpc.aiChat.listMessages.queryOptions({ limit: 100 }),
  );

  const providersQuery = useQuery(
    trpc.aiProvider.list.queryOptions(),
  );

  const sendMessageMutation = useMutation(
    trpc.aiChat.sendMessage.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.aiChat.listMessages.queryFilter(),
        );
      },
    }),
  );

  const clearHistoryMutation = useMutation(
    trpc.aiChat.clearHistory.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.aiChat.listMessages.queryFilter(),
        );
      },
    }),
  );

  const messages: ChatMessage[] =
    messagesQuery.data?.items.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      createdAt: m.createdAt,
    })).reverse() ?? [];

  const providers = providersQuery.data ?? [];
  const defaultProvider = providers.find((p: { enabled: boolean }) => p.enabled);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !defaultProvider) return;

    sendMessageMutation.mutate({
      content: trimmed,
      providerId: defaultProvider.id,
    });
    setInput("");
  }

  function handleClear() {
    clearHistoryMutation.mutate();
  }

  const isLoading = sendMessageMutation.isPending;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-sm font-semibold">AI Assistant</h1>
        </div>
        <div className="flex items-center gap-2">
          {providers.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No AI provider configured
            </span>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearHistoryMutation.isPending}
              className="inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
            <Bot className="h-10 w-10 text-muted-foreground/40" />
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No messages yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Ask about your clients, projects, tickets, or pipeline.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1 p-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 rounded-sm px-3 py-2.5 ${
                  msg.role === "user"
                    ? "bg-muted/50"
                    : "bg-transparent"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {msg.role === "user" ? (
                    <User className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {msg.role === "user" ? "You" : "Assistant"}
                  </p>
                  <div className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 rounded-sm px-3 py-2.5">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Thinking...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              defaultProvider
                ? "Ask about your CRM data..."
                : "Configure an AI provider first..."
            }
            disabled={isLoading || !defaultProvider}
            className="flex-1 rounded-sm border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !defaultProvider}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border bg-background transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
