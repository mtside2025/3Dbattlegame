export const FIGHTER_MAX_HEALTH = 100;
export const MAX_ENERGY = 100;
export const ROUND_SECONDS = 60;

export const ATTACKS = Object.freeze({
  light: Object.freeze({
    damage: 8,
    range: 1.75,
    cooldown: 0.36,
    duration: 0.24,
    energyCost: 0,
    energyGain: 10,
    knockback: 0.22,
  }),
  heavy: Object.freeze({
    damage: 15,
    range: 2.2,
    cooldown: 0.78,
    duration: 0.46,
    energyCost: 0,
    energyGain: 16,
    knockback: 0.55,
  }),
  special: Object.freeze({
    damage: 22,
    range: Number.POSITIVE_INFINITY,
    cooldown: 1.05,
    duration: 0.58,
    energyCost: 40,
    energyGain: 0,
    knockback: 0.8,
  }),
});

export function createFighterState() {
  return {
    health: FIGHTER_MAX_HEALTH,
    energy: 0,
    attackCooldown: 0,
    attackTimer: 0,
    hitStun: 0,
    guarding: false,
    airborne: false,
    currentAttack: null,
  };
}

export function createMatchState() {
  return {
    running: false,
    ended: false,
    timeRemaining: ROUND_SECONDS,
    winner: null,
    player: createFighterState(),
    enemy: createFighterState(),
  };
}

export function canStartAttack(fighter, attackName) {
  const attack = ATTACKS[attackName];
  return Boolean(
    attack &&
      fighter.attackCooldown <= 0 &&
      fighter.hitStun <= 0 &&
      !fighter.guarding &&
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
  fighter.currentAttack = attackName;
  return true;
}

export function resolveStrike(attacker, defender, attackName, distance) {
  const attack = ATTACKS[attackName];
  if (!attack || distance > attack.range || defender.health <= 0) {
    return { hit: false, damage: 0, knockback: 0, blocked: false };
  }

  const blocked = defender.guarding && !defender.airborne;
  const damage = Math.max(1, Math.round(attack.damage * (blocked ? 0.25 : 1)));
  defender.health = clamp(defender.health - damage, 0, FIGHTER_MAX_HEALTH);
  defender.hitStun = blocked ? 0.08 : attackName === "heavy" || attackName === "special" ? 0.32 : 0.16;
  attacker.energy = clamp(attacker.energy + attack.energyGain, 0, MAX_ENERGY);
  defender.energy = clamp(defender.energy + (blocked ? 4 : 7), 0, MAX_ENERGY);

  return {
    hit: true,
    damage,
    knockback: attack.knockback * (blocked ? 0.3 : 1),
    blocked,
  };
}

export function advanceMatch(state, delta) {
  for (const fighter of [state.player, state.enemy]) {
    fighter.attackCooldown = Math.max(0, fighter.attackCooldown - delta);
    fighter.attackTimer = Math.max(0, fighter.attackTimer - delta);
    fighter.hitStun = Math.max(0, fighter.hitStun - delta);
    if (fighter.attackTimer === 0) {
      fighter.currentAttack = null;
    }
  }

  if (!state.running || state.ended) {
    return null;
  }

  state.timeRemaining = Math.max(0, state.timeRemaining - delta);
  if (state.player.health <= 0 || state.enemy.health <= 0 || state.timeRemaining === 0) {
    state.running = false;
    state.ended = true;
    state.winner =
      state.player.health === state.enemy.health
        ? "draw"
        : state.player.health > state.enemy.health
          ? "player"
          : "enemy";
    return state.winner;
  }

  return null;
}

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
