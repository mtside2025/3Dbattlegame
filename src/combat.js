export const FIGHTER_MAX_HEALTH = 100;
export const MAX_ENERGY = 100;
export const ROUND_SECONDS = 60;
export const ENERGY_REGEN = 4;
export const GUARD_DAMAGE_RATE = 0.25;
export const REFLECT_WINDOW = 0.22;
export const REFLECT_COOLDOWN = 0.55;
export const GUARD_ARC = 1.35;

// All times are in seconds. `windup` is the time before the move becomes active,
// `active` is how long the hitbox stays out and `duration` is the full motion.
// `arc` is the half-angle (radians) in front of the attacker that the move covers.
export const ATTACKS = Object.freeze({
  light: Object.freeze({
    label: "ジャブ",
    kind: "melee",
    damage: 7,
    range: 1.9,
    arc: 0.9,
    windup: 0.08,
    active: 0.1,
    duration: 0.26,
    cooldown: 0.32,
    energyCost: 0,
    energyGain: 8,
    knockback: 0.35,
    hitStun: 0.2,
  }),
  heavy: Object.freeze({
    label: "ハイキック",
    kind: "melee",
    damage: 14,
    range: 2.3,
    arc: 0.8,
    windup: 0.22,
    active: 0.1,
    duration: 0.52,
    cooldown: 0.7,
    energyCost: 0,
    energyGain: 13,
    knockback: 1.1,
    hitStun: 0.34,
  }),
  beam: Object.freeze({
    label: "ネオンビーム",
    special: true,
    kind: "beam",
    damage: 16,
    range: Number.POSITIVE_INFINITY,
    arc: Math.PI,
    windup: 0.42,
    active: 0.05,
    duration: 0.75,
    cooldown: 0.9,
    energyCost: 30,
    energyGain: 6,
    knockback: 1.0,
    hitStun: 0.42,
    speed: 15,
  }),
  cyclone: Object.freeze({
    label: "サイクロンキック",
    special: true,
    kind: "spin",
    damage: 18,
    range: 2.5,
    arc: Math.PI,
    windup: 0.18,
    active: 0.5,
    duration: 0.85,
    cooldown: 1,
    energyCost: 35,
    energyGain: 6,
    knockback: 1.6,
    hitStun: 0.45,
    travelSpeed: 4.5,
  }),
  dragon: Object.freeze({
    label: "ライジングドラゴン",
    special: true,
    kind: "dash",
    damage: 20,
    range: 1.9,
    arc: 0.9,
    windup: 0.12,
    active: 0.35,
    duration: 0.8,
    cooldown: 1,
    energyCost: 40,
    energyGain: 6,
    knockback: 1.4,
    hitStun: 0.5,
    travelSpeed: 11,
    riseHeight: 2.2,
  }),
  meteor: Object.freeze({
    label: "メテオダイブ",
    special: true,
    kind: "slam",
    damage: 26,
    range: 3.2,
    arc: Math.PI,
    windup: 0.7,
    active: 0.14,
    duration: 1.1,
    cooldown: 1.2,
    energyCost: 55,
    energyGain: 6,
    knockback: 2,
    hitStun: 0.6,
    travelSpeed: 7,
    riseHeight: 4.2,
  }),
  nova: Object.freeze({
    label: "オメガ・ノヴァ",
    special: true,
    bossOnly: true,
    kind: "nova",
    damage: 13,
    range: Number.POSITIVE_INFINITY,
    arc: Math.PI,
    windup: 1,
    active: 0.05,
    duration: 1.5,
    cooldown: 1.6,
    energyCost: 60,
    energyGain: 0,
    knockback: 1.2,
    hitStun: 0.45,
    speed: 12,
    beams: 7,
    spread: 1.3,
  }),
});

export const PLAYER_SPECIALS = Object.freeze(["beam", "cyclone", "dragon", "meteor"]);

export function createFighterState({ maxHealth = FIGHTER_MAX_HEALTH, energyRegen = ENERGY_REGEN } = {}) {
  return {
    health: maxHealth,
    maxHealth,
    energy: 0,
    energyRegen,
    attackCooldown: 0,
    attackTimer: 0,
    attackElapsed: 0,
    hitApplied: false,
    hitStun: 0,
    guarding: false,
    airborne: false,
    currentAttack: null,
    reflectTimer: 0,
    reflectCooldown: 0,
  };
}

export function createRoundState({ playerMaxHealth, enemyMaxHealth, enemyEnergyRegen } = {}) {
  return {
    running: false,
    ended: false,
    timeRemaining: ROUND_SECONDS,
    winner: null,
    player: createFighterState({ maxHealth: playerMaxHealth }),
    enemy: createFighterState({ maxHealth: enemyMaxHealth, energyRegen: enemyEnergyRegen }),
  };
}

export function canStartAttack(fighter, attackName) {
  const attack = ATTACKS[attackName];
  return Boolean(
    attack &&
      fighter.health > 0 &&
      fighter.attackCooldown <= 0 &&
      fighter.attackTimer <= 0 &&
      fighter.hitStun <= 0 &&
      !fighter.guarding &&
      !(attack.special && fighter.airborne) &&
      fighter.energy >= attack.energyCost,
  );
}

export function startAttack(fighter, attackName) {
  if (!canStartAttack(fighter, attackName)) {
    return false;
  }

  const attack = ATTACKS[attackName];
  fighter.energy = clamp(fighter.energy - attack.energyCost, 0, MAX_ENERGY);
  fighter.attackCooldown = attack.cooldown;
  fighter.attackTimer = attack.duration;
  fighter.attackElapsed = 0;
  fighter.hitApplied = false;
  fighter.currentAttack = attackName;
  return true;
}

