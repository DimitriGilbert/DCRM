CREATE TABLE "unmatched_email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email_account_id" text NOT NULL,
	"mailbox" text NOT NULL,
	"uid" text NOT NULL,
	"message_id" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"subject" text,
	"body_preview" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_exchange_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "unmatched_email_messages" ADD CONSTRAINT "unmatched_email_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_email_messages" ADD CONSTRAINT "unmatched_email_messages_email_account_id_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unmatched_email_messages_user_id_idx" ON "unmatched_email_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "unmatched_email_messages_from_email_idx" ON "unmatched_email_messages" USING btree ("from_email");--> statement-breakpoint
CREATE UNIQUE INDEX "unmatched_email_messages_account_message_idx" ON "unmatched_email_messages" USING btree ("email_account_id","message_id");
