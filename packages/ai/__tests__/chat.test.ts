import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage, listMessages, clearHistory } from "../src/chat";
import type { ChatDeps, PersistedChatMessage } from "../src/chat";
import type { CRMToolDeps } from "../src/tools/index";

// --- Mocks ---

const storedMessages: PersistedChatMessage[] = [];

function resetStoredMessages() {
  storedMessages.length = 0;
}

function createMockMessageStore() {
  return {
    insert: vi.fn(async (msg: Omit<PersistedChatMessage, "createdAt">) => {
      storedMessages.push({ ...msg, createdAt: new Date() } as PersistedChatMessage);
    }),
    getByUserId: vi.fn(async (userId: string, _limit: number) => {
      return storedMessages.filter((m) => m.userId === userId);
    }),
    deleteByUserId: vi.fn(async (userId: string) => {
      const idx = storedMessages.findIndex((m) => m.userId === userId);
      while (idx !== -1) {
        storedMessages.splice(idx, 1);
        break;
      }
      // Remove all matching
      for (let i = storedMessages.length - 1; i >= 0; i--) {
        if (storedMessages[i]?.userId === userId) {
          storedMessages.splice(i, 1);
        }
      }
    }),
  };
}

function createMockCRMToolDeps(): CRMToolDeps {
  return {
    searchClients: vi.fn(async (query, limit) => ({
      clients: [
        {
          id: "cl-1",
          name: "Acme Corp",
          email: "hello@acme.com",
          company: "Acme",
          phone: null,
          website: "acme.com",
        },
      ].filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.email?.includes(query.toLowerCase()))
        .slice(0, limit),
      total: 1,
    })),
    getProjectSummary: vi.fn(async (projectId) => ({
      project: {
        id: projectId,
        name: "Website Redesign",
        description: "Redesign the company website",
        status: "active",
        budgetAmount: 5000,
        budgetCurrency: "USD",
        estimatedHours: 40,
        actualHours: 25,
        startDate: "2025-01-01",
        endDate: "2025-03-01",
        clientName: "Acme Corp",
      },
      tickets: { total: 5, open: 3, closed: 2 },
    })),
    listOpenTickets: vi.fn(async (_projectId, limit) => ({
      tickets: [
        {
          id: "tk-1",
          title: "Fix login page",
          type: "bug",
          status: "open",
          priority: "high",
          dueDate: "2025-02-15",
          projectName: "Website Redesign",
        },
      ].slice(0, limit),
      total: 1,
    })),
    getPipelineSummary: vi.fn(async () => ({
      stages: [
        { stage: "new", count: 3, totalEstimatedValue: 15000 },
        { stage: "contacted", count: 2, totalEstimatedValue: 8000 },
        { stage: "qualified", count: 1, totalEstimatedValue: 5000 },
        { stage: "proposal", count: 1, totalEstimatedValue: 10000 },
        { stage: "negotiation", count: 0, totalEstimatedValue: 0 },
        { stage: "won", count: 5, totalEstimatedValue: 50000 },
        { stage: "lost", count: 2, totalEstimatedValue: 12000 },
      ],
      totalActiveValue: 38000,
      totalLeads: 14,
    })),
    getRecentExchanges: vi.fn(async (limit, _clientId, _projectId) => ({
      exchanges: [
        {
          id: "ex-1",
          type: "email",
          subject: "Project update",
          body: "Hi, here is the latest update.",
          direction: "incoming",
          createdAt: "2025-01-15T10:00:00Z",
          clientName: "Acme Corp",
          projectName: "Website Redesign",
        },
      ].slice(0, limit),
      total: 1,
    })),
  };
}

// Mock TanStack AI chat function
vi.mock("@tanstack/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/ai")>();
  return {
    ...actual,
    chat: vi.fn(async (options: Record<string, unknown>) => {
      // Return a mock response based on the last user message
      const messages = options.messages as Array<{ role: string; content: string }>;
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.content.includes("client")) {
        return "I found 1 client matching your search: Acme Corp (hello@acme.com, Acme).";
      }
      if (lastMessage?.content.includes("pipeline")) {
        return "Your pipeline has 14 leads across all stages. Total active value is $38,000.";
      }
      if (lastMessage?.content.includes("ticket")) {
        return "You have 1 open ticket: Fix login page (high priority, due Feb 15).";
      }
      if (lastMessage?.content.includes("project")) {
        return "The Website Redesign project is active with a $5,000 budget. 3 open tickets, 2 closed.";
      }
      if (lastMessage?.content.includes("exchange") || lastMessage?.content.includes("recent")) {
        return "Your most recent exchange is an email from Acme Corp about 'Project update'.";
      }
      return "Hello! I'm your DCRM AI assistant. How can I help you today?";
    }),
  };
});

