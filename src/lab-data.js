export const avatarDefinitions = [
  {
    id: "deepseek",
    number: "01",
    title: "DeepSeek 肥鱼",
    subtitle: "BLUE WHALE MAID",
    file: "avatars/deepseek.vrm",
    color: "#4865a7",
    note: "ニケ原版 · 长身女仆",
    author: "ニケ / Nike",
    special: "微笑",
    features: ["蓝色渐变", "女仆长裙", "鲸鱼长尾"],
  },
  {
    id: "gpt",
    number: "02",
    title: "GPT 白龙",
    subtitle: "IVORY DRAGON",
    file: "avatars/gpt.vrm",
    color: "#a093bc",
    note: "长身底模衍生 · 白银礼裙",
    author: "ニケ底模 · 本项目改版",
    special: "舒展双翼",
    features: ["银白双角", "淡紫膜翼", "鳞片长尾"],
  },
  {
    id: "gemini",
    number: "03",
    title: "Gemini 猫咪",
    subtitle: "STARLIT CAT",
    file: "avatars/gemini.vrm",
    color: "#8e75c6",
    note: "长身底模衍生 · 星饰短裙",
    author: "ニケ底模 · 本项目改版",
    special: "眨眼摆尾",
    features: ["蓝紫侧束", "星形发饰", "蓬松大尾"],
  },
  {
    id: "claude",
    number: "04",
    title: "Claude 太阳花",
    subtitle: "SUNFLOWER SCHOLAR",
    file: "avatars/claude.vrm",
    color: "#b77845",
    note: "长身底模衍生 · 抱书长裙",
    author: "ニケ底模 · 本项目改版",
    special: "低头看书",
    features: ["铜橙长发", "太阳花饰", "白棕书装"],
  },
];

export const fishDefinitions = [
  {
    ...avatarDefinitions[0],
    id: "nike",
    title: "DeepSeek-chan",
    author: "ニケ / Nike",
    bytes: 33616628,
    note: "原始长身版 · VRM 1.0",
    source: "https://github.com/tegnike/deepseek-chan-vrm",
  },
  {
    id: "mirror",
    number: "02",
    title: "蓝色大肥鱼",
    author: "水原镜",
    file: "local-models/mirror.vrm",
    bytes: 10427496,
    note: "StarLite 转换版 · 仅本地",
    color: "#4d73a6",
    localOnly: true,
    source: "https://www.bilibili.com/video/BV1Tgxv6CE1Z/",
  },
  {
    id: "muzi",
    number: "03",
    title: "蓝色小肥鱼",
    author: "木子恶魔",
    file: "local-models/muzi.vrm",
    bytes: 18480432,
    note: "大头桌宠版 · 仅本地",
    color: "#7387bc",
    localOnly: true,
    source: "https://www.aplaybox.com/details/model/ayXkRzVflmnd",
  },
];

export function assetUrl(path) {
  return new URL(path, new URL(import.meta.env.BASE_URL, document.baseURI))
    .href;
}

export const expressionOptions = [
  ["neutral", "自然"],
  ["happy", "微笑"],
  ["relaxed", "放松"],
  ["angry", "生气"],
  ["surprised", "惊讶"],
  ["blink", "闭眼"],
];
