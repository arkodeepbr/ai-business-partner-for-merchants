import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(fileURLToPath(new URL("./src", import.meta.url))) } },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], clearMocks: true, exclude: ["e2e/**", "node_modules/**"] },
});
