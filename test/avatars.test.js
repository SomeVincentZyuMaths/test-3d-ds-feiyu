import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const project = new URL("../", import.meta.url);
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const sourceHash =
  "b9326bcc62988be97a22d3ef73c8401121dfbd321a5bfca95a84238d3052602a";

function readVrm(id) {
  const bytes = readFileSync(new URL(`public/avatars/${id}.vrm`, project));
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length > 1_000_000, "reject skeleton-only exports");
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  return { bytes, json };
}

test("reviewed author source stays byte-identical", () => {
  assert.equal(
    hash(
      readFileSync(new URL("models/nike-source/DeepSeek-chan.blend", project)),
    ),
    sourceHash,
  );
});

for (const id of ["deepseek", "gpt", "gemini", "claude"]) {
  test(`${id}: complete self-contained VRM, skeleton, expressions and credits`, () => {
    const { json } = readVrm(id);
    const vrm = json.extensions.VRMC_vrm;
    assert.equal(vrm.specVersion, "1.0");
    assert.ok(json.meshes.length > 20);
    assert.ok(json.skins.length > 0);
    assert.ok(
      json.meshes.some((m) =>
        m.primitives.some((p) => p.attributes.JOINTS_0 !== undefined),
      ),
    );
    assert.ok(json.buffers.every((b) => !b.uri));
    assert.ok(json.images.every((image) => !image.uri));
    for (const name of [
      "hips",
      "head",
      "chest",
      "leftHand",
      "rightHand",
      "leftFoot",
      "rightFoot",
    ]) {
      assert.ok(Number.isInteger(vrm.humanoid.humanBones[name].node), name);
    }
    for (const name of ["happy", "blink", "angry", "relaxed"]) {
      const binds = vrm.expressions.preset[name].morphTargetBinds;
      assert.ok(binds.length > 0, `${name} morph bindings`);
      for (const bind of binds) {
        const mesh = json.meshes[json.nodes[bind.node].mesh];
        assert.ok(
          mesh.primitives.some((p) => p.targets?.[bind.index]),
          "valid morph target",
        );
      }
    }
    assert.match(
      vrm.meta.otherLicenseUrl,
      /creativecommons\.org\/licenses\/by-nc-sa\/4\.0/,
    );
    assert.ok(vrm.meta.authors.length > 0);
    assert.equal(vrm.meta.allowRedistribution, true);
  });
}

const signatures = {
  gpt: [
    "Dragon curved horn",
    "Dragon membrane",
    "Dragon ivory scaled tail",
    "gpt_new_skirt",
  ],
  gemini: [
    "Gemini cat ear",
    "Gemini side bun",
    "Gemini fluffy curved tail",
    "gemini_new_skirt",
  ],
  claude: [
    "Claude sunflower hairpin",
    "Claude book front cover",
    "Claude cinnamon overdress",
    "claude_new_skirt",
  ],
};

for (const [id, names] of Object.entries(signatures)) {
  test(`${id}: structural redesign with editable source and retained face morphs`, () => {
    const { json } = readVrm(id);
    for (const name of names)
      assert.ok(
        json.nodes.some((n) => n.name.startsWith(name)),
        name,
      );
    assert.ok(json.nodes.some((n) => n.name === `${id}_continuous_back_hair`));
    assert.ok(
      !json.nodes.some(
        (n) => /_whale_tail|_ribbon_/.test(n.name) && n.mesh !== undefined,
      ),
    );
    const audit = JSON.parse(
      readFileSync(new URL(`models/nike-derived/${id}.json`, project)),
    );
    assert.equal(audit.face_shape_keys, 24);
    assert.equal(audit.license, "CC BY-NC-SA 4.0");
    assert.ok(audit.triangles > 30_000);
    assert.ok(existsSync(new URL(`models/nike-derived/${id}.blend`, project)));
    assert.match(
      json.extensions.VRMC_vrm.meta.copyrightInformation,
      /ZipZipPipe.*Nike/,
    );
  });
}

test("restricted comparison assets are outside public and ignored by git", () => {
  const publicNames = readdirSync(new URL("public/", project), {
    recursive: true,
  }).join("\n");
  assert.doesNotMatch(publicNames, /mirror\.vrm|muzi\.vrm|尾大\.(png|jpg)/i);
  assert.match(
    readFileSync(new URL(".gitignore", project), "utf8"),
    /^local-assets\/$/m,
  );
  const config = readFileSync(new URL("vite.config.js", project), "utf8");
  assert.match(config, /configureServer/);
  assert.doesNotMatch(config, /configurePreviewServer/);
  assert.ok(existsSync(new URL("public/licenses/DERIVATIVES.md", project)));
});
