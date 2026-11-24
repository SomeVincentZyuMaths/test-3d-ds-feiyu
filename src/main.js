import * as THREE from "three";
import { CastViewer, FishViewer } from "./viewers.js";
import { avatarDefinitions, expressionOptions } from "./lab-data.js";
import "./style.css";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const host = $("#canvas-host");
let active;
let viewers;
let lastCastSelection = "deepseek";
let raf;
let lost = false;
let renderer;
let initialized = false;

$("#expression").innerHTML = expressionOptions
  .map(([value, text]) => `<option value="${value}">${text}</option>`)
  .join("");
for (const def of avatarDefinitions) {
  const button = document.createElement("button");
  button.className = "roster-card";
  button.dataset.roster = def.id;
  button.style.setProperty("--character", def.color);
  button.innerHTML = `<span class="load-state"></span><span class="number">${def.number}</span><h2>${def.title}</h2><p>${def.subtitle}</p><span class="features">${def.features.join(" · ")}</span>`;
  button.onclick = () => selectModel(def.id);
  $("#cast-roster").append(button);
}

function selectModel(id) {
  if (active.id === "cast" && id !== "all") lastCastSelection = id;
  if (
    id === "all" &&
    active.id === "cast" &&
    ["face", "bust"].includes(active.state.view)
  )
    active.state.view = "body";
  active.setState({ selection: id });
  $("#fish-grid").scrollLeft = 0;
}

function syncUI() {
  if (!active) return;
  const cast = active.id === "cast";
  const state = active.state;
  $("#cast-stage").hidden = !cast;
  $("#cast-roster").hidden = !cast;
  $("#fish-grid").hidden = cast;
  $("#sync-label").hidden = cast;
  $("#sync").checked = state.sync;
  $("#sync").disabled = state.selection !== "all";
  $("#special").hidden = !cast;
  $("#special").setAttribute("aria-pressed", state.special);
  const selectedDef = active.definitions.find(
    (def) => def.id === state.selection,
  );
  $("#special").textContent = selectedDef?.special ?? "角色动作";
  $("#tpose").setAttribute("aria-pressed", state.tpose);
  $("#motion").checked = state.motion;
  $("#expression").value = state.expression;
  $("#compare").checked = state.compare;
  $("#compare-divider").hidden = !cast || !state.compare;
  $("#compare-divider").style.left = `${state.split * 100}%`;
  $("#compare-divider").setAttribute(
    "aria-valuenow",
    Math.round(state.split * 100),
  );
  for (const button of $$("[data-view]"))
    button.setAttribute("aria-pressed", button.dataset.view === state.view);
  for (const button of $$("[data-shade]"))
    button.setAttribute("aria-pressed", button.dataset.shade === state.shade);
  for (const button of $$("[data-env]"))
    button.setAttribute(
      "aria-pressed",
      button.dataset.env === state.environment,
    );
  const allText = cast ? "四人同台" : "三款对比";
  const items = [{ id: "all", title: allText }, ...active.definitions];
  // Rebuild only when the collection changes; keep keyboard focus during loading.
  const tabs = $("#model-tabs");
  if (tabs.dataset.page !== active.id) {
    tabs.dataset.page = active.id;
    tabs.replaceChildren();
    for (const def of items) {
      const button = document.createElement("button");
      button.dataset.modelSelect = def.id;
      button.setAttribute("role", "tab");
      button.style.setProperty("--character", def.color ?? "#586e5d");
      const label = cast
        ? def.id === "all"
          ? allText
          : def.title.split(" ")[0]
        : def.id === "all"
          ? allText
          : def.author;
      button.innerHTML = `${def.id === "all" ? "" : '<i class="dot"></i>'}${label}`;
      button.onclick = () => selectModel(def.id);
      tabs.append(button);
    }
  }
  for (const button of $$("[data-model-select]")) {
    const selected = button.dataset.modelSelect === state.selection;
    button.setAttribute("aria-selected", selected);
    button.tabIndex = selected ? 0 : -1;
  }
  if (cast) {
    $("#cast-roster").classList.toggle("single", state.selection !== "all");
    for (const button of $$("[data-roster]"))
      button.hidden =
        state.selection !== "all" && button.dataset.roster !== state.selection;
    $("#stage-label").textContent =
      state.selection === "all"
        ? "PLATE 001 — 004"
        : `${selectedDef.number} / ${selectedDef.subtitle}`;
    $("#cast-caption").textContent =
      state.selection === "all"
        ? "NIKE ORIGINAL + THREE STRUCTURAL REINTERPRETATIONS"
        : `${selectedDef.author} · ${selectedDef.note}`;
  }
  const unsupported = active
    .ready()
    .filter(
      (actor) =>
        state.expression !== "neutral" &&
        !actor.vrm.expressionManager?.getExpression(state.expression),
    );
  $("#selection-note").textContent = unsupported.length
    ? `${unsupported.map((actor) => actor.title).join("、")}未提供该表情。`
    : cast
      ? "原版五官与骨骼保留；另外三位采用独立衣装、发型与配件。点击下方角色卡可单独观察。"
      : "同灯光、等高展示。水原镜为 StarLite 转换版；手机可从卡片标题区域左右滑动。";
  active.updateProgress();
  updateStatus();
}

