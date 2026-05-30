import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@DCRM/ui/components/command";
import { Badge } from "@DCRM/ui/components/badge";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import {
  Users,
  Target,
  FolderKanban,
  Ticket,
  MessageSquare,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useTRPC } from "@/utils/trpc";

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  client: (id) => `/clients/${id}`,
  lead: (id) => `/leads/${id}`,
  project: (id) => `/projects/${id}`,
  ticket: () => "/tickets",
  exchange: () => "/clients",
};

const ENTITY_CONFIG: Record<string, { icon: typeof Users; label: string }> = {
  client: { icon: Users, label: "Client" },
  lead: { icon: Target, label: "Lead" },
  project: { icon: FolderKanban, label: "Project" },
  ticket: { icon: Ticket, label: "Ticket" },
  exchange: { icon: MessageSquare, label: "Exchange" },
};

function GlobalSearch({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");

  const searchQuery = useQuery(
    trpc.search.global.queryOptions(
      { query, limit: 20 },
      { enabled: query.length > 0 },
    ),
  );

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  // Keyboard shortcut: Cmd/Ctrl+K to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  const handleSelect = useCallback(
    (entityType: string, entityId: string) => {
      const routeBuilder = ENTITY_ROUTES[entityType];
      if (!routeBuilder) return;
      onOpenChange(false);
      // Use href-based navigation to avoid TanStack Router strict typing issues
      // with dynamic entity types
      window.location.href = routeBuilder(entityId);
    },
    [onOpenChange],
  );

  // Group results by entity type
  const groupedResults = query.length > 0 && searchQuery.data?.items
    ? searchQuery.data.items.reduce(
        (acc, item) => {
          const type = item.entityType;
          if (!acc[type]) acc[type] = [];
          acc[type]!.push(item);
          return acc;
        },
        {} as Record<string, typeof searchQuery.data.items>,
      )
    : {};

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Global Search"
      description="Search across clients, leads, projects, tickets, and exchanges."
    >
      <CommandInput
        placeholder="Search everything..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.length === 0 ? (
          <CommandEmpty>
            Start typing to search...
          </CommandEmpty>
        ) : searchQuery.isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <CommandEmpty>
              No results found for &ldquo;{query}&rdquo;
            </CommandEmpty>
            {Object.entries(groupedResults).map(([type, items]) => {
              const config = ENTITY_CONFIG[type];
              if (!config) return null;
              const Icon = config.icon;
              return (
                <CommandGroup key={type} heading={config.label + "s"}>
                  {items.map((item) => (
                    <CommandItem
                      key={`${item.entityType}-${item.id}`}
                      value={`${item.entityType}-${item.label}`}
                      onSelect={() => handleSelect(item.entityType, item.id)}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        <span className="truncate text-xs font-medium">
                          {item.label}
                        </span>
                        {item.sublabel && (
                          <span className="truncate text-xs text-muted-foreground">
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                      {item.status && (
                        <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">
                          {item.status}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export { GlobalSearch };
export default GlobalSearch;
