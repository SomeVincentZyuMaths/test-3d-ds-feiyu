import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { assetUrl } from "./lab-data.js";

const downloaded = new Map();
const neutralState = {
  motion: false,
  tpose: false,
  expression: "neutral",
  special: false,
};

export function hasVisibleMaterial(mesh) {
  return [mesh.material]
    .flat()
    .some((m) => m && m.visible && m.opacity > 0.001);
}

export function visibleBounds(root) {
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((mesh) => {
    if (!mesh.isMesh || !hasVisibleMaterial(mesh)) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(vertex);
    }
  });
  return bounds;
}

async function bytesFor(url, onProgress) {
  if (!downloaded.has(url)) {
    downloaded.set(
      url,
      (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`模型请求失败 (${response.status})`);
        const total = Number(response.headers.get("content-length"));
        const chunks = [];
        let loaded = 0;
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          onProgress?.(
            total ? Math.min(99, Math.round((loaded / total) * 100)) : 0,
          );
        }
        const bytes = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return bytes.buffer;
      })().catch((error) => {
        downloaded.delete(url);
        throw error;
      }),
    );
  }
  return downloaded.get(url);
}

export async function loadAvatar(definition, anatomical, onProgress) {
  const url = assetUrl(definition.file);
  const bytes = await bytesFor(url, onProgress);
  const loader = new GLTFLoader();
  loader.register(
    (parser) => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true }),
  );
  // Parse separate instances, sharing only the immutable downloaded ArrayBuffer.
  const gltf = await loader.parseAsync(bytes, new URL(".", url).href);
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error("文件不是可识别的 VRM");
  VRMUtils.rotateVRM0(vrm);
  const world = new THREE.Group();
  world.name = definition.id;
  world.add(vrm.scene);
  const actor = {
    ...definition,
    vrm,
    world,
    bytes: bytes.byteLength,
    customBones: [],
    updateCount: 0,
  };
  vrm.scene.traverse((node) => {
    if (node.isMesh) node.frustumCulled = false;
    if (node.isBone && /^AA_(wing|tail)_/.test(node.name)) {
      actor.customBones.push({ node, rest: node.quaternion.clone() });
    }
  });
  poseAvatar(actor, 0, neutralState);
  vrm.update(0);
  world.updateMatrixWorld(true);
  const natural = visibleBounds(vrm.scene);
  const head = vrm.humanoid.getNormalizedBoneNode("head");
  const naturalHead =
    head?.getWorldPosition(new THREE.Vector3()).y ?? natural.max.y * 0.85;
  const height = natural.max.y - natural.min.y;
  if (!Number.isFinite(height) || height < 0.1)
    throw new Error("模型没有可显示的网格或尺寸异常");
  const scale = anatomical
    ? 1.86 / (naturalHead - natural.min.y)
    : 2.2 / height;
  const hips = vrm.humanoid
    .getNormalizedBoneNode("hips")
    .getWorldPosition(new THREE.Vector3());
  world.scale.setScalar(scale);
  world.position.set(-hips.x * scale, -natural.min.y * scale, -hips.z * scale);
  world.updateMatrixWorld(true);
  vrm.springBoneManager?.reset();
  actor.localPosition = world.position.clone();
  actor.bounds = visibleBounds(world);
  actor.head = head.getWorldPosition(new THREE.Vector3()).y;
  actor.neck =
    vrm.humanoid
      .getNormalizedBoneNode("neck")
      ?.getWorldPosition(new THREE.Vector3()).y ?? actor.head - 0.14;
  actor.chest =
    vrm.humanoid
      .getNormalizedBoneNode("chest")
      ?.getWorldPosition(new THREE.Vector3()).y ?? actor.neck - 0.3;
  actor.top = actor.bounds.max.y;
  if (actor.id === "claude") {
    const cover =
      vrm.scene.getObjectByName("Claudebookfrontcover") ??
      vrm.scene.getObjectByName("Claude_book_front_cover");
    // GLTFLoader normalizes node names, so also accept spaces in other exporters.
    const bookMesh =
      cover ?? vrm.scene.getObjectByName("Claude book front cover");
    if (bookMesh) {
      const box = visibleBounds(bookMesh);
      const rawChest = vrm.humanoid.getRawBoneNode("chest");
      actor.bookGrip = [-1, 1].map((side) =>
        rawChest.worldToLocal(
          new THREE.Vector3(
            (box.min.x + box.max.x) / 2 + side * (box.max.x - box.min.x) * 0.62,
            box.min.y + (box.max.y - box.min.y) * 0.22,
            box.max.z + 0.008,
          ),
        ),
      );
    }
  }
  onProgress?.(100);
  return actor;
}

export function resetPhysics(actor) {
  actor.world.updateMatrixWorld(true);
  actor.vrm.springBoneManager?.reset();
}

export function refreshPoseBounds(actor, state) {
  const position = actor.world.position.clone();
  const visible = actor.world.visible;
  actor.world.visible = true;
  actor.world.position.copy(actor.localPosition);
  poseAvatar(actor, 0, state);
  actor.vrm.update(0);
  resetPhysics(actor);
  actor.bounds = visibleBounds(actor.world);
  actor.world.position.copy(position);
  actor.world.visible = visible;
  resetPhysics(actor);
}

function rotate(vrm, bone, x = 0, y = 0, z = 0) {
  vrm.humanoid.getNormalizedBoneNode(bone)?.rotation.set(x, y, z);
}

