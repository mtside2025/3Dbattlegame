import "./style.css";
import * as THREE from "three";
import {
  ATTACKS,
  FIGHTER_MAX_HEALTH,
  MAX_ENERGY,
  advanceMatch,
  clamp,
  createMatchState,
  resolveStrike,
  startAttack,
} from "./combat.js";

const ARENA_LIMIT = 8.4;
const GRAVITY = 23;
const PLAYER_SPEED = 5.2;
const app = document.querySelector("#app");
const overlay = document.querySelector("#overlay");
const overlayEyebrow = document.querySelector("#overlay-eyebrow");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const startButton = document.querySelector("#start-button");
const playerHealthBar = document.querySelector("#player-health");
const enemyHealthBar = document.querySelector("#enemy-health");
const playerEnergyBar = document.querySelector("#player-energy");
const enemyEnergyBar = document.querySelector("#enemy-energy");
const timerDisplay = document.querySelector("#timer");
const announcement = document.querySelector("#announcement");
const statusMessage = document.querySelector("#status-message");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#080916");
scene.fog = new THREE.Fog("#151126", 19, 42);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 5.2, 14.5);
camera.lookAt(0, 2, 0);

const clock = new THREE.Clock();
const keys = new Set();
const projectiles = [];
let match = createMatchState();
let playerVelocityY = 0;
let enemyThinkTimer = 0;
let enemyGuardTimer = 0;
let announcementTimer = 0;

scene.add(new THREE.HemisphereLight("#8ba8ff", "#1b1025", 2.1));
const keyLight = new THREE.DirectionalLight("#fff4e6", 3.2);
keyLight.position.set(-5, 11, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const leftGlow = new THREE.PointLight("#247cff", 45, 18, 2);
leftGlow.position.set(-8, 4, 2);
scene.add(leftGlow);
const rightGlow = new THREE.PointLight("#ff315d", 45, 18, 2);
rightGlow.position.set(8, 4, 2);
scene.add(rightGlow);

function addArena() {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(22, 0.45, 7),
    new THREE.MeshStandardMaterial({
      color: "#202638",
      metalness: 0.58,
      roughness: 0.38,
    }),
  );
  floor.position.y = -0.28;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(22, 22, "#647aff", "#343a57");
  grid.position.y = -0.045;
  scene.add(grid);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: "#405072",
    emissive: "#182343",
    emissiveIntensity: 0.6,
    metalness: 0.8,
    roughness: 0.25,
  });
  for (const z of [-2.8, 2.8]) {
    for (const y of [0.8, 1.55, 2.3]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 20, 10), railMaterial);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, y, z);
      scene.add(rail);
    }
  }

  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: "#121629",
    emissive: "#080b18",
    roughness: 0.8,
  });
  const windowMaterial = new THREE.MeshBasicMaterial({ color: "#ffd46b" });
  for (let i = 0; i < 18; i += 1) {
    const width = 1.1 + Math.random() * 1.6;
    const height = 2.8 + Math.random() * 6;
    const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, 2), buildingMaterial);
    building.position.set(-14 + i * 1.65, height / 2, -8 - Math.random() * 3);
    scene.add(building);

    for (let row = 1; row < height - 0.5; row += 0.9) {
      if (Math.random() > 0.32) {
        const windowLight = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), windowMaterial);
        windowLight.position.set(building.position.x, row, building.position.z + 1.01);
        scene.add(windowLight);
      }
    }
  }

  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 48),
    new THREE.MeshBasicMaterial({ color: "#756cff", transparent: true, opacity: 0.7 }),
  );
  moon.position.set(6.8, 8.5, -12);
  scene.add(moon);

  const crowdGeometry = new THREE.BufferGeometry();
  const crowdPositions = [];
  for (let i = 0; i < 90; i += 1) {
    crowdPositions.push((Math.random() - 0.5) * 21, 0.5 + Math.random() * 1.3, -4.2);
  }
  crowdGeometry.setAttribute("position", new THREE.Float32BufferAttribute(crowdPositions, 3));
  scene.add(
    new THREE.Points(
      crowdGeometry,
      new THREE.PointsMaterial({ color: "#7ddfff", size: 0.1, transparent: true, opacity: 0.8 }),
    ),
  );
}

