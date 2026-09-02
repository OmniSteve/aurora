-- Phase 8: private-bucket uploads (bespoke/special-request reference
-- images) need a way for the anonymous customer who just uploaded a file to
-- preview it immediately, without the object ever being reachable by a
-- guessable URL (migration/MEDIA.md: "never return a permanently-public
-- private-R2 URL"). Mirrors the orders.access_token_hash pattern
-- (0014_order_access.sql): an opaque random token, minted once at upload
-- time, hashed at rest -- GET /media-private/:id accepts either this token
-- or an admin session, never the id alone.
ALTER TABLE media_assets ADD COLUMN access_token_hash TEXT;
CREATE INDEX idx_media_assets_access_token ON media_assets(access_token_hash);
