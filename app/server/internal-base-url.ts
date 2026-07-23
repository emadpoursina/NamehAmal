import "server-only";

/**
 * Origin for server-side fetches to this app's own API routes.
 *
 * Always loop back to the local Node process so custom domains / reverse
 * proxies (e.g. nml.localhost) work in Docker, where those hostnames often
 * do not resolve (`getaddrinfo ENOTFOUND`).
 */
export function getInternalBaseUrl(): string {
  const port = process.env.PORT ?? "3060";
  return `http://127.0.0.1:${port}`;
}