function updateStatus() {
  if (!active || lost) return;
  const wanted = active.wanted();
  const count = wanted.filter((entry) => entry.status === "ready").length;
  const failures = wanted.filter((entry) => entry.status === "error").length;
  const unavailable = wanted.filter(
    (entry) => entry.status === "unavailable",
  ).length;
  $("#render-status").textContent =
    `${count} / ${wanted.length} 已加载 · ${active.id === "cast" ? "长身角色图鉴" : "原始模型对比"}${failures ? ` · ${failures} 项需重试` : ""}${unavailable ? ` · ${unavailable} 款仅本地提供` : ""}`;
}

function activatePage(id) {
  id = id === "fish" ? "fish" : "cast";
  if (active === viewers[id]) return;
  active?.deactivate();
  active = viewers[id];
  for (const button of $$("[data-page]")) {
    const selected = button.dataset.page === id;
    button.setAttribute("aria-selected", selected);
    button.tabIndex = selected ? 0 : -1;
  }
  $("#collection-panel").setAttribute("aria-labelledby", `collection-${id}`);
  $("#page-title").innerHTML =
    id === "cast"
      ? "同一个起点，<em>四种性格。</em>"
      : "同一只肥鱼，<em>三种诠释。</em>";
  $("#eyebrow").textContent =
    id === "cast"
      ? "FOUR CHARACTERS / ONE SHARED BEGINNING"
      : "CHARACTER STUDY / 001–003";
  $("#page-description").innerHTML =
    id === "cast"
      ? "保留成熟的五官，重新诠释角色。<br />长身比例 · 独立衣装 · 真实 3D"
      : "把模型放到一起，认真看看。<br />同一套灯光 · 等高展示 · 自由观察";
  syncUI();
  active.activate();
  syncUI();
}

function keyboardTabs(element, selector) {
  element.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...element.querySelectorAll(selector)];
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) %
            buttons.length;
    buttons[next].click();
    buttons[next].focus();
  });
}
keyboardTabs($(".collection-tabs"), "[data-page]");
keyboardTabs($("#model-tabs"), "[data-model-select]");
for (const button of $$("[data-page]"))
  button.onclick = () => {
    location.hash = button.dataset.page;
  };
window.addEventListener("hashchange", () => {
  if (initialized) activatePage(location.hash.slice(1));
});
for (const button of $$("[data-view]"))
  button.onclick = () => {
    if (
      active.id === "cast" &&
      active.state.selection === "all" &&
      ["face", "bust"].includes(button.dataset.view)
    )
      active.state.selection = lastCastSelection;
    active.setState({ view: button.dataset.view });
  };
