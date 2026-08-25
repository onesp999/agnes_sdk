import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "vite";

dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });
const backendPort = process.env.PORT ?? "3101";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": `http://localhost:${backendPort}`,
      "/health": `http://localhost:${backendPort}`,
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
