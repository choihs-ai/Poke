/**
 * Pokemon Gen 4 Sinnoh Adventure Types & Data Structures
 */

export type PokemonType =
  | 'normal'
  | 'fire'
  | 'water'
  | 'grass'
  | 'electric'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'steel'
  | 'dark';

export type MoveCategory = 'physical' | 'special' | 'status';

export interface Move {
  id: string;
  name: string;
  type: PokemonType;
  category: MoveCategory;
  power: number;
  accuracy: number;
  pp: number;
  maxPp: number;
  effect?: 'burn' | 'paralyze' | 'lower_defense' | 'lower_attack' | 'heal' | 'speed_boost';
  description: string;
}

export interface BasePokemonData {
  id: number;
  name: string;
  koreanName: string;
  types: PokemonType[];
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    spAtk: number;
    spDef: number;
    speed: number;
  };
  baseExp: number;
  catchRate: number;
  evolution?: {
    level: number;
    evolvesToId: number;
  };
  learnableMoves: {
    level: number;
    move: Move;
  }[];
  description: string;
  color: string;
}

export interface PokemonInstance {
  uid: string;
  baseId: number;
  name: string;
  koreanName: string;
  types: PokemonType[];
  level: number;
  currentHp: number;
  maxHp: number;
  attack: number;
  defense: number;
  spAtk: number;
  spDef: number;
  speed: number;
  exp: number;
  expToNextLevel: number;
  status?: 'paralysis' | 'burn' | 'sleep' | 'poison' | null;
  moves: Move[];
  isFainted: boolean;
  caughtWithBall?: string;
}

export interface Item {
  id: string;
  name: string;
  category: 'ball' | 'medicine' | 'key_item' | 'battle';
  price: number;
  count: number;
  description: string;
  icon: string;
  effectValue?: number;
}

export interface Trainer {
  id: string;
  name: string;
  title: string;
  sprite: string;
  dialogBefore: string;
  dialogAfter: string;
  rewardMoney: number;
  party: {
    baseId: number;
    level: number;
  }[];
  defeated: boolean;
  isGymLeader?: boolean;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface OverworldNPC {
  id: string;
  name: string;
  x: number;
  y: number;
  direction: Direction;
  sprite: string;
  dialog: string[];
  trainerId?: string;
  isHealer?: boolean;
  isShop?: boolean;
  isStarterSelector?: boolean;
  isRival?: boolean;
}

export interface Warp {
  x: number;
  y: number;
  targetMap: string;
  targetX: number;
  targetY: number;
}

export interface Signpost {
  x: number;
  y: number;
  title: string;
  text: string;
}

export interface MapData {
  id: string;
  name: string;
  koreanName: string;
  width: number;
  height: number;
  tiles: number[][]; // 0: grass, 1: path, 2: tall grass, 3: water, 4: tree, 5: flower, 6: building, 7: door, 8: rock/mountain
  npcs: OverworldNPC[];
  warps: Warp[];
  signposts: Signpost[];
  wildEncounters?: {
    baseId: number;
    minLevel: number;
    maxLevel: number;
    weight: number;
  }[];
  bgm: 'town' | 'route' | 'city' | 'cave';
}

export interface PlayerState {
  name: string;
  x: number;
  y: number;
  direction: Direction;
  currentMap: string;
  party: PokemonInstance[];
  box: PokemonInstance[];
  inventory: Item[];
  money: number;
  badges: string[];
  hasRunningShoes: boolean;
  hasBicycle: boolean;
  hasPokedex: boolean;
  hasPoketch: boolean;
  seenPokemon: number[];
  caughtPokemon: number[];
  storyFlags: Record<string, boolean>;
  playTimeSeconds: number;
}

export type GameScreen =
  | 'title'
  | 'starter_select'
  | 'overworld'
  | 'battle'
  | 'evolution'
  | 'menu'
  | 'bag'
  | 'party'
  | 'pokedex'
  | 'poketch'
  | 'shop'
  | 'gym_clear';
