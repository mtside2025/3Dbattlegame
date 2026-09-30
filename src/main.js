import "./style.css";
import * as THREE from "three";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";
import {
  ATTACKS,
  GUARD_ARC,
  MAX_ENERGY,
  advanceRound,
  angleDifference,
  angleTo,
  attackPhase,
  clamp,
  createRoundState,
  createSeries,
  horizontalDistance,
  isFacing,
  isMatchPoint,
  pressReflect,
  recordRoundResult,
  resolveBeamContact,
  resolveStrike,
  startAttack,
} from "./combat.js";
import { PLAYER_LOOK, STAGES, difficultyStars, getStage, isFinalStage } from "./roster.js";
import {
  animateCloth,
  applyPose,
  computePose,
  createFighterModel,
  disposeModel,
  useSimpleMaterials,
} from "./fighterModel.js";

const ARENA_RADIUS = 9;
const GRAVITY = 24;
const JUMP_VELOCITY = 8.6;
const PLAYER_SPEED = 5.4;
const GUARD_WALK_SPEED = 1.8;
const BEAM_HEIGHT = 1.5;
const SPECIAL_KEYS = Object.freeze({ KeyU: "beam", KeyI: "cyclone", KeyO: "dragon", KeyP: "meteor" });
const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyJ",
  "KeyK",
  "KeyL",
  "KeyU",
  "KeyI",
  "KeyO",
  "KeyP",
  "Space",
  "Enter",
]);

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
const overlay = $("#overlay");
const overlayEyebrow = $("#overlay-eyebrow");
const overlayTitle = $("#overlay-title");
const overlayCopy = $("#overlay-copy");
const titleExtras = $("#title-extras");
const stageCard = $("#stage-card");
const stageStars = $("#stage-stars");
const stageRule = $("#stage-rule");
const startButton = $("#start-button");
const secondaryButton = $("#secondary-button");
const playerHealthBar = $("#player-health");
const enemyHealthBar = $("#enemy-health");
const playerEnergyBar = $("#player-energy");
const enemyEnergyBar = $("#enemy-energy");
const playerRounds = $("#player-rounds");
const enemyRounds = $("#enemy-rounds");
const enemyNameLabel = $("#enemy-name");
const stageLabel = $("#stage-label");
const roundLabel = $("#round-label");
const timerDisplay = $("#timer");
const announcement = $("#announcement");
const callout = $("#special-callout");
const statusMessage = $("#status-message");
const specialChips = [...document.querySelectorAll("[data-special]")];

/**
 * Uses WebGL when possible. School and office PCs often have WebGL disabled by
 * policy or a blocked GPU driver, so fall back to the software SVG renderer
 * instead of crashing before the start button is wired up.
 */
function createRenderer() {
  try {
    const webgl = new THREE.WebGLRenderer({ antialias: true });
    webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    webgl.shadowMap.enabled = true;
    webgl.shadowMap.type = THREE.PCFShadowMap;
    webgl.outputColorSpace = THREE.SRGBColorSpace;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 1.15;
    return { renderer: webgl, softwareRendering: false };
  } catch (error) {
    console.warn("WebGL is unavailable; using the software renderer instead.", error);
    const svg = new SVGRenderer();
    svg.setQuality("low");
    svg.domElement.classList.add("software-renderer");
    return { renderer: svg, softwareRendering: true };
  }
}

const { renderer, softwareRendering } = createRenderer();
useSimpleMaterials(softwareRendering);
renderer.setSize(window.innerWidth, window.innerHeight);
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0c1f");
scene.fog = new THREE.Fog("#1a1430", 24, 60);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 150);
camera.position.set(0, 9, 13);
const cameraTarget = new THREE.Vector3(0, 1.3, 0);

const timer = new THREE.Timer();
let elapsedTime = 0;
const keys = new Set();
const projectiles = [];
const effects = [];
const tmpVector = new THREE.Vector3();
const tmpVector2 = new THREE.Vector3();

scene.add(new THREE.HemisphereLight("#9fb4ff", "#241533", 1.6));
const keyLight = new THREE.DirectionalLight("#fff2e0", 2.6);
keyLight.position.set(-6, 14, 9);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, far: 40 });
scene.add(keyLight);
const leftGlow = new THREE.PointLight("#247cff", 60, 26, 2);
leftGlow.position.set(-10, 5, 2);
scene.add(leftGlow);
const rightGlow = new THREE.PointLight("#ff315d", 60, 26, 2);
rightGlow.position.set(10, 5, -2);
scene.add(rightGlow);
if (softwareRendering) {
  // The SVG renderer ignores hemisphere lights and uses unphysical intensities.
  scene.add(new THREE.AmbientLight("#8c94c8", 0.55));
  keyLight.intensity = 0.9;
  leftGlow.intensity = 0.35;
  rightGlow.intensity = 0.35;
}

const shared = {
  ring: new THREE.RingGeometry(0.55, 1, 40),
  spark: new THREE.SphereGeometry(1, 8, 6),
  torus: new THREE.TorusGeometry(1, 0.08, 6, 40),
  beamCore: new THREE.CapsuleGeometry(0.13, 1.5, 4, 10),
  beamGlow: new THREE.CapsuleGeometry(0.3, 1.7, 4, 12),
  beamHead: new THREE.SphereGeometry(0.34, 16, 12),
};

const arenaParts = { caps: [], rim: null, grid: null };

