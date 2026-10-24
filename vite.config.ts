import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  base: "./",
  build: {
    target: "chrome120",
    minify: false,
    rollupOptions: {
      input: {
        app: resolve("index.html"),
        background: resolve("src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
