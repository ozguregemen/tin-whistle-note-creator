import type { CapacitorConfig } from "@capacitor/cli";

// The installed app loads the bundle from https://localhost (Android) and
// capacitor://localhost (iOS). Workers must allow those origins for live
// services; packaged catalog, practice and tutorials work without them.
const config: CapacitorConfig = {
  appId: "io.github.ozguregemen.tinwhistle",
  appName: "Tin Whistle Note Creator",
  webDir: "dist-mobile",
  // Capacitor's default: debug builds can be inspected from chrome://inspect,
  // release builds cannot.
};

export default config;
