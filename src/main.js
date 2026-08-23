import "./style.css";
import * as THREE from "three";

const arenaRadius = 11;
const startScreen = document.querySelector("#start-screen");
const startButton = document.querySelector("#start-button");
const playerHealthBar = document.querySelector("#player-health");
const enemyHealthBar = document.querySelector("#enemy-health");
const message = document.querySelector("#message");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector("#app").append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#070b16");
scene.fog = new THREE.Fog("#070b16", 14, 36);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 8, 12);

const clock = new THREE.Clock();
const keys = {};

const state = {
  running: false,
  ended: false,
  playerHealth: 100,
  enemyHealth: 140,
  playerAttackCooldown: 0,
  enemyAttackCooldown: 0,
  attackFlash: 0,
};

function setMessage(text) {
  message.textContent = text;
}

function updateBars() {
  playerHealthBar.style.width = `${Math.max(state.playerHealth, 0)}%`;
  enemyHealthBar.style.width = `${Math.max((state.enemyHealth / 140) * 100, 0)}%`;
}

const hemiLight = new THREE.HemisphereLight("#7db6ff", "#10131f", 1.7);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight("#ffffff", 1.55);
keyLight.position.set(8, 14, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -16;
keyLight.shadow.camera.right = 16;
keyLight.shadow.camera.top = 16;
keyLight.shadow.camera.bottom = -16;
scene.add(keyLight);

const rimLight = new THREE.PointLight("#5fe3ff", 18, 26, 2);
rimLight.position.set(-8, 5, -6);
scene.add(rimLight);

const dangerLight = new THREE.PointLight("#ff5f8b", 14, 24, 2);
dangerLight.position.set(8, 4, 8);
scene.add(dangerLight);

function makeArenaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");

  context.fillStyle = "#0b1324";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.translate(canvas.width / 2, canvas.height / 2);
  const gradient = context.createRadialGradient(0, 0, 30, 0, 0, 460);
  gradient.addColorStop(0, "#16223d");
  gradient.addColorStop(1, "#070b14");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, 470, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = 8;
  context.strokeStyle = "rgba(88, 197, 255, 0.6)";
  [120, 220, 320, 420].forEach((radius) => {
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
  });

  context.lineWidth = 3;
  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  for (let i = 0; i < 16; i += 1) {
    const angle = (Math.PI * 2 * i) / 16;
    context.beginPath();
    context.moveTo(Math.cos(angle) * 80, Math.sin(angle) * 80);
    context.lineTo(Math.cos(angle) * 440, Math.sin(angle) * 440);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(arenaRadius + 2, 64),
  new THREE.MeshStandardMaterial({
    map: makeArenaTexture(),
    metalness: 0.3,
    roughness: 0.5,
    emissive: "#0a1732",
    emissiveIntensity: 0.45,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const edge = new THREE.Mesh(
  new THREE.TorusGeometry(arenaRadius + 1.6, 0.25, 18, 80),
  new THREE.MeshStandardMaterial({
    color: "#66d4ff",
    emissive: "#66d4ff",
    emissiveIntensity: 0.8,
    roughness: 0.25,
    metalness: 0.7,
  }),
);
edge.rotation.x = Math.PI / 2;
edge.position.y = 0.1;
scene.add(edge);

const pedestalGeometry = new THREE.CylinderGeometry(0.45, 0.75, 3.6, 6);
const pedestalMaterial = new THREE.MeshStandardMaterial({
  color: "#1d2744",
  emissive: "#131b31",
  metalness: 0.4,
  roughness: 0.55,
});

const crystalMaterial = new THREE.MeshStandardMaterial({
  color: "#88e4ff",
  emissive: "#6ed7ff",
  emissiveIntensity: 0.9,
  metalness: 0.1,
  roughness: 0.15,
});

const decorations = [];
for (let i = 0; i < 8; i += 1) {
  const angle = (Math.PI * 2 * i) / 8;
  const radius = arenaRadius + 0.9;
  const base = new THREE.Group();

  const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  base.add(pedestal);

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), crystalMaterial);
  crystal.position.y = 2.4;
  crystal.castShadow = true;
  base.add(crystal);

  base.position.set(Math.cos(angle) * radius, 1.8, Math.sin(angle) * radius);
  base.lookAt(0, 1.8, 0);
  scene.add(base);
  decorations.push({ base, crystal, offset: i * 0.8 });
}

const starGeometry = new THREE.BufferGeometry();
const starCount = 250;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i += 1) {
  const spread = 36;
  starPositions[i * 3] = (Math.random() - 0.5) * spread;
  starPositions[i * 3 + 1] = Math.random() * 18 + 4;
  starPositions[i * 3 + 2] = (Math.random() - 0.5) * spread;
}
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: "#d1e6ff",
    size: 0.12,
    transparent: true,
    opacity: 0.85,
  }),
);
scene.add(stars);

