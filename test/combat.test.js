import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTACKS,
  MAX_ENERGY,
  ROUND_SECONDS,
  advanceMatch,
  canStartAttack,
  createMatchState,
  resolveStrike,
  startAttack,
} from "../src/combat.js";

test("a new match starts with full health and a 60-second timer", () => {
  const match = createMatchState();

  assert.equal(match.player.health, 100);
  assert.equal(match.enemy.health, 100);
  assert.equal(match.timeRemaining, ROUND_SECONDS);
  assert.equal(match.ended, false);
});

test("special attacks require and consume 40 energy", () => {
  const { player } = createMatchState();

  assert.equal(canStartAttack(player, "special"), false);
  player.energy = ATTACKS.special.energyCost;
  assert.equal(startAttack(player, "special"), true);
  assert.equal(player.energy, 0);
  assert.equal(startAttack(player, "light"), false);
});

test("melee attacks only hit inside their range", () => {
  const { player, enemy } = createMatchState();

  const miss = resolveStrike(player, enemy, "light", ATTACKS.light.range + 0.01);
  assert.equal(miss.hit, false);
  assert.equal(enemy.health, 100);

  const hit = resolveStrike(player, enemy, "light", ATTACKS.light.range);
  assert.equal(hit.hit, true);
  assert.equal(hit.damage, ATTACKS.light.damage);
  assert.equal(enemy.health, 92);
  assert.equal(player.energy, ATTACKS.light.energyGain);
});

test("guarding reduces damage and knockback", () => {
  const { player, enemy } = createMatchState();
  enemy.guarding = true;

  const result = resolveStrike(player, enemy, "heavy", 1);

  assert.equal(result.blocked, true);
  assert.equal(result.damage, Math.round(ATTACKS.heavy.damage * 0.25));
  assert.ok(result.knockback < ATTACKS.heavy.knockback);
  assert.equal(enemy.health, 96);
});

test("energy gain is capped at the maximum", () => {
  const { player, enemy } = createMatchState();
  player.energy = MAX_ENERGY - 1;

  resolveStrike(player, enemy, "heavy", 1);

  assert.equal(player.energy, MAX_ENERGY);
});

test("a knockout ends the match and selects the player", () => {
  const match = createMatchState();
  match.running = true;
  match.enemy.health = 0;

  const winner = advanceMatch(match, 0.016);

  assert.equal(winner, "player");
  assert.equal(match.ended, true);
  assert.equal(match.running, false);
});

test("time up selects the fighter with more health and supports draws", () => {
  const match = createMatchState();
  match.running = true;
  match.timeRemaining = 0.01;
  match.player.health = 70;
  match.enemy.health = 40;

  assert.equal(advanceMatch(match, 0.02), "player");

  const draw = createMatchState();
  draw.running = true;
  draw.timeRemaining = 0;
  assert.equal(advanceMatch(draw, 0.01), "draw");
});

test("cooldowns and hit stun never become negative", () => {
  const match = createMatchState();
  match.player.attackCooldown = 0.2;
  match.player.attackTimer = 0.1;
  match.player.hitStun = 0.05;

  advanceMatch(match, 1);

  assert.equal(match.player.attackCooldown, 0);
  assert.equal(match.player.attackTimer, 0);
  assert.equal(match.player.hitStun, 0);
  assert.equal(match.player.currentAttack, null);
});
