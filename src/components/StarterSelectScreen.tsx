/**
 * Professor Rowan's Briefcase (마박사의 가방) - Authentic Gen 4 Starter Selection
 * No stat dumps, no meta spoilers, no emojis. Pure DS briefcase interface with
 * 3 Pokéballs in velvet compartments and a classic Gen 4 dialogue prompt.
 */

import React, { useState, useEffect } from 'react';
import { PokemonInstance } from '../game/types';
import { POKEDEX } from '../game/pokemonData';
import { createPokemonInstance } from '../game/battleLogic';
import { getPokemonSpriteUrl, getPokemonFallbackSpriteUrl, getPixelIconDataUrl } from '../game/spriteRenderer';
import { sound } from '../game/soundEngine';

interface StarterSelectProps {
  onStarterChosen: (starter: PokemonInstance) => void;
}

const STARTER_INFO: Record<number, { category: string; typeText: string }> = {
  387: { category: '꼬마잎포켓몬', typeText: '풀타입' },
  390: { category: '꼬마원숭이포켓몬', typeText: '불꽃타입' },
  393: { category: '펭귄포켓몬', typeText: '물타입' },
};

export const StarterSelectScreen: React.FC<StarterSelectProps> = ({ onStarterChosen }) => {
  const starters = [POKEDEX[387], POKEDEX[390], POKEDEX[393]]; // Turtwig, Chimchar, Piplup
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const activeStarter = starters[selectedIdx];
  const pokeballIcon = getPixelIconDataUrl('pokeball');
  const info = STARTER_INFO[activeStarter.id];

  useEffect(() => {
    sound.playSelect();
  }, [selectedIdx]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 2) % 3);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % 3);
      } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIdx]);

  const handleConfirm = () => {
    sound.playCatchSuccess();
    const instance = createPokemonInstance(activeStarter, 5);
    onStarterChosen(instance);
  };

  return (
    <div className="relative w-full h-full flex flex-col justify-between items-center bg-[#305828] p-4 select-none font-pixel overflow-hidden">
      {/* Pixel Grass Texture Backdrop */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(#70b848 15%, transparent 16%), radial-gradient(#204018 15%, transparent 16%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 8px 8px',
        }}
      />

      {/* Open Leather Briefcase Container */}
      <div className="relative z-10 w-full max-w-lg flex-1 flex flex-col items-center justify-center my-1">
        {/* Top Briefcase Lid Frame */}
        <div className="w-full bg-[#58341c] border-4 border-[#241408] p-3 shadow-[0_8px_0_#1c3414]">
          <div className="bg-[#382012] border-2 border-[#784828] p-4 flex flex-col items-center">
            {/* Pokémon Preview Window (Gen 4 DS Popup Frame) */}
            <div className="bg-[#f8f8f8] border-4 border-[#304058] outline outline-2 outline-[#88a0b8] px-6 py-2 mb-4 flex items-center gap-5 shadow-[0_4px_0_#201008]">
              <div className="relative w-24 h-24 flex items-center justify-center bg-[#e8f0f8] border-2 border-[#b0c0d0]">
                <img
                  src={getPokemonSpriteUrl(activeStarter.id, false)}
                  alt={activeStarter.koreanName}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = getPokemonFallbackSpriteUrl(
                      activeStarter.id,
                      false
                    );
                  }}
                  className="w-20 h-20 object-contain pixelated"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="text-[#202830] text-left">
                <div className="text-[11px] text-[#506888]">{info.category}</div>
                <div className="text-lg font-bold tracking-wider mt-0.5">{activeStarter.koreanName}</div>
                <div className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold text-white bg-[#405870] border border-[#203040]">
                  {info.typeText}
                </div>
              </div>
            </div>

            {/* 3 Velvet Compartments with Pokéballs */}
            <div className="w-full grid grid-cols-3 gap-3 bg-[#28140c] border-2 border-[#180c06] p-3">
              {starters.map((starter, idx) => {
                const isSelected = selectedIdx === idx;
                return (
                  <button
                    key={starter.id}
                    onClick={() => setSelectedIdx(idx)}
                    className={`relative py-3 px-2 flex flex-col items-center justify-center border-2 transition-none ${
                      isSelected
                        ? 'bg-[#602028] border-[#ffd848]'
                        : 'bg-[#3c181c] border-[#240c10] hover:bg-[#4c1c22]'
                    }`}
                  >
                    {/* Cursor Arrow */}
                    <div
                      className={`text-xs font-bold text-[#ffd848] mb-1 ${
                        isSelected ? 'opacity-100 animate-bounce' : 'opacity-0'
                      }`}
                    >
                      ▼
                    </div>
                    <img
                      src={pokeballIcon}
                      alt={starter.koreanName}
                      className={`w-9 h-9 object-contain pixelated ${
                        isSelected ? 'scale-110' : 'opacity-80'
                      }`}
                    />
                    <span
                      className={`mt-1.5 text-xs font-bold ${
                        isSelected ? 'text-[#ffd848]' : 'text-[#c8b0a0]'
                      }`}
                    >
                      {starter.koreanName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Gen 4 DS Dialogue Box + Yes/No Prompt */}
      <div className="relative z-10 w-full max-w-lg flex items-end gap-2">
        <div className="flex-1 dialog-box-gen4 text-[#202830] p-3 min-h-[72px] flex flex-col justify-center">
          <div className="text-xs sm:text-sm leading-relaxed">
            {info.typeText}의 {info.category} <span className="font-bold text-[#c82828]">「{activeStarter.koreanName}」</span>이다!
          </div>
          <div className="text-xs sm:text-sm leading-relaxed mt-0.5">
            이 포켓몬의 몬스터볼을 사용하겠습니까?
          </div>
        </div>

        {/* Classic Gen 4 Yes Confirm Box */}
        <div className="bg-[#f8f8f8] border-4 border-[#304058] outline outline-2 outline-[#88a0b8] p-2.5 flex flex-col gap-1 min-w-[100px] shadow-[0_4px_0_#182810]">
          <button
            data-start="true"
            onClick={handleConfirm}
            className="w-full text-left px-2 py-1 text-xs sm:text-sm font-bold text-[#202830] bg-[#e0ecf8] border border-[#3868a8] flex items-center gap-1.5 hover:bg-[#d0e4f8]"
          >
            <span className="text-[#d83828]">▶</span>
            <span>예</span>
          </button>
          <button
            onClick={() => setSelectedIdx((prev) => (prev + 1) % 3)}
            className="w-full text-left px-2 py-1 text-xs sm:text-sm font-bold text-[#505860] hover:text-[#202830] flex items-center gap-1.5"
          >
            <span className="opacity-0">▶</span>
            <span>다른 볼</span>
          </button>
        </div>
      </div>
    </div>
  );
};
