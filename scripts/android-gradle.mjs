// Runs the Capacitor Android Gradle wrapper on Windows, macOS and Linux.
// Usage: node scripts/android-gradle.mjs assembleDebug
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = resolve(root, "android");
const wrapper = resolve(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");

if (!existsSync(wrapper)) {
  console.error("android/ is missing. Run `npx cap add android` first.");
  process.exit(1);
}
if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !existsSync(resolve(androidDir, "local.properties"))) {
  console.error("Set ANDROID_HOME to your Android SDK, or create android/local.properties with sdk.dir=...");
  process.exit(1);
}

const tasks = process.argv.slice(2);
const result = spawnSync(wrapper, tasks.length ? tasks : ["assembleDebug"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
