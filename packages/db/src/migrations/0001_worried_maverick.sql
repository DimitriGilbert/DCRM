CREATE TYPE "public"."ai_chat_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('openrouter', 'openai', 'anthropic', 'google');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('app', 'email', 'webhook', 'api', 'hook', 'system');--> statement-breakpoint
CREATE TYPE "public"."hook_execution_status" AS ENUM('pending', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."hook_type" AS ENUM('ai', 'outgoing_webhook', 'built_in');--> statement-breakpoint
CREATE TYPE "public"."hook_write_behavior" AS ENUM('propose_first', 'direct_write');--> statement-breakpoint
CREATE TYPE "public"."incoming_webhook_mode" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TABLE "ai_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" "ai_chat_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hook_execution_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"structured_output" jsonb,
	"field_mapping_result" jsonb,
	"applied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"name" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"base_url" text,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"encrypted_imap_host" text NOT NULL,
	"encrypted_imap_port" text NOT NULL,
	"encrypted_imap_user" text NOT NULL,
	"encrypted_imap_password" text NOT NULL,
	"encrypted_smtp_host" text NOT NULL,
	"encrypted_smtp_port" text NOT NULL,
	"encrypted_smtp_user" text NOT NULL,
	"encrypted_smtp_password" text NOT NULL,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"sync_interval" integer DEFAULT 15 NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email_account_id" text NOT NULL,
	"folder" text NOT NULL,
	"last_uid" text,
	"uid_validity" text,
	"last_sync_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"source" "event_source" NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"payload" jsonb NOT NULL,
	"changes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hook_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hook_id" text NOT NULL,
	"event_id" text NOT NULL,
	"status" "hook_execution_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "hook_type" NOT NULL,
	"event_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"output_schema" jsonb,
	"field_mapping" jsonb,
	"write_behavior" "hook_write_behavior" DEFAULT 'propose_first' NOT NULL,
	"emit_downstream_events" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incoming_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"url_token" text NOT NULL,
	"secret" text,
	"mode" "incoming_webhook_mode" DEFAULT 'test' NOT NULL,
	"mapping_config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_received_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" "billing_status" DEFAULT 'inactive' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unmatched_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text,
	"body" text,
	"headers" jsonb,
	"received_at" timestamp NOT NULL,
	"linked_entity_type" text,
	"linked_entity_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "file_size" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "mime_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "authorized_addresses" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_hook_execution_id_hook_executions_id_fk" FOREIGN KEY ("hook_execution_id") REFERENCES "public"."hook_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sync_state" ADD CONSTRAINT "email_sync_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sync_state" ADD CONSTRAINT "email_sync_state_email_account_id_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_executions" ADD CONSTRAINT "hook_executions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_executions" ADD CONSTRAINT "hook_executions_hook_id_hooks_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_executions" ADD CONSTRAINT "hook_executions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hooks" ADD CONSTRAINT "hooks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_emails" ADD CONSTRAINT "unmatched_emails_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chat_messages_user_id_idx" ON "ai_chat_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_chat_messages_created_at_idx" ON "ai_chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_insights_user_id_idx" ON "ai_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_insights_hook_execution_id_idx" ON "ai_insights" USING btree ("hook_execution_id");--> statement-breakpoint
CREATE INDEX "ai_insights_entity_idx" ON "ai_insights" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_providers_user_id_idx" ON "ai_providers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_providers_provider_idx" ON "ai_providers" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "email_accounts_user_id_idx" ON "email_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_accounts_user_email_idx" ON "email_accounts" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "email_sync_state_user_id_idx" ON "email_sync_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_sync_state_email_account_id_idx" ON "email_sync_state" USING btree ("email_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_sync_state_account_folder_idx" ON "email_sync_state" USING btree ("email_account_id","folder");--> statement-breakpoint
CREATE INDEX "events_user_id_idx" ON "events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "hook_executions_user_id_idx" ON "hook_executions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hook_executions_hook_id_idx" ON "hook_executions" USING btree ("hook_id");--> statement-breakpoint
CREATE INDEX "hook_executions_event_id_idx" ON "hook_executions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "hook_executions_status_idx" ON "hook_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hooks_user_id_idx" ON "hooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hooks_event_type_idx" ON "hooks" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "hooks_enabled_idx" ON "hooks" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "incoming_webhooks_user_id_idx" ON "incoming_webhooks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incoming_webhooks_url_token_idx" ON "incoming_webhooks" USING btree ("url_token");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_sub_id_idx" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "unmatched_emails_user_id_idx" ON "unmatched_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "unmatched_emails_received_at_idx" ON "unmatched_emails" USING btree ("received_at");