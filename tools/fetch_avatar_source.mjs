import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const files = [
  [
    "https://raw.githubusercontent.com/tegnike/deepseek-chan-vrm/main/DeepSeek-chan.blend",
    "models/nike-source/DeepSeek-chan.blend",
    "b9326bcc62988be97a22d3ef73c8401121dfbd321a5bfca95a84238d3052602a",
  ],
  [
    "https://github.com/saturday06/VRM-Addon-for-Blender/releases/download/v4.10.2/VRM_Addon_for_Blender-4_10_2.zip",
    "D:/temp/codex/test-3d-ds-feiyu/integration-20261125/VRM_Addon_for_Blender-4_10_2.zip",
    "c02baf55b83a409fbc01e5c1912d7c8eff2807ce1a23d20eb6c049d1fb1d469c",
  ],
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [url, path, expected] of files) {
  let existing;
  try {
    existing = await readFile(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing) {
    if (hash(existing) !== expected)
      throw new Error(`Existing file differs; will not overwrite: ${path}`);
    console.log("Verified existing", path);
    continue;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected)
    throw new Error(`Upstream hash differs: ${url}`);
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, bytes);
  console.log(
    path,
    bytes.length,
    createHash("sha256").update(bytes).digest("hex"),
  );
}
