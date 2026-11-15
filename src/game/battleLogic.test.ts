import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTypeEffectiveness,
  calculateStat,
  calculateDamage,
  getExpForLevel,
  calculateCatchShakes,
  checkEvolution,
  createPokemonInstance,
} from './battleLogic';
import { BasePokemonData, Move } from './types';

test('type effectiveness chart calculates correct multipliers', () => {
  // Fire vs Grass: 2x
  assert.equal(getTypeEffectiveness('fire', ['grass']), 2);
  // Water vs Fire: 2x
  assert.equal(getTypeEffectiveness('water', ['fire']), 2);
  // Grass vs Water: 2x
  assert.equal(getTypeEffectiveness('grass', ['water']), 2);
  // Fire vs Water: 0.5x
  assert.equal(getTypeEffectiveness('fire', ['water']), 0.5);
  // Electric vs Ground: 0x (immune)
  assert.equal(getTypeEffectiveness('electric', ['ground']), 0);
  // Grass vs Water/Ground dual type: 2 * 2 = 4x
  assert.equal(getTypeEffectiveness('grass', ['water', 'ground']), 4);
  // Normal vs Ghost: 0x
  assert.equal(getTypeEffectiveness('normal', ['ghost']), 0);
});

test('stat calculations scale properly with level', () => {
  // Level 5 Turtwig (base HP 55): ((2*55 + 15)*5)/100 + 5 + 10 = 6 + 15 = 21
  const hpLv5 = calculateStat(55, 5, true);
  assert.ok(hpLv5 >= 20 && hpLv5 <= 22, `HP at level 5 was ${hpLv5}`);

  // Level 50 Turtwig
  const hpLv50 = calculateStat(55, 50, true);
  assert.ok(hpLv50 > hpLv5, 'Higher level must have higher HP');

  // Attack stat calculation
  const atk = calculateStat(68, 5);
  assert.ok(atk >= 10 && atk <= 13);
});

test('damage calculation deals non-zero damage and applies multipliers', () => {
  const tackle: Move = {
    id: 'tackle',
    name: 'Tackle',
    type: 'normal',
    category: 'physical',
    power: 40,
    accuracy: 100,
    pp: 35,
    maxPp: 35,
    description: 'A physical attack in which the user charges.',
  };

  const waterGun: Move = {
    id: 'water_gun',
    name: 'Water Gun',
    type: 'water',
    category: 'special',
    power: 40,
    accuracy: 100,
    pp: 25,
    maxPp: 25,
    description: 'The target is blasted with a forceful shot of water.',
  };

  const baseAttacker: BasePokemonData = {
    id: 393,
    name: 'Piplup',
    koreanName: '팽도리',
    types: ['water'],
    baseStats: { hp: 53, attack: 51, defense: 53, spAtk: 61, spDef: 56, speed: 40 },
    baseExp: 63,
    catchRate: 45,
    learnableMoves: [{ level: 1, move: tackle }, { level: 8, move: waterGun }],
    description: '펭귄 포켓몬',
    color: '#3b82f6',
  };

  const baseDefenderFire: BasePokemonData = {
    id: 390,
    name: 'Chimchar',
    koreanName: '불꽃숭이',
    types: ['fire'],
    baseStats: { hp: 44, attack: 58, defense: 44, spAtk: 58, spDef: 44, speed: 61 },
    baseExp: 62,
    catchRate: 45,
    learnableMoves: [{ level: 1, move: tackle }],
    description: '꼬마원숭이 포켓몬',
    color: '#f97316',
  };

  const attacker = createPokemonInstance(baseAttacker, 10);
  const defenderFire = createPokemonInstance(baseDefenderFire, 10);

  // Normal tackle
  const resTackle = calculateDamage(attacker, defenderFire, tackle, false, 1.0);
  assert.ok(resTackle.damage > 0);
  assert.equal(resTackle.effectiveness, 1.0);

  // Super effective STAB Water Gun (Water vs Fire = 2x, STAB = 1.5x)
  const resWaterGun = calculateDamage(attacker, defenderFire, waterGun, false, 1.0);
  assert.ok(resWaterGun.damage > resTackle.damage, 'Super effective STAB must deal more damage');
  assert.equal(resWaterGun.effectiveness, 2.0);
  assert.equal(resWaterGun.isStab, true);
  assert.equal(resWaterGun.messageKey, 'super');
});

test('catch calculation returns shakes and high chance on low HP', () => {
  // At 1 HP with high catch rate, catch is guaranteed or very likely
  const easyCatch = calculateCatchShakes(100, 1, 255, 1.0, 'sleep');
  assert.equal(easyCatch.caught, true);
  assert.equal(easyCatch.shakes, 3);

  // EXP progression formula increases with level
  assert.equal(getExpForLevel(1), 1);
  assert.equal(getExpForLevel(10), 1000);
  assert.equal(getExpForLevel(20), 8000);
});

test('evolution check triggers at designated level', () => {
  const baseTurtwig: BasePokemonData = {
    id: 387,
    name: 'Turtwig',
    koreanName: '모부기',
    types: ['grass'],
    baseStats: { hp: 55, attack: 68, defense: 64, spAtk: 45, spDef: 55, speed: 31 },
    baseExp: 64,
    catchRate: 45,
    evolution: { level: 18, evolvesToId: 388 },
    learnableMoves: [],
    description: '어린잎포켓몬',
    color: '#22c55e',
  };

  const turtwigLv15 = createPokemonInstance(baseTurtwig, 15);
  const evo15 = checkEvolution(turtwigLv15, baseTurtwig);
  assert.equal(evo15.shouldEvolve, false);

  const turtwigLv18 = createPokemonInstance(baseTurtwig, 18);
  const evo18 = checkEvolution(turtwigLv18, baseTurtwig);
  assert.equal(evo18.shouldEvolve, true);
  assert.equal(evo18.targetBaseId, 388);
});
