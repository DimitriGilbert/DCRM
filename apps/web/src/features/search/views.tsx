import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import type { AppRouter } from "@DCRM/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowRight } from "lucide-react";

type GlobalSearchResult = inferRouterOutputs<AppRouter>["search"]["global"][number];

export function SearchResults({ results }: { readonly results: readonly GlobalSearchResult[] }) {
  if (results.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>No matching records</CardTitle>
          <CardDescription>Try a broader term, remove status filters, or search every entity type.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {results.map((result) => (
        <Card key={`${result.entityType}:${result.entityId}`}>
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{result.title}</CardTitle>
                <CardDescription>{result.description ?? `${formatLabel(result.entityType)} result`}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{formatLabel(result.entityType)}</Badge>
                {result.status ? <Badge variant="secondary">{formatLabel(result.status)}</Badge> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Matched {formatDate(result.matchedAt)}</span>
            <Button variant="outline" size="sm" render={<a href={result.href} />}>Open <ArrowRight /></Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SearchLoading() {
  return (
    <div className="grid gap-3" aria-label="Loading search results">
      {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-32" />)}
    </div>
  );
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/^\w/u, (character) => character.toUpperCase());
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