function addArena() {
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RADIUS + 0.8, ARENA_RADIUS + 1.4, 0.6, 72),
    new THREE.MeshStandardMaterial({ color: "#232a40", metalness: 0.5, roughness: 0.42 }),
  );
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  scene.add(floor);

  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_RADIUS, 72),
    new THREE.MeshStandardMaterial({ color: "#2b3350", metalness: 0.35, roughness: 0.5 }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.005;
  inner.receiveShadow = true;
  scene.add(inner);

  const grid = new THREE.PolarGridHelper(ARENA_RADIUS, 16, 6, 72, "#6f7dff", "#3a4166");
  grid.position.y = 0.02;
  scene.add(grid);
  arenaParts.grid = grid;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_RADIUS + 0.35, 0.09, 8, 96),
    new THREE.MeshBasicMaterial({ color: "#61efff", toneMapped: false }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.04;
  scene.add(rim);
  arenaParts.rim = rim;

  const emblem = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.7, 6),
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18, toneMapped: false }),
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.y = 0.03;
  scene.add(emblem);

  const pillarMaterial = new THREE.MeshStandardMaterial({ color: "#1b2033", metalness: 0.7, roughness: 0.3 });
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 4.2, 10), pillarMaterial);
    pillar.position.set(Math.sin(angle) * (ARENA_RADIUS + 2.6), 2.1, Math.cos(angle) * (ARENA_RADIUS + 2.6));
    pillar.castShadow = true;
    scene.add(pillar);
    const cap = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42),
      new THREE.MeshBasicMaterial({ color: "#61efff", toneMapped: false }),
    );
    cap.position.set(pillar.position.x, 4.75, pillar.position.z);
    cap.userData.phase = i;
    scene.add(cap);
    arenaParts.caps.push(cap);
  }

  const buildingMaterial = new THREE.MeshStandardMaterial({ color: "#121629", emissive: "#070a16", roughness: 0.85 });
  const windowGeometry = new THREE.PlaneGeometry(0.3, 0.38);
  const windowMaterial = new THREE.MeshBasicMaterial({ color: "#ffd46b", toneMapped: false });
  const windowPositions = [];
  for (let i = 0; i < 44; i += 1) {
    const angle = (i / 44) * Math.PI * 2 + Math.random() * 0.05;
    const radius = 30 + Math.random() * 8;
    const width = 2 + Math.random() * 3;
    const height = 5 + Math.random() * 14;
    const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, 3), buildingMaterial);
    building.position.set(Math.sin(angle) * radius, height / 2 - 1, Math.cos(angle) * radius);
    building.lookAt(0, building.position.y, 0);
    scene.add(building);
    for (let row = 1; row < height - 1.5; row += 1.3) {
      for (let column = -width / 2 + 0.5; column < width / 2 - 0.3; column += 0.8) {
        if (Math.random() > 0.45) {
          const local = new THREE.Vector3(column, row - height / 2, 1.52);
          local.applyQuaternion(building.quaternion).add(building.position);
          windowPositions.push({ position: local, quaternion: building.quaternion.clone() });
        }
      }
    }
  }
  const windows = new THREE.InstancedMesh(windowGeometry, windowMaterial, windowPositions.length);
  const matrix = new THREE.Matrix4();
  windowPositions.forEach(({ position, quaternion }, index) => {
    matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
    windows.setMatrixAt(index, matrix);
  });
  scene.add(windows);

  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshBasicMaterial({ color: "#8f86ff", transparent: true, opacity: 0.75, fog: false }),
  );
  moon.position.set(14, 22, -48);
  scene.add(moon);

  const starGeometry = new THREE.BufferGeometry();
  const stars = [];
  for (let i = 0; i < 500; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    stars.push(Math.sin(angle) * 70, 12 + Math.random() * 45, Math.cos(angle) * 70);
  }
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
  scene.add(
    new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: "#ffffff", size: 0.25, fog: false })),
  );
}

function applyArenaTheme(theme) {
  scene.background.set(theme.sky);
  scene.fog.color.set(theme.fog);
  leftGlow.color.set(theme.left);
  rightGlow.color.set(theme.right);
  arenaParts.rim.material.color.set(theme.left);
  arenaParts.caps.forEach((cap, index) => cap.material.color.set(index % 2 ? theme.right : theme.left));
}

function createShield(color) {
  const shield = new THREE.Group();
  const material = (opacity) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.95, 6), material(0.22));
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.86, 0.98, 6), material(0.95));
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 6), material(0.7));
  const cross = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.63, 6), material(0.45));
  for (const mesh of [face, edge, inner, cross]) {
    mesh.rotation.z = Math.PI / 6;
    shield.add(mesh);
  }
  shield.userData = { parts: [face, edge, inner, cross], baseOpacity: [0.22, 0.95, 0.7, 0.45], color: new THREE.Color(color) };
  shield.scale.setScalar(0.001);
  shield.visible = false;
  return shield;
}

