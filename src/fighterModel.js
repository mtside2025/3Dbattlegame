import * as THREE from "three";
import { ATTACKS } from "./combat.js";

const toonGradient = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
})();

const outlineMaterial = new THREE.MeshBasicMaterial({ color: "#07060d", side: THREE.BackSide });

let simpleMaterials = false;

/**
 * Switches fighter models to materials the software (SVG) renderer can draw.
 * Used when WebGL is unavailable, e.g. when it is disabled by a school policy.
 */
export function useSimpleMaterials(enabled) {
  simpleMaterials = enabled;
}

function toon(color, emissiveIntensity = 0) {
  if (simpleMaterials) {
    return new THREE.MeshLambertMaterial({
      color,
      emissive: new THREE.Color(color).multiplyScalar(emissiveIntensity * 0.5),
    });
  }
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient,
    emissive: color,
    emissiveIntensity,
  });
}

function glow(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}

/** Creates a mesh with an inverted-hull outline for a cel-shaded look. */
function part(geometry, material, { outline = true, thickness = 0.035, shadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadow;
  if (outline && !simpleMaterials) {
    geometry.computeBoundingSphere();
    const radius = Math.max(geometry.boundingSphere.radius, 0.05);
    const hull = new THREE.Mesh(geometry, outlineMaterial);
    hull.scale.setScalar(1 + thickness / radius);
    hull.castShadow = false;
    mesh.add(hull);
  }
  return mesh;
}

function joint(parent, x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function buildHair(head, look, materials) {
  const hair = materials.hair;
  if (look.hairStyle === "spiky") {
    const cap = part(new THREE.SphereGeometry(0.35, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.set(0, 0.04, -0.02);
    head.add(cap);
    const spikes = [
      [0, 0.34, -0.05, -0.5, 0, 0.5],
      [0.17, 0.3, -0.1, -0.7, 0, -0.5],
      [-0.17, 0.3, -0.1, -0.7, 0, 0.5],
      [0.1, 0.22, -0.3, -1.3, 0, -0.3],
      [-0.1, 0.22, -0.3, -1.3, 0, 0.3],
      [0, 0.1, -0.36, -1.7, 0, 0],
      [0.25, 0.14, 0.1, -0.2, 0, -1],
      [-0.25, 0.14, 0.1, -0.2, 0, 1],
    ];
    for (const [x, y, z, rx, ry, rz] of spikes) {
      const spike = part(new THREE.ConeGeometry(0.11, 0.42, 6), hair, { thickness: 0.02 });
      spike.position.set(x, y, z);
      spike.rotation.set(rx, ry, rz);
      head.add(spike);
    }
    const bangs = part(new THREE.ConeGeometry(0.09, 0.3, 5), hair, { thickness: 0.02 });
    bangs.position.set(0.1, 0.2, 0.3);
    bangs.rotation.set(2.1, 0, 0.3);
    head.add(bangs);
  } else if (look.hairStyle === "mohawk") {
    for (let i = 0; i < 6; i += 1) {
      const fin = part(new THREE.ConeGeometry(0.08, 0.36 - i * 0.02, 4), hair, { thickness: 0.02 });
      const angle = 0.5 - i * 0.42;
      fin.position.set(0, Math.cos(angle) * 0.33, Math.sin(angle) * 0.33);
      fin.rotation.x = angle;
      head.add(fin);
    }
  } else if (look.hairStyle === "hood") {
    const hood = part(
      new THREE.SphereGeometry(0.4, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      materials.suitDark,
    );
    hood.position.set(0, 0.02, -0.04);
    hood.rotation.x = -0.25;
    head.add(hood);
    const tail = part(new THREE.ConeGeometry(0.16, 0.5, 8), materials.suitDark, { thickness: 0.02 });
    tail.position.set(0, 0.05, -0.42);
    tail.rotation.x = -1.9;
    head.add(tail);
  } else if (look.hairStyle === "long") {
    const cap = part(new THREE.SphereGeometry(0.36, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), hair);
    cap.position.set(0, 0.03, -0.03);
    head.add(cap);
    const mane = part(new THREE.CylinderGeometry(0.3, 0.42, 0.95, 12, 1, true), hair, { thickness: 0.02 });
    mane.position.set(0, -0.35, -0.16);
    mane.rotation.x = 0.18;
    head.add(mane);
  }

  if (look.horns) {
    for (const side of [-1, 1]) {
      const horn = part(new THREE.ConeGeometry(0.07, 0.5, 8), materials.armor ?? materials.accent, {
        thickness: 0.02,
      });
      horn.position.set(side * 0.24, 0.3, 0.02);
      horn.rotation.set(-0.35, 0, -side * 0.55);
      head.add(horn);
    }
  }
}

function buildHead(neck, look, materials) {
  const head = joint(neck, 0, 0.2, 0);
  const skull = part(new THREE.SphereGeometry(0.32, 28, 22), materials.skin);
  skull.scale.set(1, 1.08, 1);
  head.add(skull);

  const jaw = part(new THREE.SphereGeometry(0.22, 18, 12), materials.skin, { thickness: 0.02 });
  jaw.scale.set(1.05, 0.8, 1);
  jaw.position.set(0, -0.14, 0.08);
  head.add(jaw);

  const eyeMaterial = look.mask || look.glowEyes ? glow(look.eyes) : new THREE.MeshBasicMaterial({ color: "#ffffff" });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.06, 4, 8), eyeMaterial);
    eye.rotation.z = Math.PI / 2 + side * 0.2;
    eye.position.set(side * 0.12, 0.02, 0.29);
    head.add(eye);
    if (!look.mask && !look.glowEyes) {
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), new THREE.MeshBasicMaterial({ color: look.eyes }));
      pupil.position.set(side * 0.12, 0.015, 0.325);
      head.add(pupil);
    }
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), materials.outline);
    brow.position.set(side * 0.12, 0.11, 0.3);
    brow.rotation.z = side * 0.28;
    head.add(brow);
  }

  if (look.mask) {
    const mask = part(new THREE.SphereGeometry(0.335, 20, 12, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.4), materials.suitDark, {
      thickness: 0.015,
    });
    head.add(mask);
  } else {
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.02), materials.outline);
    mouth.position.set(0, -0.15, 0.29);
    head.add(mouth);
  }

  if (look.headband) {
    const band = part(new THREE.TorusGeometry(0.33, 0.045, 8, 28), toon(look.headband, 0.15), {
      thickness: 0.015,
    });
    band.rotation.x = Math.PI / 2 - 0.12;
    band.position.y = 0.12;
    head.add(band);
    const ribbons = [];
    for (const side of [-1, 1]) {
      const ribbon = joint(head, side * 0.06, 0.1, -0.32);
      const strip = part(new THREE.BoxGeometry(0.08, 0.02, 0.5), toon(look.headband, 0.15), { thickness: 0.01 });
      strip.position.z = -0.25;
      ribbon.add(strip);
      ribbon.rotation.set(-0.45, side * 0.3, 0);
      ribbons.push(ribbon);
    }
    head.userData.ribbons = ribbons;
  }

  buildHair(head, look, materials);
  return head;
}

