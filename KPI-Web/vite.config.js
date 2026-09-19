import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  target: "http://127.0.0.1:5050",
  changeOrigin: true
};

export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "data",
  server: {
    watch: {
      ignored: ["**/database/**"]
    },
    proxy: {
      "/api": apiProxy,
      "/images": apiProxy
    }
  },
  preview: {
    proxy: {
      "/api": apiProxy,
      "/images": apiProxy
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        player: resolve(process.cwd(), "player.html"),
        diff: resolve(process.cwd(), "diff.html")
      }
    }
  }
});
