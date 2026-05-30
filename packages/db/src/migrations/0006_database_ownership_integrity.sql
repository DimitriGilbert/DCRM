INSERT INTO "event_definitions" ("type", "entity_type", "action", "description") VALUES
  ('client.created', 'client', 'created', 'A client was created.'),
  ('client.updated', 'client', 'updated', 'A client was updated.'),
  ('client.deleted', 'client', 'deleted', 'A client was soft-deleted.'),
  ('client.restored', 'client', 'restored', 'A client was restored.'),
  ('tag.created', 'tag', 'created', 'A tag was created.'),
  ('tag.updated', 'tag', 'updated', 'A tag was updated.'),
  ('tag.deleted', 'tag', 'deleted', 'A tag was soft-deleted.'),
  ('tag.restored', 'tag', 'restored', 'A tag was restored.'),
  ('lead.created', 'lead', 'created', 'A lead was created.'),
  ('lead.updated', 'lead', 'updated', 'A lead was updated.'),
  ('lead.deleted', 'lead', 'deleted', 'A lead was deleted.'),
  ('lead.stage_changed', 'lead', 'stage_changed', 'A lead moved pipeline stage.'),
  ('lead.converted', 'lead', 'converted', 'A lead was converted into a client.'),
  ('project.created', 'project', 'created', 'A project was created.'),
  ('project.updated', 'project', 'updated', 'A project was updated.'),
  ('project.deleted', 'project', 'deleted', 'A project was deleted.'),
  ('project.status_changed', 'project', 'status_changed', 'A project changed status.'),
  ('ticket.created', 'ticket', 'created', 'A ticket was created.'),
  ('ticket.updated', 'ticket', 'updated', 'A ticket was updated.'),
  ('ticket.deleted', 'ticket', 'deleted', 'A ticket was deleted.'),
  ('ticket.status_changed', 'ticket', 'status_changed', 'A ticket changed status.'),
  ('exchange.created', 'exchange', 'created', 'An exchange was created.'),
  ('exchange.updated', 'exchange', 'updated', 'An exchange was updated.'),
  ('exchange.deleted', 'exchange', 'deleted', 'An exchange was deleted.'),
  ('exchange.exchange_received', 'exchange', 'exchange_received', 'An exchange was received.'),
  ('attachment.file_attached', 'attachment', 'file_attached', 'A file was attached.'),
  ('import.import_completed', 'import', 'import_completed', 'An import completed.'),
  ('webhook.webhook_received', 'webhook', 'webhook_received', 'An incoming webhook was received.')
ON CONFLICT ("type") DO UPDATE SET
  "entity_type" = excluded."entity_type",
  "action" = excluded."action",
  "description" = excluded."description",
  "updated_at" = now();--> statement-breakpoint