function createChargeOrb() {
  const orb = new THREE.Group();
  const core = new THREE.Mesh(shared.spark, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
  const halo = new THREE.Mesh(
    shared.spark,
    new THREE.MeshBasicMaterial({
      color: "#61efff",
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  halo.scale.setScalar(1.7);
  orb.add(core, halo);
  const light = new THREE.PointLight("#61efff", 0, 6, 2);
  orb.add(light);
  orb.userData = { core, halo, light };
  orb.visible = false;
  scene.add(orb);
  return orb;
}

function createEntity(side, look) {
  const model = createFighterModel(look);
  const scale = look.scale ?? 1;
  const shield = createShield(look.accent);
  shield.position.set(0, 1.35 * scale, 0.95 * scale);
  shield.scale.setScalar(0.001);
  model.add(shield);
  scene.add(model);
  return {
    side,
    look,
    model,
    shield,
    scale,
    orb: createChargeOrb(),
    facing: side === "player" ? Math.PI / 2 : -Math.PI / 2,
    vy: 0,
    push: new THREE.Vector3(),
    moving: false,
    speedRatio: 0,
    damageScale: 1,
    shieldFlash: 0,
    shieldFlashColor: new THREE.Color("#ffffff"),
    attackSerial: 0,
    spawned: false,
    slamLanded: false,
    trailTimer: 0,
    get position() {
      return model.position;
    },
  };
}

function removeEntity(entity) {
  scene.remove(entity.model);
  scene.remove(entity.orb);
  disposeModel(entity.model);
}

addArena();
const player = createEntity("player", PLAYER_LOOK);
let enemy = createEntity("enemy", STAGES[0].look);

let stageIndex = 0;
let stage = STAGES[0];
let series = createSeries(stage.roundsToWin);
let round = createRoundState({ enemyMaxHealth: stage.maxHealth, enemyEnergyRegen: stage.energyRegen });
let phase = "title";
let phaseTimer = 0;
let fightAnnounced = false;
let roundWinner = null;
let primaryAction = null;
let secondaryAction = null;
let announcementTimer = 0;
let calloutTimer = 0;
let hitStop = 0;
let shake = 0;
const ai = { think: 0, guardTimer: 0, strafeDir: 1, strafeTimer: 0, lastSeenAttack: -1, reflectAt: null };

const entityState = (entity) => (entity.side === "player" ? round.player : round.enemy);
const opponentOf = (entity) => (entity.side === "player" ? enemy : player);

function positionFighters() {
  for (const entity of [player, enemy]) {
    const sign = entity.side === "player" ? -1 : 1;
    entity.model.position.set(sign * 3.5, 0, 0);
    entity.facing = -sign * (Math.PI / 2);
    entity.model.rotation.y = entity.facing;
    entity.vy = 0;
    entity.push.set(0, 0, 0);
    entity.orb.visible = false;
  }
}

/* ---------------------------------- UI ---------------------------------- */

function setAnnouncement(text, duration = 0.9) {
  announcement.textContent = text;
  announcement.classList.remove("visible");
  void announcement.offsetWidth;
  announcement.classList.add("visible");
  announcementTimer = duration;
}

function showCallout(text, side, color) {
  callout.textContent = text;
  callout.className = `special-callout visible ${side}`;
  callout.style.setProperty("--callout-color", color);
  calloutTimer = 1.1;
}

function renderPips(element, wins, needed) {
  const pips = [];
  for (let i = 0; i < needed; i += 1) {
    pips.push(`<span class="pip${i < wins ? " won" : ""}"></span>`);
  }
  element.innerHTML = pips.join("");
}

function updateRoundHud() {
  renderPips(playerRounds, series.playerWins, series.roundsToWin);
  renderPips(enemyRounds, series.enemyWins, series.roundsToWin);
  stageLabel.textContent = stage.boss ? "BOSS" : `STAGE ${stageIndex + 1}`;
  roundLabel.textContent = `ROUND ${series.roundNumber}`;
  enemyNameLabel.textContent = stage.name;
}

function updateHud() {
  playerHealthBar.style.width = `${(round.player.health / round.player.maxHealth) * 100}%`;
  enemyHealthBar.style.width = `${(round.enemy.health / round.enemy.maxHealth) * 100}%`;
  playerEnergyBar.style.width = `${(round.player.energy / MAX_ENERGY) * 100}%`;
  enemyEnergyBar.style.width = `${(round.enemy.energy / MAX_ENERGY) * 100}%`;
  timerDisplay.textContent = String(Math.ceil(round.timeRemaining)).padStart(2, "0");
  playerEnergyBar.parentElement.classList.toggle("ready", round.player.energy >= ATTACKS.beam.energyCost);
  enemyEnergyBar.parentElement.classList.toggle("ready", round.enemy.energy >= ATTACKS.beam.energyCost);
  for (const chip of specialChips) {
    chip.classList.toggle("ready", round.player.energy >= ATTACKS[chip.dataset.special].energyCost);
  }
}

function showOverlay({ eyebrow, title, copy, primary, onPrimary, secondary = null, onSecondary = null, mode }) {
  overlayEyebrow.textContent = eyebrow;
  overlayTitle.innerHTML = title;
  overlayCopy.textContent = copy;
  titleExtras.hidden = mode !== "title";
  stageCard.hidden = mode !== "stage";
  overlay.dataset.mode = mode;
  startButton.textContent = primary;
  primaryAction = onPrimary;
  secondaryButton.hidden = !secondary;
  secondaryButton.textContent = secondary ?? "";
  secondaryAction = onSecondary;
  overlay.classList.remove("hidden");
  startButton.focus({ preventScroll: true });
}

function hideOverlay() {
  overlay.classList.add("hidden");
  primaryAction = null;
  secondaryAction = null;
}

function showTitle() {
  phase = "title";
  stageIndex = 0;
  prepareStage(0);
  showOverlay({
    mode: "title",
    eyebrow: "3D ACTION FIGHTING",
    title: "NEON<br />CLASH",
    copy: `上下左右・斜めに自由に動ける3Dアリーナで戦うアクション格闘ゲーム。全${STAGES.length}ステージを勝ち抜き、最後に待つボスを倒せ！`,
    primary: "ゲームスタート",
    onPrimary: () => showStageIntro(),
  });
}

function prepareStage(index) {
  stageIndex = index;
  stage = getStage(index);
  if (enemy.look !== stage.look) {
    removeEntity(enemy);
    enemy = createEntity("enemy", stage.look);
  }
  enemy.damageScale = stage.damageScale;
  applyArenaTheme(stage.arena);
  series = createSeries(stage.roundsToWin);
  round = createRoundState({ enemyMaxHealth: stage.maxHealth, enemyEnergyRegen: stage.energyRegen });
  clearProjectiles();
  positionFighters();
  updateRoundHud();
  updateHud();
}

function showStageIntro() {
  phase = "stageIntro";
  prepareStage(stageIndex);
  const stars = difficultyStars(stageIndex);
  stageStars.textContent = `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`;
  stageRule.textContent = `${stage.roundsToWin}ラウンド先取 / HP ${stage.maxHealth}`;
  showOverlay({
    mode: "stage",
    eyebrow: stage.boss ? `FINAL STAGE — BOSS BATTLE` : `STAGE ${stageIndex + 1} / ${STAGES.length}`,
    title: `VS<br />${stage.name}`,
    copy: `「${stage.title}」 ${stage.description}`,
    primary: "試合開始",
    onPrimary: () => startStage(),
  });
}

function startStage() {
  hideOverlay();
  prepareStage(stageIndex);
  startRound();
}

function startRound() {
  round = createRoundState({ enemyMaxHealth: stage.maxHealth, enemyEnergyRegen: stage.energyRegen });
  clearProjectiles();
  positionFighters();
  Object.assign(ai, { think: 0.8, guardTimer: 0, strafeTimer: 0, lastSeenAttack: -1, reflectAt: null });
  keys.clear();
  phase = "intro";
  phaseTimer = 2;
  fightAnnounced = false;
  roundWinner = null;
  const matchPoint = isMatchPoint(series);
  const finalRound =
    series.playerWins === series.roundsToWin - 1 && series.enemyWins === series.roundsToWin - 1;
  setAnnouncement(finalRound ? "FINAL ROUND" : `ROUND ${series.roundNumber}`, 1.2);
  statusMessage.textContent = matchPoint
    ? series.playerWins > series.enemyWins
      ? "マッチポイント！ このラウンドを取れば勝利"
      : series.playerWins < series.enemyWins
        ? "相手のマッチポイント！ 絶対に落とせない"
        : "お互いにマッチポイント！"
    : `${stage.roundsToWin}ラウンド先取で勝利`;
  updateRoundHud();
  updateHud();
}

function endRound(winner) {
  roundWinner = winner;
  phase = "roundEnd";
  phaseTimer = 2.8;
  recordRoundResult(series, winner);
  const ko = round.player.health <= 0 || round.enemy.health <= 0;
  setAnnouncement(winner === "draw" ? "DRAW" : ko ? "K.O." : "TIME UP", 1.6);
  statusMessage.textContent =
    winner === "draw"
      ? "引き分け — どちらにもポイントなし"
      : `${winner === "player" ? PLAYER_LOOK.name : stage.name} がラウンドを取った！ (${series.playerWins} - ${series.enemyWins})`;
  hitStop = ko ? 0.25 : 0;
  updateRoundHud();
  // Show the score of the finished round without bumping the round number prematurely.
  if (!series.winner) {
    roundLabel.textContent = `ROUND ${series.roundNumber - 1}`;
  }
}

function showMatchResult() {
  phase = "result";
  const score = `${series.playerWins} - ${series.enemyWins}`;
  if (series.winner === "player" && isFinalStage(stageIndex)) {
    showOverlay({
      mode: "result",
      eyebrow: "ALL STAGES CLEAR",
      title: "CHAMPION!",
      copy: `スコア ${score}。ボス「${stage.name}」を撃破し、ネオンアリーナの頂点に立った！`,
      primary: "最初から遊ぶ",
      onPrimary: () => {
        stageIndex = 0;
        showStageIntro();
      },
      secondary: "タイトルへ",
      onSecondary: () => showTitle(),
    });
  } else if (series.winner === "player") {
    const next = getStage(stageIndex + 1);
    showOverlay({
      mode: "result",
      eyebrow: `STAGE ${stageIndex + 1} CLEAR`,
      title: "YOU WIN",
      copy: `スコア ${score} で勝利！ 次の相手は${next.boss ? "ボス" : ""}「${next.name}」。敵はさらに強くなる…！`,
      primary: "次のステージへ",
      onPrimary: () => {
        stageIndex += 1;
        showStageIntro();
      },
    });
  } else {
    showOverlay({
      mode: "result",
      eyebrow: "GAME OVER",
      title: "YOU LOSE",
      copy: `スコア ${score}。ガードとビーム反射を活かして、もう一度挑戦しよう。`,
      primary: "コンティニュー",
      onPrimary: () => showStageIntro(),
      secondary: "タイトルへ",
      onSecondary: () => showTitle(),
    });
  }
}

/* -------------------------------- Effects -------------------------------- */

function effectMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function spawnEffect(mesh, life, update) {
  scene.add(mesh);
  effects.push({ mesh, life, maxLife: life, update });
}

function spawnRing(position, color, { size = 1, life = 0.3, flat = false } = {}) {
  const mesh = new THREE.Mesh(shared.ring, effectMaterial(color));
  mesh.position.copy(position);
  if (flat) {
    mesh.rotation.x = -Math.PI / 2;
  }
  spawnEffect(mesh, life, (effect, t) => {
    if (!flat) {
      effect.mesh.quaternion.copy(camera.quaternion);
    }
    effect.mesh.scale.setScalar(size * (0.3 + t * 1.2));
    effect.mesh.material.opacity = 1 - t;
  });
}

function spawnSparks(position, color, count = 8, speed = 5, size = 0.07) {
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(shared.spark, effectMaterial(color));
    mesh.position.copy(position);
    const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    spawnEffect(mesh, 0.3 + Math.random() * 0.2, (effect, t, delta) => {
      effect.mesh.position.addScaledVector(velocity, delta);
      velocity.y -= 9 * delta;
      effect.mesh.scale.setScalar(size * (1 - t));
    });
  }
}

function spawnTrail(position, color, size = 0.18, life = 0.25) {
  const mesh = new THREE.Mesh(shared.spark, effectMaterial(color, 0.8));
  mesh.position.copy(position);
  spawnEffect(mesh, life, (effect, t) => {
    effect.mesh.scale.setScalar(size * (1 - t));
    effect.mesh.material.opacity = 0.8 * (1 - t);
  });
}

function spawnShockwave(position, color, radius) {
  const mesh = new THREE.Mesh(shared.torus, effectMaterial(color));
  mesh.position.set(position.x, 0.1, position.z);
  mesh.rotation.x = Math.PI / 2;
  spawnEffect(mesh, 0.45, (effect, t) => {
    effect.mesh.scale.set(radius * (0.2 + t), radius * (0.2 + t), 1 + t * 3);
    effect.mesh.material.opacity = 1 - t;
  });
  spawnRing(new THREE.Vector3(position.x, 0.06, position.z), color, { size: radius * 1.1, life: 0.4, flat: true });
}

function spawnWind(entity, color) {
  const mesh = new THREE.Mesh(shared.torus, effectMaterial(color, 0.7));
  mesh.position.set(entity.position.x, entity.position.y + 0.9 * entity.scale, entity.position.z);
  mesh.rotation.x = Math.PI / 2;
  const radius = ATTACKS.cyclone.range * 0.8;
  spawnEffect(mesh, 0.25, (effect, t) => {
    effect.mesh.scale.set(radius * (0.7 + t * 0.4), radius * (0.7 + t * 0.4), 1);
    effect.mesh.position.y += 0.02;
    effect.mesh.material.opacity = 0.7 * (1 - t);
  });
}

function updateEffects(delta) {
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    effect.life -= delta;
    const t = clamp(1 - effect.life / effect.maxLife, 0, 1);
    effect.update(effect, t, delta);
    if (effect.life <= 0) {
      scene.remove(effect.mesh);
      effect.mesh.material.dispose();
      effects.splice(i, 1);
    }
  }
}

function worldPoint(object, target = new THREE.Vector3()) {
  return object.getWorldPosition(target);
}

function chestPoint(entity, target = new THREE.Vector3()) {
  return target.set(entity.position.x, entity.position.y + 1.6 * entity.scale, entity.position.z);
}

function forwardVector(angle, target = new THREE.Vector3()) {
  return target.set(Math.sin(angle), 0, Math.cos(angle));
}

/* ------------------------------- Projectiles ------------------------------ */

function beamColors(entity, name) {
  if (name === "nova") {
    return { core: "#ffffff", glow: "#ff1f3d" };
  }
  return { core: "#ffffff", glow: entity.look.accent };
}

function spawnBeam(owner, angle, name, { speed, damageScale }) {
  const colors = beamColors(owner, name);
  const group = new THREE.Group();
  const core = new THREE.Mesh(shared.beamCore, new THREE.MeshBasicMaterial({ color: colors.core, toneMapped: false }));
  const glowMesh = new THREE.Mesh(shared.beamGlow, effectMaterial(colors.glow, 0.55));
  const head = new THREE.Mesh(shared.beamHead, effectMaterial(colors.glow, 0.85));
  core.rotation.x = Math.PI / 2;
  glowMesh.rotation.x = Math.PI / 2;
  head.position.z = 0.9;
  group.add(core, glowMesh, head);
  const light = new THREE.PointLight(colors.glow, 12, 5, 2);
  group.add(light);
  const direction = forwardVector(angle);
  group.position.set(owner.position.x, BEAM_HEIGHT, owner.position.z).addScaledVector(direction, 1.1 * owner.scale);
  group.rotation.y = angle;
  if (name === "nova") {
    group.scale.setScalar(1.25);
  }
  scene.add(group);
  projectiles.push({
    group,
    owner: owner.side,
    name,
    direction,
    speed,
    damageScale,
    life: 2.6,
    reflections: 0,
    trailTimer: 0,
    aiDecision: null,
    warned: false,
    materials: { glow: glowMesh.material, head: head.material, light },
  });
}

function removeProjectile(index) {
  const projectile = projectiles[index];
  scene.remove(projectile.group);
  projectile.materials.glow.dispose();
  projectile.materials.head.dispose();
  projectile.group.children[0].material.dispose();
  projectiles.splice(index, 1);
}

function clearProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    removeProjectile(i);
  }
}

