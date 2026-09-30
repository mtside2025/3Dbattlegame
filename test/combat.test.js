import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTACKS,
  MAX_ENERGY,
  PLAYER_SPECIALS,
  REFLECT_WINDOW,
  ROUND_SECONDS,
  advanceRound,
  angleTo,
  attackPhase,
  canStartAttack,
  createRoundState,
  createSeries,
  isFacing,
  isMatchPoint,
  pressReflect,
  recordRoundResult,
  resolveBeamContact,
  resolveStrike,
  startAttack,
} from "../src/combat.js";
import { STAGES, getStage, isFinalStage } from "../src/roster.js";

test("a new round starts with full health and a 60-second timer", () => {
  const round = createRoundState({ enemyMaxHealth: 150 });

  assert.equal(round.player.health, 100);
  assert.equal(round.enemy.health, 150);
  assert.equal(round.enemy.maxHealth, 150);
  assert.equal(round.timeRemaining, ROUND_SECONDS);
  assert.equal(round.ended, false);
});

test("special attacks require and consume their energy cost", () => {
  const { player } = createRoundState();

  assert.equal(canStartAttack(player, "beam"), false);
  player.energy = ATTACKS.beam.energyCost;
  assert.equal(startAttack(player, "beam"), true);
  assert.equal(player.energy, 0);
  assert.equal(startAttack(player, "light"), false);
});

test("the player has several specials and each has a unique motion kind", () => {
  assert.ok(PLAYER_SPECIALS.length >= 4);
  const kinds = new Set(PLAYER_SPECIALS.map((name) => ATTACKS[name].kind));
  assert.equal(kinds.size, PLAYER_SPECIALS.length);
  for (const name of PLAYER_SPECIALS) {
    assert.ok(ATTACKS[name].special && ATTACKS[name].windup > 0, name);
    assert.equal(ATTACKS[name].bossOnly, undefined);
  }
});

test("specials cannot be started in the air", () => {
  const { player } = createRoundState();
  player.energy = MAX_ENERGY;
  player.airborne = true;

  assert.equal(canStartAttack(player, "cyclone"), false);
  assert.equal(canStartAttack(player, "light"), true);
});

test("attack phases progress from windup to active to recovery", () => {
  const round = createRoundState();
  startAttack(round.player, "heavy");
  assert.equal(attackPhase(round.player), "windup");

  advanceRound(round, ATTACKS.heavy.windup + 0.01);
  assert.equal(attackPhase(round.player), "active");

  advanceRound(round, ATTACKS.heavy.active + 0.05);
  assert.equal(attackPhase(round.player), "recovery");

  advanceRound(round, 1);
  assert.equal(attackPhase(round.player), null);
});

test("melee attacks only hit inside their range and arc", () => {
  const { player, enemy } = createRoundState();

  const miss = resolveStrike(player, enemy, "light", ATTACKS.light.range + 0.01);
  assert.equal(miss.hit, false);
  assert.equal(enemy.health, 100);

  const behind = resolveStrike(player, enemy, "light", 1, { angle: Math.PI });
  assert.equal(behind.hit, false);

  const hit = resolveStrike(player, enemy, "light", ATTACKS.light.range);
  assert.equal(hit.hit, true);
  assert.equal(hit.damage, ATTACKS.light.damage);
  assert.equal(enemy.health, 100 - ATTACKS.light.damage);
  assert.equal(player.energy, ATTACKS.light.energyGain);
});

test("spinning attacks hit all around the attacker", () => {
  const { player, enemy } = createRoundState();
  const result = resolveStrike(player, enemy, "cyclone", 1, { angle: Math.PI });
  assert.equal(result.hit, true);
});

test("guarding reduces damage and knockback only when the shield faces the attack", () => {
  const { player, enemy } = createRoundState();
  enemy.guarding = true;

  const result = resolveStrike(player, enemy, "heavy", 1);

  assert.equal(result.blocked, true);
  assert.equal(result.damage, Math.round(ATTACKS.heavy.damage * 0.25));
  assert.ok(result.knockback < ATTACKS.heavy.knockback);
  assert.equal(enemy.health, 96);

  const fromBehind = resolveStrike(player, enemy, "heavy", 1, { guardFacing: false });
  assert.equal(fromBehind.blocked, false);
  assert.equal(fromBehind.damage, ATTACKS.heavy.damage);
});

test("damage scale makes stronger opponents hit harder", () => {
  const { player, enemy } = createRoundState();
  const result = resolveStrike(enemy, player, "heavy", 1, { damageScale: 1.5 });
  assert.equal(result.damage, Math.round(ATTACKS.heavy.damage * 1.5));
});

