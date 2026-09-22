<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Use npm. This machine has Node.js 22 and npm; Bun is not installed, and `bun.lock` is gitignored.
- `.cursor/environment.json` install is `npm ci --no-audit --no-fund`, then copy `.env.example` to `.env` when `.env` is missing, then `npx prisma generate` and `npx prisma migrate deploy`. Run that same sequence when `node_modules` does not match `package-lock.json` (a saved snapshot can be older than the lockfile).
- Dev server: `npm run dev` (webpack on port 3060). Leave `dev:turbo` unused; Turbopack can panic during HMR.
- Checks: `npm test` and `npm run lint`. The app is local SQLite (`dev.db` via `DATABASE_URL` in `.env`) and has no login.
- Docker and macOS desktop packaging (`npm run desktop:dist`) are not part of this environment.
