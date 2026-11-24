import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { avatarDefinitions, fishDefinitions } from "./lab-data.js";
import {
  createLitScene,
  disposeAvatar,
  loadAvatar,
  poseAvatar,
  renderShaded,
  resetPhysics,
  refreshPoseBounds,
} from "./avatar-runtime.js";
import { habitats } from "./habitats.js";

const $ = (s) => document.querySelector(s);
const studioColor = new THREE.Color(0xe5eadd);
const clay = new THREE.MeshStandardMaterial({
  color: 0xd2d5c8,
  roughness: 0.9,
  side: THREE.DoubleSide,
});
const wire = new THREE.MeshBasicMaterial({
  color: 0x4a7161,
  wireframe: true,
  side: THREE.DoubleSide,
});
const shadeMaterial = (shade) =>
  shade === "clay" ? clay : shade === "wire" ? wire : null;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function cameraControls(element) {
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  controls.dampingFactor = 0.16;
  controls.minDistance = 0.25;
  controls.maxDistance = 35;
  controls.minPolarAngle = 0.03;
  controls.maxPolarAngle = Math.PI - 0.03;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  element.addEventListener("contextmenu", (event) => event.preventDefault());
  return { camera, controls, element };
}

function setFrame(view, target, halfHeight, halfWidth, angle = 0, depth = 0.2) {
  const rect = view.element.getBoundingClientRect();
  view.camera.aspect = rect.width / Math.max(1, rect.height);
  view.camera.updateProjectionMatrix();
  const tan = Math.tan(THREE.MathUtils.degToRad(view.camera.fov / 2));
  const distance =
    Math.max(halfHeight / tan, halfWidth / (tan * view.camera.aspect)) + depth;
  view.anchor = target.clone();
  view.baseDistance = distance;
  view.controls.target.copy(target);
  view.camera.position
    .copy(target)
    .add(
      new THREE.Vector3(
        Math.sin(angle) * distance,
        0.015 * distance,
        Math.cos(angle) * distance,
      ),
    );
  view.controls.update();
}

function viewport(renderer, element, host) {
  const rect = element.getBoundingClientRect();
  const left = Math.max(rect.left, host.left),
    right = Math.min(rect.right, host.right);
  const top = Math.max(rect.top, host.top),
    bottom = Math.min(rect.bottom, host.bottom);
  if (
    left >= right ||
    top >= bottom ||
    rect.bottom < 0 ||
    rect.top > innerHeight
  )
    return null;
  renderer.setViewport(
    rect.left - host.left,
    host.bottom - rect.bottom,
    rect.width,
    rect.height,
  );
  renderer.setScissor(
    left - host.left,
    host.bottom - bottom,
    right - left,
    bottom - top,
  );
  return rect;
}

class CollectionViewer {
  constructor(id, definitions, onChange) {
    this.id = id;
    this.definitions = definitions;
    this.entries = definitions.map((definition) => ({
      definition,
      status:
        definition.localOnly && !import.meta.env.DEV ? "unavailable" : "idle",
      percent: 0,
      actor: null,
      error: null,
    }));
    this.onChange = onChange;
    this.active = false;
    this.loading = false;
    this.elapsed = 0;
    this.ticks = 0;
    this.frameNeeded = true;
    this.cameraTouched = false;
    this.state = {
      selection: "all",
      view: "body",
      shade: "original",
      expression: "neutral",
      motion: !reduced,
      special: false,
      tpose: false,
      environment: "studio",
      compare: false,
      split: 0.5,
      sync: true,
    };
  }
  wanted() {
    return this.entries.filter(
      (entry) =>
        this.state.selection === "all" ||
        entry.definition.id === this.state.selection,
    );
  }
  ready() {
    return this.wanted()
      .filter((entry) => entry.actor)
      .map((entry) => entry.actor);
  }
  setState(patch) {
    Object.assign(this.state, patch);
    if ("tpose" in patch) {
      for (const entry of this.entries)
        if (entry.actor) refreshPoseBounds(entry.actor, this.state);
    }
    if ("selection" in patch || "view" in patch || "tpose" in patch) {
      this.frameNeeded = true;
      this.cameraTouched = false;
    }
    this.layout();
    this.ensure();
    this.onChange();
  }
  activate() {
    this.active = true;
    this.setControlsEnabled(true);
    this.layout();
    this.ensure();
  }
  deactivate() {
    this.active = false;
    this.setControlsEnabled(false);
  }
  reset() {
    this.frameNeeded = true;
    this.cameraTouched = false;
  }
  async ensure() {
    if (this.loading || !this.active) return;
    this.loading = true;
    while (this.active) {
      const entry = this.wanted().find((item) => item.status === "idle");
      if (!entry) break;
      entry.status = "loading";
      this.onChange();
      try {
        const actor = await loadAvatar(
          entry.definition,
          this.id === "cast",
          (percent) => {
            entry.percent = percent;
            if (this.active) this.updateProgress();
          },
        );
        entry.actor = actor;
        if (this.state.tpose) refreshPoseBounds(actor, this.state);
        entry.status = "ready";
        this.attach(entry);
        this.layout();
        if (!this.cameraTouched) this.frameNeeded = true;
      } catch (error) {
        entry.status = "error";
        entry.error = String(error);
        console.error(`${this.id}/${entry.definition.id}`, error);
      }
      if (this.active) this.onChange();
    }
    this.loading = false;
  }
  retry(id) {
    const entry = this.entries.find((item) => item.definition.id === id);
    if (entry?.status !== "error") return;
    entry.status = "idle";
    entry.error = null;
    entry.percent = 0;
    this.ensure();
  }
  updateActors(delta) {
    if (this.state.motion) this.elapsed += delta;
    for (const actor of this.ready()) {
      poseAvatar(actor, this.elapsed, this.state);
      actor.vrm.update(this.state.motion ? delta : 0);
      actor.updateCount++;
    }
  }
  snapshot() {
    return {
      state: { ...this.state },
      active: this.active,
      ticks: this.ticks,
      models: this.entries.map((entry) => ({
        id: entry.definition.id,
        status: entry.status,
        error: entry.error,
        bytes: entry.actor?.bytes,
        head: entry.actor?.head,
        height: entry.actor
          ? entry.actor.bounds.max.y - entry.actor.bounds.min.y
          : null,
        updates: entry.actor?.updateCount ?? 0,
        expression: entry.actor?.vrm.expressionManager?.getValue(
          this.state.expression,
        ),
      })),
    };
  }
  dispose() {
    this.deactivate();
    for (const entry of this.entries)
      if (entry.actor) disposeAvatar(entry.actor);
  }
}

