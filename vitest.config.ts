/// <reference types="vitest" />
// Standalone test config. Deliberately NOT extending vite.config.ts: that config
// pulls in tanstackStart + nitro, which build a server bundle and are irrelevant
// (and slow) for unit tests. We only need React JSX + the "@" alias.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/api/**", "src/lib/**", "src/components/app/**", "src/routes/**"],
      exclude: ["src/routeTree.gen.ts", "src/**/*.{test,spec}.{ts,tsx}", "src/test/**"],
    },
  },
});