function reflectProjectile(projectile, reflector) {
  const shooter = opponentOf(reflector);
  projectile.owner = reflector.side;
  projectile.reflections += 1;
  projectile.speed *= 1.25;
  projectile.damageScale *= 1.2;
  projectile.aiDecision = null;
  projectile.warned = false;
  projectile.life = 2.6;
  const angle = angleTo(projectile.group.position, shooter.position);
  forwardVector(angle, projectile.direction);
  projectile.group.rotation.y = angle;
  projectile.group.position.addScaledVector(projectile.direction, 0.6);
  projectile.materials.glow.color.set("#ffd84a");
  projectile.materials.head.color.set("#ffd84a");
  projectile.materials.light.color.set("#ffd84a");

  const point = projectile.group.position.clone();
  spawnRing(point, "#ffd84a", { size: 2.4, life: 0.4 });
  spawnRing(point, "#ffffff", { size: 1.2, life: 0.25 });
  spawnSparks(point, "#ffd84a", 16, 7, 0.09);
  reflector.shieldFlash = 1;
  reflector.shieldFlashColor.set("#ffd84a");
  showCallout("REFLECT!!", reflector.side, "#ffd84a");
  statusMessage.textContent =
    reflector.side === "player" ? "ビーム反射成功！ 威力アップで跳ね返した" : `${stage.name} がビームを反射した！`;
  hitStop = Math.max(hitStop, 0.1);
  shake = Math.max(shake, 0.25);
}

