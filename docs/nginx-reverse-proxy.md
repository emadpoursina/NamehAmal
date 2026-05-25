# Nginx reverse proxy

NamehAmal is a Next.js app. The HTML you see is rendered on the server; **buttons, filters, and forms need the browser to load JavaScript from `/_next/static/...`**. If those scripts fail to load or are blocked, the page looks fine but nothing interactive works.

## Production (recommended)

Build and run the Node server, then proxy **all** traffic to it (do not serve the app as plain static files).

```bash
bun run build
bun run start
# listens on PORT (default 3000); bind 0.0.0.0 if the app runs in Docker/VM
```

Example nginx site config (replace `nameh.example.com` and upstream port):

```nginx
upstream nameh_amal {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 443 ssl;
    http2 on;
    server_name nameh.example.com;

    # ssl_certificate ...;
    # ssl_certificate_key ...;

    location / {
        proxy_pass http://nameh_amal;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # WebSockets (only needed for `next dev`; harmless in production)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Common nginx mistakes

| Symptom | Likely cause |
|--------|----------------|
| Page loads, buttons dead | `/_next/static/*` returns **404** or **403** (wrong `location`, `try_files`, or stale cache) |
| Page loads, buttons dead (dev only) | `next dev` **blocks** `/_next` from your custom host — see [Development](#development) |
| Assets 404 after deploy | Cached HTML pointing at old chunk names — purge CDN/nginx cache after `bun run build` |
| App under a subpath | App served at `https://domain.com/app/` but assets requested from `/_next/...` — set `basePath` in `next.config.ts` |

### Quick checks

1. Open DevTools → **Network** → reload → filter `static` or `_next`.
2. Any red requests under `/_next/static/chunks/` mean client JS did not load.
3. From your machine:

```bash
curl -I "https://nameh.example.com/_next/static/chunks/$(curl -sS https://nameh.example.com/ | grep -oE '/_next/static/chunks/[^\"]+\.js' | head -1 | tr -d '/')"
```

You should see `HTTP/2 200` (or `HTTP/1.1 200`), not 404/403.

4. Confirm you are **not** using `try_files` + a static `index.html` for `/` while only proxying `/api` — the dashboard must be served by Next.js.

## Development

`bun run dev` blocks cross-origin access to dev bundles (`/_next/*`) unless the browser host is allowlisted. Proxying `https://your-domain` → `localhost:3000` often triggers **403** on chunk URLs while the HTML still loads.

Add your public host(s) to `next.config.ts` (or set `ALLOWED_DEV_ORIGINS` in `.env`):

```bash
ALLOWED_DEV_ORIGINS=nameh.example.com,*.nameh.example.com
```

Restart the dev server after changing config.

For day-to-day use behind nginx, prefer **production mode** (`build` + `start`) instead of `dev`.

## Subpath deployment

If the app lives at `https://domain.com/nameh/` (not the site root), set in `next.config.ts`:

```ts
basePath: "/nameh",
```

Rebuild, and nginx must proxy that prefix to Next.js (or use a matching `location /nameh/` with trailing-slash rules). Without `basePath`, scripts load from `/_next/...` at the domain root and break.

## Cloudflare / WAF

Features like **Rocket Loader** or aggressive JS optimization can break React hydration. Disable them for this app or bypass `/_next/*`.
