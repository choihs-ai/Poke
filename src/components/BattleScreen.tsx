/**
 * Pokemon Gen 4 Diamond & Pearl Battle Screen Component
 * Uses authentic Gen 4 pixel battle backdrops and authentic Nintendo DS Pokemon sprites.
 */

import React, { useState, useEffect } from 'react';
import { PokemonInstance, Move, Item } from '../game/types';
import { POKEDEX } from '../game/pokemonData';
import {
  calculateDamage,
  calculateExpYield,
  calculateCatchShakes,
  getExpForLevel,
} from '../game/battleLogic';
import { sound } from '../game/soundEngine';
import { getPokemonSpriteUrl, getPokemonFallbackSpriteUrl, getPixelIconDataUrl } from '../game/spriteRenderer';
import battleBgGrass from '../assets/images/battle_bg_grass.png';
import battleBgCave from '../assets/images/battle_bg_cave.png';

interface BattleScreenProps {
  playerPokemon: PokemonInstance;
  enemyPokemon: PokemonInstance;
  isTrainerBattle: boolean;
  trainerName?: string;
  trainerReward?: number;
  playerParty: PokemonInstance[];
  inventory: Item[];
  onBattleEnd: (result: {
    won: boolean;
    escaped: boolean;
    caughtPokemon?: PokemonInstance;
    expGained: number;
    moneyGained: number;
    updatedPlayerPokemon: PokemonInstance;
    updatedParty: PokemonInstance[];
    updatedInventory: Item[];
  }) => void;
}

type BattleMenuMode = 'main' | 'moves' | 'bag' | 'party' | 'message';

