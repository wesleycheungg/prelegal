import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    globals: true,
    // Pure logic and PDF rendering run in Node; component test files opt into
    // jsdom with a `@vitest-environment jsdom` docblock.
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["{lib,components,test}/**/*.test.{ts,tsx}"],
  },
});