function updateProjectiles(delta) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    projectile.life -= delta;
    projectile.group.position.addScaledVector(projectile.direction, projectile.speed * delta);
    projectile.trailTimer -= delta;
    if (projectile.trailTimer <= 0) {
      projectile.trailTimer = 0.025;
      spawnTrail(projectile.group.position, projectile.materials.glow.color, 0.26, 0.2);
    }

    const target = projectile.owner === "player" ? enemy : player;
    const targetState = entityState(target);
    const attackerState = projectile.owner === "player" ? round.player : round.enemy;
    const position = projectile.group.position;

    if (target.side === "player" && !projectile.warned && horizontalDistance(position, target.position) < 5) {
      projectile.warned = true;
      if (phase === "fight") {
        statusMessage.textContent = "ビームが来る！ タイミングよく L で反射 / ジャンプで回避";
      }
    }

    let clashed = false;
    for (let j = projectiles.length - 1; j >= 0; j -= 1) {
      const other = projectiles[j];
      if (j !== i && other.owner !== projectile.owner && other.group.position.distanceTo(position) < 0.7) {
        spawnRing(position, "#ffffff", { size: 2.2, life: 0.35 });
        spawnSparks(position, "#ffffff", 14, 6);
        shake = Math.max(shake, 0.2);
        removeProjectile(Math.max(i, j));
        removeProjectile(Math.min(i, j));
        i = Math.min(i, j);
        clashed = true;
        break;
      }
    }
    if (clashed) {
      continue;
    }

    const heightOk = target.position.y < BEAM_HEIGHT - 0.3 && BEAM_HEIGHT < target.position.y + 2.4 * target.scale;
    if (
      phase === "fight" &&
      targetState.health > 0 &&
      heightOk &&
      horizontalDistance(position, target.position) < 0.75 * target.scale
    ) {
      const facingBeam = isFacing(target.facing, target.position, position, GUARD_ARC);
      if (resolveBeamContact(targetState, facingBeam) === "reflect") {
        reflectProjectile(projectile, target);
        continue;
      }
      const result = resolveStrike(attackerState, targetState, projectile.name, 0, {
        guardFacing: facingBeam,
        damageScale: projectile.damageScale,
      });
      onHit(projectile.owner === "player" ? player : enemy, target, result, projectile.name, position.clone());
      removeProjectile(i);
      continue;
    }

    if (projectile.life <= 0 || Math.hypot(position.x, position.z) > ARENA_RADIUS + 6) {
      removeProjectile(i);
    }
  }
}

/* --------------------------------- Combat -------------------------------- */

function onHit(attacker, defender, result, attackName, sourcePosition) {
  if (!result.hit) {
    return;
  }
  const direction = tmpVector2.set(
    defender.position.x - sourcePosition.x,
    0,
    defender.position.z - sourcePosition.z,
  );
  if (direction.lengthSq() < 0.0001) {
    forwardVector(attacker.facing, direction);
  }
  direction.normalize();
  defender.push.addScaledVector(direction, result.knockback * 9);
  const attack = ATTACKS[attackName];
  const point = chestPoint(defender, new THREE.Vector3());

  if (result.blocked) {
    defender.shieldFlash = 1;
    defender.shieldFlashColor.set("#ffffff");
    spawnRing(worldPoint(defender.shield), defender.look.accent, { size: 1.6, life: 0.25 });
    spawnSparks(worldPoint(defender.shield), "#ffffff", 6, 4);
    statusMessage.textContent = `ガード！ ${result.damage} ダメージに軽減`;
    hitStop = Math.max(hitStop, 0.04);
  } else {
    spawnRing(point, attacker.look.accent, { size: attack.special ? 2.2 : 1.3, life: 0.28 });
    spawnSparks(point, attacker.look.accent, attack.special ? 16 : 8, attack.special ? 7 : 5);
    hitStop = Math.max(hitStop, attack.special ? 0.09 : attackName === "heavy" ? 0.06 : 0.035);
    shake = Math.max(shake, attack.special ? 0.35 : attackName === "heavy" ? 0.18 : 0.08);
    if ((attackName === "dragon" || attackName === "meteor") && defender.position.y < 0.5) {
      defender.vy = attackName === "dragon" ? 7 : 5;
      defender.position.y = Math.max(defender.position.y, 0.05);
    }
    const who = attacker.side === "player" ? "" : `${stage.name} の`;
    statusMessage.textContent = `${who}${attack.special ? attack.label : attackName === "heavy" ? "HEAVY HIT" : "HIT"} · ${result.damage} ダメージ`;
  }
}

function performAttack(entity, attackName) {
  if (phase !== "fight") {
    return false;
  }
  const state = entityState(entity);
  const attack = ATTACKS[attackName];
  if (!startAttack(state, attackName)) {
    if (entity.side === "player" && attack.special && state.energy < attack.energyCost) {
      statusMessage.textContent = `${attack.label} には ENERGY ${attack.energyCost} が必要`;
    }
    return false;
  }
  const opponent = opponentOf(entity);
  entity.facing = angleTo(entity.position, opponent.position);
  entity.attackSerial += 1;
  entity.spawned = false;
  entity.slamLanded = false;
  if (attack.special) {
    const color = attackName === "nova" ? "#ff1f3d" : entity.look.accent;
    showCallout(`${entity.look.name}「${attack.label}」`, entity.side, color);
    spawnRing(new THREE.Vector3(entity.position.x, 0.05, entity.position.z), color, { size: 2.2, life: 0.4, flat: true });
    spawnSparks(chestPoint(entity), color, 10, 3);
  }
  return true;
}

function tryMeleeHit(entity, attackName) {
  const state = entityState(entity);
  const opponent = opponentOf(entity);
  const opponentState = entityState(opponent);
  const attack = ATTACKS[attackName];
  if (Math.abs(entity.position.y - opponent.position.y) > 1.9 * Math.max(entity.scale, opponent.scale)) {
    return;
  }
  const reachBonus = (entity.scale - 1) * 0.9 + (opponent.scale - 1) * 0.5;
  const distance = Math.max(0, horizontalDistance(entity.position, opponent.position) - reachBonus);
  const angle = attack.arc >= Math.PI ? 0 : angleDifference(entity.facing, angleTo(entity.position, opponent.position));
  const result = resolveStrike(state, opponentState, attackName, distance, {
    angle,
    guardFacing: isFacing(opponent.facing, opponent.position, entity.position, GUARD_ARC),
    damageScale: entity.damageScale,
  });
  if (result.hit) {
    state.hitApplied = true;
    onHit(entity, opponent, result, attackName, entity.position);
  }
}

