-- Run once against your database after `prisma migrate deploy`.
-- Prisma's schema.prisma enables the postgis extension, but the geography column below
-- is unmanaged and must be added manually. Search queries use ST_DWithin against this column.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "PhotographerProfile"
  ADD COLUMN IF NOT EXISTS "searchLocation" geography(Point, 4326);

CREATE INDEX IF NOT EXISTS "PhotographerProfile_searchLocation_gix"
  ON "PhotographerProfile"
  USING GIST ("searchLocation");
