import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const roster = [
  {
    id: "deepseek",
    title: "DeepSeek 肥鱼",
    line: "Blue Whale Maid",
    tint: "#697eb4",
    head: 3.89,
    view: "angle",
    yaw: -0.38,
    motions: [
      ["idle", "何意味"],
      ["turn_smile", "回头笑"],
      ["peace", "闭眼比耶"],
    ],
  },
  {
    id: "gpt",
    title: "GPT 白龙",
    line: "Ivory Dragon",
    tint: "#b6a5c9",
    head: 3.89,
    view: "angle",
    yaw: 0.4,
    motions: [
      ["idle", "待机"],
      ["contemplate", "托腮展翅"],
    ],
  },
  {
    id: "gemini",
    title: "Gemini 猫咪",
    line: "Starlit Cat",
    tint: "#8a79b8",
    head: 3.89,
    view: "angle",
    yaw: 0.32,
    motions: [
      ["idle", "待机"],
      ["wink", "眨眼甩尾"],
    ],
  },
  {
    id: "claude",
    title: "Claude 太阳花小姐",
    line: "Lady Sunflower",
    tint: "#c58a53",
    head: 3.89,
    view: "front",
    yaw: -0.16,
    motions: [
      ["idle", "待机"],
      ["page_turn", "低头翻书"],
    ],
  },
];

const loader = new GLTFLoader();
const base = new URL(import.meta.env.BASE_URL, document.baseURI);
const loads = new Map();

export function loadActor(character) {
  if (!loads.has(character.id)) {
    const url = new URL(`cast/${character.id}.glb`, base).href;
    loads.set(
      character.id,
      loader
        .loadAsync(url)
        .then(({ scene: root, animations }) => {
          const clips = new Map(animations.map((clip) => [clip.name, clip]));
          for (const [name] of character.motions) {
            if (!clips.has(name))
              throw new Error(`缺少角色动作: ${character.id}/${name}`);
          }
          const pivot = new T.Group();
          pivot.name = character.id;
          pivot.add(root);
          const bounds = new T.Box3().setFromObject(root, true);
          const mixer = new T.AnimationMixer(root);
          let action;
          return {
            pivot,
            bounds,
            mixer,
            play(id) {
              action?.stop();
              action = mixer.clipAction(clips.get(id) ?? clips.get("idle"));
              action.reset().play();
              mixer.update(0);
            },
            stop() {
              mixer.stopAllAction();
            },
          };
        })
        .catch((error) => {
          loads.delete(character.id);
          throw error;
        }),
    );
  }
  return loads.get(character.id);
}
