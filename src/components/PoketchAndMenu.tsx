/**
 * Gen 4 Pokétch (Pokémon Watch) & DS In-Game Menu System
 * Zero emojis, authentic LCD Pokétch display, and double-bordered DS menu windows.
 */

import React, { useState, useEffect } from 'react';
import { PlayerState, PokemonInstance, Item } from '../game/types';
import { POKEDEX } from '../game/pokemonData';
import { TYPE_CHART } from '../game/battleLogic';
import { sound } from '../game/soundEngine';
import { getPokemonSpriteUrl, getPixelIconDataUrl } from '../game/spriteRenderer';

interface PoketchAndMenuProps {
  playerState: PlayerState;
  stepCount: number;
  onUpdatePlayerState: (updated: Partial<PlayerState>) => void;
  onCloseMenu: () => void;
  isMenuOpen: boolean;
  activeMenuTab: 'menu' | 'bag' | 'party' | 'pokedex' | 'card' | 'save' | null;
  setActiveMenuTab: (tab: 'menu' | 'bag' | 'party' | 'pokedex' | 'card' | 'save' | null) => void;
}

const VALID_ICON_TYPES = new Set([
  'pokeball',
  'greatball',
  'potion',
  'super_potion',
  'revive',
  'badge',
]);

function resolveItemIconUrl(iconKey: string): string {
  const key = VALID_ICON_TYPES.has(iconKey)
    ? (iconKey as 'pokeball' | 'greatball' | 'potion' | 'super_potion' | 'revive' | 'badge')
    : 'potion';
  return getPixelIconDataUrl(key);
}