test("energy gain is capped at the maximum", () => {
  const { player, enemy } = createRoundState();
  player.energy = MAX_ENERGY - 1;

  resolveStrike(player, enemy, "heavy", 1);

  assert.equal(player.energy, MAX_ENERGY);
});

test("pressing reflect with good timing bounces a beam back", () => {
  const round = createRoundState();
  const { player } = round;

  assert.equal(pressReflect(player), true);
  assert.equal(player.reflectTimer, REFLECT_WINDOW);
  assert.equal(resolveBeamContact(player, true), "reflect");
  assert.equal(player.reflectTimer, 0);
});

test("reflect fails when pressed too early, facing away or mashed", () => {
  const round = createRoundState();
  const { player } = round;

  pressReflect(player);
  advanceRound(round, REFLECT_WINDOW + 0.01);
  assert.equal(resolveBeamContact(player, true), "hit");

  assert.equal(pressReflect(player), false, "cooldown prevents mashing");
  advanceRound(round, 1);
  pressReflect(player);
  assert.equal(resolveBeamContact(player, false), "hit");
});

test("facing helpers work on the XZ plane", () => {
  const origin = { x: 0, z: 0 };
  assert.equal(angleTo(origin, { x: 0, z: 1 }), 0);
  assert.ok(isFacing(Math.PI / 2, origin, { x: 3, z: 0.2 }));
  assert.equal(isFacing(-Math.PI / 2, origin, { x: 3, z: 0 }), false);
});

test("a knockout ends the round and selects the player", () => {
  const round = createRoundState();
  round.running = true;
  round.enemy.health = 0;

  const winner = advanceRound(round, 0.016);

  assert.equal(winner, "player");
  assert.equal(round.ended, true);
  assert.equal(round.running, false);
});

test("time up compares remaining health ratios and supports draws", () => {
  const round = createRoundState({ enemyMaxHealth: 200 });
  round.running = true;
  round.timeRemaining = 0.01;
  round.player.health = 60;
  round.enemy.health = 100;

  assert.equal(advanceRound(round, 0.02), "player");

  const draw = createRoundState();
  draw.running = true;
  draw.timeRemaining = 0;
  assert.equal(advanceRound(draw, 0.01), "draw");
});

test("cooldowns, hit stun and reflect timers never become negative", () => {
  const round = createRoundState();
  round.player.attackCooldown = 0.2;
  round.player.attackTimer = 0.1;
  round.player.hitStun = 0.05;
  round.player.reflectTimer = 0.05;

  advanceRound(round, 1);

  assert.equal(round.player.attackCooldown, 0);
  assert.equal(round.player.attackTimer, 0);
  assert.equal(round.player.hitStun, 0);
  assert.equal(round.player.reflectTimer, 0);
  assert.equal(round.player.currentAttack, null);
});

test("energy regenerates only while the round is running", () => {
  const round = createRoundState();
  advanceRound(round, 1);
  assert.equal(round.player.energy, 0);

  round.running = true;
  advanceRound(round, 1);
  assert.ok(round.player.energy > 0);
});

test("a match is won by the first fighter to take the required rounds", () => {
  const series = createSeries(2);

  assert.equal(recordRoundResult(series, "player"), null);
  assert.equal(series.roundNumber, 2);
  assert.equal(isMatchPoint(series), true);
  assert.equal(recordRoundResult(series, "draw"), null);
  assert.equal(series.playerWins, 1);
  assert.equal(recordRoundResult(series, "enemy"), null);
  assert.equal(recordRoundResult(series, "enemy"), "enemy");
  assert.equal(series.enemyWins, 2);
  assert.equal(recordRoundResult(series, "player"), "enemy", "finished matches do not change");
  assert.equal(series.playerWins, 1);
});

test("opponents get stronger each stage and the last one is a boss with a unique special", () => {
  for (let i = 1; i < STAGES.length; i += 1) {
    const previous = STAGES[i - 1];
    const current = STAGES[i];
    assert.ok(current.maxHealth >= previous.maxHealth);
    assert.ok(current.damageScale > previous.damageScale);
    assert.ok(current.ai.reaction < previous.ai.reaction);
    assert.ok(current.ai.guard >= previous.ai.guard);
  }

  const boss = STAGES.at(-1);
  assert.equal(boss.boss, true);
  assert.equal(isFinalStage(STAGES.length - 1), true);
  assert.equal(getStage(99), boss);
  assert.ok(ATTACKS[boss.signature].bossOnly);
  assert.ok(boss.specials.includes(boss.signature));
  assert.ok(STAGES.slice(0, -1).every((stage) => !stage.specials.includes(boss.signature)));
});
