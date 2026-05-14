-- CreateTable
CREATE TABLE "ActiveTimer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "title" TEXT,
    "timeZone" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "timeZoneOffsetMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveTimer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ActiveTimer_categoryId_idx" ON "ActiveTimer"("categoryId");