export const PoketchAndMenu: React.FC<PoketchAndMenuProps> = ({
  playerState,
  stepCount,
  onUpdatePlayerState,
  onCloseMenu,
  isMenuOpen,
  activeMenuTab,
  setActiveMenuTab,
}) => {
  const [poketchApp, setPoketchApp] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [radarPing, setRadarPing] = useState<{ x: number; y: number } | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const [selectedAttackType, setSelectedAttackType] = useState<string>('water');
  const [selectedDefendType, setSelectedDefendType] = useState<string>('rock');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleNextPoketchApp = () => {
    sound.playSelect();
    setPoketchApp((prev) => (prev + 1) % 5);
  };

  const handleRadarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    sound.playTone(660, 0.08, 'sine', 0.15);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setRadarPing({ x, y });
    setTimeout(() => setRadarPing(null), 1000);
  };

  const handleUseItemOnPokemon = (item: Item, targetPokemon?: PokemonInstance) => {
    if (!targetPokemon || item.count <= 0) return;
    if (item.category !== 'medicine') return;

    if (targetPokemon.isFainted && item.id !== 'revive') {
      sound.playCancel();
      return;
    }
    if (!targetPokemon.isFainted && item.id === 'revive') {
      sound.playCancel();
      return;
    }

    sound.playHeal();
    let updatedHp = targetPokemon.currentHp;
    let isFainted = targetPokemon.isFainted;

    if (item.id === 'revive') {
      updatedHp = Math.floor(targetPokemon.maxHp / 2);
      isFainted = false;
    } else {
      updatedHp = Math.min(targetPokemon.maxHp, targetPokemon.currentHp + (item.effectValue || 20));
    }

    const updatedParty = playerState.party.map((p) =>
      p.uid === targetPokemon.uid ? { ...p, currentHp: updatedHp, isFainted } : p
    );

    const updatedInv = playerState.inventory.map((i) =>
      i.id === item.id ? { ...i, count: i.count - 1 } : i
    );

    onUpdatePlayerState({
      party: updatedParty,
      inventory: updatedInv,
    });
  };

  const handleSaveGame = () => {
    try {
      sound.playConfirm();
      const saveData = {
        name: playerState.name,
        party: playerState.party,
        inventory: playerState.inventory,
        money: playerState.money,
        badges: playerState.badges,
        currentMap: playerState.currentMap,
        x: playerState.x,
        y: playerState.y,
        seenPokemon: playerState.seenPokemon,
        caughtPokemon: playerState.caughtPokemon,
        playTimeSeconds: playerState.playTimeSeconds,
        savedAt: new Date().toLocaleString(),
      };
      localStorage.setItem('sinnoh_pokemon_save', JSON.stringify(saveData));
      setSaveSuccessMessage(`${playerState.name}은(는) 리포트를 정확히 작성했다!`);
      setTimeout(() => setSaveSuccessMessage(null), 2500);
    } catch {
      setSaveSuccessMessage('리포트 작성에 실패했습니다.');
    }
  };

  return (
    <>
      {/* --- POKÉTCH (DS BOTTOM LCD ACCESSORY) --- */}
      <div
        className="w-full bg-[#94a888] text-[#1c2818] p-2 font-pixel select-none flex flex-col justify-between"
        style={{
          border: '3px solid #3c4838',
          boxShadow: 'inset 0 0 0 2px #788c6c',
        }}
      >
        <div className="flex justify-between items-center text-[10px] border-b border-[#687c5c] pb-1 font-bold">
          <span>POKÉTCH APP No.0{poketchApp + 1}</span>
          <button
            onClick={handleNextPoketchApp}
            className="bg-[#748868] hover:bg-[#647858] text-[#142010] px-2.5 py-0.5 text-[10px] font-bold border border-[#3c4838]"
          >
            버튼 전환 ▶
          </button>
        </div>

        <div className="py-1.5 min-h-[82px] flex flex-col items-center justify-center">
          {/* App 0: Digital Clock */}
          {poketchApp === 0 && (
            <div className="text-center">
              <div className="text-[10px] font-bold">디지털 시계</div>
              <div className="text-xl font-bold tracking-widest my-0.5">
                {currentTime || '12:00:00'}
              </div>
              <div className="text-[10px]">
                모험 시간 {Math.floor(playerState.playTimeSeconds / 60)}분
              </div>
            </div>
          )}

          {/* App 1: Party Status Monitor */}
          {poketchApp === 1 && (
            <div className="w-full px-1">
              <div className="text-[10px] font-bold text-center mb-1">
                실시간 포켓몬 리스트 ({playerState.party.length}/6)
              </div>
              {playerState.party.length === 0 ? (
                <div className="text-[11px] text-center py-2">
                  현재 데리고 있는 포켓몬이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {playerState.party.map((p) => (
                    <div
                      key={p.uid}
                      className="bg-[#829676] p-1 border border-[#54644c] text-[9px] flex flex-col items-center"
                    >
                      <img
                        src={getPokemonSpriteUrl(p.baseId, false)}
                        alt={p.koreanName}
                        className="w-6 h-6 object-contain pixelated"
                        referrerPolicy="no-referrer"
                      />
                      <span className="font-bold truncate max-w-[54px]">{p.koreanName}</span>
                      <div className="w-full bg-[#485840] h-1.5 mt-0.5">
                        <div
                          className="h-full bg-[#182414]"
                          style={{ width: `${(p.currentHp / p.maxHp) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* App 2: Dowsing Machine */}
          {poketchApp === 2 && (
            <div
              onClick={handleRadarClick}
              className="relative w-36 h-16 bg-[#829676] border-2 border-[#485840] flex items-center justify-center cursor-pointer overflow-hidden"
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-35">
                <div className="w-12 h-12 rounded-full border border-[#182414]" />
                <div className="absolute w-full h-[1px] bg-[#182414]" />
                <div className="absolute h-full w-[1px] bg-[#182414]" />
              </div>
              <span className="text-[9px] font-bold z-10">다우징머신 (터치)</span>
              {radarPing && (
                <div
                  className="absolute w-2.5 h-2.5 bg-[#182414] animate-ping pointer-events-none"
                  style={{ left: `${radarPing.x}%`, top: `${radarPing.y}%` }}
                />
              )}
            </div>
          )}

          {/* App 3: Type Matchup Calculator */}
          {poketchApp === 3 && (
            <div className="w-full text-center text-[10px]">
              <div className="font-bold mb-1">상성 체커</div>
              <div className="flex items-center justify-center gap-1">
                <select
                  value={selectedAttackType}
                  onChange={(e) => setSelectedAttackType(e.target.value)}
                  className="bg-[#829676] border border-[#485840] px-1 text-[9px] font-bold"
                >
                  {Object.keys(TYPE_CHART).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span>▶</span>
                <select
                  value={selectedDefendType}
                  onChange={(e) => setSelectedDefendType(e.target.value)}
                  className="bg-[#829676] border border-[#485840] px-1 text-[9px] font-bold"
                >
                  {Object.keys(TYPE_CHART).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1 font-bold text-xs">
                배율: {(TYPE_CHART as any)[selectedAttackType]?.[selectedDefendType] ?? 1}배
              </div>
            </div>
          )}

          {/* App 4: Step Counter */}
          {poketchApp === 4 && (
            <div className="text-center">
              <div className="text-[10px] font-bold">카운터 (만보기)</div>
              <div className="text-lg font-bold tracking-widest my-0.5">
                {stepCount.toLocaleString()} 걸음
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- GEN 4 DS IN-GAME MENU MODAL --- */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 font-pixel select-none">
          <div
            className="relative w-full max-w-md bg-[#f8f8f8] text-[#283038] p-4 flex flex-col max-h-[85vh]"
            style={{
              border: '4px solid #384048',
              boxShadow: 'inset 0 0 0 3px #d0d8e0, 0 10px 25px rgba(0,0,0,0.75)',
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-[#a8b8c8] pb-2 mb-3">
              <h2 className="text-sm font-bold tracking-tight text-[#204888]">
                {activeMenuTab === 'menu' && '메뉴'}
                {activeMenuTab === 'bag' && '가방'}
                {activeMenuTab === 'party' && '포켓몬'}
                {activeMenuTab === 'pokedex' && '신오 포켓몬 도감'}
                {activeMenuTab === 'card' && '트레이너 카드'}
                {activeMenuTab === 'save' && '포켓몬 리포트'}
              </h2>
              <button
                onClick={onCloseMenu}
                className="bg-[#e0e8f0] hover:bg-[#d0d8e0] text-[#283038] border-2 border-[#505868] px-2 py-0.5 text-xs font-bold"
              >
                닫기 [X]
              </button>
            </div>

            {/* TAB: MAIN MENU HUB */}
            {activeMenuTab === 'menu' && (
              <div className="flex flex-col gap-2 my-1">
                <button
                  onClick={() => {
                    sound.playSelect();
                    setActiveMenuTab('pokedex');
                  }}
                  className="p-2.5 bg-white hover:bg-[#e8f0f8] border-2 border-[#687888] flex items-center justify-between font-bold text-xs"
                >
                  <span>▶ 도감</span>
                  <span className="text-[10px] text-[#606870]">발견 {playerState.seenPokemon.length}</span>
                </button>
                <button
                  onClick={() => {
                    sound.playSelect();
                    setActiveMenuTab('party');
                  }}
                  className="p-2.5 bg-white hover:bg-[#e8f0f8] border-2 border-[#687888] flex items-center justify-between font-bold text-xs"
                >
                  <span>▶ 포켓몬</span>
                  <span className="text-[10px] text-[#606870]">{playerState.party.length}마리 동행</span>
                </button>
                <button
                  onClick={() => {
                    sound.playSelect();
                    setActiveMenuTab('bag');
                  }}
                  className="p-2.5 bg-white hover:bg-[#e8f0f8] border-2 border-[#687888] flex items-center justify-between font-bold text-xs"
                >
                  <span>▶ 가방</span>
                  <span className="text-[10px] text-[#606870]">도구 및 볼 확인</span>
                </button>
                <button
                  onClick={() => {
                    sound.playSelect();
                    setActiveMenuTab('card');
                  }}
                  className="p-2.5 bg-white hover:bg-[#e8f0f8] border-2 border-[#687888] flex items-center justify-between font-bold text-xs"
                >
                  <span>▶ {playerState.name}</span>
                  <span className="text-[10px] text-[#606870]">트레이너 카드</span>
                </button>
                <button
                  onClick={() => {
                    sound.playSelect();
                    setActiveMenuTab('save');
                  }}
                  className="p-2.5 bg-white hover:bg-[#e8f0f8] border-2 border-[#687888] flex items-center justify-between font-bold text-xs"
                >
                  <span>▶ 리포트</span>
                  <span className="text-[10px] text-[#606870]">모험 기록 저장</span>
                </button>
              </div>
            )}

            {/* TAB: BAG */}
            {activeMenuTab === 'bag' && (
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs font-bold bg-[#e8f0f8] border border-[#98a8b8] px-2.5 py-1.5">
                  <span>용돈: {playerState.money.toLocaleString()}원</span>
                  <span className="text-[10px] text-[#505868]">도구 주머니</span>
                </div>
                <div className="flex flex-col gap-1.5 mt-1">
                  {playerState.inventory
                    .filter((item) => item.count > 0)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-2 bg-white border-2 border-[#8898a8] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={resolveItemIconUrl(item.icon)}
                            alt={item.name}
                            className="w-6 h-6 pixelated"
                          />
                          <div>
                            <div className="font-bold text-[#283038]">{item.name}</div>
                            <div className="text-[10px] text-[#586068]">{item.description}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#204888]">x{item.count}</span>
                          {item.category === 'medicine' && playerState.party.length > 0 && (
                            <button
                              onClick={() => handleUseItemOnPokemon(item, playerState.party[0])}
                              className="text-[10px] bg-[#389058] hover:bg-[#287848] text-white px-2 py-1 border border-[#184828] font-bold"
                            >
                              사용
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
                <button
                  onClick={() => setActiveMenuTab('menu')}
                  className="mt-3 text-xs bg-[#e0e8f0] text-[#283038] py-1.5 border-2 border-[#606878] font-bold"
                >
                  ◀ 돌아간다
                </button>
              </div>
            )}

            {/* TAB: PARTY */}
            {activeMenuTab === 'party' && (
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
                {playerState.party.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#586068] bg-white border-2 border-[#98a8b8]">
                    현재 동행 중인 포켓몬이 없습니다.
                  </div>
                ) : (
                  playerState.party.map((p, idx) => (
                    <div
                      key={p.uid}
                      className="p-2.5 bg-white border-2 border-[#687888] flex items-center gap-3"
                    >
                      <div className="w-14 h-14 bg-[#e8f0f8] border border-[#98a8b8] flex items-center justify-center flex-shrink-0">
                        <img
                          src={getPokemonSpriteUrl(p.baseId, false)}
                          alt={p.koreanName}
                          className="w-12 h-12 object-contain pixelated"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-xs font-bold text-[#204888]">No.{idx + 1}</span>
                            <span className="font-bold text-sm text-[#283038] truncate">
                              {p.koreanName}
                            </span>
                            <span className="text-xs text-[#485868] font-bold">Lv.{p.level}</span>
                          </div>
                          <span className="text-[11px] font-bold text-[#283038]">
                            HP {p.currentHp}/{p.maxHp}
                          </span>
                        </div>

                        <div className="w-full bg-[#384048] h-2.5 p-0.5 my-1">
                          <div
                            className={`h-full ${
                              p.currentHp / p.maxHp > 0.5
                                ? 'bg-[#30d858]'
                                : p.currentHp / p.maxHp > 0.2
                                ? 'bg-[#f8c830]'
                                : 'bg-[#f03828]'
                            }`}
                            style={{ width: `${(p.currentHp / p.maxHp) * 100}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-1 mt-1">
                          {p.moves.map((m) => (
                            <div
                              key={m.id}
                              className="text-[10px] bg-[#f0f4f8] px-1.5 py-0.5 border border-[#b0c0d0] flex justify-between"
                            >
                              <span className="truncate font-bold">{m.name}</span>
                              <span className="text-[#586068] ml-1">
                                {m.pp}/{m.maxPp}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <button
                  onClick={() => setActiveMenuTab('menu')}
                  className="mt-3 text-xs bg-[#e0e8f0] text-[#283038] py-1.5 border-2 border-[#606878] font-bold"
                >
                  ◀ 돌아간다
                </button>
              </div>
            )}

            {/* TAB: POKEDEX */}
            {activeMenuTab === 'pokedex' && (
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
                <div className="text-xs font-bold bg-[#e8f0f8] border border-[#98a8b8] px-2.5 py-1.5 flex justify-between">
                  <span>만난 포켓몬: {playerState.seenPokemon.length}</span>
                  <span>잡은 포켓몬: {playerState.caughtPokemon.length}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {Object.values(POKEDEX).map((entry) => {
                    const isSeen = playerState.seenPokemon.includes(entry.id);
                    const isCaught = playerState.caughtPokemon.includes(entry.id);

                    return (
                      <div
                        key={entry.id}
                        className="p-2 bg-white border-2 border-[#98a8b8] text-xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 bg-[#e8f0f8] border border-[#b0c0d0] flex items-center justify-center flex-shrink-0">
                            {isSeen ? (
                              <img
                                src={getPokemonSpriteUrl(entry.id, false)}
                                alt={entry.koreanName}
                                className={`w-8 h-8 object-contain pixelated ${
                                  isCaught ? '' : 'brightness-0 opacity-45'
                                }`}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="text-xs text-[#788088] font-bold">?</span>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] text-[#586068] block font-bold">
                              No.{String(entry.id).padStart(3, '0')}
                            </span>
                            <span className="font-bold text-xs text-[#283038]">
                              {isSeen ? entry.koreanName : '-----'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isCaught ? (
                            <div className="flex items-center gap-1 bg-[#e8f0f8] border border-[#687888] px-1.5 py-0.5">
                              <img
                                src={getPixelIconDataUrl('pokeball')}
                                alt="포획"
                                className="w-3.5 h-3.5 pixelated"
                              />
                              <span className="text-[10px] font-bold text-[#204888]">포획</span>
                            </div>
                          ) : isSeen ? (
                            <span className="text-[10px] text-[#505868] font-bold">발견</span>
                          ) : (
                            <span className="text-[10px] text-[#9098a0]">미발견</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => setActiveMenuTab('menu')}
                  className="mt-3 text-xs bg-[#e0e8f0] text-[#283038] py-1.5 border-2 border-[#606878] font-bold"
                >
                  ◀ 돌아간다
                </button>
              </div>
            )}

            {/* TAB: TRAINER CARD */}
            {activeMenuTab === 'card' && (
              <div className="flex-1 flex flex-col justify-between py-1">
                <div className="bg-[#e8f0f8] border-2 border-[#486078] p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-baseline border-b-2 border-[#88a0b8] pb-1.5">
                    <span className="text-xs font-bold text-[#204888]">TRAINER CARD</span>
                    <span className="text-xs font-bold text-[#485868]">IDNo. 200609</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <div className="text-[10px] text-[#586068]">이름</div>
                      <div className="font-bold text-sm text-[#283038]">{playerState.name}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#586068]">용돈</div>
                      <div className="font-bold text-sm text-[#283038]">
                        {playerState.money.toLocaleString()}원
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#586068]">포켓몬 도감</div>
                      <div className="font-bold text-[#283038]">
                        {playerState.caughtPokemon.length}마리
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#586068]">플레이 시간</div>
                      <div className="font-bold text-[#283038]">
                        {Math.floor(playerState.playTimeSeconds / 60)}분{' '}
                        {playerState.playTimeSeconds % 60}초
                      </div>
                    </div>
                  </div>

                  <div className="border-t-2 border-[#88a0b8] pt-2">
                    <div className="text-[10px] text-[#586068] mb-1.5 font-bold">
                      신오지방 체육관 배지 케이스
                    </div>
                    <div className="flex items-center gap-2">
                      {playerState.badges.includes('coal_badge') ? (
                        <div className="flex items-center gap-1.5 bg-white border-2 border-[#687888] px-2.5 py-1">
                          <img
                            src={getPixelIconDataUrl('badge')}
                            alt="콜배지"
                            className="w-4 h-4 pixelated"
                          />
                          <span className="text-xs font-bold text-[#283038]">
                            콜배지 (무쇠체육관)
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-[#687078]">획득한 배지가 없습니다.</div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveMenuTab('menu')}
                  className="mt-4 text-xs bg-[#e0e8f0] text-[#283038] py-1.5 border-2 border-[#606878] font-bold"
                >
                  ◀ 돌아간다
                </button>
              </div>
            )}

            {/* TAB: SAVE GAME */}
            {activeMenuTab === 'save' && (
              <div className="flex-1 flex flex-col justify-between py-2">
                <div className="bg-white border-2 border-[#687888] p-4 flex flex-col gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#586068]">주인공</span>
                    <span className="font-bold">{playerState.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#586068]">소지 배지</span>
                    <span className="font-bold">{playerState.badges.length}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#586068]">포켓몬 도감</span>
                    <span className="font-bold">{playerState.caughtPokemon.length}마리</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#586068]">모험 시간</span>
                    <span className="font-bold">{Math.floor(playerState.playTimeSeconds / 60)}분</span>
                  </div>
                  <div className="border-t border-[#c0ccd8] pt-2 mt-1 font-bold text-[#283038]">
                    지금까지의 활약상을 포켓몬 리포트에 작성하겠습니까?
                  </div>
                  {saveSuccessMessage && (
                    <div className="mt-2 bg-[#e8f8e8] text-[#186828] border-2 border-[#389058] px-3 py-1.5 font-bold">
                      {saveSuccessMessage}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 mt-3">
                  <button
                    onClick={handleSaveGame}
                    className="w-full py-2 bg-[#2868a8] hover:bg-[#205890] text-white font-bold text-xs border-2 border-[#183860]"
                  >
                    ▶ 예 (리포트 작성)
                  </button>
                  <button
                    onClick={() => setActiveMenuTab('menu')}
                    className="text-xs bg-[#e0e8f0] text-[#283038] py-1.5 border-2 border-[#606878] font-bold"
                  >
                    ◀ 아니오
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