export const BattleScreen: React.FC<BattleScreenProps> = ({
  playerPokemon: initialPlayerPokemon,
  enemyPokemon: initialEnemyPokemon,
  isTrainerBattle,
  trainerName,
  trainerReward = 0,
  playerParty: initialParty,
  inventory: initialInventory,
  onBattleEnd,
}) => {
  const [playerPokemon, setPlayerPokemon] = useState<PokemonInstance>(initialPlayerPokemon);
  const [enemyPokemon, setEnemyPokemon] = useState<PokemonInstance>(initialEnemyPokemon);
  const [party, setParty] = useState<PokemonInstance[]>(initialParty);
  const [inventory, setInventory] = useState<Item[]>(initialInventory);

  const [menuMode, setMenuMode] = useState<BattleMenuMode>('message');
  const [dialogText, setDialogText] = useState<string>('');
  const [isProcessingTurn, setIsProcessingTurn] = useState<boolean>(true);

  // Animation & Visual FX states
  const [playerHitFlash, setPlayerHitFlash] = useState<boolean>(false);
  const [enemyHitFlash, setEnemyHitFlash] = useState<boolean>(false);
  const [cameraShake, setCameraShake] = useState<boolean>(false);
  const [activeAttackFx, setActiveAttackFx] = useState<{
    type: string;
    target: 'player' | 'enemy';
  } | null>(null);

  // Catching animation
  const [throwingBall, setThrowingBall] = useState<boolean>(false);
  const [ballShakes, setBallShakes] = useState<number>(0);
  const [ballCaught, setBallCaught] = useState<boolean>(false);

  // Fallback state if CDN image fails
  const [enemySpriteFallback, setEnemySpriteFallback] = useState<boolean>(false);
  const [playerSpriteFallback, setPlayerSpriteFallback] = useState<boolean>(false);

  // Initial battle entrance dialog
  useEffect(() => {
    sound.playBgm(isTrainerBattle ? 'battle_trainer' : 'battle_wild');

    const intro = isTrainerBattle
      ? `${trainerName}이(가) 승부를 걸어왔다!`
      : `앗! 야생 ${initialEnemyPokemon.koreanName}이(가) 나타났다!`;

    setDialogText(intro);

    const timer = setTimeout(() => {
      setDialogText(`가라! ${initialPlayerPokemon.koreanName}!`);
      setTimeout(() => {
        setIsProcessingTurn(false);
        setMenuMode('main');
        setDialogText(`무엇을 할까?`);
      }, 1000);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  // Handle Player choosing an Attack
  const handleSelectMove = async (move: Move) => {
    if (isProcessingTurn || move.pp <= 0) return;
    setIsProcessingTurn(true);
    setMenuMode('message');
    sound.playConfirm();

    // Deduct PP
    const updatedMoves = playerPokemon.moves.map((m) =>
      m.id === move.id ? { ...m, pp: m.pp - 1 } : m
    );
    const updatedPlayer = { ...playerPokemon, moves: updatedMoves };
    setPlayerPokemon(updatedPlayer);

    // Speed comparison determines who acts first
    const playerFirst = playerPokemon.speed >= enemyPokemon.speed;

    if (playerFirst) {
      await executeAttack(updatedPlayer, enemyPokemon, move, 'enemy');
      if (enemyPokemon.currentHp <= 0) {
        return;
      }
      await executeEnemyTurn(updatedPlayer, enemyPokemon);
    } else {
      await executeEnemyTurn(updatedPlayer, enemyPokemon);
      if (updatedPlayer.currentHp <= 0) {
        return;
      }
      await executeAttack(updatedPlayer, enemyPokemon, move, 'enemy');
    }

    setIsProcessingTurn(false);
    setMenuMode('main');
    setDialogText(`무엇을 할까?`);
  };

  // Attack execution logic with animations & sound
  const executeAttack = async (
    attacker: PokemonInstance,
    defender: PokemonInstance,
    move: Move,
    target: 'player' | 'enemy'
  ) => {
    setDialogText(`${attacker.koreanName}의 ${move.name}!`);

    setActiveAttackFx({ type: move.type, target });
    await new Promise((r) => setTimeout(r, 600));
    setActiveAttackFx(null);

    // Accuracy check
    const hitSuccess = Math.random() * 100 <= move.accuracy;
    if (!hitSuccess) {
      sound.playCancel();
      setDialogText(`그러나 공격은 빗나갔다!`);
      await new Promise((r) => setTimeout(r, 900));
      return;
    }

    if (move.category === 'status') {
      sound.playSelect();
      if (move.effect === 'lower_defense') {
        setDialogText(`${defender.koreanName}의 방어가 떨어졌다!`);
      } else if (move.effect === 'lower_attack') {
        setDialogText(`${defender.koreanName}의 공격이 떨어졌다!`);
      } else if (move.effect === 'heal') {
        const healAmt = Math.floor(attacker.maxHp * 0.4);
        attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmt);
        setDialogText(`${attacker.koreanName}의 HP가 회복되었다!`);
      }
      await new Promise((r) => setTimeout(r, 900));
      return;
    }

    // Damage calculations
    const damageResult = calculateDamage(attacker, defender, move);
    sound.playHit(damageResult.effectiveness > 1, damageResult.isCritical);

    setCameraShake(true);
    if (target === 'player') setPlayerHitFlash(true);
    else setEnemyHitFlash(true);

    setTimeout(() => {
      setCameraShake(false);
      setPlayerHitFlash(false);
      setEnemyHitFlash(false);
    }, 200);

    const nextDefenderHp = Math.max(0, defender.currentHp - damageResult.damage);
    defender.currentHp = nextDefenderHp;

    if (target === 'player') {
      setPlayerPokemon({ ...defender });
    } else {
      setEnemyPokemon({ ...defender });
    }

    await new Promise((r) => setTimeout(r, 500));

    if (damageResult.isCritical) {
      setDialogText(`급소에 맞았다!`);
      await new Promise((r) => setTimeout(r, 700));
    }
    if (damageResult.messageKey === 'super') {
      setDialogText(`효과가 굉장했다!`);
      await new Promise((r) => setTimeout(r, 700));
    } else if (damageResult.messageKey === 'not_very') {
      setDialogText(`효과가 별로인 듯하다...`);
      await new Promise((r) => setTimeout(r, 700));
    } else if (damageResult.messageKey === 'immune') {
      setDialogText(`효과가 없는 것 같다...`);
      await new Promise((r) => setTimeout(r, 700));
    }

    // Faint check
    if (nextDefenderHp <= 0) {
      defender.isFainted = true;
      setDialogText(`${defender.koreanName}은(는) 쓰러졌다!`);
      sound.playCancel();
      await new Promise((r) => setTimeout(r, 1000));

      if (target === 'enemy') {
        const base = POKEDEX[defender.baseId];
        const expYield = calculateExpYield(base.baseExp, defender.level, isTrainerBattle);
        sound.playLevelUp();
        setDialogText(`${attacker.koreanName}은(는) ${expYield} 경험치를 얻었다!`);

        let updatedLevel = attacker.level;
        let currentExp = attacker.exp + expYield;
        let expToNext = attacker.expToNextLevel;

        if (currentExp >= expToNext) {
          updatedLevel += 1;
          expToNext = getExpForLevel(updatedLevel + 1);
          await new Promise((r) => setTimeout(r, 1000));
          sound.playLevelUp();
          setDialogText(`${attacker.koreanName}의 레벨이 ${updatedLevel}(으)로 올랐다!`);
        }

        const finalPlayer: PokemonInstance = {
          ...attacker,
          level: updatedLevel,
          exp: currentExp,
          expToNextLevel: expToNext,
        };

        const updatedParty = party.map((p) => (p.uid === finalPlayer.uid ? finalPlayer : p));
        await new Promise((r) => setTimeout(r, 1200));

        onBattleEnd({
          won: true,
          escaped: false,
          expGained: expYield,
          moneyGained: trainerReward,
          updatedPlayerPokemon: finalPlayer,
          updatedParty,
          updatedInventory: inventory,
        });
      } else {
        const remaining = party.filter((p) => p.uid !== defender.uid && !p.isFainted && p.currentHp > 0);
        if (remaining.length > 0) {
          setDialogText(`다음 포켓몬을 선택해 주세요!`);
          setMenuMode('party');
        } else {
          setDialogText(`${attacker.koreanName}과의 승부에서 눈앞이 캄캄해졌다...`);
          await new Promise((r) => setTimeout(r, 1500));
          onBattleEnd({
            won: false,
            escaped: false,
            expGained: 0,
            moneyGained: 0,
            updatedPlayerPokemon: defender,
            updatedParty: party.map((p) => (p.uid === defender.uid ? defender : p)),
            updatedInventory: inventory,
          });
        }
      }
    }
  };

  const executeEnemyTurn = async (player: PokemonInstance, enemy: PokemonInstance) => {
    if (enemy.currentHp <= 0) return;
    const availableMoves = enemy.moves.filter((m) => m.pp > 0);
    const chosenMove = availableMoves.length > 0
      ? availableMoves[Math.floor(Math.random() * availableMoves.length)]
      : enemy.moves[0];

    await executeAttack(enemy, player, chosenMove, 'player');
  };

  // Throw Pokéball to catch
  const handleThrowBall = async (ballItem: Item) => {
    if (isTrainerBattle) {
      setDialogText(`남의 포켓몬을 훔치면 안 됩니다!`);
      return;
    }
    if (ballItem.count <= 0) return;

    setIsProcessingTurn(true);
    setMenuMode('message');
    sound.playConfirm();

    const updatedInventory = inventory.map((item) =>
      item.id === ballItem.id ? { ...item, count: item.count - 1 } : item
    );
    setInventory(updatedInventory);

    setDialogText(`${ballItem.name}을(를) 던졌다!`);
    setThrowingBall(true);

    const baseEnemy = POKEDEX[enemyPokemon.baseId];
    const catchResult = calculateCatchShakes(
      enemyPokemon.maxHp,
      enemyPokemon.currentHp,
      baseEnemy.catchRate,
      ballItem.effectValue || 1.0,
      enemyPokemon.status
    );

    for (let s = 1; s <= catchResult.shakes; s++) {
      await new Promise((r) => setTimeout(r, 800));
      sound.playBallShake();
      setBallShakes(s);
    }

    await new Promise((r) => setTimeout(r, 700));

    if (catchResult.caught) {
      setBallCaught(true);
      sound.playCatchSuccess();
      setDialogText(`신난다! ${enemyPokemon.koreanName}을(를) 잡았다!`);
      await new Promise((r) => setTimeout(r, 1500));

      const caughtInstance: PokemonInstance = {
        ...enemyPokemon,
        uid: Math.random().toString(36).substring(2, 9),
        caughtWithBall: ballItem.name,
      };

      onBattleEnd({
        won: true,
        escaped: false,
        caughtPokemon: caughtInstance,
        expGained: 50,
        moneyGained: 0,
        updatedPlayerPokemon: playerPokemon,
        updatedParty: [...party, caughtInstance],
        updatedInventory,
      });
    } else {
      sound.playCancel();
      setThrowingBall(false);
      setBallShakes(0);
      setDialogText(`아깝다! 조금만 더 하면 잡을 수 있었는데!`);
      await new Promise((r) => setTimeout(r, 1000));
      await executeEnemyTurn(playerPokemon, enemyPokemon);
      setIsProcessingTurn(false);
      setMenuMode('main');
      setDialogText(`무엇을 할까?`);
    }
  };

  const handleUseMedicine = async (medItem: Item) => {
    if (medItem.count <= 0) return;
    if (playerPokemon.currentHp >= playerPokemon.maxHp && !playerPokemon.status) {
      setDialogText(`아무 효과가 없을 것 같다.`);
      return;
    }

    setIsProcessingTurn(true);
    setMenuMode('message');
    sound.playHeal();

    const healAmount = medItem.effectValue || 20;
    const nextHp = Math.min(playerPokemon.maxHp, playerPokemon.currentHp + healAmount);
    const updated = { ...playerPokemon, currentHp: nextHp };
    setPlayerPokemon(updated);

    const updatedInv = inventory.map((i) =>
      i.id === medItem.id ? { ...i, count: i.count - 1 } : i
    );
    setInventory(updatedInv);

    setDialogText(`${playerPokemon.koreanName}의 HP가 ${healAmount} 회복되었다!`);
    await new Promise((r) => setTimeout(r, 1000));

    await executeEnemyTurn(updated, enemyPokemon);
    setIsProcessingTurn(false);
    setMenuMode('main');
    setDialogText(`무엇을 할까?`);
  };

  const handleSwitchPokemon = async (newPokemon: PokemonInstance) => {
    if (newPokemon.uid === playerPokemon.uid || newPokemon.isFainted || newPokemon.currentHp <= 0) return;

    setIsProcessingTurn(true);
    setMenuMode('message');
    sound.playConfirm();

    setDialogText(`${playerPokemon.koreanName}! 돌아와!`);
    await new Promise((r) => setTimeout(r, 700));

    setPlayerPokemon(newPokemon);
    setDialogText(`가라! ${newPokemon.koreanName}!`);
    await new Promise((r) => setTimeout(r, 900));

    await executeEnemyTurn(newPokemon, enemyPokemon);
    setIsProcessingTurn(false);
    setMenuMode('main');
    setDialogText(`무엇을 할까?`);
  };

  const handleRun = () => {
    if (isTrainerBattle) {
      sound.playCancel();
      setDialogText(`트레이너와의 배틀에서는 도망칠 수 없다!`);
      setTimeout(() => setDialogText(`무엇을 할까?`), 1000);
      return;
    }

    sound.playFlee();
    setMenuMode('message');
    setDialogText(`무사히 도망쳤다!`);
    setTimeout(() => {
      onBattleEnd({
        won: false,
        escaped: true,
        expGained: 0,
        moneyGained: 0,
        updatedPlayerPokemon: playerPokemon,
        updatedParty: party,
        updatedInventory: inventory,
      });
    }, 1000);
  };

  const getHpBarColor = (curr: number, max: number) => {
    const ratio = curr / max;
    if (ratio > 0.5) return 'bg-emerald-500';
    if (ratio > 0.2) return 'bg-amber-400';
    return 'bg-red-500';
  };

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      normal: 'bg-stone-500',
      fire: 'bg-orange-500',
      water: 'bg-blue-500',
      grass: 'bg-emerald-600',
      electric: 'bg-amber-400 text-slate-950',
      ice: 'bg-cyan-400 text-slate-950',
      fighting: 'bg-rose-700',
      poison: 'bg-purple-600',
      ground: 'bg-amber-700',
      flying: 'bg-indigo-400',
      psychic: 'bg-pink-500',
      bug: 'bg-lime-600',
      rock: 'bg-stone-600',
      ghost: 'bg-violet-800',
      dragon: 'bg-indigo-700',
      steel: 'bg-slate-400 text-slate-950',
      dark: 'bg-neutral-800',
    };
    return colors[type] || 'bg-slate-600';
  };

  // Determine which background to show (cave or grass meadow)
  const isCave = enemyPokemon.baseId === 74 || enemyPokemon.baseId === 95 || enemyPokemon.baseId === 408 || enemyPokemon.baseId === 41;
  const bgImageSrc = isCave ? battleBgCave : battleBgGrass;

  const enemySpriteSrc = enemySpriteFallback
    ? getPokemonFallbackSpriteUrl(enemyPokemon.baseId, false)
    : getPokemonSpriteUrl(enemyPokemon.baseId, false);

  const playerSpriteSrc = playerSpriteFallback
    ? getPokemonFallbackSpriteUrl(playerPokemon.baseId, true)
    : getPokemonSpriteUrl(playerPokemon.baseId, true);

  return (
    <div
      className={`relative w-full h-full flex flex-col justify-between overflow-hidden bg-slate-950 select-none ${
        cameraShake ? 'translate-x-1 -translate-y-1' : ''
      }`}
    >
      {/* --- TOP BATTLEFIELD SCREEN WITH HIGH-FIDELITY GEN 4 BACKDROP --- */}
      <div className="relative flex-1 w-full overflow-hidden border-b-4 border-slate-700">
        {/* Authentic Gen 4 Battle Stage Backdrop Image */}
        <img
          src={bgImageSrc}
          alt="Battle Stage"
          className="absolute inset-0 w-full h-full object-cover pixelated pointer-events-none"
          referrerPolicy="no-referrer"
        />

        {/* --- OPPONENT HP BOX (TOP-LEFT GEN 4 FRAME) --- */}
        <div className="absolute top-3 left-3 z-20 bg-slate-900/95 text-white rounded-lg p-2.5 border-2 border-slate-300 shadow-2xl w-60">
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-bold text-sm tracking-wide text-slate-100 font-pixel flex items-center gap-1.5">
              {!isTrainerBattle && (
                <img
                  src={getPixelIconDataUrl('pokeball')}
                  alt="Wild"
                  className="w-3.5 h-3.5 object-contain pixelated opacity-80"
                />
              )}
              {enemyPokemon.koreanName}
            </span>
            <span className="text-xs text-amber-300 font-mono font-bold">Lv.{enemyPokemon.level}</span>
          </div>
          {/* HP Bar */}
          <div className="flex items-center gap-1.5 bg-slate-950 rounded px-1.5 py-1 border border-slate-700">
            <span className="text-[10px] font-bold text-amber-400">HP</span>
            <div className="flex-1 bg-slate-700 h-2.5 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getHpBarColor(
                  enemyPokemon.currentHp,
                  enemyPokemon.maxHp
                )}`}
                style={{ width: `${Math.max(0, (enemyPokemon.currentHp / enemyPokemon.maxHp) * 100)}%` }}
              />
            </div>
          </div>
          {enemyPokemon.status && (
            <span className="inline-block mt-1 text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold uppercase">
              {enemyPokemon.status}
            </span>
          )}
        </div>

        {/* --- OPPONENT POKEMON SPRITE (ANCHORED ON UPPER-RIGHT PLATFORM RING) --- */}
        <div className="absolute right-[21%] bottom-[25%] z-10 flex flex-col items-center pointer-events-none">
          <div
            className={`transition-all duration-200 ${
              enemyHitFlash ? 'brightness-200 contrast-200 scale-95' : ''
            } ${throwingBall ? 'scale-0 opacity-0' : ''}`}
          >
            <img
              src={enemySpriteSrc}
              alt={enemyPokemon.koreanName}
              onError={() => setEnemySpriteFallback(true)}
              className="w-36 h-36 sm:w-40 sm:h-40 object-contain pixelated drop-shadow-[0_6px_6px_rgba(0,0,0,0.65)]"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Pixel-Art Pokéball Throw & Shake Animation */}
          {throwingBall && (
            <div
              className={`transition-transform duration-200 ${
                ballShakes % 2 === 1 ? '-rotate-12 -translate-x-1' : ballShakes > 0 ? 'rotate-12 translate-x-1' : 'animate-bounce'
              }`}
            >
              <img
                src={getPixelIconDataUrl('pokeball')}
                alt="Throwing Pokeball"
                className="w-10 h-10 object-contain pixelated drop-shadow-[0_6px_6px_rgba(0,0,0,0.7)]"
              />
            </div>
          )}
        </div>

        {/* --- PLAYER POKEMON SPRITE (ANCHORED ON LOWER-LEFT PLATFORM RING) --- */}
        <div className="absolute left-[22%] bottom-[4%] z-10 flex flex-col items-center pointer-events-none">
          <div
            className={`transition-all duration-200 ${
              playerHitFlash ? 'brightness-200 contrast-200 scale-95' : ''
            }`}
          >
            <img
              src={playerSpriteSrc}
              alt={playerPokemon.koreanName}
              onError={() => setPlayerSpriteFallback(true)}
              className="w-40 h-40 sm:w-44 sm:h-44 object-contain pixelated drop-shadow-[0_8px_8px_rgba(0,0,0,0.75)]"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* --- PLAYER HP BOX & EXP BAR (BOTTOM-RIGHT GEN 4 FRAME) --- */}
        <div className="absolute bottom-3 right-3 z-20 bg-slate-900/95 text-white rounded-lg p-3 border-2 border-slate-300 shadow-2xl w-64">
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-bold text-sm tracking-wide text-slate-100 font-pixel">
              {playerPokemon.koreanName}
            </span>
            <span className="text-xs text-amber-300 font-mono font-bold">Lv.{playerPokemon.level}</span>
          </div>
          {/* HP Bar */}
          <div className="flex items-center gap-1.5 bg-slate-950 rounded px-1.5 py-1 border border-slate-700">
            <span className="text-[10px] font-bold text-amber-400">HP</span>
            <div className="flex-1 bg-slate-700 h-2.5 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getHpBarColor(
                  playerPokemon.currentHp,
                  playerPokemon.maxHp
                )}`}
                style={{ width: `${Math.max(0, (playerPokemon.currentHp / playerPokemon.maxHp) * 100)}%` }}
              />
            </div>
          </div>
          {/* Numerical HP Readout */}
          <div className="text-right text-[11px] font-mono mt-0.5 font-bold tabular-nums text-slate-200">
            {playerPokemon.currentHp} / {playerPokemon.maxHp}
          </div>
          {/* EXP Bar */}
          <div className="flex items-center gap-1.5 mt-1 bg-slate-950 rounded px-1.5 py-0.5 border border-slate-700">
            <span className="text-[9px] font-bold text-cyan-400">EXP</span>
            <div className="flex-1 bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-cyan-400 h-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, (playerPokemon.exp / playerPokemon.expToNextLevel) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* --- PIXEL-ART ATTACK VISUAL EFFECT OVERLAY --- */}
        {activeAttackFx && (
          <div
            className={`absolute z-30 pointer-events-none flex items-center justify-center ${
              activeAttackFx.target === 'enemy' ? 'right-[24%] bottom-[32%]' : 'left-[26%] bottom-[12%]'
            }`}
          >
            <svg
              width="96"
              height="96"
              viewBox="0 0 16 16"
              className="pixelated animate-ping"
              shapeRendering="crispEdges"
            >
              {activeAttackFx.type === 'fire' && (
                <g>
                  <rect x="6" y="1" width="4" height="14" fill="#ff3d00" />
                  <rect x="1" y="6" width="14" height="4" fill="#ff3d00" />
                  <rect x="4" y="4" width="8" height="8" fill="#ff9100" />
                  <rect x="6" y="6" width="4" height="4" fill="#fff59d" />
                </g>
              )}
              {activeAttackFx.type === 'water' && (
                <g>
                  <rect x="5" y="2" width="6" height="12" fill="#0288d1" />
                  <rect x="2" y="5" width="12" height="6" fill="#03a9f4" />
                  <rect x="5" y="5" width="6" height="6" fill="#b3e5fc" />
                  <rect x="6" y="6" width="2" height="2" fill="#ffffff" />
                </g>
              )}
              {activeAttackFx.type === 'grass' && (
                <g>
                  <rect x="2" y="6" width="12" height="4" fill="#2e7d32" />
                  <rect x="6" y="2" width="4" height="12" fill="#4caf50" />
                  <rect x="4" y="4" width="8" height="8" fill="#8bc34a" />
                  <rect x="6" y="6" width="4" height="4" fill="#e8f5e9" />
                </g>
              )}
              {activeAttackFx.type === 'electric' && (
                <g>
                  <rect x="7" y="1" width="4" height="6" fill="#ffd600" />
                  <rect x="4" y="6" width="8" height="3" fill="#ffff00" />
                  <rect x="5" y="9" width="4" height="6" fill="#ffd600" />
                  <rect x="6" y="6" width="4" height="4" fill="#ffffff" />
                </g>
              )}
              {activeAttackFx.type !== 'fire' &&
                activeAttackFx.type !== 'water' &&
                activeAttackFx.type !== 'grass' &&
                activeAttackFx.type !== 'electric' && (
                  <g>
                    <rect x="7" y="1" width="2" height="14" fill="#ffffff" />
                    <rect x="1" y="7" width="14" height="2" fill="#ffffff" />
                    <rect x="3" y="3" width="10" height="10" fill="#ffca28" />
                    <rect x="5" y="5" width="6" height="6" fill="#ffffff" />
                  </g>
                )}
            </svg>
          </div>
        )}
      </div>

      {/* --- BOTTOM DS COMMAND & TOUCHSCREEN CONTROL CONSOLE --- */}
      <div className="h-44 w-full bg-slate-900 border-t-4 border-slate-700 p-2 flex flex-col justify-between">
        {/* Dialog / Message readout */}
        <div className="dialog-box-gen4 text-slate-900 rounded p-2.5 min-h-[52px] flex items-center font-pixel text-xs leading-relaxed border-2 border-slate-400 shadow-inner">
          <p>{dialogText}</p>
        </div>

        {/* Menu Buttons depending on Mode */}
        {menuMode === 'main' && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => {
                sound.playConfirm();
                setMenuMode('moves');
              }}
              className="bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold py-2.5 px-3 rounded-lg border-2 border-red-400 shadow-md flex items-center justify-center gap-2 transition"
            >
              <img
                src={getPixelIconDataUrl('pokeball')}
                alt="Fight"
                className="w-4 h-4 object-contain pixelated"
              />
              <span className="text-sm tracking-wider font-pixel">싸운다 (FIGHT)</span>
            </button>
            <button
              onClick={() => {
                sound.playConfirm();
                setMenuMode('bag');
              }}
              className="bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold py-2.5 px-3 rounded-lg border-2 border-amber-400 shadow-md flex items-center justify-center gap-2 transition"
            >
              <img
                src={getPixelIconDataUrl('potion')}
                alt="Bag"
                className="w-4 h-4 object-contain pixelated"
              />
              <span className="text-sm tracking-wider font-pixel">가방 (BAG)</span>
            </button>
            <button
              onClick={() => {
                sound.playConfirm();
                setMenuMode('party');
              }}
              className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold py-2.5 px-3 rounded-lg border-2 border-emerald-400 shadow-md flex items-center justify-center gap-2 transition"
            >
              <img
                src={getPixelIconDataUrl('greatball')}
                alt="Party"
                className="w-4 h-4 object-contain pixelated"
              />
              <span className="text-sm tracking-wider font-pixel">포켓몬 (PKMN)</span>
            </button>
            <button
              onClick={handleRun}
              className="bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold py-2.5 px-3 rounded-lg border-2 border-sky-400 shadow-md flex items-center justify-center gap-2 transition"
            >
              <span className="text-sm tracking-wider font-pixel">▶ 도망친다 (RUN)</span>
            </button>
          </div>
        )}

        {/* Move Selector (4 Moves) */}
        {menuMode === 'moves' && (
          <div className="relative mt-2">
            <div className="grid grid-cols-2 gap-2">
              {playerPokemon.moves.map((move, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectMove(move)}
                  disabled={move.pp <= 0}
                  className={`p-2 rounded-lg border-2 text-left flex flex-col justify-between transition ${
                    move.pp > 0
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-white cursor-pointer active:scale-95'
                      : 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs">{move.name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${getTypeBadgeColor(
                        move.type
                      )}`}
                    >
                      {move.type}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1 text-[10px] font-mono text-slate-300">
                    <span>
                      위력 {move.power > 0 ? move.power : '-'} ·{' '}
                      {move.category === 'physical'
                        ? '물리'
                        : move.category === 'special'
                        ? '특수'
                        : '변화'}
                    </span>
                    <span className={move.pp <= 3 ? 'text-red-400 font-bold' : ''}>
                      PP {move.pp}/{move.maxPp}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                sound.playCancel();
                setMenuMode('main');
              }}
              className="absolute -top-11 right-0 text-xs bg-slate-700 text-slate-200 px-2.5 py-1 rounded border border-slate-500 hover:bg-slate-600"
            >
              뒤로 (Back)
            </button>
          </div>
        )}

        {/* Bag Selector (Balls & Medicine) */}
        {menuMode === 'bag' && (
          <div className="relative mt-2 flex flex-col gap-1.5 overflow-y-auto max-h-24 pr-1">
            <div className="grid grid-cols-2 gap-2">
              {inventory
                .filter((item) => (item.category === 'ball' || item.category === 'medicine') && item.count > 0)
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.category === 'ball') handleThrowBall(item);
                      else handleUseMedicine(item);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-left flex items-center justify-between text-xs text-white"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{item.icon}</span>
                      <span className="font-bold">{item.name}</span>
                    </div>
                    <span className="text-amber-400 font-mono font-bold">x{item.count}</span>
                  </button>
                ))}
            </div>
            <button
              onClick={() => {
                sound.playCancel();
                setMenuMode('main');
              }}
              className="absolute -top-11 right-0 text-xs bg-slate-700 text-slate-200 px-2.5 py-1 rounded border border-slate-500 hover:bg-slate-600"
            >
              뒤로 (Back)
            </button>
          </div>
        )}

        {/* Party Selector (Switch Active Pokemon) */}
        {menuMode === 'party' && (
          <div className="relative mt-2 flex flex-col gap-1.5 overflow-y-auto max-h-24 pr-1">
            <div className="grid grid-cols-2 gap-2">
              {party.map((p) => (
                <button
                  key={p.uid}
                  disabled={p.uid === playerPokemon.uid || p.isFainted || p.currentHp <= 0}
                  onClick={() => handleSwitchPokemon(p)}
                  className={`p-1.5 rounded-lg border text-left flex items-center justify-between text-xs ${
                    p.uid === playerPokemon.uid
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                      : p.currentHp > 0
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-white'
                      : 'bg-red-950/40 border-red-800 text-red-400 opacity-60'
                  }`}
                >
                  <div>
                    <div className="font-bold">{p.koreanName}</div>
                    <div className="text-[10px] text-slate-400">Lv.{p.level}</div>
                  </div>
                  <div className="text-right text-[10px] font-mono">
                    <div>
                      {p.currentHp}/{p.maxHp} HP
                    </div>
                    {p.isFainted && <span className="text-red-500 font-bold">기절</span>}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                sound.playCancel();
                setMenuMode('main');
              }}
              className="absolute -top-11 right-0 text-xs bg-slate-700 text-slate-200 px-2.5 py-1 rounded border border-slate-500 hover:bg-slate-600"
            >
              뒤로 (Back)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
