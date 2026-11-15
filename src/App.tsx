/**
 * Pokemon Diamond & Pearl: Sinnoh Adventure (포켓몬스터DP 디아루가·펄기아)
 * Authentic Gen 4 DS 2.5D Pixel RPG
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PlayerState, PokemonInstance, GameScreen, Item } from './game/types';
import { ITEMS, POKEDEX } from './game/pokemonData';
import { createPokemonInstance, checkEvolution } from './game/battleLogic';
import { TRAINERS } from './game/mapData';
import { TitleScreen } from './components/TitleScreen';
import { StarterSelectScreen } from './components/StarterSelectScreen';
import { OverworldScreen } from './components/OverworldScreen';
import { BattleScreen } from './components/BattleScreen';
import { PoketchAndMenu } from './components/PoketchAndMenu';
import { EvolutionModal } from './components/EvolutionModal';
import { GymClearModal } from './components/GymClearModal';
import { sound } from './game/soundEngine';

export default function App() {
  const [screen, setScreen] = useState<GameScreen>('title');
  const [hasSaveGame, setHasSaveGame] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [gameSpeed, setGameSpeed] = useState<number>(1);
  const [stepCount, setStepCount] = useState<number>(0);

  // In-Game Menu overlay states
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [activeMenuTab, setActiveMenuTab] = useState<
    'menu' | 'bag' | 'party' | 'pokedex' | 'card' | 'save' | null
  >(null);

  // Active Battle state
  const [activeBattle, setActiveBattle] = useState<{
    enemyPokemon: PokemonInstance;
    isTrainerBattle: boolean;
    trainerId?: string;
    trainerName?: string;
    trainerReward?: number;
  } | null>(null);

  // Active Evolution state
  const [pendingEvolution, setPendingEvolution] = useState<{
    pokemon: PokemonInstance;
    targetBaseId: number;
  } | null>(null);

  // Gym Victory Modal state
  const [showGymClearModal, setShowGymClearModal] = useState<boolean>(false);

  // Core Player State: Starts outside Lucas's house in Twinleaf Town with 0 Pokémon
  const [playerState, setPlayerState] = useState<PlayerState>({
    name: '광휘',
    x: 12,
    y: 8,
    direction: 'left',
    currentMap: 'twinleaf_town',
    party: [],
    box: [],
    inventory: [
      { ...ITEMS.poke_ball, count: 5 },
      { ...ITEMS.potion, count: 3 },
      { ...ITEMS.running_shoes, count: 1 },
      { ...ITEMS.town_map, count: 1 },
    ],
    money: 3000,
    badges: [],
    hasRunningShoes: true,
    hasBicycle: false,
    hasPokedex: true,
    hasPoketch: true,
    seenPokemon: [],
    caughtPokemon: [],
    storyFlags: {},
    playTimeSeconds: 0,
  });

  // Mirror game state to document.body.dataset.state as required by ultra-mode
  useEffect(() => {
    if (screen === 'title') {
      document.body.dataset.state = 'title';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screen]);

  // Check saved game in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sinnoh_pokemon_save');
      if (saved) setHasSaveGame(true);
    } catch {}
  }, []);

  // Start New Game in Twinleaf Town Overworld (authentic Gen 4 progression)
  const handleStartNewGame = useCallback(() => {
    setPlayerState({
      name: '광휘',
      x: 12,
      y: 8,
      direction: 'left',
      currentMap: 'twinleaf_town',
      party: [],
      box: [],
      inventory: [
        { ...ITEMS.poke_ball, count: 5 },
        { ...ITEMS.potion, count: 3 },
        { ...ITEMS.running_shoes, count: 1 },
        { ...ITEMS.town_map, count: 1 },
      ],
      money: 3000,
      badges: [],
      hasRunningShoes: true,
      hasBicycle: false,
      hasPokedex: true,
      hasPoketch: true,
      seenPokemon: [],
      caughtPokemon: [],
      storyFlags: {},
      playTimeSeconds: 0,
    });
    setScreen('overworld');
  }, []);

  // Autostart parameter check (?autostart=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      handleStartNewGame();
    }
  }, [handleStartNewGame]);

  // Play time ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setPlayerState((prev) => ({
        ...prev,
        playTimeSeconds: prev.playTimeSeconds + 1,
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Continue Game from Save
  const handleContinueGame = () => {
    try {
      const saved = localStorage.getItem('sinnoh_pokemon_save');
      if (saved) {
        const data = JSON.parse(saved);
        setPlayerState((prev) => ({
          ...prev,
          name: data.name || prev.name,
          party: data.party || prev.party,
          inventory: data.inventory || prev.inventory,
          money: data.money ?? prev.money,
          badges: data.badges || prev.badges,
          currentMap: data.currentMap || 'twinleaf_town',
          x: data.x ?? 12,
          y: data.y ?? 8,
          seenPokemon: data.seenPokemon || prev.seenPokemon,
          caughtPokemon: data.caughtPokemon || prev.caughtPokemon,
          playTimeSeconds: data.playTimeSeconds ?? prev.playTimeSeconds,
        }));
        setScreen('overworld');
        return;
      }
    } catch {}
    handleStartNewGame();
  };

  // Handle Starter Choice from Professor Rowan's Briefcase -> Immediately ambush with Wild Starly Lv.2!
  const handleStarterChosen = (starter: PokemonInstance) => {
    const starlyBase = POKEDEX[396];
    const wildStarly = createPokemonInstance(starlyBase, 2);

    // Adjust Rival Barry's starter to counter player's starter
    const rivalStarterId = starter.baseId === 387 ? 390 : starter.baseId === 390 ? 393 : 387;
    if (TRAINERS.rival_barry) {
      TRAINERS.rival_barry.party = [
        { baseId: 396, level: 8 },
        { baseId: rivalStarterId, level: 9 },
      ];
    }

    setPlayerState((prev) => ({
      ...prev,
      party: [starter],
      seenPokemon: Array.from(new Set([...prev.seenPokemon, starter.baseId, 396])),
      caughtPokemon: Array.from(new Set([...prev.caughtPokemon, starter.baseId])),
    }));

    // Authentic Gen 4 Event: Wild Starly Lv.2 ambushes right as you open the briefcase!
    setActiveBattle({
      enemyPokemon: wildStarly,
      isTrainerBattle: false,
    });
    setScreen('battle');
  };

  // Trigger Wild Pokemon Battle
  const handleTriggerWildBattle = useCallback(
    (baseId: number, level: number) => {
      const base = POKEDEX[baseId];
      if (!base || playerState.party.length === 0) return;

      const enemy = createPokemonInstance(base, level);

      setPlayerState((prev) => ({
        ...prev,
        seenPokemon: Array.from(new Set([...prev.seenPokemon, baseId])),
      }));

      setActiveBattle({
        enemyPokemon: enemy,
        isTrainerBattle: false,
      });
      setScreen('battle');
    },
    [playerState.party.length]
  );

  // Trigger Trainer Battle
  const handleTriggerTrainerBattle = useCallback(
    (trainerId: string) => {
      const trainer = TRAINERS[trainerId];
      if (!trainer || playerState.party.length === 0) return;

      const firstEnemyData = trainer.party[0];
      const base = POKEDEX[firstEnemyData.baseId];
      const enemy = createPokemonInstance(base, firstEnemyData.level);

      setPlayerState((prev) => ({
        ...prev,
        seenPokemon: Array.from(new Set([...prev.seenPokemon, base.id])),
      }));

      setActiveBattle({
        enemyPokemon: enemy,
        isTrainerBattle: true,
        trainerId,
        trainerName: `${trainer.title} ${trainer.name}`,
        trainerReward: trainer.rewardMoney,
      });
      setScreen('battle');
    },
    [playerState.party.length]
  );

  // Battle Finished Handler (Preserves exact map & tile coordinates!)
  const handleBattleEnd = (result: {
    won: boolean;
    escaped: boolean;
    caughtPokemon?: PokemonInstance;
    expGained: number;
    moneyGained: number;
    updatedPlayerPokemon: PokemonInstance;
    updatedParty: PokemonInstance[];
    updatedInventory: Item[];
  }) => {
    let nextParty = [...result.updatedParty];
    let nextCaught = [...playerState.caughtPokemon];

    if (result.caughtPokemon) {
      nextCaught = Array.from(new Set([...nextCaught, result.caughtPokemon.baseId]));
    }

    // If all party Pokémon fainted (whiteout), heal party and return to Mom in Twinleaf Town
    const allFainted = !result.won && !result.escaped && nextParty.every((p) => p.isFainted || p.currentHp <= 0);
    if (allFainted) {
      nextParty = nextParty.map((p) => ({
        ...p,
        currentHp: p.maxHp,
        isFainted: false,
        moves: p.moves.map((m) => ({ ...m, pp: m.maxPp })),
      }));
    }

    // Check defeated trainer
    if (activeBattle?.trainerId && result.won) {
      const trainer = TRAINERS[activeBattle.trainerId];
      if (trainer) {
        trainer.defeated = true;
      }
      if (activeBattle.trainerId === 'gym_leader_roark') {
        const nextBadges = Array.from(new Set([...playerState.badges, 'coal_badge']));
        setPlayerState((prev) => ({
          ...prev,
          badges: nextBadges,
          money: prev.money + 2000,
        }));
        setShowGymClearModal(true);
      }
    }

    // Check Evolution for active Pokemon
    const activeLead = nextParty[0];
    if (activeLead && result.won) {
      const base = POKEDEX[activeLead.baseId];
      const evoCheck = checkEvolution(activeLead, base);
      if (evoCheck.shouldEvolve && evoCheck.targetBaseId) {
        setPendingEvolution({
          pokemon: activeLead,
          targetBaseId: evoCheck.targetBaseId,
        });
      }
    }

    setPlayerState((prev) => ({
      ...prev,
      party: nextParty,
      inventory: result.updatedInventory,
      money: prev.money + result.moneyGained,
      caughtPokemon: nextCaught,
      ...(allFainted
        ? { currentMap: 'twinleaf_town', x: 5, y: 7, direction: 'down' as const }
        : {}),
    }));

    setActiveBattle(null);
    setScreen('overworld');
  };

  // Evolution Complete Handler
  const handleEvolutionComplete = (evolved: PokemonInstance) => {
    setPlayerState((prev) => ({
      ...prev,
      party: prev.party.map((p) => (p.uid === evolved.uid ? evolved : p)),
      seenPokemon: Array.from(new Set([...prev.seenPokemon, evolved.baseId])),
      caughtPokemon: Array.from(new Set([...prev.caughtPokemon, evolved.baseId])),
    }));
    setPendingEvolution(null);
  };

  const updatePartialPlayerState = useCallback((updated: Partial<PlayerState>) => {
    setPlayerState((prev) => ({ ...prev, ...updated }));
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#10141c] flex flex-col justify-center items-center">
      {/* Nintendo DS Dual-Screen Hardware Shell */}
      <div className="relative w-full max-w-4xl h-full flex flex-col items-center justify-between p-2 md:p-3 select-none">
        {/* Main Game Screen Viewport */}
        <div className="relative w-full flex-1 max-h-[82vh] bg-[#181c24] overflow-hidden border-4 border-[#384048] shadow-2xl flex flex-col">
          {screen === 'title' && (
            <TitleScreen
              onStartNewGame={handleStartNewGame}
              onContinueGame={handleContinueGame}
              hasSaveGame={hasSaveGame}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
            />
          )}

          {screen === 'starter_select' && (
            <StarterSelectScreen onStarterChosen={handleStarterChosen} />
          )}

          {screen === 'overworld' && (
            <OverworldScreen
              playerState={playerState}
              onUpdatePlayerState={updatePartialPlayerState}
              onTriggerWildBattle={handleTriggerWildBattle}
              onTriggerTrainerBattle={handleTriggerTrainerBattle}
              onOpenStarterSelect={() => setScreen('starter_select')}
              onOpenMenu={() => {
                setIsMenuOpen(true);
                setActiveMenuTab('menu');
              }}
              stepCount={stepCount}
              setStepCount={setStepCount}
              gameSpeed={gameSpeed}
              setGameSpeed={setGameSpeed}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
            />
          )}

          {screen === 'battle' && activeBattle && (
            <BattleScreen
              playerPokemon={
                playerState.party.find((p) => !p.isFainted && p.currentHp > 0) ||
                playerState.party[0]
              }
              enemyPokemon={activeBattle.enemyPokemon}
              isTrainerBattle={activeBattle.isTrainerBattle}
              trainerName={activeBattle.trainerName}
              trainerReward={activeBattle.trainerReward}
              playerParty={playerState.party}
              inventory={playerState.inventory}
              onBattleEnd={handleBattleEnd}
            />
          )}
        </div>

        {/* Bottom Bar: Pokétch Integrated Accessory Panel */}
        {screen === 'overworld' && (
          <div className="w-full mt-1.5">
            <PoketchAndMenu
              playerState={playerState}
              stepCount={stepCount}
              onUpdatePlayerState={updatePartialPlayerState}
              isMenuOpen={isMenuOpen}
              activeMenuTab={activeMenuTab}
              setActiveMenuTab={setActiveMenuTab}
              onCloseMenu={() => {
                sound.playCancel();
                setIsMenuOpen(false);
                setActiveMenuTab(null);
              }}
            />
          </div>
        )}
      </div>

      {/* Evolution Modal */}
      {pendingEvolution && (
        <EvolutionModal
          pokemon={pendingEvolution.pokemon}
          targetBaseId={pendingEvolution.targetBaseId}
          onEvolutionComplete={handleEvolutionComplete}
        />
      )}

      {/* Gym Clear Victory Modal */}
      {showGymClearModal && (
        <GymClearModal
          playerState={playerState}
          onContinue={() => setShowGymClearModal(false)}
        />
      )}
    </div>
  );
}
