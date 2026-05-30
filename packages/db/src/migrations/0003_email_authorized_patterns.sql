CREATE TABLE "client_authorized_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"pattern" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_authorized_emails" ADD CONSTRAINT "client_authorized_emails_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_authorized_emails" ADD CONSTRAINT "client_authorized_emails_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_authorized_emails_user_id_idx" ON "client_authorized_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "client_authorized_emails_client_id_idx" ON "client_authorized_emails" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_authorized_emails_client_pattern_idx" ON "client_authorized_emails" USING btree ("client_id","pattern");
