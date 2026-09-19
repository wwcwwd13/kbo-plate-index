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
      input: [
        resolve(process.cwd(), "index.html"),
        resolve(process.cwd(), "player/index.html"),
        resolve(process.cwd(), "diff/index.html"),
        resolve(process.cwd(), "about/index.html"),
        resolve(process.cwd(), "release-note/index.html"),
        // Keep the old entrypoints available for existing bookmarks.
        resolve(process.cwd(), "player.html"),
        resolve(process.cwd(), "diff.html"),
        resolve(process.cwd(), "about.html"),
        resolve(process.cwd(), "release-note.html")
      ]
    }
  }
});
