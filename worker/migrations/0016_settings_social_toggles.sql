-- Per-platform visibility toggles for the footer's social links -- lets an
-- admin hide a platform (e.g. one they don't use, like TikTok) without
-- losing the saved URL, rather than having to blank it out to hide it.
-- Default true so existing saved URLs keep showing exactly as before.
ALTER TABLE store_settings ADD COLUMN instagram_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE store_settings ADD COLUMN facebook_enabled  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE store_settings ADD COLUMN tiktok_enabled    INTEGER NOT NULL DEFAULT 1;
