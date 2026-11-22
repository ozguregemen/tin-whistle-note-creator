import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Capacitor serves the bundled files from the WebView origin root
// (https://localhost on Android, capacitor://localhost on iOS), so the mobile
// build uses relative asset URLs and its own output folder. The GitHub Pages
// build in vite.pages.config.ts keeps writing to docs/ with its own base path.
export default defineConfig({
  root: "mobile",
  publicDir: "../public",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist-mobile",
    emptyOutDir: true,
    // Old Android System WebView versions still in use on Android 7–9 devices.
    target: ["es2020", "chrome80", "safari14"],
  },
});