export function attackPhase(fighter) {
  const attack = ATTACKS[fighter.currentAttack];
  if (!attack || fighter.attackTimer <= 0) {
    return null;
  }
  if (fighter.attackElapsed < attack.windup) {
    return "windup";
  }
  if (fighter.attackElapsed <= attack.windup + attack.active) {
    return "active";
  }
  return "recovery";
}

export function attackProgress(fighter) {
  const attack = ATTACKS[fighter.currentAttack];
  if (!attack) {
    return 0;
  }
  return clamp(fighter.attackElapsed / attack.duration, 0, 1);
}

/**
 * Applies an attack to the defender.
 * `distance` is the horizontal distance between fighters, `options.angle` is how far
 * (radians) the defender is from the attacker's facing direction and
 * `options.guardFacing` tells whether the defender's shield points at the attack.
 */
export function resolveStrike(attacker, defender, attackName, distance, options = {}) {
  const attack = ATTACKS[attackName];
  const { angle = 0, guardFacing = true, damageScale = 1 } = options;
  if (!attack || distance > attack.range || Math.abs(angle) > attack.arc || defender.health <= 0) {
    return { hit: false, damage: 0, knockback: 0, blocked: false };
  }

  const blocked = defender.guarding && !defender.airborne && guardFacing;
  const damage = Math.max(1, Math.round(attack.damage * damageScale * (blocked ? GUARD_DAMAGE_RATE : 1)));
  defender.health = clamp(defender.health - damage, 0, defender.maxHealth ?? FIGHTER_MAX_HEALTH);
  defender.hitStun = blocked ? 0.1 : attack.hitStun;
  if (!blocked) {
    defender.currentAttack = null;
    defender.attackTimer = 0;
  }
  attacker.energy = clamp(attacker.energy + attack.energyGain, 0, MAX_ENERGY);
  defender.energy = clamp(defender.energy + (blocked ? 4 : 7), 0, MAX_ENERGY);

  return {
    hit: true,
    damage,
    knockback: attack.knockback * (blocked ? 0.3 : 1),
    blocked,
  };
}

export function pressReflect(fighter) {
  if (fighter.reflectCooldown > 0 || fighter.hitStun > 0 || fighter.health <= 0) {
    return false;
  }
  fighter.reflectTimer = REFLECT_WINDOW;
  fighter.reflectCooldown = REFLECT_COOLDOWN;
  return true;
}

/** Decides what happens when a beam reaches a fighter: "reflect" or "hit". */
export function resolveBeamContact(defender, facingBeam) {
  if (defender.reflectTimer > 0 && facingBeam && defender.hitStun <= 0 && defender.health > 0) {
    defender.reflectTimer = 0;
    defender.reflectCooldown = 0;
    defender.energy = clamp(defender.energy + 10, 0, MAX_ENERGY);
    return "reflect";
  }
  return "hit";
}

export function advanceRound(state, delta) {
  for (const fighter of [state.player, state.enemy]) {
    fighter.attackCooldown = Math.max(0, fighter.attackCooldown - delta);
    fighter.attackTimer = Math.max(0, fighter.attackTimer - delta);
    fighter.hitStun = Math.max(0, fighter.hitStun - delta);
    fighter.reflectTimer = Math.max(0, fighter.reflectTimer - delta);
    fighter.reflectCooldown = Math.max(0, fighter.reflectCooldown - delta);
    if (fighter.attackTimer === 0) {
      fighter.currentAttack = null;
      fighter.attackElapsed = 0;
    } else {
      fighter.attackElapsed += delta;
    }
    if (state.running && !state.ended) {
      fighter.energy = clamp(fighter.energy + fighter.energyRegen * delta, 0, MAX_ENERGY);
    }
  }

  if (!state.running || state.ended) {
    return null;
  }

  state.timeRemaining = Math.max(0, state.timeRemaining - delta);
  if (state.player.health <= 0 || state.enemy.health <= 0 || state.timeRemaining === 0) {
    const playerRatio = state.player.health / state.player.maxHealth;
    const enemyRatio = state.enemy.health / state.enemy.maxHealth;
    state.running = false;
    state.ended = true;
    state.winner = playerRatio === enemyRatio ? "draw" : playerRatio > enemyRatio ? "player" : "enemy";
    return state.winner;
  }

  return null;
}

/** A match is a series of rounds; the first fighter to take `roundsToWin` rounds wins. */
export function createSeries(roundsToWin = 2) {
  return { roundsToWin, playerWins: 0, enemyWins: 0, roundNumber: 1, winner: null };
}

export function recordRoundResult(series, roundWinner) {
  if (series.winner) {
    return series.winner;
  }
  if (roundWinner === "player") {
    series.playerWins += 1;
  } else if (roundWinner === "enemy") {
    series.enemyWins += 1;
  }
  if (series.playerWins >= series.roundsToWin) {
    series.winner = "player";
  } else if (series.enemyWins >= series.roundsToWin) {
    series.winner = "enemy";
  } else {
    series.roundNumber += 1;
  }
  return series.winner;
}

export function isMatchPoint(series) {
  return (
    !series.winner &&
    (series.playerWins === series.roundsToWin - 1 || series.enemyWins === series.roundsToWin - 1)
  );
}

/** Yaw angle (radians, around Y) that looks from `from` toward `to` on the XZ plane. */
export function angleTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function angleDifference(a, b) {
  let difference = (b - a) % (Math.PI * 2);
  if (difference > Math.PI) {
    difference -= Math.PI * 2;
  } else if (difference < -Math.PI) {
    difference += Math.PI * 2;
  }
  return difference;
}

export function isFacing(facing, from, to, arc = GUARD_ARC) {
  return Math.abs(angleDifference(facing, angleTo(from, to))) <= arc;
}

export function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
