-- Make userUuid the only identifier (UUID PK)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Backfill if needed (so SET NOT NULL / casts won't fail)
UPDATE "UserProfile"
SET "userUuid" = gen_random_uuid()
WHERE "userUuid" IS NULL;

-- Convert userUuid column to native UUID
ALTER TABLE "UserProfile"
  ALTER COLUMN "userUuid" TYPE uuid
  USING ("userUuid"::uuid);

ALTER TABLE "UserProfile"
  ALTER COLUMN "userUuid" SET NOT NULL;

-- Drop old integer identifiers
ALTER TABLE "UserProfile" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "UserProfile" DROP COLUMN IF EXISTS "id";

-- Remove previous unique index on userUuid if it exists
DROP INDEX IF EXISTS "UserProfile_userUuid_key";

-- Set PK on userUuid
ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userUuid");

