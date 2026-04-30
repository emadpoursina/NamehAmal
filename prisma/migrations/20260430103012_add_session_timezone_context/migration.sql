-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Yerevan',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "categoryId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "durationSeconds" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Yerevan',
    "timeZoneOffsetMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("categoryId", "createdAt", "durationSeconds", "endedAt", "id", "kind", "note", "occurredAt", "startedAt", "title", "updatedAt") SELECT "categoryId", "createdAt", "durationSeconds", "endedAt", "id", "kind", "note", "occurredAt", "startedAt", "title", "updatedAt" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_occurredAt_idx" ON "Session"("occurredAt");
CREATE INDEX "Session_categoryId_occurredAt_idx" ON "Session"("categoryId", "occurredAt");
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");
CREATE INDEX "Session_endedAt_idx" ON "Session"("endedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
