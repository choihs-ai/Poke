/**
 * Core Pokemon Battle Logic & Math Engine (Gen 4 Diamond & Pearl formula)
 */

import { PokemonType, Move, PokemonInstance, BasePokemonData } from './types';

// Gen 4 Type Effectiveness Chart
export const TYPE_CHART: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  electric: { water: 2, grass: 0.5, electric: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  ground: { fire: 2, grass: 0.5, electric: 2, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { grass: 2, electric: 0.5, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5 },
  dragon: { dragon: 2, steel: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5 },
};

/**
 * Calculates type effectiveness multiplier against 1 or 2 target types
 */
export function getTypeEffectiveness(moveType: PokemonType, targetTypes: PokemonType[]): number {
  let multiplier = 1;
  const attackChart = TYPE_CHART[moveType] || {};
  for (const defType of targetTypes) {
    if (attackChart[defType] !== undefined) {
      multiplier *= attackChart[defType]!;
    }
  }
  return multiplier;
}

/**
 * Calculates stat based on base stat, level, IV (default 15/31), EV (default 0)
 */
export function calculateStat(base: number, level: number, isHp = false): number {
  if (isHp) {
    if (base === 1) return 1; // Shedinja
    return Math.floor(((2 * base + 15) * level) / 100) + level + 10;
  }
  return Math.floor(((2 * base + 15) * level) / 100) + 5;
}

/**
 * Calculates damage dealt by an attack in Gen 4 rules
 */
export interface DamageResult {
  damage: number;
  effectiveness: number;
  isCritical: boolean;
  isStab: boolean;
  messageKey: 'effective' | 'super' | 'not_very' | 'immune' | 'normal';
}

export function calculateDamage(
  attacker: PokemonInstance,
  defender: PokemonInstance,
  move: Move,
  forceCrit = false,
  randomFactor?: number
): DamageResult {
  if (move.power <= 0 || move.category === 'status') {
    return {
      damage: 0,
      effectiveness: 1,
      isCritical: false,
      isStab: false,
      messageKey: 'normal',
    };
  }

  const effectiveness = getTypeEffectiveness(move.type, defender.types);
  if (effectiveness === 0) {
    return {
      damage: 0,
      effectiveness: 0,
      isCritical: false,
      isStab: false,
      messageKey: 'immune',
    };
  }

  // Physical vs Special stats
  const atk = move.category === 'physical' ? attacker.attack : attacker.spAtk;
  const def = move.category === 'physical' ? defender.defense : defender.spDef;

  // Level scaling: (2 * L / 5 + 2)
  const levelFactor = Math.floor((2 * attacker.level) / 5 + 2);
  let baseDamage = Math.floor((levelFactor * move.power * (atk / Math.max(1, def))) / 50) + 2;

  // Critical hit (~6.25% chance unless forced)
  const isCritical = forceCrit || Math.random() < 0.0625;
  if (isCritical) {
    baseDamage = Math.floor(baseDamage * 1.5);
  }

  // STAB (Same-Type Attack Bonus) = 1.5x
  const isStab = attacker.types.includes(move.type);
  if (isStab) {
    baseDamage = Math.floor(baseDamage * 1.5);
  }

  // Type multiplier
  baseDamage = Math.floor(baseDamage * effectiveness);

  // Random factor between 0.85 and 1.00
  const rand = randomFactor !== undefined ? randomFactor : 0.85 + Math.random() * 0.15;
  const finalDamage = Math.max(1, Math.floor(baseDamage * rand));

  let messageKey: 'effective' | 'super' | 'not_very' | 'immune' | 'normal' = 'normal';
  if (effectiveness > 1) {
    messageKey = 'super';
  } else if (effectiveness < 1) {
    messageKey = 'not_very';
  }

  return {
    damage: finalDamage,
    effectiveness,
    isCritical,
    isStab,
    messageKey,
  };
}

/**
 * Calculates EXP threshold for a given level (Medium Fast curve: n^3)
 */
export function getExpForLevel(level: number): number {
  return Math.floor(Math.pow(level, 3));
}

/**
 * Calculates EXP awarded from defeating a Pokemon
 */
export function calculateExpYield(baseExp: number, faintedLevel: number, isTrainer = false): number {
  const trainerBonus = isTrainer ? 1.5 : 1.0;
  return Math.floor((baseExp * faintedLevel * trainerBonus) / 7);
}

/**
 * Calculates catching probability and shake checks (0-4 shakes, 4 = caught)
 */
export function calculateCatchShakes(
  maxHp: number,
  currentHp: number,
  catchRate: number,
  ballMultiplier = 1.0,
  status: PokemonInstance['status'] = null
): { caught: boolean; shakes: number } {
  // Status bonus
  let statusBonus = 1;
  if (status === 'sleep') statusBonus = 2.0;
  else if (status === 'paralysis' || status === 'burn' || status === 'poison') statusBonus = 1.5;

  // Gen 4 modified catch rate: a = ((3 * MaxHP - 2 * CurrHP) * 4096 * CatchRate * BallMultiplier) / (3 * MaxHP) * StatusBonus
  const a = Math.floor(
    (((3 * maxHp - 2 * Math.max(1, currentHp)) * catchRate * ballMultiplier) / (3 * maxHp)) * statusBonus
  );

  if (a >= 255) {
    return { caught: true, shakes: 3 };
  }

  // Shake probability: b = 65536 / (255 / a)^0.25
  const b = Math.floor(65536 / Math.pow(255 / Math.max(1, a), 0.25));

  let shakes = 0;
  for (let i = 0; i < 3; i++) {
    const roll = Math.floor(Math.random() * 65536);
    if (roll < b) {
      shakes++;
    } else {
      break;
    }
  }

  const caught = shakes === 3;
  return { caught, shakes };
}

/**
 * Creates a PokemonInstance from BasePokemonData
 */
export function createPokemonInstance(
  base: BasePokemonData,
  level: number,
  customMoves?: Move[]
): PokemonInstance {
  const maxHp = calculateStat(base.baseStats.hp, level, true);
  const attack = calculateStat(base.baseStats.attack, level);
  const defense = calculateStat(base.baseStats.defense, level);
  const spAtk = calculateStat(base.baseStats.spAtk, level);
  const spDef = calculateStat(base.baseStats.spDef, level);
  const speed = calculateStat(base.baseStats.speed, level);

  // Available moves up to current level
  let moves = customMoves;
  if (!moves || moves.length === 0) {
    const available = base.learnableMoves.filter((m) => m.level <= level);
    moves = available.slice(-4).map((m) => ({ ...m.move }));
  }

  const expCurrent = getExpForLevel(level);
  const expNext = getExpForLevel(level + 1);

  return {
    uid: Math.random().toString(36).substring(2, 9),
    baseId: base.id,
    name: base.name,
    koreanName: base.koreanName,
    types: [...base.types],
    level,
    currentHp: maxHp,
    maxHp,
    attack,
    defense,
    spAtk,
    spDef,
    speed,
    exp: expCurrent,
    expToNextLevel: expNext,
    status: null,
    moves,
    isFainted: false,
  };
}

/**
 * Checks if a pokemon should evolve
 */
export function checkEvolution(
  pokemon: PokemonInstance,
  base: BasePokemonData
): { shouldEvolve: boolean; targetBaseId?: number } {
  if (base.evolution && pokemon.level >= base.evolution.level) {
    return {
      shouldEvolve: true,
      targetBaseId: base.evolution.evolvesToId,
    };
  }
  return { shouldEvolve: false };
}
