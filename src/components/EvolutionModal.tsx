/**
 * Pokemon Evolution Modal (Gen 4 DS Style)
 * Classic "어라...? [포켓몬]의 상태가...!" sequence with DS dialogue frame
 */

import React, { useEffect, useState } from 'react';
import { PokemonInstance } from '../game/types';
import { POKEDEX } from '../game/pokemonData';
import { getPokemonSpriteUrl, getPokemonFallbackSpriteUrl } from '../game/spriteRenderer';
import { sound } from '../game/soundEngine';

interface EvolutionModalProps {
  pokemon: PokemonInstance;
  targetBaseId: number;
  onEvolutionComplete: (evolvedPokemon: PokemonInstance) => void;
}

export const EvolutionModal: React.FC<EvolutionModalProps> = ({
  pokemon,
  targetBaseId,
  onEvolutionComplete,
}) => {
  const [phase, setPhase] = useState<'intro' | 'evolving' | 'done'>('intro');
  const targetBase = POKEDEX[targetBaseId];

  useEffect(() => {
    sound.playLevelUp();

    const timer1 = setTimeout(() => {
      setPhase('evolving');
      sound.playCatchSuccess();
    }, 1800);

    const timer2 = setTimeout(() => {
      setPhase('done');
      sound.playLevelUp();
    }, 4200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const handleFinish = () => {
    sound.playConfirm();
    const evolvedInstance: PokemonInstance = {
      ...pokemon,
      baseId: targetBase.id,
      name: targetBase.name,
      koreanName: targetBase.koreanName,
      types: [...targetBase.types],
      maxHp: pokemon.maxHp + 18,
      currentHp: pokemon.currentHp + 18,
      attack: pokemon.attack + 12,
      defense: pokemon.defense + 10,
      spAtk: pokemon.spAtk + 12,
      spDef: pokemon.spDef + 10,
      speed: pokemon.speed + 8,
    };
    onEvolutionComplete(evolvedInstance);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 select-none font-pixel">
      <div
        className="relative w-full max-w-md bg-[#182838] p-4 flex flex-col items-center justify-between"
        style={{
          border: '4px solid #384048',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
        }}
      >
        {/* Evolution Stage Viewport */}
        <div className="relative w-44 h-44 flex items-center justify-center my-4 bg-[#203850] border-2 border-[#486888]">
          <img
            src={getPokemonSpriteUrl(phase === 'done' ? targetBase.id : pokemon.baseId, false)}
            alt={pokemon.koreanName}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = getPokemonFallbackSpriteUrl(
                phase === 'done' ? targetBase.id : pokemon.baseId,
                false
              );
            }}
            className={`w-32 h-32 object-contain pixelated z-10 transition-all duration-700 ${
              phase === 'evolving' ? 'scale-110 brightness-200 contrast-200 animate-pulse' : 'scale-100'
            }`}
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Classic DS Dialogue Box */}
        <div
          className="w-full text-left"
          style={{
            backgroundColor: '#f8f8f8',
            borderTop: '4px solid #505868',
            borderBottom: '4px solid #505868',
            borderLeft: '12px solid #707888',
            borderRight: '12px solid #707888',
            padding: '12px 14px',
          }}
        >
          <p className="text-xs font-bold text-[#283038] leading-relaxed">
            {phase === 'intro' && `어라...? ${pokemon.koreanName}의 상태가...!`}
            {phase === 'evolving' && `${pokemon.koreanName}의 모습이 변하고 있다!`}
            {phase === 'done' &&
              `축하합니다! ${pokemon.koreanName}은(는) ${targetBase.koreanName}(으)로 진화했습니다!`}
          </p>

          {phase === 'done' && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleFinish}
                className="px-4 py-1.5 bg-[#2868a8] hover:bg-[#205890] text-white font-bold text-xs border-2 border-[#183860]"
              >
                ▶ 확인
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
