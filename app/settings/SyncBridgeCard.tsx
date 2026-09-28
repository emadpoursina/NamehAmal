import { networkInterfaces } from "node:os";

import { SYNC_BRIDGE_DEFAULT_PORT } from "@/electron/runtime-config";

/** Current non-internal IPv4 addresses of this Mac for the sync bridge card. */
function getLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const info of interfaces ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      addresses.push(info.address);
    }
  }
  return addresses;
}

/**
 * Display the LAN sync bridge address for the Android companion (T028).
 * Informational only: the desktop never initiates sync and offers no Sync button.
 */
export function SyncBridgeCard() {
  const addresses = getLanAddresses();
  const port = process.env.NAMEHAMAL_SYNC_PORT
    ? Number.parseInt(process.env.NAMEHAMAL_SYNC_PORT, 10)
    : SYNC_BRIDGE_DEFAULT_PORT;
  const displayPort =
    Number.isInteger(port) && port > 0 && port <= 65535
      ? port
      : SYNC_BRIDGE_DEFAULT_PORT;

  return (
    <section
      aria-label="Android sync bridge"
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
        Android sync bridge
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Enter this address once in the Android companion, then tap Sync on the
        phone. Sync only runs on a trusted private network over plain HTTP.
      </p>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 font-medium text-zinc-700 dark:text-zinc-300">
            Private IP
          </dt>
          <dd className="text-zinc-950 dark:text-zinc-50">
            {addresses.length > 0 ? addresses.join(", ") : "Unavailable"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 font-medium text-zinc-700 dark:text-zinc-300">
            Sync port
          </dt>
          <dd className="text-zinc-950 dark:text-zinc-50">{displayPort}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
        Trusted private networks only — never sync on public or untrusted
        networks. Forgetting the saved endpoint on Android clears that app only;
        it does not revoke host access. The desktop cannot start a sync.
      </p>
    </section>
  );
}