function createFighter({ primary, emissive, blade, scale = 1 }) {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: primary,
    emissive,
    emissiveIntensity: 0.35,
    metalness: 0.45,
    roughness: 0.4,
  });

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: "#dcecff",
    metalness: 0.7,
    roughness: 0.2,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.9), bodyMaterial);
  body.position.y = 1.5;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 24), trimMaterial);
  head.position.y = 2.65;
  head.castShadow = true;
  group.add(head);

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.7), bodyMaterial);
  legs.position.y = 0.6;
  legs.castShadow = true;
  group.add(legs);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.28), trimMaterial);
  leftArm.position.set(-0.86, 1.75, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.86, 1.7, 0);
  group.add(rightArm);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.05, 0.28), trimMaterial);
  arm.position.y = -0.25;
  arm.castShadow = true;
  rightArm.add(arm);

  const swordHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.4, 0.14),
    new THREE.MeshStandardMaterial({ color: "#141925", metalness: 0.5, roughness: 0.35 }),
  );
  swordHandle.position.set(0, -0.85, 0);
  rightArm.add(swordHandle);

  const sword = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 1.45, 0.28),
    new THREE.MeshStandardMaterial({
      color: blade,
      emissive: blade,
      emissiveIntensity: 1.1,
      metalness: 0.1,
      roughness: 0.15,
      transparent: true,
      opacity: 0.92,
    }),
  );
  sword.position.set(0, -1.55, 0);
  sword.castShadow = true;
  rightArm.add(sword);

  group.scale.setScalar(scale);
  group.userData = { rightArm, sword, body, head };
  return group;
}

const player = createFighter({
  primary: "#3478ff",
  emissive: "#1f4eff",
  blade: "#51f6ff",
});
player.position.set(0, 0, 5);
scene.add(player);

const enemy = createFighter({
  primary: "#9c2c58",
  emissive: "#631433",
  blade: "#ff8f67",
  scale: 1.16,
});
enemy.position.set(0, 0, -4.4);
scene.add(enemy);

const slash = new THREE.Mesh(
  new THREE.TorusGeometry(1.25, 0.08, 8, 48, Math.PI * 1.2),
  new THREE.MeshBasicMaterial({ color: "#7df8ff", transparent: true, opacity: 0 }),
);
slash.rotation.y = Math.PI / 2;
slash.visible = false;
scene.add(slash);

function restartGame() {
  state.running = true;
  state.ended = false;
  state.playerHealth = 100;
  state.enemyHealth = 140;
  state.playerAttackCooldown = 0;
  state.enemyAttackCooldown = 0;
  state.attackFlash = 0;
  player.position.set(0, 0, 5);
  enemy.position.set(0, 0, -4.4);
  player.rotation.set(0, Math.PI, 0);
  enemy.rotation.set(0, 0, 0);
  slash.visible = false;
  updateBars();
  setMessage("敵の動きを見て、近づいたら Space で斬撃！");
}

function endGame(didWin) {
  state.running = false;
  state.ended = true;
  startScreen.classList.remove("hidden");
  startButton.textContent = didWin ? "もう一度挑戦する" : "リトライする";
  setMessage(didWin ? "勝利！ ボスを撃破しました。" : "敗北… タイミングを変えて再挑戦！");
}

function clampToArena(object) {
  const distance = Math.hypot(object.position.x, object.position.z);
  if (distance > arenaRadius) {
    const scale = arenaRadius / distance;
    object.position.x *= scale;
    object.position.z *= scale;
  }
}

function applyAttackIfClose() {
  const distance = player.position.distanceTo(enemy.position);
  if (distance < 2.7) {
    state.enemyHealth -= distance < 1.9 ? 28 : 18;
    enemy.position.add(
      enemy.position.clone().sub(player.position).setY(0).normalize().multiplyScalar(0.55),
    );
    dangerLight.intensity = 24;
    setMessage(distance < 1.9 ? "クリティカルヒット！" : "斬撃が命中！");
  } else {
    setMessage("少し近づいてから攻撃しよう。");
  }
}