function makeFighter({ color, accent, skin, name }) {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  const suit = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.17,
    roughness: 0.48,
    metalness: 0.16,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.5,
    roughness: 0.35,
  });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#14131d", roughness: 0.65 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.35, 0.72), suit);
  torso.position.y = 2.05;
  torso.castShadow = true;
  model.add(torso);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.18, 0.77), accentMaterial);
  belt.position.y = 1.42;
  model.add(belt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 20), skinMaterial);
  head.position.y = 3.08;
  head.castShadow = true;
  model.add(head);

  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.55, 7), darkMaterial);
  hair.position.y = 3.48;
  hair.rotation.z = 0.12;
  model.add(hair);

  const limbs = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.68, 2.45, 0);
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.65, 5, 10), skinMaterial);
    upperArm.position.y = -0.43;
    upperArm.castShadow = true;
    arm.add(upperArm);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), accentMaterial);
    glove.position.y = -0.92;
    arm.add(glove);
    arm.rotation.z = side * -0.35;
    model.add(arm);
    limbs[side < 0 ? "backArm" : "frontArm"] = arm;

    const leg = new THREE.Group();
    leg.position.set(side * 0.3, 1.28, 0);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.85, 5, 10), suit);
    shin.position.y = -0.57;
    shin.castShadow = true;
    leg.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.72), darkMaterial);
    boot.position.set(0, -1.12, 0.13);
    boot.castShadow = true;
    leg.add(boot);
    model.add(leg);
    limbs[side < 0 ? "backLeg" : "frontLeg"] = leg;
  }

  root.userData = { model, torso, ...limbs, name, baseColor: color };
  return root;
}

function makeImpact(color) {
  const impact = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.5, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  impact.visible = false;
  impact.userData.timer = 0;
  scene.add(impact);
  return impact;
}

addArena();
const player = makeFighter({
  color: "#1769ff",
  accent: "#61efff",
  skin: "#d69a72",
  name: "KAI",
});
const enemy = makeFighter({
  color: "#b5163e",
  accent: "#ffcf52",
  skin: "#c98368",
  name: "VIPER",
});
scene.add(player, enemy);
const playerImpact = makeImpact("#77f7ff");
const enemyImpact = makeImpact("#ffbc62");

function positionFighters() {
  player.position.set(-3.5, 0, 0);
  enemy.position.set(3.5, 0, 0);
  player.userData.model.rotation.y = Math.PI / 2;
  enemy.userData.model.rotation.y = -Math.PI / 2;
}

function setAnnouncement(text, duration = 0.8) {
  announcement.textContent = text;
  announcement.classList.add("visible");
  announcementTimer = duration;
}

function updateHud() {
  playerHealthBar.style.width = `${(match.player.health / FIGHTER_MAX_HEALTH) * 100}%`;
  enemyHealthBar.style.width = `${(match.enemy.health / FIGHTER_MAX_HEALTH) * 100}%`;
  playerEnergyBar.style.width = `${(match.player.energy / MAX_ENERGY) * 100}%`;
  enemyEnergyBar.style.width = `${(match.enemy.energy / MAX_ENERGY) * 100}%`;
  timerDisplay.textContent = String(Math.ceil(match.timeRemaining)).padStart(2, "0");
  playerEnergyBar.parentElement.classList.toggle("ready", match.player.energy >= ATTACKS.special.energyCost);
  enemyEnergyBar.parentElement.classList.toggle("ready", match.enemy.energy >= ATTACKS.special.energyCost);
}

function resetMatch() {
  match = createMatchState();
  match.running = true;
  playerVelocityY = 0;
  enemyThinkTimer = 0;
  enemyGuardTimer = 0;
  keys.clear();
  projectiles.splice(0).forEach(({ mesh }) => scene.remove(mesh));
  positionFighters();
  player.rotation.set(0, 0, 0);
  enemy.rotation.set(0, 0, 0);
  statusMessage.textContent = "相手の間合いを見極めろ";
  overlay.classList.add("hidden");
  setAnnouncement("FIGHT!", 1.1);
  updateHud();
}