export class CastViewer extends CollectionViewer {
  constructor(onChange) {
    super("cast", avatarDefinitions, onChange);
    this.state.selection = matchMedia("(max-width: 700px)").matches
      ? "deepseek"
      : "all";
    this.scene = createLitScene();
    this.view = cameraControls($("#cast-stage"));
    this.view.controls.addEventListener("start", () => {
      this.cameraTouched = true;
    });
    this.environments = null;
    this.size = "";
  }
  setControlsEnabled(value) {
    this.view.controls.enabled = value;
  }
  attach(entry) {
    this.scene.add(entry.actor.world);
  }
  layout() {
    const selected = this.ready();
    let cursor = 0;
    const positions = [];
    for (const actor of selected) {
      const width = actor.bounds.max.x - actor.bounds.min.x;
      positions.push(cursor - actor.bounds.min.x);
      cursor += width + 0.22;
    }
    const total = Math.max(0, cursor - 0.22);
    for (const entry of this.entries) {
      if (!entry.actor) continue;
      const index = selected.indexOf(entry.actor);
      entry.actor.world.visible = index >= 0;
      const previousPosition = entry.actor.world.position.clone();
      entry.actor.world.position.copy(entry.actor.localPosition);
      if (index >= 0 && this.state.selection === "all")
        entry.actor.world.position.x += positions[index] - total / 2;
      if (!previousPosition.equals(entry.actor.world.position))
        resetPhysics(entry.actor);
    }
    this.groupWidth = total;
    if (this.active) {
      $("#cast-stage").classList.toggle(
        "group",
        this.state.selection === "all",
      );
      this.updateProgress();
    }
  }
  updateProgress() {
    if (!this.active) return;
    const wanted = this.wanted();
    const loading = wanted.find((entry) => entry.status === "loading");
    const errors = wanted.filter((entry) => entry.status === "error");
    const overlay = $("#cast-progress");
    overlay.replaceChildren();
    if (loading) {
      const text = document.createElement("span");
      text.textContent = `${loading.definition.title} · ${loading.percent >= 99 ? "准备材质与骨骼…" : `加载 ${loading.percent}%`}`;
      overlay.append(text);
    }
    for (const entry of errors) {
      const row = document.createElement("div");
      row.textContent = `${entry.definition.title}加载失败`;
      const retry = document.createElement("button");
      retry.textContent = "重试";
      retry.onclick = () => this.retry(entry.definition.id);
      row.append(retry);
      overlay.append(row);
    }
    for (const entry of this.entries) {
      const label = document.querySelector(
        `[data-roster="${entry.definition.id}"] .load-state`,
      );
      if (label)
        label.textContent =
          entry.status === "ready"
            ? "↗"
            : entry.status === "loading"
              ? `${entry.percent}%`
              : entry.status === "error"
                ? "重试"
                : "";
    }
  }
  frame() {
    const ready = this.ready();
    const bounds = new THREE.Box3();
    for (const actor of ready) {
      const offset = actor.world.position.clone().sub(actor.localPosition);
      bounds.union(actor.bounds.clone().translate(offset));
    }
    if (bounds.isEmpty())
      bounds.set(
        new THREE.Vector3(-1, 0, -0.4),
        new THREE.Vector3(1, 2.4, 0.4),
      );
    let target = bounds.getCenter(new THREE.Vector3());
    target.z = 0;
    let halfHeight = (bounds.max.y - bounds.min.y) * 0.57;
    let halfWidth = (bounds.max.x - bounds.min.x) * 0.55;
    const actor = ready[0];
    if (
      actor &&
      ["bust", "face"].includes(this.state.view) &&
      this.state.selection !== "all"
    ) {
      const bottom =
        this.state.view === "face" ? actor.neck - 0.08 : actor.chest - 0.32;
      target.set(0, (actor.top + 0.05 + bottom) / 2, 0.06);
      halfHeight = (actor.top + 0.05 - bottom) * 0.56;
      halfWidth = halfHeight * 0.73;
    }
    setFrame(
      this.view,
      target,
      halfHeight,
      halfWidth,
      this.state.view === "back"
        ? Math.PI
        : this.state.view === "angle"
          ? 0.58
          : 0,
      0.3,
    );
    this.frameNeeded = false;
  }
  render(renderer, host, delta) {
    if (!this.active) return;
    this.ticks++;
    const size = `${this.view.element.clientWidth}/${this.view.element.clientHeight}`;
    if (this.size !== size) {
      this.size = size;
      this.frameNeeded = true;
    }
    if (this.frameNeeded) this.frame();
    this.view.controls.update();
    this.updateActors(delta);
    const rect = viewport(renderer, this.view.element, host);
    if (!rect) return;
    this.scene.background =
      this.state.environment === "studio" ? studioColor : null;
    if (this.state.environment !== "studio") {
      this.environments ??= habitats();
      this.environments.update(this.elapsed);
      renderer.render(
        this.environments[this.state.environment],
        this.view.camera,
      );
      renderer.clearDepth();
    }
    if (!this.state.compare) {
      renderShaded(
        renderer,
        this.scene,
        this.view.camera,
        shadeMaterial(this.state.shade),
      );
      return;
    }
    const split = Math.round(rect.width * this.state.split);
    renderer.setScissor(
      rect.left - host.left,
      host.bottom - rect.bottom,
      split,
      rect.height,
    );
    renderShaded(renderer, this.scene, this.view.camera, null);
    renderer.setScissor(
      rect.left - host.left + split,
      host.bottom - rect.bottom,
      rect.width - split,
      rect.height,
    );
    renderShaded(
      renderer,
      this.scene,
      this.view.camera,
      shadeMaterial(
        this.state.shade === "original" ? "wire" : this.state.shade,
      ),
    );
  }
  snapshot() {
    return {
      ...super.snapshot(),
      camera: this.view.camera.position.toArray(),
      target: this.view.controls.target.toArray(),
    };
  }
  dispose() {
    super.dispose();
    this.view.controls.dispose();
  }
}

