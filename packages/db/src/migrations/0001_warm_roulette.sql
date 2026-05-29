CREATE TYPE "public"."ai_provider_type" AS ENUM('openrouter', 'openai', 'anthropic', 'google');--> statement-breakpoint
CREATE TYPE "public"."downstream_event_behavior" AS ENUM('suppress', 'emit');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('app', 'email', 'webhook', 'api', 'hook', 'system');--> statement-breakpoint
CREATE TYPE "public"."hook_execution_status" AS ENUM('pending', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."hook_type" AS ENUM('ai', 'outgoing_webhook', 'built_in');--> statement-breakpoint
CREATE TYPE "public"."hook_write_behavior" AS ENUM('propose', 'direct');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('inactive', 'active');--> statement-breakpoint
CREATE TYPE "public"."webhook_auth_type" AS ENUM('none', 'bearer', 'basic', 'hmac', 'custom_headers');--> statement-breakpoint
CREATE TYPE "public"."webhook_mode" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text,
	"hook_execution_id" text,
	"entity_type" text,
	"entity_id" text,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"structured_output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "ai_provider_type" NOT NULL,
	"encrypted_api_key" jsonb NOT NULL,
	"base_url" text,
	"default_model" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'inactive' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"email_address" text NOT NULL,
	"imap_host" text NOT NULL,
	"imap_port" integer NOT NULL,
	"imap_username" text NOT NULL,
	"encrypted_imap_password" jsonb NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"smtp_username" text NOT NULL,
	"encrypted_smtp_password" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "email_sync_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email_account_id" text NOT NULL,
	"mailbox" text NOT NULL,
	"last_uid" text,
	"sync_cursor" text,
	"last_synced_at" timestamp,
	"status" text DEFAULT 'idle' NOT NULL,
	"error" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_definitions" (
	"type" text PRIMARY KEY NOT NULL,
	"entity_type" text,
	"action" text NOT NULL,
	"payload_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"source" "event_source" NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changes" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hook_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hook_id" text NOT NULL,
	"event_id" text NOT NULL,
	"status" "hook_execution_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"retry_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"queued_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"next_retry_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"event_type" text NOT NULL,
	"type" "hook_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"write_behavior" "hook_write_behavior" DEFAULT 'propose' NOT NULL,
	"downstream_event_behavior" "downstream_event_behavior" DEFAULT 'suppress' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "incoming_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mode" "webhook_mode" DEFAULT 'test' NOT NULL,
	"token_hash" text,
	"encrypted_secret" jsonb,
	"mapping_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_event_type" text NOT NULL,
	"last_test_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_hook_execution_id_hook_executions_id_fk" FOREIGN KEY ("hook_execution_id") REFERENCES "public"."hook_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sync_states" ADD CONSTRAINT "email_sync_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sync_states" ADD CONSTRAINT "email_sync_states_email_account_id_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_executions" ADD CONSTRAINT "hook_executions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_executions" ADD CONSTRAINT "hook_executions_hook_id_hooks_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_executions" ADD CONSTRAINT "hook_executions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hooks" ADD CONSTRAINT "hooks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_insights_user_id_idx" ON "ai_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_insights_entity_idx" ON "ai_insights" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_messages_user_id_idx" ON "ai_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_id_idx" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_providers_user_id_idx" ON "ai_providers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_providers_type_idx" ON "ai_providers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_user_id_idx" ON "billing_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_stripe_customer_id_idx" ON "billing_subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_stripe_subscription_id_idx" ON "billing_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "email_accounts_user_id_idx" ON "email_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_accounts_email_address_idx" ON "email_accounts" USING btree ("email_address");--> statement-breakpoint
CREATE INDEX "email_sync_states_user_id_idx" ON "email_sync_states" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_sync_states_account_mailbox_idx" ON "email_sync_states" USING btree ("email_account_id","mailbox");--> statement-breakpoint
CREATE INDEX "event_definitions_entity_type_idx" ON "event_definitions" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "events_user_id_idx" ON "events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "hook_executions_user_id_idx" ON "hook_executions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hook_executions_hook_id_idx" ON "hook_executions" USING btree ("hook_id");--> statement-breakpoint
CREATE INDEX "hook_executions_event_id_idx" ON "hook_executions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "hook_executions_status_idx" ON "hook_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hooks_user_id_idx" ON "hooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hooks_event_type_idx" ON "hooks" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "hooks_enabled_idx" ON "hooks" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "incoming_webhooks_user_id_idx" ON "incoming_webhooks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incoming_webhooks_slug_idx" ON "incoming_webhooks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "incoming_webhooks_mode_idx" ON "incoming_webhooks" USING btree ("mode");