function updatePlayer(delta, elapsed) {
  if (!state.running) {
    player.userData.rightArm.rotation.z = Math.sin(elapsed * 1.8) * 0.04;
    return;
  }

  const direction = new THREE.Vector3(
    Number(keys.ArrowRight || keys.d) - Number(keys.ArrowLeft || keys.a),
    0,
    Number(keys.ArrowDown || keys.s) - Number(keys.ArrowUp || keys.w),
  );

  if (direction.lengthSq() > 0) {
    direction.normalize();
    player.position.addScaledVector(direction, delta * 5.6);
    const targetRotation = Math.atan2(direction.x, direction.z);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetRotation, 0.18);
  }

  clampToArena(player);

  state.playerAttackCooldown = Math.max(state.playerAttackCooldown - delta, 0);
  if (state.attackFlash > 0) {
    state.attackFlash = Math.max(state.attackFlash - delta * 3.5, 0);
    slash.visible = true;
    slash.material.opacity = state.attackFlash * 0.85;
    slash.position.copy(player.position).add(new THREE.Vector3(0, 1.4, 0));
    slash.rotation.z += delta * 10;
  } else {
    slash.visible = false;
  }

  const swing = state.playerAttackCooldown > 0.55 ? -1.45 : -0.15;
  player.userData.rightArm.rotation.z = THREE.MathUtils.lerp(
    player.userData.rightArm.rotation.z,
    swing,
    0.28,
  );
  player.position.y = Math.abs(Math.sin(elapsed * 5)) * (direction.lengthSq() > 0 ? 0.12 : 0);
}

function updateEnemy(delta, elapsed) {
  const toPlayer = player.position.clone().sub(enemy.position);
  const flatDistance = Math.hypot(toPlayer.x, toPlayer.z);
  if (flatDistance > 0.1) {
    enemy.rotation.y = THREE.MathUtils.lerp(
      enemy.rotation.y,
      Math.atan2(toPlayer.x, toPlayer.z),
      0.08,
    );
  }

  if (!state.running) {
    enemy.userData.rightArm.rotation.z = Math.sin(elapsed * 1.4 + 0.8) * 0.15;
    return;
  }

  if (flatDistance > 1.65) {
    enemy.position.addScaledVector(toPlayer.normalize(), delta * 3.1);
  } else {
    state.enemyAttackCooldown = Math.max(state.enemyAttackCooldown - delta, 0);
    if (state.enemyAttackCooldown === 0) {
      state.playerHealth -= 12;
      state.enemyAttackCooldown = 1.05;
      rimLight.intensity = 24;
      setMessage("被弾！ 回り込んで距離を取り直そう。");
    }
  }

  clampToArena(enemy);
  enemy.userData.rightArm.rotation.z = Math.sin(elapsed * 4 + 0.8) * 0.2 - (flatDistance < 2 ? 1.1 : 0.2);
}

function updateCamera(delta) {
  const desired = player.position.clone().add(new THREE.Vector3(0, 7.4, 10));
  camera.position.lerp(desired, 1 - Math.exp(-delta * 3));
  camera.lookAt(player.position.x, 1.8, player.position.z - 1.6);
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.032);
  const elapsed = clock.elapsedTime;

  decorations.forEach(({ base, crystal, offset }) => {
    crystal.rotation.y += delta * 1.2;
    crystal.position.y = 2.4 + Math.sin(elapsed * 1.8 + offset) * 0.18;
    base.rotation.y += delta * 0.04;
  });
  stars.rotation.y += delta * 0.02;

  rimLight.intensity = THREE.MathUtils.lerp(rimLight.intensity, 18, 0.08);
  dangerLight.intensity = THREE.MathUtils.lerp(dangerLight.intensity, 14, 0.08);

  updatePlayer(delta, elapsed);
  updateEnemy(delta, elapsed);
  updateCamera(delta);
  updateBars();

  if (state.running) {
    if (state.enemyHealth <= 0) {
      state.enemyHealth = 0;
      updateBars();
      endGame(true);
    } else if (state.playerHealth <= 0) {
      state.playerHealth = 0;
      updateBars();
      endGame(false);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys[key] = true;

  if (key === " " || key === "Spacebar") {
    event.preventDefault();
    if (state.running && state.playerAttackCooldown === 0) {
      state.playerAttackCooldown = 0.8;
      state.attackFlash = 1;
      applyAttackIfClose();
    }
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys[key] = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startButton.addEventListener("click", () => {
  startScreen.classList.add("hidden");
  restartGame();
});

updateBars();
setMessage("ゲームスタートで 3D バトル開始！");
animate();
