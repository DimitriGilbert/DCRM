ALTER TABLE "exchanges" ADD COLUMN "synced_email_account_id" text;--> statement-breakpoint
ALTER TABLE "exchanges" ADD COLUMN "synced_email_mailbox" text;--> statement-breakpoint
ALTER TABLE "exchanges" ADD COLUMN "synced_email_uid" text;--> statement-breakpoint
CREATE UNIQUE INDEX "exchanges_synced_email_identity_idx" ON "exchanges" USING btree ("user_id","synced_email_account_id","synced_email_mailbox","synced_email_uid");