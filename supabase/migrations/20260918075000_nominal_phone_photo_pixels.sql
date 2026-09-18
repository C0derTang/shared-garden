-- Nominal 24MP phone photos (5712x4284) contain 24,470,208 pixels.
-- Raise only the decoded pixel ceiling; preserve all byte/side/type limits.
-- Keep the neighboring status constraint name for the additive audio migration.
alter table private.media_uploads drop constraint media_uploads_check;
alter table private.media_uploads add constraint media_uploads_check
  check (width::bigint * height <= 25000000);
