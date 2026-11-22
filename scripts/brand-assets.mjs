// Generates every app icon and splash size from mobile/brand, then adds the Android 13+
// themed (monochrome) icon layer that @capacitor/assets does not produce.
// Usage: npm run brand:assets
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("node", ["scripts/build-brand.mjs", "--png"]);
run("npx", ["capacitor-assets", "generate", "--assetPath", "mobile/brand/assets", "--android", "--ios",
  "--iconBackgroundColor", "#264b3e", "--iconBackgroundColorDark", "#264b3e",
  "--splashBackgroundColor", "#f3ead8", "--splashBackgroundColorDark", "#18302a"]);

const res = resolve(root, "android/app/src/main/res");
await mkdir(resolve(res, "drawable-xxxhdpi"), { recursive: true });
await copyFile(resolve(root, "mobile/brand/assets/icon-monochrome.png"), resolve(res, "drawable-xxxhdpi/ic_launcher_monochrome.png"));
for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  const path = resolve(res, "mipmap-anydpi-v26", name);
  const xml = await readFile(path, "utf8");
  if (xml.includes("<monochrome>")) continue;
  await writeFile(path, xml.replace("</adaptive-icon>",
    '    <monochrome>\n        <inset android:drawable="@drawable/ic_launcher_monochrome" android:inset="16.7%" />\n    </monochrome>\n</adaptive-icon>'));
}
console.log("Brand assets generated for Android and iOS.");