function moveForward(entity, speed, delta, stopDistance = 0) {
  const opponent = opponentOf(entity);
  if (stopDistance > 0 && horizontalDistance(entity.position, opponent.position) < stopDistance) {
    return;
  }
  entity.position.addScaledVector(forwardVector(entity.facing, tmpVector), speed * delta);
}

/** Drives attack-specific motion and hit timing. Returns true if the attack controls height. */
function updateAttack(entity, delta) {
  const state = entityState(entity);
  const name = state.currentAttack;
  const attack = ATTACKS[name];
  const current = attackPhase(state);
  entity.orb.visible = false;
  if (!attack || !current) {
    return false;
  }
  const e = state.attackElapsed;
  const w = attack.windup;

  switch (attack.kind) {
    case "melee": {
      if (current !== "recovery") {
        moveForward(entity, name === "heavy" ? 1.8 : 2.4, delta, 1.3);
      }
      if (current === "active" && !state.hitApplied) {
        tryMeleeHit(entity, name);
      }
      return false;
    }
    case "beam": {
      if (current === "windup") {
        const hands = worldPoint(entity.model.userData.armR.hand, tmpVector)
          .add(worldPoint(entity.model.userData.armL.hand, tmpVector2))
          .multiplyScalar(0.5);
        showOrb(entity, hands, entity.look.accent, 0.08 + (e / w) * 0.3);
      } else if (!entity.spawned) {
        entity.spawned = true;
        spawnBeam(entity, entity.facing, "beam", { speed: attack.speed, damageScale: entity.damageScale });
        spawnRing(chestPoint(entity).addScaledVector(forwardVector(entity.facing, tmpVector), 1), entity.look.accent, {
          size: 1.6,
        });
        shake = Math.max(shake, 0.12);
      }
      return false;
    }
    case "spin": {
      if (current !== "recovery") {
        moveForward(entity, attack.travelSpeed, delta, 0.9);
        entity.trailTimer -= delta;
        if (current === "active" && entity.trailTimer <= 0) {
          entity.trailTimer = 0.06;
          spawnWind(entity, entity.look.accent);
          spawnTrail(worldPoint(entity.model.userData.legL.foot, tmpVector), entity.look.accent, 0.3, 0.3);
        }
      }
      if (current === "active" && !state.hitApplied) {
        tryMeleeHit(entity, name);
      }
      return false;
    }
    case "dash": {
      const riseT = clamp((e - w) / (attack.duration - w), 0, 1);
      if (e < w + attack.active * 0.5) {
        moveForward(entity, attack.travelSpeed, delta, 1.0);
      }
      entity.position.y = attack.riseHeight * Math.sin(Math.PI * riseT);
      entity.vy = 0;
      if (current === "active") {
        entity.trailTimer -= delta;
        if (entity.trailTimer <= 0) {
          entity.trailTimer = 0.02;
          spawnTrail(worldPoint(entity.model.userData.armR.hand, tmpVector), entity.look.accent, 0.35, 0.35);
          spawnTrail(worldPoint(entity.model.userData.armR.hand, tmpVector), "#ff8a3d", 0.22, 0.25);
        }
        if (!state.hitApplied) {
          tryMeleeHit(entity, name);
        }
      }
      return true;
    }
    case "slam": {
      const opponent = opponentOf(entity);
      if (current === "windup") {
        const rise = e / w;
        entity.position.y = attack.riseHeight * (1 - (1 - rise) * (1 - rise));
        entity.facing = angleTo(entity.position, opponent.position);
        moveForward(entity, attack.travelSpeed, delta, 0.8);
      } else if (current === "active") {
        const dive = clamp((e - w) / attack.active, 0, 1);
        entity.position.y = attack.riseHeight * (1 - dive);
        spawnTrail(worldPoint(entity.model.userData.armR.hand, tmpVector), entity.look.accent, 0.4, 0.3);
      } else {
        entity.position.y = 0;
      }
      if (e >= w + attack.active * 0.85 && !entity.slamLanded) {
        entity.slamLanded = true;
        entity.position.y = 0;
        spawnShockwave(entity.position, entity.look.accent, attack.range);
        spawnSparks(new THREE.Vector3(entity.position.x, 0.2, entity.position.z), entity.look.accent, 18, 8);
        shake = Math.max(shake, 0.4);
        if (!state.hitApplied) {
          tryMeleeHit(entity, name);
        }
      }
      entity.vy = 0;
      return true;
    }
    case "nova": {
      const opponent = opponentOf(entity);
      const lift = current === "recovery" ? 1 - clamp((e - w - attack.active) / 0.3, 0, 1) : clamp(e / 0.3, 0, 1);
      entity.position.y = 0.8 * lift;
      entity.vy = 0;
      if (current === "windup") {
        entity.facing = angleTo(entity.position, opponent.position);
        tmpVector.set(entity.position.x, entity.position.y + 3.7 * entity.scale, entity.position.z);
        showOrb(entity, tmpVector, "#ff1f3d", 0.2 + (e / w) * 0.75, "#1a0006");
        if (Math.random() < 0.5) {
          const angle = Math.random() * Math.PI * 2;
          spawnTrail(
            tmpVector2.set(tmpVector.x + Math.sin(angle) * 2, tmpVector.y - 1 + Math.random() * 2, tmpVector.z + Math.cos(angle) * 2),
            "#ff1f3d",
            0.15,
            0.3,
          );
        }
      } else if (!entity.spawned) {
        entity.spawned = true;
        const base = angleTo(entity.position, opponent.position);
        for (let i = 0; i < attack.beams; i += 1) {
          const offset = attack.beams === 1 ? 0 : -attack.spread / 2 + (attack.spread * i) / (attack.beams - 1);
          spawnBeam(entity, base + offset, "nova", { speed: attack.speed, damageScale: entity.damageScale });
        }
        spawnRing(chestPoint(entity), "#ff1f3d", { size: 4, life: 0.5 });
        spawnShockwave(entity.position, "#ff1f3d", 4);
        shake = Math.max(shake, 0.5);
      }
      return true;
    }
    default:
      return false;
  }
}

function showOrb(entity, position, color, size, coreColor = "#ffffff") {
  const orb = entity.orb;
  orb.visible = true;
  orb.position.copy(position);
  const flicker = 1 + Math.sin(elapsedTime * 40) * 0.08;
  orb.scale.setScalar(size * flicker);
  orb.userData.core.material.color.set(coreColor);
  orb.userData.halo.material.color.set(color);
  orb.userData.light.color.set(color);
  orb.userData.light.intensity = 10 + size * 20;
}