function showResult(winner) {
  overlayEyebrow.textContent = "ROUND COMPLETE";
  overlayTitle.textContent =
    winner === "draw" ? "DRAW" : winner === "player" ? "YOU WIN" : "YOU LOSE";
  overlayCopy.textContent =
    winner === "player"
      ? "勝利！ 間合いとガードを活かして相手を制しました。"
      : winner === "draw"
        ? "引き分け。攻めのタイミングを変えて再挑戦しましょう。"
        : "敗北…。ガードで攻撃をしのぎ、反撃の隙を狙いましょう。";
  startButton.textContent = "再戦する";
  overlay.classList.remove("hidden");
  setAnnouncement(winner === "draw" ? "TIME UP" : "K.O.", 1.4);
}

function triggerImpact(impact, target, blocked) {
  impact.position.set(target.position.x, 2.1, 0.75);
  impact.scale.setScalar(blocked ? 0.65 : 1);
  impact.material.opacity = 1;
  impact.visible = true;
  impact.userData.timer = 0.2;
}

function applyMeleeAttack(attackerObject, defenderObject, attackerState, defenderState, attackName) {
  const distance = Math.abs(attackerObject.position.x - defenderObject.position.x);
  const result = resolveStrike(attackerState, defenderState, attackName, distance);
  if (!result.hit) {
    return;
  }

  const direction = Math.sign(defenderObject.position.x - attackerObject.position.x) || 1;
  defenderObject.position.x = clamp(
    defenderObject.position.x + direction * result.knockback,
    -ARENA_LIMIT,
    ARENA_LIMIT,
  );
  triggerImpact(attackerObject === player ? playerImpact : enemyImpact, defenderObject, result.blocked);
  statusMessage.textContent = result.blocked
    ? `ガード！ ${result.damage} ダメージ`
    : `${attackName === "heavy" ? "HEAVY HIT" : "HIT"} · ${result.damage} ダメージ`;
}

function createProjectile(owner, direction) {
  const isPlayer = owner === "player";
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16),
    new THREE.MeshStandardMaterial({
      color: isPlayer ? "#76f6ff" : "#ff9d45",
      emissive: isPlayer ? "#2fdfff" : "#ff4f24",
      emissiveIntensity: 2.5,
      transparent: true,
      opacity: 0.9,
    }),
  );
  const source = isPlayer ? player : enemy;
  mesh.position.set(source.position.x + direction * 1.1, 1.75, 0);
  mesh.add(
    new THREE.PointLight(isPlayer ? "#52eaff" : "#ff5b36", 8, 3, 2),
  );
  scene.add(mesh);
  projectiles.push({ mesh, owner, direction, life: 2.4 });
}

function performAttack(isPlayer, attackName) {
  if (!match.running) {
    return false;
  }

  const attackerState = isPlayer ? match.player : match.enemy;
  const defenderState = isPlayer ? match.enemy : match.player;
  const attackerObject = isPlayer ? player : enemy;
  const defenderObject = isPlayer ? enemy : player;
  if (!startAttack(attackerState, attackName)) {
    if (isPlayer && attackName === "special" && attackerState.energy < ATTACKS.special.energyCost) {
      statusMessage.textContent = "スペシャルには ENERGY 40 が必要";
    }
    return false;
  }

  if (attackName === "special") {
    const direction = Math.sign(defenderObject.position.x - attackerObject.position.x) || 1;
    createProjectile(isPlayer ? "player" : "enemy", direction);
    statusMessage.textContent = isPlayer ? "NEON WAVE!" : "DANGER WAVE!";
  } else {
    applyMeleeAttack(attackerObject, defenderObject, attackerState, defenderState, attackName);
  }
  return true;
}

function updatePlayer(delta) {
  const state = match.player;
  state.guarding =
    match.running &&
    keys.has("KeyS") &&
    !state.airborne &&
    state.hitStun <= 0 &&
    state.attackTimer <= 0;

  if (match.running && state.hitStun <= 0 && state.attackTimer <= 0 && !state.guarding) {
    const movement = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
    player.position.x += movement * PLAYER_SPEED * delta;
  }

  if (state.airborne) {
    playerVelocityY -= GRAVITY * delta;
    player.position.y += playerVelocityY * delta;
    if (player.position.y <= 0) {
      player.position.y = 0;
      playerVelocityY = 0;
      state.airborne = false;
    }
  }

  player.position.x = clamp(player.position.x, -ARENA_LIMIT, ARENA_LIMIT);
}

