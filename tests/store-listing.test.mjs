import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)), "store/google-play");
// Google Play Console limits (characters).
const LIMITS = { "title.txt": 30, "short_description.txt": 80, "full_description.txt": 4000 };

test("Google Play listing texts fit the Play Console limits in every language", async () => {
  const languages = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name !== "images" && entry.name !== "screenshots");
  assert.deepEqual(languages.map(entry => entry.name).sort(), ["en-US", "tr-TR"]);
  for (const { name } of languages) {
    for (const [file, limit] of Object.entries(LIMITS)) {
      const text = (await readFile(resolve(root, name, file), "utf8")).trim();
      assert.ok(text.length > 0, `${name}/${file} is empty`);
      assert.ok([...text].length <= limit, `${name}/${file} has ${[...text].length} characters (limit ${limit})`);
    }
    const notes = (await readFile(resolve(root, name, "changelogs/1.txt"), "utf8")).trim();
    assert.ok([...notes].length <= 500, `${name} release notes are over 500 characters`);
  }
});