function buildArm(chest, side, look, materials) {
  const shoulder = joint(chest, side * 0.52, 0.42, 0);
  const pad = part(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), materials.armor ?? materials.suitDark);
  pad.position.y = 0.06;
  pad.rotation.z = side * -0.35;
  shoulder.add(pad);
  const upper = part(new THREE.CapsuleGeometry(0.12, 0.36, 6, 12), materials.suit);
  upper.position.y = -0.26;
  shoulder.add(upper);

  const elbow = joint(shoulder, 0, -0.52, 0);
  const forearm = part(new THREE.CapsuleGeometry(0.105, 0.32, 6, 12), materials.skin);
  forearm.position.y = -0.22;
  elbow.add(forearm);
  const bracer = part(new THREE.CylinderGeometry(0.13, 0.12, 0.16, 14), materials.accentGlow, { thickness: 0.015 });
  bracer.position.y = -0.3;
  elbow.add(bracer);

  const hand = joint(elbow, 0, -0.5, 0);
  const fist = part(new THREE.SphereGeometry(0.14, 16, 12), materials.glove);
  fist.scale.set(1, 0.95, 1.15);
  hand.add(fist);
  return { shoulder, elbow, hand };
}

function buildLeg(hips, side, look, materials) {
  const hip = joint(hips, side * 0.2, -0.08, 0);
  const thigh = part(new THREE.CapsuleGeometry(0.155, 0.36, 6, 12), materials.pants);
  thigh.position.y = -0.27;
  hip.add(thigh);

  const knee = joint(hip, 0, -0.56, 0);
  const kneePad = part(new THREE.SphereGeometry(0.12, 12, 10), materials.armor ?? materials.accent, { thickness: 0.015 });
  kneePad.position.set(0, 0, 0.08);
  knee.add(kneePad);
  const shin = part(new THREE.CapsuleGeometry(0.13, 0.34, 6, 12), materials.pants);
  shin.position.y = -0.25;
  knee.add(shin);

  const foot = joint(knee, 0, -0.56, 0);
  const boot = part(new THREE.BoxGeometry(0.26, 0.2, 0.44), materials.boot);
  boot.position.set(0, -0.02, 0.08);
  foot.add(boot);
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.46), materials.outline);
  sole.position.set(0, -0.12, 0.08);
  foot.add(sole);
  return { hip, knee, foot };
}