function updateEnemy(delta) {
  if (!match.running) {
    match.enemy.guarding = false;
    return;
  }

  const state = match.enemy;
  const distance = Math.abs(player.position.x - enemy.position.x);
  const direction = Math.sign(player.position.x - enemy.position.x) || -1;
  enemyThinkTimer -= delta;
  enemyGuardTimer = Math.max(0, enemyGuardTimer - delta);

  if (
    match.player.attackTimer > 0 &&
    distance < 2.35 &&
    state.attackTimer <= 0 &&
    state.hitStun <= 0 &&
    Math.random() < delta * 6
  ) {
    enemyGuardTimer = 0.35;
  }
  state.guarding = enemyGuardTimer > 0 && state.attackTimer <= 0 && state.hitStun <= 0;

  if (state.hitStun <= 0 && state.attackTimer <= 0 && !state.guarding) {
    if (distance > 1.55) {
      enemy.position.x += direction * (distance > 4 ? 3.7 : 2.45) * delta;
    } else if (distance < 1.05) {
      enemy.position.x -= direction * 1.5 * delta;
    }

    if (enemyThinkTimer <= 0) {
      enemyThinkTimer = 0.3 + Math.random() * 0.35;
      if (state.energy >= ATTACKS.special.energyCost && distance > 2.7 && Math.random() < 0.42) {
        performAttack(false, "special");
      } else if (distance <= ATTACKS.heavy.range && Math.random() < 0.42) {
        performAttack(false, "heavy");
      } else if (distance <= ATTACKS.light.range) {
        performAttack(false, "light");
      }
    }
  }

  enemy.position.x = clamp(enemy.position.x, -ARENA_LIMIT, ARENA_LIMIT);
}

function updateProjectiles(delta, elapsed) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    projectile.life -= delta;
    projectile.mesh.position.x += projectile.direction * delta * 7.5;
    projectile.mesh.rotation.y += delta * 8;
    const targetObject = projectile.owner === "player" ? enemy : player;
    const targetState = projectile.owner === "player" ? match.enemy : match.player;
    const attackerState = projectile.owner === "player" ? match.player : match.enemy;

    if (
      match.running &&
      Math.abs(projectile.mesh.position.x - targetObject.position.x) < 0.65 &&
      Math.abs(projectile.mesh.position.y - (targetObject.position.y + 1.7)) < 1.2
    ) {
      const result = resolveStrike(attackerState, targetState, "special", 0);
      const direction = projectile.direction;
      targetObject.position.x = clamp(
        targetObject.position.x + direction * result.knockback,
        -ARENA_LIMIT,
        ARENA_LIMIT,
      );
      triggerImpact(projectile.owner === "player" ? playerImpact : enemyImpact, targetObject, result.blocked);
      statusMessage.textContent = result.blocked
        ? `スペシャルをガード · ${result.damage} ダメージ`
        : `SPECIAL HIT · ${result.damage} ダメージ`;
      scene.remove(projectile.mesh);
      projectiles.splice(i, 1);
      continue;
    }

    if (
      projectile.life <= 0 ||
      Math.abs(projectile.mesh.position.x) > ARENA_LIMIT + 1
    ) {
      scene.remove(projectile.mesh);
      projectiles.splice(i, 1);
    } else {
      projectile.mesh.position.y = 1.75 + Math.sin(elapsed * 14) * 0.08;
    }
  }
}

