import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [
      ...configDefaults.exclude,
      "**/release/**",
      "**/.next/**",
      "**/.desktop-runtime/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
