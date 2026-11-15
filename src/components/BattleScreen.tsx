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
import platformGrass from '../assets/images/platform_grass.png';
import platformCave from '../assets/images/platform_cave.png';

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

  // Determine which background to show (cave or grass meadow)
  const isCave = enemyPokemon.baseId === 74 || enemyPokemon.baseId === 95 || enemyPokemon.baseId === 408 || enemyPokemon.baseId === 41;
  const bgImageSrc = isCave ? battleBgCave : battleBgGrass;
  const platformSrc = isCave ? platformCave : platformGrass;

  const enemySpriteSrc = enemySpriteFallback
    ? getPokemonFallbackSpriteUrl(enemyPokemon.baseId, false)
    : getPokemonSpriteUrl(enemyPokemon.baseId, false);

  const playerSpriteSrc = playerSpriteFallback
    ? getPokemonFallbackSpriteUrl(playerPokemon.baseId, true)
    : getPokemonSpriteUrl(playerPokemon.baseId, true);

  // --- Pixel UI helpers ---------------------------------------------------
  const hpFillColor = (curr: number, max: number) => {
    const ratio = curr / max;
    if (ratio > 0.5) return '#58d048';
    if (ratio > 0.2) return '#f8c030';
    return '#e84838';
  };
  const pct = (curr: number, max: number) => `${Math.max(0, Math.min(100, (curr / max) * 100))}%`;

  const TYPE_INFO: Record<string, { ko: string; color: string }> = {
    normal: { ko: '노말', color: '#a0a090' },
    fire: { ko: '불꽃', color: '#f07838' },
    water: { ko: '물', color: '#5090f0' },
    grass: { ko: '풀', color: '#58b850' },
    electric: { ko: '전기', color: '#f0c828' },
    ice: { ko: '얼음', color: '#78d0d8' },
    fighting: { ko: '격투', color: '#c03828' },
    poison: { ko: '독', color: '#a048a0' },
    ground: { ko: '땅', color: '#d8b060' },
    flying: { ko: '비행', color: '#9890f0' },
    psychic: { ko: '에스퍼', color: '#f05888' },
    bug: { ko: '벌레', color: '#a0b820' },
    rock: { ko: '바위', color: '#b8a038' },
    ghost: { ko: '고스트', color: '#705898' },
    dragon: { ko: '드래곤', color: '#7038f8' },
    steel: { ko: '강철', color: '#b8b8d0' },
    dark: { ko: '악', color: '#705848' },
  };
  type PixelIcon = Parameters<typeof getPixelIconDataUrl>[0];
  const PIXEL_ICONS: PixelIcon[] = ['pokeball', 'greatball', 'potion', 'super_potion', 'revive', 'badge'];
  const typeInfo = (t: string) => TYPE_INFO[t] ?? { ko: t, color: '#8890a8' };

  const goBack = () => {
    sound.playCancel();
    setMenuMode('main');
  };
  const consoleTitle =
    menuMode === 'moves'
      ? '어떤 기술을 쓸까?'
      : menuMode === 'bag'
        ? '무엇을 사용할까?'
        : menuMode === 'party'
          ? '누구로 교체할까?'
          : null;

  const SwordIcon = () => (
    <svg viewBox="0 0 16 16" width="22" height="22" shapeRendering="crispEdges" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={12 - i} y={1 + i} width="3" height="3" fill={i === 0 ? '#ffffff' : '#e8ecf8'} />
      ))}
      <rect x="2" y="9" width="6" height="2" fill="#f8d040" />
      <rect x="5" y="8" width="2" height="6" fill="#f8d040" />
      <rect x="2" y="12" width="3" height="3" fill="#8c5830" />
    </svg>
  );
  const RunIcon = () => (
    <svg viewBox="0 0 16 16" width="22" height="22" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="6" width="9" height="4" fill="#ffffff" />
      <rect x="9" y="3" width="2" height="10" fill="#ffffff" />
      <rect x="11" y="4" width="2" height="8" fill="#ffffff" />
      <rect x="13" y="6" width="2" height="4" fill="#ffffff" />
    </svg>
  );

  return (
    <div
      className={`relative w-full h-full flex flex-col overflow-hidden bg-[#0a0e1a] select-none ${
        cameraShake ? 'translate-x-1 -translate-y-1' : ''
      }`}
    >
      {/* --- BATTLEFIELD --- */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        <img
          src={bgImageSrc}
          alt="Battle Stage"
          className="absolute inset-0 w-full h-full object-cover pixelated pointer-events-none"
        />

        {/* Opponent status panel */}
        <div className="pxui-frame absolute top-2 left-2 z-20 px-4 pt-3 pb-3"
          style={{ width: 'min(60%, 240px)' }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="pxui-label text-[15px] font-bold truncate flex items-center gap-1.5">
              {!isTrainerBattle && (
                <img src={getPixelIconDataUrl('pokeball')} alt="야생" className="w-3.5 h-3.5 pixelated" />
              )}
              {enemyPokemon.koreanName}
            </span>
            <span className="pxui-label text-[12px] font-bold text-[#f8d878] shrink-0">Lv.{enemyPokemon.level}</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="pxui-tag">HP</span>
            <div className="pxui-bar flex-1">
              <div
                className="fill"
                style={{
                  width: pct(enemyPokemon.currentHp, enemyPokemon.maxHp),
                  background: hpFillColor(enemyPokemon.currentHp, enemyPokemon.maxHp),
                }}
              />
            </div>
          </div>
          {enemyPokemon.status && (
            <span className="pxui-tag inline-block mt-2 !bg-[#e84838] !text-white uppercase">{enemyPokemon.status}</span>
          )}
        </div>

        {/* --- OPPONENT POKEMON SPRITE (ANCHORED ON UPPER-RIGHT PLATFORM RING) --- */}
        <div className="absolute right-[21%] bottom-[25%] z-10 flex flex-col items-center pointer-events-none">
          {/* Platform drawn with the sprite so they always line up, whatever the screen ratio */}
          <img src={platformSrc} alt="" className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-48 max-w-none pixelated -z-10" />
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
        <div className="absolute left-[6%] bottom-[4%] z-10 flex flex-col items-center pointer-events-none">
          <img src={platformSrc} alt="" className="absolute left-1/2 -translate-x-1/2 -bottom-6 w-60 max-w-none pixelated -z-10" />
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

        {/* Player status panel */}
        <div className="pxui-frame absolute bottom-2 right-2 z-20 px-4 pt-3 pb-2.5"
          style={{ width: 'min(56%, 250px)' }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="pxui-label text-[15px] font-bold truncate">{playerPokemon.koreanName}</span>
            <span className="pxui-label text-[12px] font-bold text-[#f8d878] shrink-0">Lv.{playerPokemon.level}</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="pxui-tag">HP</span>
            <div className="pxui-bar flex-1">
              <div
                className="fill"
                style={{
                  width: pct(playerPokemon.currentHp, playerPokemon.maxHp),
                  background: hpFillColor(playerPokemon.currentHp, playerPokemon.maxHp),
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            {playerPokemon.status ? (
              <span className="pxui-tag !bg-[#e84838] !text-white uppercase">{playerPokemon.status}</span>
            ) : (
              <span />
            )}
            <span className="pxui-label text-[14px] font-bold tabular-nums">
              {Math.max(0, playerPokemon.currentHp)}
              <span className="text-[#9aa4c8]"> / </span>
              {playerPokemon.maxHp}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="pxui-tag !bg-[#58b8f0]">EXP</span>
            <div className="pxui-bar thin flex-1">
              <div
                className="fill"
                style={{ width: pct(playerPokemon.exp, playerPokemon.expToNextLevel), background: '#58b8f0' }}
              />
            </div>
          </div>
        </div>

        {/* --- PIXEL-ART ATTACK VISUAL EFFECT OVERLAY --- */}
        {activeAttackFx && (
          <div
            className={`absolute z-30 pointer-events-none flex items-center justify-center ${
              activeAttackFx.target === 'enemy' ? 'right-[24%] bottom-[32%]' : 'left-[12%] bottom-[12%]'
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

      {/* --- COMMAND CONSOLE --- */}
      <div className="pxui-console w-full shrink-0 p-2.5 flex flex-col gap-2">
        {/* Message window — in sub-menus it shows the prompt and a back button, so the layout never jumps */}
        <div className="pxui-frame pl-4 pr-3 py-3 min-h-[62px] flex items-center gap-2">
          <p className="pxui-label text-[15px] leading-snug flex-1">{consoleTitle ?? dialogText}</p>
          {menuMode === 'message' && <span className="pxui-cursor text-[#f8d878] text-xs self-end">▼</span>}
          {consoleTitle && (
            <button onClick={goBack} className="pxui-btn pxui-btn-sm pxui-label shrink-0">
              ◀ 뒤로
            </button>
          )}
        </div>

        {/* Fixed-height command area so the battlefield never jumps between menus */}
        <div className="h-[124px]">
          {/* Main commands */}
          {menuMode === 'main' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  sound.playConfirm();
                  setMenuMode('moves');
                }}
                className="pxui-btn"
                style={{ '--accent': '#f06048' } as React.CSSProperties}
              >
                <span className="chip">
                  <SwordIcon />
                </span>
                <span className="pxui-label text-[17px] font-bold">싸운다</span>
              </button>
              <button
                onClick={() => {
                  sound.playConfirm();
                  setMenuMode('bag');
                }}
                className="pxui-btn"
                style={{ '--accent': '#f0b030' } as React.CSSProperties}
              >
                <span className="chip">
                  <img src={getPixelIconDataUrl('potion')} alt="" className="w-6 h-6 pixelated" />
                </span>
                <span className="pxui-label text-[17px] font-bold">가방</span>
              </button>
              <button
                onClick={() => {
                  sound.playConfirm();
                  setMenuMode('party');
                }}
                className="pxui-btn"
                style={{ '--accent': '#48c078' } as React.CSSProperties}
              >
                <span className="chip">
                  <img src={getPixelIconDataUrl('pokeball')} alt="" className="w-6 h-6 pixelated" />
                </span>
                <span className="pxui-label text-[17px] font-bold">포켓몬</span>
              </button>
              <button onClick={handleRun} className="pxui-btn" style={{ '--accent': '#58a0e8' } as React.CSSProperties}>
                <span className="chip">
                  <RunIcon />
                </span>
                <span className="pxui-label text-[17px] font-bold">도망친다</span>
              </button>
            </div>
          )}

          {/* Move selector */}
          {menuMode === 'moves' && (
            <div className="grid grid-cols-2 gap-2">
              {playerPokemon.moves.map((move, idx) => {
                const ti = typeInfo(move.type);
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectMove(move)}
                    disabled={move.pp <= 0}
                    className="pxui-btn !flex-col !items-stretch !gap-1 !min-h-[58px]"
                    style={{ '--accent': ti.color } as React.CSSProperties}
                  >
                    <span className="pxui-label text-[15px] font-bold truncate">{move.name}</span>
                    <span className="flex items-center justify-between gap-1">
                      <span className="pxui-tag !text-white" style={{ background: ti.color }}>
                        {ti.ko}
                      </span>
                      <span
                        className={`pxui-label text-[12px] tabular-nums ${
                          move.pp <= Math.ceil(move.maxPp / 4) ? 'text-[#f87858]' : 'text-[#c8d0e8]'
                        }`}
                      >
                        PP {move.pp}/{move.maxPp}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Bag */}
          {menuMode === 'bag' && (
            <div className="grid grid-cols-2 gap-2 max-h-full overflow-y-auto pr-0.5">
              {inventory
                .filter((item) => (item.category === 'ball' || item.category === 'medicine') && item.count > 0)
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.category === 'ball') handleThrowBall(item);
                      else handleUseMedicine(item);
                    }}
                    className="pxui-btn !min-h-[48px] justify-between"
                    style={{ '--accent': item.category === 'ball' ? '#f06048' : '#a070e0' } as React.CSSProperties}
                  >
                    <span className="pxui-label text-[14px] font-bold truncate flex items-center gap-1.5">
                      {PIXEL_ICONS.includes(item.icon as PixelIcon) && (
                        <img src={getPixelIconDataUrl(item.icon as PixelIcon)} alt="" className="w-5 h-5 pixelated shrink-0" />
                      )}
                      {item.name}
                    </span>
                    <span className="pxui-label text-[13px] text-[#f8d878] tabular-nums">×{item.count}</span>
                  </button>
                ))}
            </div>
          )}

          {/* Party */}
          {menuMode === 'party' && (
            <div className="grid grid-cols-2 gap-2 max-h-full overflow-y-auto pr-0.5">
              {party.map((p) => {
                const active = p.uid === playerPokemon.uid;
                const fainted = p.isFainted || p.currentHp <= 0;
                return (
                  <button
                    key={p.uid}
                    disabled={active || fainted}
                    onClick={() => handleSwitchPokemon(p)}
                    className="pxui-btn !flex-col !items-stretch !gap-1 !min-h-[52px]"
                    style={{ '--accent': active ? '#f8d878' : fainted ? '#5a6078' : '#48c078' } as React.CSSProperties}
                  >
                    <span className="flex items-baseline justify-between gap-1">
                      <span className="pxui-label text-[14px] font-bold truncate">{p.koreanName}</span>
                      <span className="pxui-label text-[11px] text-[#f8d878]">
                        {active ? '전투 중' : fainted ? '기절' : `Lv.${p.level}`}
                      </span>
                    </span>
                    <span className="pxui-bar thin w-full">
                      <span
                        className="fill block"
                        style={{ width: pct(p.currentHp, p.maxHp), background: hpFillColor(p.currentHp, p.maxHp) }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
