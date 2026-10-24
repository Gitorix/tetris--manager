import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [{
    name: "production-network-policy",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("connect-src 'self' ws://127.0.0.1:5173", "connect-src 'none'");
    }
  }],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
