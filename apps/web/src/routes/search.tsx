import { Card, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { GlobalSearchForm, hasValidGlobalSearchFilters } from "@/features/search/forms";
import type { GlobalSearchFilters } from "@/features/search/forms";
import { SearchLoading, SearchResults } from "@/features/search/views";
import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/search")({
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
  const [filters, setFilters] = useState<GlobalSearchFilters | null>(null);
  const canSearch = filters !== null && hasValidGlobalSearchFilters(filters);
  const search = useQuery({ ...trpc.search.global.queryOptions(filters ?? { search: "__idle_search__" }), enabled: canSearch });

  return (
    <main className="overflow-auto bg-muted/20">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="space-y-2">
          <span className="inline-flex h-5 w-fit items-center border px-2 text-xs font-medium text-muted-foreground">Search</span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Global search</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">Find clients, leads, projects, tickets, and exchanges with simple database-backed search and filters.</p>
          </div>
        </section>
        <GlobalSearchForm onSubmit={setFilters} />
        {canSearch ? search.isError ? <SearchError /> : search.data ? <SearchResults results={search.data} /> : <SearchLoading /> : <SearchIdle />}
      </div>
    </main>
  );
}

function SearchIdle() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search your CRM</CardTitle>
        <CardDescription>Enter a search term or add a status, tag, or date filter to find matching records.</CardDescription>
      </CardHeader>
    </Card>
  );
}

function SearchError() {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <CardTitle>Search could not load</CardTitle>
        <CardDescription>Refresh the page or sign in again to reconnect to your CRM data.</CardDescription>
      </CardHeader>
    </Card>
  );
}
