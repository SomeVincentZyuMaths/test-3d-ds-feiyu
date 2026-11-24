import assert from "node:assert/strict";
import { readdir, readFile, lstat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(process.argv[2] ?? "dist");
const expected = new Set([
  "avatars/deepseek.vrm",
  "avatars/gpt.vrm",
  "avatars/gemini.vrm",
  "avatars/claude.vrm",
]);
const actual = new Set();
let total = 0;

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const name = relative(root, path).replaceAll("\\", "/");
    assert.ok(
      !entry.isSymbolicLink(),
      `No symlinks in Pages artifact: ${name}`,
    );
    assert.doesNotMatch(
      name,
      /(^|\/)(local-assets|local-models|\.git|\.env|\.cp-images)(\/|$|\.)/i,
    );
    assert.doesNotMatch(name, /mirror\.vrm|muzi\.vrm|尾大\.(png|jpe?g)/i);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    const stat = await lstat(path);
    total += stat.size;
    if (/\.vrm$/i.test(name)) {
      assert.ok(
        expected.has(name),
        `Unexpected model in public build: ${name}`,
      );
      actual.add(name);
      // Published bytes must match the explicitly reviewed public assets.
      const published = await readFile(path);
      const source = await readFile(resolve("public", name));
      const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
      assert.equal(hash(published), hash(source), `Asset mismatch: ${name}`);
    }
  }
}

await scan(root);
assert.deepEqual(actual, expected);
assert.ok(
  (await readFile(resolve(root, "index.html"), "utf8")).includes("星象观测室"),
);
await readFile(resolve(root, "licenses/DERIVATIVES.md"));
await readFile(resolve(root, "licenses/nike-license.txt"));
console.log(
  `Public artifact verified: 4 allowed VRMs; ${(total / 1048576).toFixed(1)} MiB; restricted files absent.`,
);