function animateFighter(object, state, elapsed, isEnemy = false) {
  const { model, torso, frontArm, backArm, frontLeg, backLeg } = object.userData;
  const direction = isEnemy ? -1 : 1;
  model.rotation.y = direction * Math.PI / 2;

  const walking =
    match.running &&
    state.hitStun <= 0 &&
    state.attackTimer <= 0 &&
    !state.guarding &&
    (isEnemy || keys.has("KeyA") || keys.has("KeyD"));
  const stride = walking ? Math.sin(elapsed * 9) * 0.45 : 0;
  frontLeg.rotation.z = THREE.MathUtils.lerp(frontLeg.rotation.z, stride, 0.2);
  backLeg.rotation.z = THREE.MathUtils.lerp(backLeg.rotation.z, -stride, 0.2);
  torso.rotation.z = THREE.MathUtils.lerp(
    torso.rotation.z,
    state.hitStun > 0 ? -direction * 0.18 : state.guarding ? direction * -0.12 : 0,
    0.25,
  );

  let frontArmTarget = -0.35;
  let backArmTarget = 0.35;
  if (state.guarding) {
    frontArmTarget = direction * -1.45;
    backArmTarget = direction * -1.05;
  } else if (state.currentAttack === "light") {
    frontArmTarget = direction * 1.55;
  } else if (state.currentAttack === "heavy") {
    frontArmTarget = direction * 2.1;
    backArmTarget = direction * 0.9;
  } else if (state.currentAttack === "special") {
    frontArmTarget = direction * 1.3;
    backArmTarget = direction * 1.3;
  }
  frontArm.rotation.z = THREE.MathUtils.lerp(frontArm.rotation.z, frontArmTarget, 0.3);
  backArm.rotation.z = THREE.MathUtils.lerp(backArm.rotation.z, backArmTarget, 0.3);
  model.position.y = state.guarding ? -0.18 : Math.sin(elapsed * 3.2) * 0.025;
}

function updateEffects(delta) {
  for (const impact of [playerImpact, enemyImpact]) {
    impact.userData.timer = Math.max(0, impact.userData.timer - delta);
    if (impact.userData.timer > 0) {
      impact.scale.multiplyScalar(1 + delta * 5);
      impact.material.opacity = impact.userData.timer * 5;
    } else {
      impact.visible = false;
    }
  }

  if (announcementTimer > 0) {
    announcementTimer = Math.max(0, announcementTimer - delta);
    if (announcementTimer === 0) {
      announcement.classList.remove("visible");
    }
  }
}

function preventOverlap() {
  const gap = enemy.position.x - player.position.x;
  if (gap < 0.9) {
    const midpoint = (player.position.x + enemy.position.x) / 2;
    player.position.x = clamp(midpoint - 0.45, -ARENA_LIMIT, ARENA_LIMIT);
    enemy.position.x = clamp(midpoint + 0.45, -ARENA_LIMIT, ARENA_LIMIT);
  }
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;
  advanceMatch(match, delta);
  updatePlayer(delta);
  updateEnemy(delta);
  updateProjectiles(delta, elapsed);
  preventOverlap();
  animateFighter(player, match.player, elapsed);
  animateFighter(enemy, match.enemy, elapsed, true);
  updateEffects(delta);
  updateHud();

  if (match.ended && !overlay.classList.contains("result-shown")) {
    overlay.classList.add("result-shown");
    showResult(match.winner);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function handleAction(code) {
  if (code === "KeyJ") {
    performAttack(true, "light");
  } else if (code === "KeyK") {
    performAttack(true, "heavy");
  } else if (code === "KeyL") {
    performAttack(true, "special");
  } else if (
    code === "KeyW" &&
    match.running &&
    !match.player.airborne &&
    match.player.hitStun <= 0
  ) {
    match.player.airborne = true;
    match.player.guarding = false;
    playerVelocityY = 8.2;
  }
}

window.addEventListener("keydown", (event) => {
  if (["KeyA", "KeyD", "KeyW", "KeyS", "KeyJ", "KeyK", "KeyL", "Enter"].includes(event.code)) {
    event.preventDefault();
  }
  if (!keys.has(event.code)) {
    handleAction(event.code);
  }
  keys.add(event.code);

  if (event.code === "Enter" && !match.running) {
    overlay.classList.remove("result-shown");
    resetMatch();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
  match.player.guarding = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startButton.addEventListener("click", () => {
  overlay.classList.remove("result-shown");
  resetMatch();
});

positionFighters();
updateHud();
animate();