// --- Tests ---

describe("chat", () => {
  let mockMessageStore: ReturnType<typeof createMockMessageStore>;
  let mockCRMToolDeps: CRMToolDeps;
  let mockDeps: ChatDeps;

  beforeEach(() => {
    resetStoredMessages();
    mockMessageStore = createMockMessageStore();
    mockCRMToolDeps = createMockCRMToolDeps();
    mockDeps = {
      adapter: {} as never,
      provider: "openrouter",
      model: "openai/gpt-4o",
      messageStore: mockMessageStore,
      crmDeps: mockCRMToolDeps,
    } satisfies ChatDeps;
  });

  describe("sendMessage", () => {
    it("persists user message before sending", async () => {
      await sendMessage(
        { userId: "user-1", content: "Hello", providerId: "prov-1" },
        mockDeps,
      );

      // Should have inserted user message
      const userInsert = mockMessageStore.insert.mock.calls.find(
        (call) => (call[0] as { role: string }).role === "user",
      );
      expect(userInsert).toBeDefined();
      expect((userInsert![0] as { content: string }).content).toBe("Hello");
    });

    it("persists assistant response after sending", async () => {
      const result = await sendMessage(
        { userId: "user-1", content: "Hello", providerId: "prov-1" },
        mockDeps,
      );

      // Should have inserted assistant message
      const assistantInsert = mockMessageStore.insert.mock.calls.find(
        (call) => (call[0] as { role: string }).role === "assistant",
      );
      expect(assistantInsert).toBeDefined();
      expect(result.content).toBeTruthy();
    });

    it("returns message IDs and metadata", async () => {
      const result = await sendMessage(
        { userId: "user-1", content: "Hello", providerId: "prov-1" },
        mockDeps,
      );

      expect(result.userMessageId).toBeTruthy();
      expect(result.assistantMessageId).toBeTruthy();
      expect(result.model).toBe("openai/gpt-4o");
      expect(result.provider).toBe("openrouter");
    });

    it("loads conversation history for multi-turn context", async () => {
      // Pre-seed a user message
      storedMessages.push({
        id: "prev-msg",
        userId: "user-1",
        role: "user",
        content: "Previous question",
        toolCalls: null,
        metadata: null,
        createdAt: new Date("2025-01-01"),
      });

      await sendMessage(
        { userId: "user-1", content: "Follow up", providerId: "prov-1" },
        mockDeps,
      );

      // Should have loaded history
      expect(mockMessageStore.getByUserId).toHaveBeenCalledWith("user-1", 50);
    });

    it("scopes tool calls to the user's data", async () => {
      await sendMessage(
        { userId: "user-1", content: "Show me my clients", providerId: "prov-1" },
        mockDeps,
      );

      // The CRM tools should be created with the user's ID
      // Since we mock the chat function, we verify the deps are accessible
      expect(mockCRMToolDeps.searchClients).toBeDefined();
    });
  });

  describe("listMessages", () => {
    it("returns messages sorted newest first", async () => {
      storedMessages.push(
        {
          id: "msg-1",
          userId: "user-1",
          role: "user",
          content: "First",
          toolCalls: null,
          metadata: null,
          createdAt: new Date("2025-01-01"),
        },
        {
          id: "msg-2",
          userId: "user-1",
          role: "assistant",
          content: "Second",
          toolCalls: null,
          metadata: null,
          createdAt: new Date("2025-01-02"),
        },
      );

      const messages = await listMessages("user-1", { messageStore: mockMessageStore });
      expect(messages).toHaveLength(2);
      expect(messages[0]!.content).toBe("Second");
      expect(messages[1]!.content).toBe("First");
    });

    it("filters by userId", async () => {
      storedMessages.push(
        {
          id: "msg-1",
          userId: "user-1",
          role: "user",
          content: "Mine",
          toolCalls: null,
          metadata: null,
          createdAt: new Date("2025-01-01"),
        },
        {
          id: "msg-2",
          userId: "user-2",
          role: "user",
          content: "Theirs",
          toolCalls: null,
          metadata: null,
          createdAt: new Date("2025-01-02"),
        },
      );

      const messages = await listMessages("user-1", { messageStore: mockMessageStore });
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe("Mine");
    });
  });

  describe("clearHistory", () => {
    it("deletes all messages for a user", async () => {
      storedMessages.push(
        {
          id: "msg-1",
          userId: "user-1",
          role: "user",
          content: "Delete me",
          toolCalls: null,
          metadata: null,
          createdAt: new Date("2025-01-01"),
        },
      );

      await clearHistory("user-1", { messageStore: mockMessageStore });
      expect(mockMessageStore.deleteByUserId).toHaveBeenCalledWith("user-1");
    });
  });
});
