import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const cast = {
  deepseek: {
    clips: ["idle", "turn_smile", "peace"],
    mesh: "Large curved whale tail",
  },
  gpt: { clips: ["idle", "contemplate"], mesh: "Dragon tail" },
  gemini: { clips: ["idle", "wink"], mesh: "Fluffy curled cat tail" },
  claude: { clips: ["idle", "page_turn"], mesh: "Page of folio" },
};

function readGlb(id) {
  const bytes = readFileSync(
    new URL(`../public/cast/${id}.glb`, import.meta.url),
  );
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 6 * 1024 * 1024, "mobile file-size budget");
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  const glb = JSON.parse(bytes.toString("utf8", 20, jsonEnd));
  return { ...glb, binary: bytes.subarray(jsonEnd + 8) };
}

for (const [id, spec] of Object.entries(cast)) {
  test(`${id} ships an editable model and a self-contained animated GLB`, () => {
    assert.ok(existsSync(new URL(`../models/${id}.blend`, import.meta.url)));
    const glb = readGlb(id);
    assert.ok(glb.meshes.some((mesh) => mesh.name === spec.mesh));
    assert.ok(glb.meshes.some((mesh) => mesh.name === "Sculpted cheekbones, nose and jaw"));
    assert.ok(glb.nodes.some((node) => node.name === "Forearm left"));
    assert.ok(glb.nodes.some((node) => node.name === "Closed lid right"));
    assert.deepEqual(
      glb.animations.map((action) => action.name),
      spec.clips,
    );
    assert.ok(glb.buffers.every((buffer) => buffer.uri === undefined));
    assert.ok((glb.images ?? []).every((image) => image.uri === undefined));
    assert.ok(glb.animations.every((action) => action.channels.length > 3));
  });
}

function firstTransform(glb, clipName, nodeName, path) {
  const node = glb.nodes.findIndex(({ name }) => name === nodeName);
  assert.notEqual(node, -1, nodeName);
  const clip = glb.animations.find(({ name }) => name === clipName);
  const track = clip.channels.find(({ target }) => target.node === node && target.path === path);
  // The exporter can leave an unchanging transform on the node itself.
  if (!track) return glb.nodes[node][path] ?? { scale: [1, 1, 1], translation: [0, 0, 0] }[path];
  const accessor = glb.accessors[clip.samplers[track.sampler].output];
  const view = glb.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  assert.equal(accessor.type, "VEC3");
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return [0, 4, 8].map((i) => glb.binary.readFloatLE(offset + i));
}

test("DeepSeek peace hides both irises, reveals sculpted lids, and raises the wrist", () => {
  const glb = readGlb("deepseek");
  for (const side of ["left", "right"]) {
    assert.ok(firstTransform(glb, "idle", `Eye ${side}`, "scale")[1] > 0.95);
    assert.ok(firstTransform(glb, "idle", `Closed lid ${side}`, "scale")[1] < 0.01);
    assert.ok(firstTransform(glb, "peace", `Eye ${side}`, "scale")[1] < 0.01);
    assert.ok(firstTransform(glb, "peace", `Closed lid ${side}`, "scale")[1] > 0.95);
  }
  const wrist = (clip) => firstTransform(glb, clip, "Wrist left", "translation")[1];
  assert.ok(wrist("peace") > wrist("idle") + 0.9);
});
