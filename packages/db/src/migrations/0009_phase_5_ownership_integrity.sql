UPDATE "leads" l SET "converted_client_id" = NULL WHERE "converted_client_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "clients" c WHERE c."user_id" = l."user_id" AND c."id" = l."converted_client_id");--> statement-breakpoint
DELETE FROM "hook_executions" he WHERE NOT EXISTS (SELECT 1 FROM "hooks" h WHERE h."user_id" = he."user_id" AND h."id" = he."hook_id");--> statement-breakpoint
DELETE FROM "hook_executions" he WHERE NOT EXISTS (SELECT 1 FROM "events" e WHERE e."user_id" = he."user_id" AND e."id" = he."event_id");--> statement-breakpoint
UPDATE "ai_insights" ai SET "provider_id" = NULL WHERE "provider_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ai_providers" ap WHERE ap."user_id" = ai."user_id" AND ap."id" = ai."provider_id");--> statement-breakpoint
UPDATE "ai_insights" ai SET "hook_execution_id" = NULL WHERE "hook_execution_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "hook_executions" he WHERE he."user_id" = ai."user_id" AND he."id" = ai."hook_execution_id");--> statement-breakpoint
UPDATE "ai_messages" am SET "provider_id" = NULL WHERE "provider_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ai_providers" ap WHERE ap."user_id" = am."user_id" AND ap."id" = am."provider_id");--> statement-breakpoint
UPDATE "unmatched_email_messages" uem SET "linked_exchange_id" = NULL WHERE "linked_exchange_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "exchanges" e WHERE e."user_id" = uem."user_id" AND e."id" = uem."linked_exchange_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_user_id_id_idx" ON "events" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "hooks_user_id_id_idx" ON "hooks" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "hook_executions_user_id_id_idx" ON "hook_executions" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_user_id_id_idx" ON "ai_providers" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "unmatched_email_messages_linked_exchange_id_idx" ON "unmatched_email_messages" USING btree ("linked_exchange_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_converted_client_fk" FOREIGN KEY ("user_id","converted_client_id") REFERENCES "public"."clients"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_executions" ADD CONSTRAINT "hook_executions_user_hook_fk" FOREIGN KEY ("user_id","hook_id") REFERENCES "public"."hooks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_executions" ADD CONSTRAINT "hook_executions_user_event_fk" FOREIGN KEY ("user_id","event_id") REFERENCES "public"."events"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_user_provider_fk" FOREIGN KEY ("user_id","provider_id") REFERENCES "public"."ai_providers"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_user_hook_execution_fk" FOREIGN KEY ("user_id","hook_execution_id") REFERENCES "public"."hook_executions"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_provider_fk" FOREIGN KEY ("user_id","provider_id") REFERENCES "public"."ai_providers"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_email_messages" ADD CONSTRAINT "unmatched_email_messages_user_linked_exchange_fk" FOREIGN KEY ("user_id","linked_exchange_id") REFERENCES "public"."exchanges"("user_id","id") ON DELETE no action ON UPDATE no action;
