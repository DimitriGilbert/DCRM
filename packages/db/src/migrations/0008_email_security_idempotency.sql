CREATE UNIQUE INDEX "client_authorized_emails_user_pattern_idx" ON "client_authorized_emails" USING btree ("user_id","pattern");