INSERT INTO "event_definitions" ("type", "action", "description")
SELECT DISTINCT "type", 'legacy', 'Existing event type present before event definition constraints.' FROM "events"
WHERE "type" NOT IN (SELECT "type" FROM "event_definitions");--> statement-breakpoint
INSERT INTO "event_definitions" ("type", "action", "description")
SELECT DISTINCT "event_type", 'legacy', 'Existing hook event type present before event definition constraints.' FROM "hooks"
WHERE "event_type" NOT IN (SELECT "type" FROM "event_definitions");--> statement-breakpoint
INSERT INTO "event_definitions" ("type", "action", "description")
SELECT DISTINCT "target_event_type", 'legacy', 'Existing incoming webhook event type present before event definition constraints.' FROM "incoming_webhooks"
WHERE "target_event_type" NOT IN (SELECT "type" FROM "event_definitions");--> statement-breakpoint
DELETE FROM "client_authorized_emails" cae WHERE NOT EXISTS (SELECT 1 FROM "clients" c WHERE c."user_id" = cae."user_id" AND c."id" = cae."client_id");--> statement-breakpoint
DELETE FROM "projects" p WHERE NOT EXISTS (SELECT 1 FROM "clients" c WHERE c."user_id" = p."user_id" AND c."id" = p."client_id");--> statement-breakpoint
DELETE FROM "tickets" t WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."user_id" = t."user_id" AND p."id" = t."project_id");--> statement-breakpoint
UPDATE "exchanges" e SET "client_id" = NULL WHERE "client_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "clients" c WHERE c."user_id" = e."user_id" AND c."id" = e."client_id");--> statement-breakpoint
UPDATE "exchanges" e SET "project_id" = NULL WHERE "project_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."user_id" = e."user_id" AND p."id" = e."project_id");--> statement-breakpoint
UPDATE "exchanges" e SET "ticket_id" = NULL WHERE "ticket_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "tickets" t WHERE t."user_id" = e."user_id" AND t."id" = e."ticket_id");--> statement-breakpoint
UPDATE "exchanges" e SET "synced_email_account_id" = NULL WHERE "synced_email_account_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "email_accounts" a WHERE a."user_id" = e."user_id" AND a."id" = e."synced_email_account_id");--> statement-breakpoint
DELETE FROM "exchange_participants" ep WHERE NOT EXISTS (SELECT 1 FROM "exchanges" e WHERE e."user_id" = ep."user_id" AND e."id" = ep."exchange_id");--> statement-breakpoint
DELETE FROM "entity_tags" et WHERE NOT EXISTS (SELECT 1 FROM "tags" t WHERE t."user_id" = et."user_id" AND t."id" = et."tag_id");--> statement-breakpoint
DELETE FROM "email_sync_states" ess WHERE NOT EXISTS (SELECT 1 FROM "email_accounts" a WHERE a."user_id" = ess."user_id" AND a."id" = ess."email_account_id");--> statement-breakpoint
DELETE FROM "unmatched_email_messages" uem WHERE NOT EXISTS (SELECT 1 FROM "email_accounts" a WHERE a."user_id" = uem."user_id" AND a."id" = uem."email_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_user_id_id_idx" ON "clients" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_id_id_idx" ON "projects" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_user_id_id_idx" ON "tickets" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchanges_user_id_id_idx" ON "exchanges" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_id_id_idx" ON "tags" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_accounts_user_id_id_idx" ON "email_accounts" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "client_authorized_emails" ADD CONSTRAINT "client_authorized_emails_user_client_fk" FOREIGN KEY ("user_id","client_id") REFERENCES "public"."clients"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_client_fk" FOREIGN KEY ("user_id","client_id") REFERENCES "public"."clients"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_project_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."projects"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_user_client_fk" FOREIGN KEY ("user_id","client_id") REFERENCES "public"."clients"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_user_project_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."projects"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_user_ticket_fk" FOREIGN KEY ("user_id","ticket_id") REFERENCES "public"."tickets"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_synced_email_account_id_email_accounts_id_fk" FOREIGN KEY ("synced_email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_user_synced_email_account_fk" FOREIGN KEY ("user_id","synced_email_account_id") REFERENCES "public"."email_accounts"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_participants" ADD CONSTRAINT "exchange_participants_user_exchange_fk" FOREIGN KEY ("user_id","exchange_id") REFERENCES "public"."exchanges"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_user_tag_fk" FOREIGN KEY ("user_id","tag_id") REFERENCES "public"."tags"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sync_states" ADD CONSTRAINT "email_sync_states_user_email_account_fk" FOREIGN KEY ("user_id","email_account_id") REFERENCES "public"."email_accounts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_email_messages" ADD CONSTRAINT "unmatched_email_messages_user_email_account_fk" FOREIGN KEY ("user_id","email_account_id") REFERENCES "public"."email_accounts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_type_event_definitions_type_fk" FOREIGN KEY ("type") REFERENCES "public"."event_definitions"("type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hooks" ADD CONSTRAINT "hooks_event_type_event_definitions_type_fk" FOREIGN KEY ("event_type") REFERENCES "public"."event_definitions"("type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_target_event_type_event_definitions_type_fk" FOREIGN KEY ("target_event_type") REFERENCES "public"."event_definitions"("type") ON DELETE no action ON UPDATE no action;