for (const button of $$("[data-shade]"))
  button.onclick = () => active.setState({ shade: button.dataset.shade });
for (const button of $$("[data-env]"))
  button.onclick = () => active.setState({ environment: button.dataset.env });
$("#motion").onchange = (event) =>
  active.setState({ motion: event.target.checked });
$("#expression").onchange = (event) =>
  active.setState({ expression: event.target.value });
$("#sync").onchange = (event) =>
  active.setState({ sync: event.target.checked });
$("#special").onclick = () =>
  active.setState({ special: !active.state.special, tpose: false });
$("#tpose").onclick = () =>
  active.setState({ tpose: !active.state.tpose, special: false });
$("#compare").onchange = (event) =>
  active.setState({ compare: event.target.checked });
$("#reset").onclick = () => {
  active.reset();
};
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("#studio").requestFullscreen();
  } catch {
    $("#selection-note").textContent =
      "此浏览器不支持网页全屏，可使用浏览器的全屏功能。";
  }
};
const divider = $("#compare-divider");
function slide(event) {
  const rect = $("#cast-stage").getBoundingClientRect();
  active.state.split = Math.max(
    0,
    Math.min(1, (event.clientX - rect.left) / rect.width),
  );
  divider.style.left = `${active.state.split * 100}%`;
  divider.setAttribute("aria-valuenow", Math.round(active.state.split * 100));
}
divider.onpointerdown = (event) => {
  if (event.button !== 0) return;
  event.stopPropagation();
  divider.setPointerCapture(event.pointerId);
  slide(event);
};
divider.onpointermove = (event) => {
  if (divider.hasPointerCapture(event.pointerId)) {
    event.stopPropagation();
    slide(event);
  }
};
divider.onkeydown = (event) => {
  const changes = {
    ArrowLeft: active.state.split - 0.025,
    ArrowRight: active.state.split + 0.025,
    Home: 0,
    End: 1,
  };
  if (event.key in changes) {
    event.preventDefault();
    active.setState({ split: Math.max(0, Math.min(1, changes[event.key])) });
  }
};
// Toolbar controls inside the stage must not start an OrbitControls drag.
for (const node of $$(".stage-chips, .compare-switch"))
  node.addEventListener("pointerdown", (event) => event.stopPropagation());

try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  renderer.setClearColor(0, 0);
  host.append(renderer.domElement);
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
    $("#render-status").textContent = "显卡上下文已暂停，请刷新恢复。";
  });
  renderer.domElement.addEventListener("webglcontextrestored", () =>
    location.reload(),
  );
  viewers = { cast: new CastViewer(syncUI), fish: new FishViewer(syncUI) };
  initialized = true;
  activatePage(location.hash.slice(1));
  let last = 0,
    width = 0,
    height = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const delta = Math.min((now - (last || now)) / 1000, 1 / 30);
    last = now;
    if (document.hidden || lost) return;
    const rect = host.getBoundingClientRect();
    if (width !== rect.width || height !== rect.height) {
      width = rect.width;
      height = rect.height;
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    }
    renderer.info.reset();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.clear();
    renderer.setScissorTest(true);
    active.render(renderer, rect, delta);
    renderer.setScissorTest(false);
  }
  raf = requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $("#render-status").textContent =
    "3D 初始化失败，请检查 WebGL 2 与硬件加速后刷新。";
}

window.__atlas = {
  snapshot: () => ({
    page: active?.id,
    cast: viewers?.cast.snapshot(),
    fish: viewers?.fish.snapshot(),
    canvasCount: host.querySelectorAll("canvas").length,
    memory: renderer ? { ...renderer.info.memory } : null,
  }),
};
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(raf);
    for (const viewer of Object.values(viewers ?? {})) viewer.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
  });
