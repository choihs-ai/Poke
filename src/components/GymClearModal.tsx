/**
 * Gym Victory & Coal Badge Modal (Gen 4 DS Style)
 * Zero emojis, uses pixel-art Coal Badge and double-bordered DS frame.
 */

import React, { useEffect } from 'react';
import { PlayerState } from '../game/types';
import { sound } from '../game/soundEngine';
import { getPixelIconDataUrl, getPokemonSpriteUrl } from '../game/spriteRenderer';

interface GymClearModalProps {
  playerState: PlayerState;
  onContinue: () => void;
}

export const GymClearModal: React.FC<GymClearModalProps> = ({ playerState, onContinue }) => {
  useEffect(() => {
    sound.playCatchSuccess();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 select-none font-pixel">
      <div
        className="relative w-full max-w-md bg-[#f8f8f8] text-[#283038] p-5 flex flex-col items-center text-center"
        style={{
          border: '4px solid #384048',
          boxShadow: 'inset 0 0 0 3px #d0d8e0, 0 12px 30px rgba(0,0,0,0.85)',
        }}
      >
        {/* Pixel Art Coal Badge Showcase */}
        <div className="w-20 h-20 bg-[#283038] border-2 border-[#687888] flex items-center justify-center mb-3">
          <img
            src={getPixelIconDataUrl('badge')}
            alt="콜배지"
            className="w-12 h-12 pixelated"
          />
        </div>

        <div className="text-[11px] font-bold text-[#204888] mb-1">
          신오지방 포켓몬리그 공식 배지
        </div>

        <h2 className="text-base font-bold text-[#283038]">
          강석에게서 「콜배지」를 받았다!
        </h2>
        <p className="text-xs text-[#485058] mt-2 leading-relaxed">
          콜배지를 가지고 있으면 포켓몬리그의 공식 인증 트레이너로서 필드에서 비전기술 바위깨기를 사용할 수 있습니다.
        </p>

        {/* Team Lineup */}
        <div className="w-full text-left my-4 bg-[#e8f0f8] border-2 border-[#8898a8] p-3">
          <div className="text-[11px] text-[#204888] mb-2 font-bold">
            함께 승리한 동행 포켓몬
          </div>
          <div className="grid grid-cols-3 gap-2">
            {playerState.party.map((p) => (
              <div
                key={p.uid}
                className="bg-white p-1.5 border border-[#98a8b8] flex flex-col items-center"
              >
                <img
                  src={getPokemonSpriteUrl(p.baseId, false)}
                  alt={p.koreanName}
                  className="w-10 h-10 object-contain pixelated"
                  referrerPolicy="no-referrer"
                />
                <div className="font-bold text-xs truncate">{p.koreanName}</div>
                <div className="text-[10px] text-[#485868]">Lv.{p.level}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          data-start="true"
          onClick={() => {
            sound.playConfirm();
            onContinue();
          }}
          className="w-full py-2.5 bg-[#2868a8] hover:bg-[#205890] text-white font-bold text-xs border-2 border-[#183860]"
        >
          ▶ 모험을 계속한다
        </button>
      </div>
    </div>
  );
};