function aimBone(bone, child, target) {
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const from = child
    .getWorldPosition(new THREE.Vector3())
    .sub(origin)
    .normalize();
  const to = target.clone().sub(origin).normalize();
  const parentRotation = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  bone.quaternion.premultiply(
    parentRotation.clone().invert().multiply(delta).multiply(parentRotation),
  );
  bone.updateWorldMatrix(false, true);
}

function holdBook(actor) {
  if (!actor.bookGrip) return;
  const humanoid = actor.vrm.humanoid;
  humanoid.update();
  actor.world.updateMatrixWorld(true);
  const chest = humanoid.getRawBoneNode("chest");
  for (const [i, side] of ["left", "right"].entries()) {
    const upper = humanoid.getNormalizedBoneNode(`${side}UpperArm`);
    const lower = humanoid.getNormalizedBoneNode(`${side}LowerArm`);
    const hand = humanoid.getNormalizedBoneNode(`${side}Hand`);
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbow = lower.getWorldPosition(new THREE.Vector3());
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    // Choose the grip on the same side as the shoulder (VRM conventions vary).
    const candidates = actor.bookGrip.map((point) =>
      chest.localToWorld(point.clone()),
    );
    const target = candidates.reduce((a, b) =>
      Math.abs(a.x - shoulder.x) < Math.abs(b.x - shoulder.x) ? a : b,
    );
    const a = shoulder.distanceTo(elbow),
      b = elbow.distanceTo(wrist);
    const direction = target.clone().sub(shoulder).normalize();
    const distance = Math.min(shoulder.distanceTo(target), a + b - 0.0001);
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const bend = new THREE.Vector3(i === 0 ? -0.25 : 0.25, -1, -0.18);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const desiredElbow = shoulder
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
    aimBone(upper, lower, desiredElbow);
    aimBone(lower, hand, target);
  }
}

export function poseAvatar(actor, time, state) {
  const { vrm } = actor;
  const wave = state.motion ? Math.sin(time * 1.45) : 0;
  const lean = state.motion ? Math.sin(time * 0.63) : 0;
  const sign = vrm.meta.metaVersion === "0" ? -1 : 1;
  const drop = state.tpose ? 0 : sign * (actor.id === "claude" ? 0.88 : 1.18);
  rotate(vrm, "leftUpperArm", 0, 0, -drop - 0.012 * wave);
  rotate(vrm, "rightUpperArm", 0, 0, drop + 0.012 * wave);
  const book = actor.id === "claude" && !state.tpose;
  rotate(vrm, "leftLowerArm", 0, book ? -1.3 : -0.045, book ? -0.12 : 0);
  rotate(vrm, "rightLowerArm", 0, book ? 1.3 : 0.045, book ? 0.12 : 0);
  rotate(vrm, "leftHand", 0, 0, book ? -0.15 : 0);
  rotate(vrm, "rightHand", 0, 0, book ? 0.15 : 0);
  rotate(vrm, "chest", 0.007 * wave, 0, 0.004 * lean);
  rotate(vrm, "neck", 0, 0.02 * lean, 0.008 * wave);
  rotate(
    vrm,
    "head",
    book && state.special ? 0.2 : 0.008 * wave,
    actor.id === "gpt" && state.special ? 0.1 : 0,
    0,
  );
  if (book) holdBook(actor);
  const manager = vrm.expressionManager;
  if (manager) {
    for (const name of [
      "happy",
      "relaxed",
      "angry",
      "surprised",
      "sad",
      "blink",
      "blinkLeft",
      "blinkRight",
    ])
      manager.setValue(name, 0);
    if (state.expression !== "neutral")
      manager.setValue(
        state.expression,
        state.expression === "blink" ? 1 : 0.65,
      );
    if (state.special && state.expression === "neutral") {
      manager.setValue(book ? "relaxed" : "happy", book ? 0.2 : 0.45);
      if (actor.id === "gemini") manager.setValue("blinkRight", 0.85);
    }
    if (state.motion && state.expression !== "blink") {
      manager.setValue(
        "blink",
        Math.exp(
          -Math.pow(
            (((time + (Number(actor.number) || 0) * 0.27) % 4.8) - 3.7) / 0.075,
            2,
          ),
        ),
      );
    }
  }
  for (const { node, rest } of actor.customBones) {
    let angle = 0;
    if (node.name.includes("wing"))
      angle =
        (state.special ? 0.16 : 0.02) *
        (state.motion ? 0.7 + 0.3 * lean : 1) *
        (node.name.endsWith("L") ? 1 : -1);
    else angle = (state.special ? 0.07 : 0.018) * lean;
    node.quaternion
      .copy(rest)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          angle,
        ),
      );
  }
}

export function createLitScene() {
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xfff9ef, 0xc7d8cb, 1.4);
  const key = new THREE.DirectionalLight(0xfff7f0, 1.25);
  key.position.set(-2.3, 4.5, 4);
  const fill = new THREE.DirectionalLight(0xe7f0ff, 0.35);
  fill.position.set(3, 2.5, -1);
  scene.add(hemi, key, fill);
  return scene;
}

export function renderShaded(renderer, scene, camera, material) {
  scene.overrideMaterial = material;
  const hidden = [];
  if (material)
    scene.traverseVisible((node) => {
      if (node.isMesh && !hasVisibleMaterial(node)) {
        hidden.push(node);
        node.visible = false;
      }
    });
  renderer.render(scene, camera);
  for (const node of hidden) node.visible = true;
  scene.overrideMaterial = null;
}

export function disposeAvatar(actor) {
  actor.world.removeFromParent();
  VRMUtils.deepDispose(actor.vrm.scene);
}
