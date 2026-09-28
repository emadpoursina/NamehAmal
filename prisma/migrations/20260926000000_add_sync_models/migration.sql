-- Add sync identity/version/conflict tables and additive Session sync columns (T024/T036).
-- SQLite-compatible; all changes are additive and nullable so legacy rows keep working.

ALTER TABLE "Session" ADD COLUMN "syncId" TEXT;
ALTER TABLE "Session" ADD COLUMN "sourceDeviceId" TEXT;
ALTER TABLE "Session" ADD COLUMN "activityId" TEXT;
ALTER TABLE "Session" ADD COLUMN "entryType" TEXT DEFAULT 'WORK';
ALTER TABLE "Session" ADD COLUMN "confirmationState" TEXT DEFAULT 'CONFIRMED';
ALTER TABLE "Session" ADD COLUMN "currentRevisionId" TEXT;
ALTER TABLE "Session" ADD COLUMN "deletedAt" DATETIME;

CREATE UNIQUE INDEX IF NOT EXISTS "Session_syncId_key" ON "Session"("syncId");
CREATE INDEX IF NOT EXISTS "Session_syncId_idx" ON "Session"("syncId");

-- Deterministic backfill for legacy sessions: stable entry identity on the desktop installation.
-- Actual syncId values are assigned by server code on first sync; legacy rows keep syncId NULL until then
-- and map to Unassigned on the phone while preserving title/category.

CREATE TABLE IF NOT EXISTS "SyncDevice" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "deviceType" TEXT NOT NULL,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "SyncRevision" (
    "revisionId" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "baseRevisionId" TEXT,
    "changedByDeviceId" TEXT NOT NULL,
    "sourceDeviceId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "seq" INTEGER NOT NULL UNIQUE,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SyncRevision_entryId_idx" ON "SyncRevision"("entryId");

CREATE TABLE IF NOT EXISTS "HostChangeLog" (
    "changeId" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL UNIQUE,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HostChangeLog_seq_idx" ON "HostChangeLog"("seq");

CREATE TABLE IF NOT EXISTS "SyncConflict" (
    "conflictId" TEXT NOT NULL PRIMARY KEY,
    "conflictType" TEXT NOT NULL,
    "entryIdsJson" TEXT NOT NULL,
    "revisionIdsJson" TEXT NOT NULL,
    "overlapStartAt" DATETIME,
    "overlapEndAt" DATETIME,
    "state" TEXT NOT NULL DEFAULT 'UNRESOLVED',
    "resolutionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "SyncConflict_state_idx" ON "SyncConflict"("state");

CREATE TABLE IF NOT EXISTS "ConflictResolution" (
    "resolutionId" TEXT NOT NULL PRIMARY KEY,
    "conflictId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "selectedRevisionId" TEXT,
    "resultEntryIdsJson" TEXT NOT NULL,
    "resolvedByDeviceId" TEXT NOT NULL,
    "resolvedAt" DATETIME NOT NULL,
    "undoesResolutionId" TEXT,
    "seq" INTEGER NOT NULL UNIQUE,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConflictResolution_conflictId_idx" ON "ConflictResolution"("conflictId");
