ALTER TABLE "user" ADD COLUMN "single_owner_guard" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_single_owner_guard_unique" UNIQUE("single_owner_guard");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_single_owner_guard_true" CHECK ("user"."single_owner_guard" = true);