export function createFighterModel(look) {
  const materials = {
    suit: toon(look.suit, 0.08),
    suitDark: toon(look.suitDark, 0.05),
    pants: toon(look.suitDark, 0.05),
    accent: toon(look.accent, 0.3),
    accentGlow: toon(look.accent, 0.8),
    skin: toon(look.skin),
    hair: toon(look.hair, 0.05),
    glove: toon(look.accent, 0.35),
    boot: toon("#1b1a24"),
    armor: look.armor ? toon(look.armor, 0.25) : null,
    outline: new THREE.MeshBasicMaterial({ color: "#07060d" }),
  };

  const root = new THREE.Group();
  const pivotY = 1.2 * (look.scale ?? 1);
  const body = joint(root, 0, pivotY, 0);
  const scaled = joint(body, 0, -pivotY, 0);
  scaled.scale.setScalar(look.scale ?? 1);
  const hips = joint(scaled, 0, 1.24, 0);

  const pelvis = part(new THREE.CylinderGeometry(0.33, 0.3, 0.28, 16), materials.pants);
  hips.add(pelvis);
  const belt = part(new THREE.TorusGeometry(0.33, 0.06, 8, 24), materials.accent, { thickness: 0.015 });
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.12;
  hips.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), materials.accentGlow);
  buckle.position.set(0, 0.12, 0.36);
  hips.add(buckle);
  for (const side of [-1, 1]) {
    const beltTail = part(new THREE.BoxGeometry(0.08, 0.34, 0.02), materials.accent, { thickness: 0.01 });
    beltTail.position.set(side * 0.1, -0.08, 0.36);
    beltTail.rotation.z = side * 0.15;
    hips.add(beltTail);
  }

  const spine = joint(hips, 0, 0.16, 0);
  const chest = joint(spine, 0, 0.42, 0);
  const torso = part(new THREE.CapsuleGeometry(0.34, 0.36, 8, 18), materials.suit);
  torso.scale.set(1.12, 1, 0.78);
  chest.add(torso);
  const abdomen = part(new THREE.CylinderGeometry(0.28, 0.32, 0.3, 16), materials.suitDark, { thickness: 0.02 });
  abdomen.position.y = -0.34;
  chest.add(abdomen);
  const plate = part(new THREE.BoxGeometry(0.52, 0.34, 0.14), materials.armor ?? materials.suitDark, { thickness: 0.02 });
  plate.position.set(0, 0.12, 0.23);
  chest.add(plate);
  const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), materials.accentGlow);
  emblem.position.set(0, 0.13, 0.31);
  emblem.scale.set(1, 1.3, 0.4);
  chest.add(emblem);
  const collar = part(new THREE.TorusGeometry(0.2, 0.06, 8, 18), materials.suitDark, { thickness: 0.015 });
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.5;
  chest.add(collar);

  const neck = joint(chest, 0, 0.5, 0);
  const neckMesh = part(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 10), materials.skin, { outline: false });
  neck.add(neckMesh);
  const head = buildHead(neck, look, materials);

  let scarf = null;
  if (look.scarf) {
    scarf = joint(chest, 0.12, 0.45, -0.18);
    const scarfMaterial = toon(look.scarf, 0.15);
    const segments = [];
    let parent = scarf;
    for (let i = 0; i < 4; i += 1) {
      const segment = joint(parent, 0, 0, i === 0 ? 0 : -0.24);
      const cloth = part(new THREE.BoxGeometry(0.2 - i * 0.02, 0.03, 0.26), scarfMaterial, { thickness: 0.01 });
      cloth.position.z = -0.12;
      segment.add(cloth);
      segments.push(segment);
      parent = segment;
    }
    scarf.userData.segments = segments;
  }

  let cape = null;
  if (look.cape) {
    cape = joint(chest, 0, 0.42, -0.26);
    const capeMesh = part(new THREE.PlaneGeometry(1.0, 1.7, 1, 6), toon(look.cape, 0.1), { thickness: 0.01 });
    capeMesh.material.side = THREE.DoubleSide;
    capeMesh.position.y = -0.85;
    cape.add(capeMesh);
    const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 20, Math.PI), materials.armor ?? materials.accent);
    clasp.position.set(0, 0.02, 0.12);
    clasp.rotation.set(Math.PI / 2, 0, Math.PI);
    cape.add(clasp);
  }

  const armR = buildArm(chest, -1, look, materials);
  const armL = buildArm(chest, 1, look, materials);
  const legR = buildLeg(hips, -1, look, materials);
  const legL = buildLeg(hips, 1, look, materials);

  root.userData = {
    look,
    pivotY,
    body,
    hips,
    spine,
    chest,
    head,
    armR,
    armL,
    legR,
    legL,
    scarf,
    cape,
    pose: { ...NEUTRAL_POSE },
  };
  return root;
}

