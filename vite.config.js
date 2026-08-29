import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default {
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(projectRoot, "src/main.js"),
      formats: ["iife"],
      name: "NeonClash",
      fileName: () => "game.js",
      cssFileName: "style",
    },
    outDir: resolve(projectRoot, "offline-assets"),
  },
};
