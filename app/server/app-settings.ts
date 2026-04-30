import "server-only";

import { prisma } from "@/app/server/db";

// Fetch (or create) the singleton app settings row.
export async function getOrCreateAppSettings() {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", timeZone: "Asia/Yerevan" },
  });
}

// Read the configured default timezone (IANA).
export async function getDefaultTimeZone(): Promise<string> {
  const settings = await getOrCreateAppSettings();
  return settings.timeZone || "Asia/Yerevan";
}

