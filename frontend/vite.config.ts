import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // In sviluppo le chiamate /api vanno al backend FastAPI (stesso "origine" apparente → cookie funzionanti)
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