export class FishViewer extends CollectionViewer {
  constructor(onChange) {
    super("fish", fishDefinitions, onChange);
    this.leader = null;
    for (const entry of this.entries) {
      const def = entry.definition;
      const card = document.createElement("article");
      card.className = "fish-card";
      card.dataset.model = def.id;
      card.innerHTML = `<div class="fish-viewport" tabindex="0" role="img" aria-label="${def.author}的三维模型"><div class="stage-top"><span class="plate-tag">MODEL ${def.number}</span><button class="focus-model" aria-label="单独查看${def.author}">⤢</button></div><span class="format">VRM / ORIGINAL MATERIAL</span><div class="fish-loading" role="status"></div></div><div class="fish-info"><a href="${def.source}" target="_blank" rel="noreferrer">来源 ↗</a><h2>${def.title}</h2><p><span>${def.author}</span><small>${def.note}</small></p></div>`;
      $("#fish-grid").append(card);
      entry.card = card;
      entry.view = cameraControls(card.querySelector(".fish-viewport"));
      entry.scene = createLitScene();
      entry.scene.background = studioColor;
      entry.view.controls.enabled = false;
      entry.view.controls.addEventListener("start", () => {
        this.leader = entry;
        this.cameraTouched = true;
      });
      card.querySelector(".focus-model").onclick = () =>
        this.setState({ selection: def.id });
    }
  }
  setControlsEnabled(value) {
    for (const entry of this.entries)
      entry.view.controls.enabled =
        value &&
        (this.state.selection === "all" ||
          this.state.selection === entry.definition.id);
  }
  attach(entry) {
    entry.scene.add(entry.actor.world);
    entry.card.querySelector(".format").textContent =
      `VRM ${entry.actor.vrm.meta.metaVersion} / ${(entry.actor.bytes / 1048576).toFixed(1)} MB`;
  }
  layout() {
    $("#fish-grid").classList.toggle("single", this.state.selection !== "all");
    for (const entry of this.entries)
      entry.card.hidden =
        this.state.selection !== "all" &&
        this.state.selection !== entry.definition.id;
    this.setControlsEnabled(this.active);
    this.leader = null;
    if (this.active) this.updateProgress();
  }
  updateProgress() {
    if (!this.active) return;
    for (const entry of this.entries) {
      const overlay = entry.card.querySelector(".fish-loading");
      overlay.hidden = entry.status === "ready";
      if (entry.status === "ready") continue;
      overlay.classList.toggle("unavailable", entry.status === "unavailable");
      overlay.replaceChildren();
      const message = document.createElement("span");
      message.textContent =
        entry.status === "unavailable"
          ? "仅本地提供 · 模型未随发布包分发"
          : entry.status === "error"
            ? "加载失败，请检查本地模型文件后重试"
            : entry.percent >= 99
              ? "正在准备材质与骨骼…"
              : `${entry.definition.author} · 加载 ${entry.percent}%`;
      overlay.append(message);
      if (entry.status === "loading") {
        const progress = document.createElement("progress");
        progress.max = 100;
        progress.value = entry.percent;
        overlay.append(progress);
      }
      if (entry.status === "error") {
        const retry = document.createElement("button");
        retry.textContent = "重新加载";
        retry.onclick = () => this.retry(entry.definition.id);
        overlay.append(retry);
      }
    }
  }
  frame() {
    const ready = this.ready();
    const commonWidth = Math.max(
      1.4,
      ...ready.map((actor) => actor.bounds.max.x - actor.bounds.min.x),
    );
    for (const entry of this.wanted()) {
      const actor = entry.actor;
      let target = new THREE.Vector3(0, 1.11, 0),
        halfHeight = 1.24,
        halfWidth = commonWidth * 0.55;
      if (actor && ["face", "bust"].includes(this.state.view)) {
        const bottom =
          this.state.view === "face" ? actor.neck - 0.08 : actor.chest - 0.32;
        target.set(0, (actor.top + 0.05 + bottom) / 2, 0.06);
        halfHeight = (actor.top + 0.05 - bottom) * 0.54;
        halfWidth = halfHeight * 0.72;
      }
      setFrame(
        entry.view,
        target,
        halfHeight,
        halfWidth,
        this.state.view === "back"
          ? Math.PI
          : this.state.view === "angle"
            ? 0.58
            : 0,
        0.22,
      );
    }
    this.leader = null;
    this.frameNeeded = false;
  }
  render(renderer, host, delta) {
    if (!this.active) return;
    this.ticks++;
    const size = this.wanted()
      .map(
        (entry) =>
          `${entry.view.element.clientWidth}/${entry.view.element.clientHeight}`,
      )
      .join(",");
    if (size !== this.size) {
      this.size = size;
      this.frameNeeded = true;
    }
    if (this.frameNeeded) this.frame();
    if (this.leader && this.state.sync && this.state.selection === "all") {
      const lead = this.leader.view;
      lead.controls.update();
      const offset = lead.camera.position.clone().sub(lead.controls.target);
      const pan = lead.controls.target.clone().sub(lead.anchor);
      for (const entry of this.wanted()) {
        if (entry === this.leader) continue;
        entry.view.controls.target.copy(entry.view.anchor).add(pan);
        entry.view.camera.position
          .copy(entry.view.controls.target)
          .addScaledVector(offset, entry.view.baseDistance / lead.baseDistance);
        entry.view.controls.update();
      }
    }
    this.updateActors(delta);
    for (const entry of this.wanted()) {
      if (entry !== this.leader || !this.state.sync)
        entry.view.controls.update();
      if (!viewport(renderer, entry.view.element, host)) continue;
      renderShaded(
        renderer,
        entry.scene,
        entry.view.camera,
        shadeMaterial(this.state.shade),
      );
    }
  }
  snapshot() {
    return {
      ...super.snapshot(),
      cameras: this.entries.map((entry) => ({
        id: entry.definition.id,
        position: entry.view.camera.position.toArray(),
        target: entry.view.controls.target.toArray(),
      })),
    };
  }
  dispose() {
    super.dispose();
    for (const entry of this.entries) entry.view.controls.dispose();
  }
}
