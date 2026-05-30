import { Badge } from "@DCRM/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import type { ReactNode } from "react";
import { z } from "zod";

const fileSchema = z.custom<File | null>((value) => value === null || (typeof File !== "undefined" && value instanceof File)).refine(isFile, "Choose a file to attach.");

export const attachmentUploadFormSchema = z.object({
  file: fileSchema,
});

export type AttachmentUploadFormValues = Record<string, unknown> & {
  readonly file: File | null;
};

export type AttachmentTargetType = "client" | "lead" | "project" | "ticket" | "exchange";

export type AttachmentCreateInput = {
  readonly targetType: AttachmentTargetType;
  readonly targetId: string;
  readonly fileName: string;
  readonly contentType?: string;
  readonly byteSize: number;
  readonly contentBase64: string;
  readonly metadata?: Record<string, unknown>;
};

export type AttachmentListRecord = {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string | null;
  readonly byteSize: number;
  readonly storageBackend: "local" | "s3_compatible";
  readonly createdAt: Date;
};

export function AttachmentUploadForm({ targetType, targetId, maxBytes, submitting, onSubmit }: { readonly targetType: AttachmentTargetType; readonly targetId: string; readonly maxBytes: number; readonly submitting: boolean; readonly onSubmit: (input: AttachmentCreateInput) => Promise<void> }) {
  const { Form } = useFormedible<AttachmentUploadFormValues>({
    schema: attachmentUploadFormSchema,
    fields: attachmentFields(maxBytes),
    formOptions: {
      defaultValues: { file: null },
      onSubmit: async ({ value }) => {
        if (!isFile(value.file)) {
          return;
        }
        const contentBase64 = await fileToBase64(value.file);
        await onSubmit({ targetType, targetId, fileName: value.file.name, contentType: value.file.type || undefined, byteSize: value.file.size, contentBase64, metadata: { source: "web" } });
      },
    },
    submitLabel: "Attach file",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function AttachmentPanel({ attachments, children }: { readonly attachments: readonly AttachmentListRecord[]; readonly children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attachments</CardTitle>
        <CardDescription>Files stored against this record.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {attachments.length > 0 ? (
          <ul className="space-y-2" aria-label="Attachments">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center justify-between gap-3 border bg-background p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{attachment.fileName}</p>
                  <p className="text-xs text-muted-foreground">{attachment.contentType ?? "Unknown type"} · {formatByteSize(attachment.byteSize)}</p>
                </div>
                <Badge variant="outline">{attachment.storageBackend === "s3_compatible" ? "S3" : "Local"}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border border-dashed p-4 text-center text-xs text-muted-foreground">No attachments yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function attachmentFields(maxBytes: number): readonly FormedibleFieldConfig<AttachmentUploadFormValues>[] {
  return [
    { name: "file", type: "file", label: "File", required: true, description: `Maximum file size: ${formatByteSize(maxBytes)}.`, fileConfig: { maxSize: maxBytes, maxFiles: 1 } },
  ];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("File could not be read as base64."));
        return;
      }
      resolve(reader.result.split(",")[1] ?? "");
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("File could not be read.")));
    reader.readAsDataURL(file);
  });
}

function formatByteSize(byteSize: number): string {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }
  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function isFile(value: File | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}