export const NEUTRAL_POSE = Object.freeze({
  bodyY: 0,
  bodyRotX: 0,
  bodyRotY: 0,
  spineX: 0.08,
  spineY: 0.2,
  spineZ: 0,
  headX: 0,
  rShX: -0.95,
  rShZ: 0.2,
  rElX: -1.65,
  lShX: -0.55,
  lShZ: 0.25,
  lElX: -1.9,
  rHipX: 0.22,
  rHipZ: 0.1,
  rKneeX: 0.3,
  lHipX: -0.3,
  lHipZ: 0.1,
  lKneeX: 0.4,
});

const smooth = (t) => t * t * (3 - 2 * t);
const segment = (t, from, to) => Math.min(Math.max((t - from) / (to - from), 0), 1);

function attackPose(pose, state, elapsed) {
  const attack = ATTACKS[state.currentAttack];
  const e = state.attackElapsed;
  const w = attack.windup;
  const a = attack.active;
  const windup = smooth(segment(e, 0, w));
  const strike = smooth(segment(e, w, w + Math.max(a, 0.06)));
  const recover = smooth(segment(e, w + a, attack.duration));

  switch (state.currentAttack) {
    case "light": {
      const reach = strike * (1 - recover);
      pose.rShX = -0.6 - reach * 1.0;
      pose.rElX = -2.1 + reach * 2.05;
      pose.rShZ = 0.2 - reach * 0.25;
      pose.spineY = 0.2 - reach * 0.6;
      pose.spineX = 0.1 + reach * 0.12;
      break;
    }
    case "heavy": {
      const chamber = windup * (1 - strike);
      const kick = strike * (1 - recover);
      pose.lHipX = -0.3 - chamber * 1.1 - kick * 1.55;
      pose.lKneeX = 0.4 + chamber * 1.6 - kick * 0.4;
      pose.spineX = 0.08 - kick * 0.45;
      pose.rShZ = 0.2 + kick * 0.8;
      pose.lShZ = 0.25 + kick * 0.8;
      pose.rKneeX = 0.3 + chamber * 0.2;
      break;
    }
    case "beam": {
      const charge = windup * (1 - strike);
      const fire = strike * (1 - recover * 0.6);
      pose.bodyY = -0.25 * charge - 0.15 * fire;
      pose.spineY = 0.2 + charge * 0.9 - fire * 0.3;
      pose.spineX = 0.08 + fire * 0.25;
      pose.rShX = -0.95 + charge * 1.1 - fire * 0.65;
      pose.lShX = -0.55 + charge * 0.8 - fire * 1.05;
      pose.rShZ = 0.2 - charge * 0.1 - fire * 0.35;
      pose.lShZ = 0.25 - charge * 0.35 - fire * 0.35;
      pose.rElX = -1.65 + charge * 0.2 + fire * 1.6;
      pose.lElX = -1.9 + charge * 0.4 + fire * 1.85;
      pose.rHipX = 0.22 + (charge + fire) * 0.25;
      pose.lHipX = -0.3 - (charge + fire) * 0.3;
      pose.rKneeX = 0.3 + (charge + fire) * 0.4;
      pose.lKneeX = 0.4 + (charge + fire) * 0.4;
      break;
    }
    case "cyclone": {
      const spin = segment(e, w, w + a);
      const out = smooth(segment(e, 0, w)) * (1 - recover);
      pose.bodyRotY = spin * Math.PI * 4;
      pose.bodyY = out * 0.35;
      pose.lHipZ = 0.1 + out * 1.35;
      pose.lHipX = -0.3 + out * 0.2;
      pose.lKneeX = 0.4 - out * 0.4;
      pose.rKneeX = 0.3 + out * 0.5;
      pose.rShZ = 0.2 + out * 1.2;
      pose.lShZ = 0.25 + out * 1.2;
      pose.rElX = -1.65 + out * 1.4;
      pose.lElX = -1.9 + out * 1.7;
      pose.spineZ = out * -0.25;
      break;
    }
    case "dragon": {
      const crouch = windup * (1 - strike);
      const rise = strike * (1 - recover * 0.7);
      pose.bodyY = -0.35 * crouch;
      pose.bodyRotY = rise * Math.PI * 1.5;
      pose.rShX = -0.95 + crouch * 1.4 - rise * 2.1;
      pose.rElX = -1.65 + crouch * 0.3 + rise * 1.6;
      pose.rShZ = 0.2 - rise * 0.2;
      pose.spineX = 0.08 + crouch * 0.4 - rise * 0.35;
      pose.lHipX = -0.3 - rise * 1.1;
      pose.lKneeX = 0.4 + rise * 1.3 + crouch * 0.5;
      pose.rKneeX = 0.3 + crouch * 0.8;
      pose.lShX = -0.55 + rise * 0.4;
      break;
    }
    case "meteor": {
      const tuck = windup * (1 - strike);
      const dive = strike * (1 - recover);
      const land = recover;
      pose.bodyRotX = tuck * (segment(e, 0, w) * Math.PI * 2) + dive * 0.5;
      pose.rShX = -0.95 - tuck * 2.0 - dive * 0.3;
      pose.lShX = -0.55 - tuck * 2.4 - dive * 0.7;
      pose.rElX = -1.65 + tuck * 1.2 + dive * 1.5;
      pose.lElX = -1.9 + tuck * 1.5 + dive * 1.8;
      pose.rHipX = 0.22 - tuck * 1.2;
      pose.lHipX = -0.3 - tuck * 1.0;
      pose.rKneeX = 0.3 + tuck * 1.6 + land * 0.7;
      pose.lKneeX = 0.4 + tuck * 1.6 + land * 0.7;
      pose.bodyY = -0.35 * land * (1 - smooth(segment(e, w + a + 0.15, attack.duration)));
      break;
    }
    case "nova": {
      const gather = windup * (1 - strike);
      const release = strike * (1 - recover * 0.5);
      pose.bodyY = gather * 0.5 + release * 0.3;
      pose.headX = -gather * 0.4;
      pose.spineX = -gather * 0.3 + release * 0.25;
      pose.spineY = 0;
      pose.rShX = -0.4 - gather * 2.2 - release * 1.0;
      pose.lShX = -0.4 - gather * 2.2 - release * 1.0;
      pose.rShZ = 0.3 + gather * 0.9 - release * 0.4;
      pose.lShZ = 0.3 + gather * 0.9 - release * 0.4;
      pose.rElX = -0.3 + release * 0.2;
      pose.lElX = -0.3 + release * 0.2;
      pose.rKneeX = 0.3 + gather * 0.6;
      pose.lKneeX = 0.4 + gather * 0.6;
      pose.rHipX = 0.22 - gather * 0.3;
      pose.lHipX = -0.3 - gather * 0.3;
      break;
    }
    default:
      break;
  }
  return pose;
}

