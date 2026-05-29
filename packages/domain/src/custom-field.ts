import { z } from "zod";

export const CUSTOM_FIELD_TYPES = {
  TEXT: "text",
  NUMBER: "number",
  DATE: "date",
  SELECT: "select",
  CHECKBOX: "checkbox",
  TEXTAREA: "textarea",
  URL: "url",
} as const;

export type CustomFieldTypeKey = keyof typeof CUSTOM_FIELD_TYPES;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[CustomFieldTypeKey];

export const CUSTOM_FIELD_TYPE_VALUES: readonly CustomFieldType[] =
  Object.values(CUSTOM_FIELD_TYPES);

export const customFieldTypeSchema = z.enum([
  CUSTOM_FIELD_TYPES.TEXT,
  CUSTOM_FIELD_TYPES.NUMBER,
  CUSTOM_FIELD_TYPES.DATE,
  CUSTOM_FIELD_TYPES.SELECT,
  CUSTOM_FIELD_TYPES.CHECKBOX,
  CUSTOM_FIELD_TYPES.TEXTAREA,
  CUSTOM_FIELD_TYPES.URL,
]);
