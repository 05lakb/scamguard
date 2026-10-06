import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // During local development only, forward /api calls to a server running on this machine.
  server: { proxy: { "/api": "http://localhost:8080" } },
  test: { include: ["src/**/*.test.ts"] },
});
