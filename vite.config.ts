import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { geminiPlugin } from "./vite.gemini";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  const model = env.GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";
  return {
    plugins: [react(), geminiPlugin(apiKey, model)],
    server: { port: 5173, host: "127.0.0.1" },
    preview: { port: 8080, host: "0.0.0.0" },
  };
});
