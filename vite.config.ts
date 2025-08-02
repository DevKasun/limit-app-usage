import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    solid(),
    viteStaticCopy({
      targets: [
        { src: "public/manifest.json", dest: "." },
        { src: "public/icon*.png", dest: "." },
      ],
    }),
  ],
  build: {
    outDir: "dist",
  },
});
