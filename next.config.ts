import type { NextConfig } from "next";

// Optional comma-separated hosts for `next dev` behind nginx/custom domain (see docs/nginx-reverse-proxy.md).
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
};

export default nextConfig;