/**
 * Computes the target pose for the fighter this frame.
 * `context` = { moving, speedRatio, elapsed, ko, victory }
 */
export function computePose(state, context) {
  const pose = { ...NEUTRAL_POSE };
  const { elapsed } = context;

  if (context.ko) {
    pose.bodyRotX = -1.45;
    pose.bodyY = -0.85;
    pose.spineX = -0.2;
    pose.headX = -0.4;
    pose.rShX = -2.6;
    pose.lShX = -2.4;
    pose.rShZ = 0.8;
    pose.lShZ = 0.8;
    pose.rElX = -0.2;
    pose.lElX = -0.2;
    pose.rHipX = 0;
    pose.lHipX = -0.25;
    pose.rKneeX = 0.1;
    pose.lKneeX = 0.6;
    return pose;
  }

  if (context.victory) {
    const bounce = Math.abs(Math.sin(elapsed * 4));
    pose.bodyY = bounce * 0.12;
    pose.rShX = -3.0;
    pose.rShZ = 0.15;
    pose.rElX = -0.15;
    pose.lShX = -0.3;
    pose.lElX = -1.6;
    pose.spineY = 0;
    pose.spineX = -0.1;
    pose.headX = -0.2;
    return pose;
  }

  if (state.currentAttack) {
    return attackPose(pose, state, elapsed);
  }

  if (state.hitStun > 0) {
    pose.spineX = -0.5;
    pose.headX = -0.35;
    pose.rShZ = 0.9;
    pose.lShZ = 0.9;
    pose.rShX = -0.4;
    pose.lShX = -0.4;
    pose.rElX = -0.6;
    pose.lElX = -0.6;
    pose.rKneeX = 0.6;
    pose.lKneeX = 0.7;
    pose.bodyY = -0.1;
    return pose;
  }

  if (state.guarding) {
    pose.bodyY = -0.18;
    pose.spineX = 0.2;
    pose.spineY = 0;
    pose.rShX = -1.35;
    pose.lShX = -1.35;
    pose.rShZ = -0.45;
    pose.lShZ = -0.45;
    pose.rElX = -1.9;
    pose.lElX = -1.9;
    pose.rKneeX = 0.6;
    pose.lKneeX = 0.7;
    pose.rHipX = 0.1;
    pose.lHipX = -0.45;
    return pose;
  }

  if (state.airborne) {
    pose.rHipX = -0.9;
    pose.rKneeX = 1.5;
    pose.lHipX = -0.3;
    pose.lKneeX = 1.2;
    pose.rShZ = 0.7;
    pose.lShZ = 0.7;
    pose.spineX = 0.2;
    return pose;
  }

  if (context.moving) {
    const phase = elapsed * 11;
    const stride = Math.sin(phase) * 0.75 * context.speedRatio;
    pose.rHipX = -stride;
    pose.lHipX = stride;
    pose.rKneeX = 0.3 + Math.max(0, Math.sin(phase + 1.4)) * 1.1 * context.speedRatio;
    pose.lKneeX = 0.3 + Math.max(0, Math.sin(phase + Math.PI + 1.4)) * 1.1 * context.speedRatio;
    pose.rHipZ = 0.04;
    pose.lHipZ = 0.04;
    pose.rShX = -0.7 + stride * 0.5;
    pose.lShX = -0.7 - stride * 0.5;
    pose.spineX = 0.22;
    pose.spineY = 0;
    pose.bodyY = Math.abs(Math.cos(phase)) * 0.08;
    return pose;
  }

  pose.bodyY = Math.sin(elapsed * 3.4) * 0.03 - 0.04;
  pose.spineX += Math.sin(elapsed * 3.4) * 0.03;
  return pose;
}

