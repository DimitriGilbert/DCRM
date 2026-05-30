import { z } from "zod";

// --- Template types ---

/**
 * Built-in AI hook template providing prompt, schema, and default field mapping.
 */
export type HookTemplate = {
  /** Unique template identifier. */
  readonly id: string;
  /** Human-readable template name. */
  readonly name: string;
  /** Short description of what this template does. */
  readonly description: string;
  /** Event types this template is commonly used with. */
  readonly applicableEventTypes: readonly string[];
  /** System prompt sent to the AI model. */
  readonly systemPrompt: string;
  /** User prompt template. {payload} and {entityType} are replaced at runtime. */
  readonly userPromptTemplate: string;
  /** Zod schema for structured output validation. */
  readonly outputSchema: z.ZodType<Record<string, unknown>>;
  /** Default field mapping from output schema keys to CRM entity fields. */
  readonly defaultFieldMapping: Record<string, string>;
};

// --- Built-in templates ---

const summarizeSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().min(0).max(1),
});

export const summarizeTemplate: HookTemplate = {
  id: "summarize",
  name: "Summarize",
  description:
    "Summarize entity content, exchanges, or notes into a concise summary with sentiment analysis.",
  applicableEventTypes: [
    "client.created",
    "client.updated",
    "exchange.created",
    "project.updated",
    "ticket.created",
  ],
  systemPrompt:
    "You are a CRM assistant that summarizes business content. Produce a concise, actionable summary. Identify key points and assess sentiment. Return structured output.",
  userPromptTemplate:
    "Summarize the following {entityType} data and provide a structured analysis:\n\n{payload}",
  outputSchema: summarizeSchema,
  defaultFieldMapping: {
    summary: "notes",
  },
};

const classifySchema = z.object({
  category: z.string(),
  subcategory: z.string().optional(),
  tags: z.array(z.string()),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  reasoning: z.string(),
});

export const classifyTemplate: HookTemplate = {
  id: "classify",
  name: "Classify",
  description:
    "Classify an entity into categories and assign relevant tags and priority.",
  applicableEventTypes: [
    "client.created",
    "lead.created",
    "ticket.created",
    "exchange.created",
  ],
  systemPrompt:
    "You are a CRM classification assistant. Analyze the provided data and assign appropriate categories, tags, and priority. Be specific and use common business categories.",
  userPromptTemplate:
    "Classify the following {entityType} data:\n\n{payload}",
  outputSchema: classifySchema,
  defaultFieldMapping: {
    tags: "tags",
  },
};

const extractContactsSchema = z.object({
  contacts: z.array(
    z.object({
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      role: z.string().optional(),
    }),
  ),
  confidence: z.number().min(0).max(1),
  source_type: z.enum(["email", "document", "web", "notes", "unknown"]),
});

export const extractContactsTemplate: HookTemplate = {
  id: "extract_contacts",
  name: "Extract Contacts",
  description:
    "Extract contact information from exchanges, notes, or documents.",
  applicableEventTypes: [
    "exchange.created",
    "client.updated",
    "ticket.comment_added",
    "import.completed",
  ],
  systemPrompt:
    "You are a CRM data extraction assistant. Extract all contact information (names, emails, phone numbers, companies, roles) from the provided content. Return structured output.",
  userPromptTemplate:
    "Extract all contact information from the following {entityType} data:\n\n{payload}",
  outputSchema: extractContactsSchema,
  defaultFieldMapping: {},
};

const enrichFromWebSchema = z.object({
  company_description: z.string().optional(),
  industry: z.string().optional(),
  company_size: z.string().optional(),
  location: z.string().optional(),
  social_profiles: z
    .array(
      z.object({
        platform: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
  relevant_links: z.array(z.string()).optional(),
  enrichment_notes: z.string().optional(),
});

export const enrichFromWebTemplate: HookTemplate = {
  id: "enrich_from_web",
  name: "Enrich from Web",
  description:
    "Enrich client or lead data with information inferred from available web presence and company data.",
  applicableEventTypes: [
    "client.created",
    "lead.created",
    "client.updated",
  ],
  systemPrompt:
    "You are a CRM data enrichment assistant. Based on the provided entity data (company name, website, etc.), infer and suggest enrichment data. Do NOT fabricate data — only suggest plausible enrichment based on the provided information.",
  userPromptTemplate:
    "Enrich the following {entityType} data with inferred web and company information:\n\n{payload}",
  outputSchema: enrichFromWebSchema,
  defaultFieldMapping: {
    company_description: "notes",
  },
};

// --- Registry ---

const BUILTIN_TEMPLATES: readonly HookTemplate[] = [
  summarizeTemplate,
  classifyTemplate,
  extractContactsTemplate,
  enrichFromWebTemplate,
];

const TEMPLATE_MAP = new Map(
  BUILTIN_TEMPLATES.map((t) => [t.id, t]),
);

/**
 * Get a built-in template by ID.
 */
export function getBuiltinTemplate(id: string): HookTemplate | undefined {
  return TEMPLATE_MAP.get(id);
}

/**
 * List all built-in template IDs.
 */
export function listBuiltinTemplateIds(): readonly string[] {
  return BUILTIN_TEMPLATES.map((t) => t.id);
}

/**
 * List all built-in templates.
 */
export function listBuiltinTemplates(): readonly HookTemplate[] {
  return BUILTIN_TEMPLATES;
}
