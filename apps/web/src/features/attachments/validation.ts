import { z } from "zod";

export const fileSchema = z.custom<File | null>((value) => value === null || isFile(value))
  .refine(isFile, "Choose a file to attach.")
  .refine((file) => isFile(file) && file.size > 0, "Choose a non-empty file to attach.");

export const attachmentUploadFormSchema = z.object({
  file: fileSchema,
});

export function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}
