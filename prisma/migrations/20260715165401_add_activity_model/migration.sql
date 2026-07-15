-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "defaultDurationSeconds" INTEGER,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Activity_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_title_key" ON "Activity"("title");

-- CreateIndex
CREATE INDEX "Activity_isArchived_sortOrder_idx" ON "Activity"("isArchived", "sortOrder");

-- CreateIndex
CREATE INDEX "Activity_categoryId_idx" ON "Activity"("categoryId");
