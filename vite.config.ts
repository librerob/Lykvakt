import { defineConfig } from "vite";
import { resolve } from "node:path";
import {
  browserTarget,
  browserManifest,
  outputDirectory,
} from "./build/targets";
export default defineConfig(({ mode }) => {
  const target = browserTarget(mode);
  return {
    base: "./",
    define:
      target === "firefox"
        ? { chrome: "browser", "globalThis.chrome": "globalThis.browser" }
        : {},
    plugins: [
      {
        name: "browser-manifest",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "manifest.json",
            source: JSON.stringify(browserManifest(target), null, 2) + "\n",
          });
        },
      },
    ],
    build: {
      outDir: outputDirectory(target),
      modulePreload: { polyfill: false },
      target: target === "firefox" ? "firefox153" : "chrome120",
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
  };
});