function approachAngle(current, target, factor) {
  return current + (target - current) * factor;
}

/** Blends the model toward the target pose and applies it to the joints. */
export function applyPose(model, target, delta, sharpness = 16) {
  const data = model.userData;
  const pose = data.pose;
  const factor = 1 - Math.exp(-sharpness * delta);
  for (const key of Object.keys(target)) {
    if (key === "bodyRotY" || key === "bodyRotX") {
      pose[key] = Math.abs(target[key] - pose[key]) > 2 ? target[key] : approachAngle(pose[key], target[key], Math.min(1, factor * 2));
    } else {
      pose[key] = approachAngle(pose[key], target[key], factor);
    }
  }

  data.body.position.y = data.pivotY + pose.bodyY;
  data.body.rotation.set(pose.bodyRotX, pose.bodyRotY, 0);
  data.spine.rotation.set(pose.spineX, pose.spineY, pose.spineZ);
  data.head.rotation.set(pose.headX, -pose.spineY * 0.7, 0);
  data.armR.shoulder.rotation.set(pose.rShX, 0, -pose.rShZ);
  data.armR.elbow.rotation.x = pose.rElX;
  data.armL.shoulder.rotation.set(pose.lShX, 0, pose.lShZ);
  data.armL.elbow.rotation.x = pose.lElX;
  data.legR.hip.rotation.set(pose.rHipX, 0, -pose.rHipZ);
  data.legR.knee.rotation.x = pose.rKneeX;
  data.legR.foot.rotation.x = -pose.rKneeX * 0.4 - pose.rHipX * 0.3;
  data.legL.hip.rotation.set(pose.lHipX, 0, pose.lHipZ);
  data.legL.knee.rotation.x = pose.lKneeX;
  data.legL.foot.rotation.x = -pose.lKneeX * 0.4 - pose.lHipX * 0.3;
}

/** Secondary motion for cloth parts (scarf, headband ribbons, cape). */
export function animateCloth(model, elapsed, speedRatio) {
  const { scarf, cape, head } = model.userData;
  const flutter = 0.35 + speedRatio * 0.6;
  if (scarf) {
    scarf.userData.segments.forEach((segmentGroup, index) => {
      segmentGroup.rotation.x = (index === 0 ? -0.7 : -0.18) + Math.sin(elapsed * 9 + index * 0.9) * 0.18 * flutter;
      segmentGroup.rotation.y = Math.sin(elapsed * 6 + index) * 0.15 * flutter;
    });
  }
  if (head.userData.ribbons) {
    head.userData.ribbons.forEach((ribbon, index) => {
      ribbon.rotation.x = -0.45 + Math.sin(elapsed * 10 + index * 1.7) * 0.25 * flutter;
    });
  }
  if (cape) {
    cape.rotation.x = 0.12 + speedRatio * 0.35 + Math.sin(elapsed * 4) * 0.05;
  }
}

export function disposeModel(model) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose();
      if (child.material !== outlineMaterial) {
        child.material.dispose();
      }
    }
  });
}
