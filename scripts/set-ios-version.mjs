// Copies mobile/app-version.json into the iOS project (MARKETING_VERSION and
// CURRENT_PROJECT_VERSION) so Android and iOS ship the same version.
// Android reads the same file directly from android/app/build.gradle.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { versionName, versionCode } = JSON.parse(await readFile(resolve(root, "mobile/app-version.json"), "utf8"));

if (!/^\d+\.\d+\.\d+$/.test(versionName) || !Number.isInteger(versionCode) || versionCode < 1) {
  console.error("mobile/app-version.json needs versionName like 1.2.3 and a positive integer versionCode.");
  process.exit(1);
}

const projectPath = resolve(root, "ios/App/App.xcodeproj/project.pbxproj");
const project = await readFile(projectPath, "utf8");
const updated = project
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);
if (updated !== project) await writeFile(projectPath, updated);
console.log(`iOS version ${versionName} (${versionCode})`);
