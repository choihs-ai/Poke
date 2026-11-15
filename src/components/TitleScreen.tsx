/**
 * Pokémon Diamond & Pearl Authentic Nintendo DS Title Screen
 * Zero SaaS pills, zero meta text, authentic Gen 4 double-bordered menu frame.
 */

import React, { useEffect, useState } from 'react';
import { sound } from '../game/soundEngine';
import { Volume2, VolumeX } from 'lucide-react';

interface TitleScreenProps {
  onStartNewGame: () => void;
  onContinueGame: () => void;
  hasSaveGame: boolean;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartNewGame,
  onContinueGame,
  hasSaveGame,
  isMuted,
  setIsMuted,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    sound.playBgm('town');
    const interval = setInterval(() => setBlink((b) => !b), 600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (hasSaveGame && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS')) {
        e.preventDefault();
        sound.playSelect();
        setSelectedIndex((prev) => (prev === 0 ? 1 : 0));
      } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
        e.preventDefault();
        sound.playConfirm();
        if (hasSaveGame && selectedIndex === 0) {
          onContinueGame();
        } else {
          onStartNewGame();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasSaveGame, selectedIndex, onContinueGame, onStartNewGame]);

  return (
    <div className="relative w-full h-full flex flex-col justify-between items-center bg-[#080c18] p-5 text-white select-none overflow-hidden font-pixel">
      {/* 16-bit Pixel Art Key Art Background of Mount Coronet */}
      <img
        src="/src/assets/images/title_bg_1794378065271.jpg"
        alt="Mount Coronet Sinnoh"
        className="absolute inset-0 w-full h-full object-cover pixelated opacity-80 pointer-events-none"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#080c18]/60 via-transparent to-[#080c18]/85 pointer-events-none" />

      {/* Top-Right Discrete Sound Button */}
      <div className="w-full flex justify-end items-center z-10">
        <button
          onClick={() => {
            const next = !isMuted;
            sound.setMuted(next);
            setIsMuted(next);
          }}
          className="p-1.5 bg-[#182030] border-2 border-[#506888] text-slate-200 hover:bg-[#243048]"
          title="사운드 ON/OFF [M]"
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-sky-300" />}
        </button>
      </div>

      {/* Authentic Gen 4 Title Crest */}
      <div className="relative z-10 flex flex-col items-center mt-2 text-center">
        <div className="text-[11px] tracking-[0.28em] text-[#a8d0f8] mb-1 drop-shadow-[0_2px_0_#000]">
          P O K É M O N &nbsp; D I A M O N D &nbsp; &amp; &nbsp; P E A R L
        </div>

        {/* Pixel-Bordered Title Banner */}
        <div className="bg-[#101828]/90 border-4 border-[#6898d8] px-6 py-3 shadow-[0_6px_0_#080c14]">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-wider text-[#f8f8f8] drop-shadow-[0_3px_0_#182848]">
            포켓몬스터 DP
          </h1>
          <div className="mt-1 text-xs sm:text-sm tracking-[0.25em] text-[#ffd860] drop-shadow-[0_2px_0_#000]">
            디아루가 · 펄기아
          </div>
        </div>
      </div>

      {/* Bottom Gen 4 DS Menu Box */}
      <div className="relative z-10 w-full max-w-md mb-2 flex flex-col items-center gap-3">
        <div
          className={`text-xs tracking-widest text-[#f8e890] drop-shadow-[0_2px_0_#000] ${
            blink ? 'opacity-100' : 'opacity-20'
          }`}
        >
          PRESS START / Z OR SPACE
        </div>

        {/* Authentic Gen 4 Dialogue Menu Frame */}
        <div className="w-full bg-[#f8f8f8] text-[#202830] border-4 border-[#304058] outline outline-2 outline-[#7090b8] p-3 shadow-[0_6px_0_#080c14] flex flex-col gap-1.5">
          {hasSaveGame && (
            <button
              data-start="true"
              onMouseEnter={() => setSelectedIndex(0)}
              onClick={() => {
                sound.playConfirm();
                onContinueGame();
              }}
              className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-bold flex items-center justify-between border-2 transition-none ${
                selectedIndex === 0
                  ? 'bg-[#e0ecf8] border-[#3868a8] text-[#102038]'
                  : 'bg-transparent border-transparent text-[#485058]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={selectedIndex === 0 ? 'opacity-100 text-[#d83828]' : 'opacity-0'}>▶</span>
                <span>모험을 계속한다</span>
              </span>
              <span className="text-[10px] text-[#506888] font-mono">SAVED DATA</span>
            </button>
          )}

          <button
            data-start={!hasSaveGame ? 'true' : undefined}
            onMouseEnter={() => setSelectedIndex(hasSaveGame ? 1 : 0)}
            onClick={() => {
              sound.playConfirm();
              onStartNewGame();
            }}
            className={`w-full text-left px-3 py-2 text-xs sm:text-sm font-bold flex items-center justify-between border-2 transition-none ${
              (!hasSaveGame || selectedIndex === 1)
                ? 'bg-[#e0ecf8] border-[#3868a8] text-[#102038]'
                : 'bg-transparent border-transparent text-[#485058]'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={!hasSaveGame || selectedIndex === 1 ? 'opacity-100 text-[#d83828]' : 'opacity-0'}>▶</span>
              <span>새로운 모험을 시작한다</span>
            </span>
            <span className="text-[10px] text-[#506888] font-mono">NEW GAME</span>
          </button>
        </div>

        <div className="text-[10px] text-slate-400 font-mono tracking-wider">
          방향키 / WASD: 이동 &nbsp;|&nbsp; Z / Space: 조사 · 대화 &nbsp;|&nbsp; X / Esc: 메뉴
        </div>
      </div>
    </div>
  );
};