/* --------------------------------- Update -------------------------------- */

function turnToward(entity, targetAngle, rate, delta) {
  entity.facing += angleDifference(entity.facing, targetAngle) * Math.min(1, rate * delta);
}

function readMoveInput() {
  const x = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const z = Number(keys.has("KeyS") || keys.has("ArrowDown")) - Number(keys.has("KeyW") || keys.has("ArrowUp"));
  const length = Math.hypot(x, z);
  return length > 0 ? { x: x / length, z: z / length } : null;
}

function updatePlayer(delta) {
  const state = round.player;
  const free = phase === "fight" && state.health > 0 && state.hitStun <= 0 && !state.currentAttack;
  state.guarding = free && keys.has("KeyL") && !state.airborne;
  const input = free ? readMoveInput() : null;
  player.moving = Boolean(input);
  player.speedRatio = input ? (state.guarding ? 0.35 : 1) : 0;

  if (state.guarding) {
    turnToward(player, angleTo(player.position, enemy.position), 14, delta);
  }
  if (input) {
    const speed = state.guarding ? GUARD_WALK_SPEED : PLAYER_SPEED;
    player.position.x += input.x * speed * delta;
    player.position.z += input.z * speed * delta;
    if (!state.guarding) {
      turnToward(player, Math.atan2(input.x, input.z), 14, delta);
    }
  } else if (free && !state.guarding && !state.airborne) {
    turnToward(player, angleTo(player.position, enemy.position), 4, delta);
  }
}

function aiEligibleSpecials(distance, energy) {
  return stage.specials.filter((name) => {
    const attack = ATTACKS[name];
    if (energy < attack.energyCost || name === "nova") {
      return false;
    }
    if (name === "beam") return distance >= 3.2;
    if (name === "cyclone") return distance <= 2.8;
    if (name === "dragon") return distance <= 3.4;
    if (name === "meteor") return distance >= 2.2 && distance <= 7;
    return true;
  });
}

function updateEnemy(delta) {
  const state = round.enemy;
  const playerState = round.player;
  const stats = stage.ai;
  if (phase !== "fight" || state.health <= 0) {
    state.guarding = false;
    enemy.moving = false;
    enemy.speedRatio = 0;
    return;
  }

  const distance = horizontalDistance(enemy.position, player.position);
  const toPlayer = angleTo(enemy.position, player.position);
  ai.think -= delta;
  ai.guardTimer = Math.max(0, ai.guardTimer - delta);
  ai.strafeTimer -= delta;
  if (ai.strafeTimer <= 0) {
    ai.strafeTimer = 1 + Math.random() * 1.6;
    ai.strafeDir = Math.random() < 0.5 ? -1 : 1;
  }

  // React to incoming beams: reflect, guard or jump depending on skill.
  for (const projectile of projectiles) {
    if (projectile.owner !== "player") continue;
    const beamDistance = horizontalDistance(projectile.group.position, enemy.position);
    const toEnemy = tmpVector.set(enemy.position.x - projectile.group.position.x, 0, enemy.position.z - projectile.group.position.z).normalize();
    if (projectile.direction.dot(toEnemy) < 0.85 || beamDistance > 7) continue;
    if (!projectile.aiDecision) {
      const roll = Math.random();
      projectile.aiDecision =
        roll < stats.reflect ? "reflect" : roll < stats.reflect + stats.guard * 0.8 ? "guard" : roll < stats.reflect + stats.guard * 0.8 + 0.25 ? "jump" : "none";
    }
    if (state.hitStun > 0 || state.currentAttack) continue;
    const reactDistance = 0.8 + projectile.speed * 0.1;
    if (projectile.aiDecision === "reflect" && beamDistance < reactDistance) {
      enemy.facing = angleTo(enemy.position, projectile.group.position);
      pressReflect(state);
      projectile.aiDecision = "done";
    } else if (projectile.aiDecision === "guard" && beamDistance < 4) {
      ai.guardTimer = 0.5;
    } else if (projectile.aiDecision === "jump" && beamDistance < 1.4 + projectile.speed * 0.12 && !state.airborne) {
      enemy.vy = JUMP_VELOCITY;
      enemy.position.y = 0.01;
      projectile.aiDecision = "done";
    }
  }

  // React to melee attacks.
  if (playerState.currentAttack && player.attackSerial !== ai.lastSeenAttack && distance < 3.4) {
    ai.lastSeenAttack = player.attackSerial;
    if (Math.random() < stats.guard && ATTACKS[playerState.currentAttack].kind !== "beam") {
      ai.guardTimer = 0.45 + Math.random() * 0.2;
    }
  }

  const canAct = state.hitStun <= 0 && !state.currentAttack;
  state.guarding = canAct && ai.guardTimer > 0 && !state.airborne;
  enemy.moving = false;
  enemy.speedRatio = 0;

  if (!canAct) {
    return;
  }
  turnToward(enemy, toPlayer, state.guarding ? 14 : 8, delta);
  if (state.guarding) {
    return;
  }

  let forward = 0;
  if (distance > 1.7) forward = distance > 5 ? 1 : 0.75;
  else if (distance < 1.1) forward = -0.6;
  const strafe = ai.strafeDir * stats.strafe * (distance < 5 ? 1 : 0.4);
  const move = tmpVector.set(Math.sin(toPlayer) * forward + Math.cos(toPlayer) * strafe, 0, Math.cos(toPlayer) * forward - Math.sin(toPlayer) * strafe);
  if (move.lengthSq() > 0.01) {
    const length = Math.min(1, move.length());
    move.normalize();
    enemy.position.addScaledVector(move, stage.moveSpeed * length * delta);
    enemy.moving = true;
    enemy.speedRatio = length;
  }

  if (ai.think > 0) {
    return;
  }
  ai.think = stats.reaction * (0.6 + Math.random() * 0.8);
  const lowHealth = state.health / state.maxHealth < 0.5;
  if (
    stage.signature &&
    state.energy >= ATTACKS[stage.signature].energyCost &&
    distance > 2.5 &&
    Math.random() < (lowHealth ? 0.7 : 0.4)
  ) {
    performAttack(enemy, stage.signature);
    return;
  }
  const specials = aiEligibleSpecials(distance, state.energy);
  if (specials.length && Math.random() < stats.specialRate) {
    performAttack(enemy, specials[Math.floor(Math.random() * specials.length)]);
  } else if (distance <= ATTACKS.heavy.range + 0.3 && Math.random() < 0.35 + stats.aggression * 0.6) {
    performAttack(enemy, Math.random() < 0.4 ? "heavy" : "light");
  } else if (distance <= ATTACKS.light.range + 0.2) {
    performAttack(enemy, "light");
  }
}

