import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  envDir: "..",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/health": {
        target: "http://localhost:3000",
      },
      "/api": {
        target: "http://localhost:3000",
      },
    },
  },
});
