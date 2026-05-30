import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ClientImportForm, ListExportForm } from "@/features/data/forms";
import type { ClientImportFormValues, ListExportFormValues } from "@/features/data/forms";
import { HookStatusSummary, NotificationCenter } from "@/features/data/notifications";
import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { getUser } from "@/functions/get-user";
import { useTRPC, useTRPCClient } from "@/utils/trpc";

export const Route = createFileRoute("/data")({
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
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const importClients = useMutation(trpc.importExport.importClientsCsv.mutationOptions());
  const [exporting, setExporting] = useState(false);

  async function handleImport(values: ClientImportFormValues) {
    const result = await importClients.mutateAsync({ csv: values.csv });
    await queryClient.invalidateQueries();
    toast.success("Client import completed", { description: `${result.importedCount} imported, ${result.skippedCount} skipped.` });
  }

  async function handleExport(values: ListExportFormValues) {
    setExporting(true);
    try {
      const result = await trpcClient.importExport.exportList.query(values);
      downloadTextFile(result.filename, result.content, result.contentType);
      toast.success("Export ready", { description: `${result.rowCount} ${result.entity} exported.` });
    } finally {
      setExporting(false);
    }
  }

  async function handleFullExport() {
    setExporting(true);
    try {
      const result = await trpcClient.importExport.exportAll.query();
      downloadTextFile("dcrm-full-export.json", JSON.stringify(result, null, 2), "application/json");
      toast.success("Full data export ready");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Data" title="Import, export, and notifications" description="Bring client data in, take user-scoped data out, and review focused in-app notifications." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>CSV client import</CardTitle>
              <CardDescription>Imports create client records for your account and emit import completion events.</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientImportForm submitting={importClients.isPending} onSubmit={handleImport} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>List export</CardTitle>
              <CardDescription>Download user-scoped CRM lists as CSV or JSON.</CardDescription>
            </CardHeader>
            <CardContent>
              <ListExportForm submitting={exporting} onSubmit={handleExport} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Full data export foundation</CardTitle>
              <CardDescription>Download a JSON foundation containing core CRM records, events, and notifications for your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled={exporting} onClick={handleFullExport}>Download full export</Button>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <NotificationCenter />
          <HookStatusSummary />
        </div>
      </div>
    </PageFrame>
  );
}

function downloadTextFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