function updatePhysics(entity, delta, attackControlsHeight) {
  const state = entityState(entity);
  if (!attackControlsHeight) {
    if (entity.position.y > 0 || entity.vy !== 0) {
      entity.vy -= GRAVITY * delta;
      entity.position.y += entity.vy * delta;
      if (entity.position.y <= 0) {
        entity.position.y = 0;
        entity.vy = 0;
      }
    }
  }
  state.airborne = entity.position.y > 0.05;
  entity.position.addScaledVector(entity.push, delta);
  entity.push.multiplyScalar(Math.exp(-8 * delta));
  const radius = Math.hypot(entity.position.x, entity.position.z);
  if (radius > ARENA_RADIUS) {
    entity.position.x *= ARENA_RADIUS / radius;
    entity.position.z *= ARENA_RADIUS / radius;
  }
}

function preventOverlap() {
  const dx = enemy.position.x - player.position.x;
  const dz = enemy.position.z - player.position.z;
  const distance = Math.hypot(dx, dz);
  const minimum = 0.5 * (player.scale + enemy.scale) * 0.9;
  if (distance < minimum && Math.abs(player.position.y - enemy.position.y) < 1.5) {
    const nx = distance > 0.001 ? dx / distance : 1;
    const nz = distance > 0.001 ? dz / distance : 0;
    const correction = (minimum - distance) / 2;
    player.position.x -= nx * correction;
    player.position.z -= nz * correction;
    enemy.position.x += nx * correction;
    enemy.position.z += nz * correction;
  }
}

function updateShield(entity, delta) {
  const state = entityState(entity);
  const reflectReady = state.reflectTimer > 0;
  const target = state.guarding || reflectReady ? 1 : 0;
  const current = entity.shield.scale.x;
  const next = current + (target - current) * Math.min(1, delta * 18);
  entity.shield.scale.setScalar(Math.max(0.001, next));
  entity.shield.visible = next > 0.02;
  entity.shieldFlash = Math.max(0, entity.shieldFlash - delta * 4);
  const { parts, baseOpacity, color } = entity.shield.userData;
  const pulse = 0.85 + Math.sin(elapsedTime * 12) * 0.15;
  parts.forEach((mesh, index) => {
    mesh.material.color.copy(color);
    if (reflectReady) {
      mesh.material.color.set("#ffd84a");
    }
    mesh.material.color.lerp(entity.shieldFlashColor, entity.shieldFlash);
    mesh.material.opacity = Math.min(1, baseOpacity[index] * pulse + entity.shieldFlash * 0.6);
  });
  entity.shield.userData.parts[2].rotation.z += delta * 2;
}

function animateEntity(entity, delta, elapsed) {
  const state = entityState(entity);
  entity.model.rotation.y = entity.facing;
  const ko = state.health <= 0 && phase !== "title" && phase !== "stageIntro";
  const victory = phase === "roundEnd" && roundWinner === entity.side && phaseTimer < 2.1;
  const target = computePose(state, { moving: entity.moving, speedRatio: entity.speedRatio, elapsed, ko, victory });
  applyPose(entity.model, target, delta, state.currentAttack ? 24 : 14);
  animateCloth(entity.model, elapsed, entity.speedRatio);
  updateShield(entity, delta);
}

function updateCamera(delta) {
  const mid = tmpVector.set(
    (player.position.x + enemy.position.x) / 2,
    0,
    (player.position.z + enemy.position.z) / 2,
  );
  const distance = horizontalDistance(player.position, enemy.position);
  const desired = tmpVector2.set(mid.x * 0.85, 5.2 + distance * 0.32, mid.z * 0.75 + 7.2 + distance * 0.5);
  camera.position.lerp(desired, 1 - Math.exp(-4 * delta));
  cameraTarget.lerp(mid.setY(1.3), 1 - Math.exp(-6 * delta));
  camera.lookAt(cameraTarget);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - delta * 1.8);
  }
}

function updatePhase(delta) {
  if (phase === "intro") {
    phaseTimer -= delta;
    if (!fightAnnounced && phaseTimer <= 0.8) {
      fightAnnounced = true;
      setAnnouncement("FIGHT!", 0.9);
    }
    if (phaseTimer <= 0) {
      phase = "fight";
      round.running = true;
    }
  } else if (phase === "roundEnd") {
    phaseTimer -= delta;
    if (phaseTimer <= 0) {
      if (series.winner) {
        showMatchResult();
      } else {
        startRound();
      }
    }
  }
}

function animate() {
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.033);
  const elapsed = timer.getElapsed();
  elapsedTime = elapsed;
  let simDelta = delta;
  if (hitStop > 0) {
    hitStop = Math.max(0, hitStop - delta);
    simDelta = delta * 0.08;
  }

  const winner = advanceRound(round, simDelta);
  if (winner && phase === "fight") {
    endRound(winner);
  }
  updatePhase(simDelta);
  updatePlayer(simDelta);
  updateEnemy(simDelta);
  const playerHeight = updateAttack(player, simDelta);
  const enemyHeight = updateAttack(enemy, simDelta);
  updatePhysics(player, simDelta, playerHeight);
  updatePhysics(enemy, simDelta, enemyHeight);
  preventOverlap();
  updateProjectiles(simDelta);
  animateEntity(player, simDelta, elapsed);
  animateEntity(enemy, simDelta, elapsed);
  updateEffects(simDelta);
  updateCamera(delta);

  arenaParts.caps.forEach((cap) => {
    cap.rotation.y += delta * 1.5;
    cap.position.y = 4.75 + Math.sin(elapsed * 2 + cap.userData.phase) * 0.12;
  });

  if (announcementTimer > 0) {
    announcementTimer = Math.max(0, announcementTimer - delta);
    if (announcementTimer === 0) announcement.classList.remove("visible");
  }
  if (calloutTimer > 0) {
    calloutTimer = Math.max(0, calloutTimer - delta);
    if (calloutTimer === 0) callout.classList.remove("visible");
  }
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

/* --------------------------------- Input --------------------------------- */

function handleAction(code) {
  if (!overlay.classList.contains("hidden")) {
    if (code === "Enter" && primaryAction) primaryAction();
    return;
  }
  if (phase !== "fight") {
    return;
  }
  const state = round.player;
  if (code === "KeyJ") {
    performAttack(player, "light");
  } else if (code === "KeyK") {
    performAttack(player, "heavy");
  } else if (SPECIAL_KEYS[code]) {
    performAttack(player, SPECIAL_KEYS[code]);
  } else if (code === "KeyL") {
    pressReflect(state);
  } else if (code === "Space" && !state.airborne && state.hitStun <= 0 && !state.currentAttack && state.health > 0) {
    player.vy = JUMP_VELOCITY;
    player.position.y = 0.01;
    state.guarding = false;
  }
}

window.addEventListener("keydown", (event) => {
  if (GAME_KEYS.has(event.code)) {
    event.preventDefault();
  }
  if (!event.repeat && !keys.has(event.code)) {
    handleAction(event.code);
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startButton.addEventListener("click", () => primaryAction?.());
secondaryButton.addEventListener("click", () => secondaryAction?.());

showTitle();
animate();
document.documentElement.dataset.game = "ready";
