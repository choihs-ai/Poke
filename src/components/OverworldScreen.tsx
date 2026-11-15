/**
 * Overworld 2.5D Tile & Building Canvas Engine (Authentic Gen 4 Nintendo DS Viewport)
 * - Zero black bars: Dynamically resizes canvas to fill the DS upper screen at authentic DS zoom (~9.5 tiles wide)
 * - Seamless overlapping forest canopies: Upper trees overlap lower trees without drawing trunks on top of canopies
 * - Solid signposts & white picket fences: Player stops cleanly in front of signposts (`signpostBlocking`)
 * - Persistent position sync: Player remains at exact tile after battles
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { PlayerState, Direction } from '../game/types';
import { MAPS, TRAINERS } from '../game/mapData';
import {
  GRASS_BASE,
  getTileCanvas,
  getTreeCanopyCanvas,
  getBuildingStructureCanvas,
  getActorCanvas,
  getSignpostCanvas,
} from '../game/spriteRenderer';
import { sound } from '../game/soundEngine';

interface OverworldScreenProps {
  playerState: PlayerState;
  onUpdatePlayerState: (updated: Partial<PlayerState>) => void;
  onTriggerWildBattle: (baseId: number, level: number) => void;
  onTriggerTrainerBattle: (trainerId: string) => void;
  onOpenStarterSelect: () => void;
  onOpenMenu: () => void;
  stepCount: number;
  setStepCount: React.Dispatch<React.SetStateAction<number>>;
  gameSpeed: number;
  setGameSpeed: (speed: number) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

interface DetectedBuilding {
  kind: 'pokecenter' | 'mart' | 'house' | 'lab' | 'gym';
  x: number;
  y: number;
  widthTiles: number;
  heightTiles: number;
}

function detectBuildings(tiles: number[][], mapId: string): DetectedBuilding[] {
  const height = tiles.length;
  const width = tiles[0]?.length || 0;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const buildings: DetectedBuilding[] = [];

  const isBuildingTile = (t: number) => t === 6 || t === 7 || t === 9 || t === 10 || t === 11;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y][x];
      if (!visited[y][x] && (t === 6 || t === 9 || t === 10 || t === 11)) {
        let maxX = x;
        while (maxX + 1 < width && isBuildingTile(tiles[y][maxX + 1])) {
          maxX++;
        }
        let maxY = y;
        while (maxY + 1 < height && isBuildingTile(tiles[maxY + 1][x])) {
          maxY++;
        }

        for (let by = y; by <= maxY; by++) {
          for (let bx = x; bx <= maxX; bx++) {
            visited[by][bx] = true;
          }
        }

        const wTiles = maxX - x + 1;
        const hTiles = maxY - y + 1;
        let kind: DetectedBuilding['kind'] = 'house';
        if (t === 9) kind = 'pokecenter';
        else if (t === 10) kind = 'mart';
        else if (t === 11) kind = 'gym';
        else if (mapId === 'sandgem_town' && x === 4) kind = 'lab';

        buildings.push({
          kind,
          x,
          y,
          widthTiles: wTiles,
          heightTiles: hTiles,
        });
      }
    }
  }
  return buildings;
}

export const OverworldScreen: React.FC<OverworldScreenProps> = ({
  playerState,
  onUpdatePlayerState,
  onTriggerWildBattle,
  onTriggerTrainerBattle,
  onOpenStarterSelect,
  onOpenMenu,
  setStepCount,
  gameSpeed,
  setGameSpeed,
  isMuted,
  setIsMuted,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Authentic DS zoom viewport size (256px = 8 tiles wide, dynamically matching container aspect ratio so ZERO black bars ever appear)
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({ w: 256, h: 224 });

  useEffect(() => {
    const updateViewport = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Keep logical width at 256px (8 tiles of 32px, matching real Nintendo DS 256px screen width)
        // and compute height from container aspect ratio so the canvas fills 100% of the screen without black bars!
        const targetW = 256;
        const aspect = rect.height / rect.width;
        const targetH = Math.max(192, Math.min(352, Math.round(targetW * aspect)));
        setViewportSize({ w: targetW, h: targetH });
      }
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const playerRef = useRef({
    x: playerState.x,
    y: playerState.y,
    dir: playerState.direction,
    isMoving: false,
    moveProgress: 0,
    targetX: playerState.x,
    targetY: playerState.y,
    animStep: 0,
  });

  const currentMap = MAPS[playerState.currentMap] || MAPS.twinleaf_town;
  const mapBuildings = useMemo(
    () => detectBuildings(currentMap.tiles, currentMap.id),
    [currentMap.id]
  );
  const isCityMap = currentMap.id === 'sandgem_town' || currentMap.id === 'oreburgh_city';

  const [activeDialog, setActiveDialog] = useState<{
    speaker?: string;
    lines: string[];
    lineIdx: number;
    onComplete?: () => void;
  } | null>(null);

  const keysHeld = useRef<Record<string, boolean>>({});
  const lastTimeRef = useRef<number>(performance.now());
  const animFrameCounter = useRef<number>(0);

  useEffect(() => {
    playerRef.current.x = playerState.x;
    playerRef.current.y = playerState.y;
    playerRef.current.dir = playerState.direction;
    playerRef.current.targetX = playerState.x;
    playerRef.current.targetY = playerState.y;
    playerRef.current.isMoving = false;
    playerRef.current.moveProgress = 0;
  }, [playerState.currentMap, playerState.x, playerState.y]);

  useEffect(() => {
    sound.playBgm(currentMap.bgm);
  }, [currentMap.id]);

  const advanceDialog = useCallback(() => {
    if (!activeDialog) return;
    sound.playSelect();
    if (activeDialog.lineIdx < activeDialog.lines.length - 1) {
      setActiveDialog({
        ...activeDialog,
        lineIdx: activeDialog.lineIdx + 1,
      });
    } else {
      const cb = activeDialog.onComplete;
      setActiveDialog(null);
      if (cb) cb();
    }
  }, [activeDialog]);

  const handleInteract = useCallback(() => {
    if (activeDialog) {
      advanceDialog();
      return;
    }

    const p = playerRef.current;
    let targetX = p.x;
    let targetY = p.y;
    if (p.dir === 'up') targetY -= 1;
    else if (p.dir === 'down') targetY += 1;
    else if (p.dir === 'left') targetX -= 1;
    else if (p.dir === 'right') targetX += 1;

    onUpdatePlayerState({ x: p.x, y: p.y, direction: p.dir });

    // Check NPC interaction (including adjacent Rowan's Briefcase when party is empty)
    let npc = currentMap.npcs.find(
      (n) => n.x === targetX && n.y === targetY && !(n.isStarterSelector && playerState.party.length > 0)
    );
    if (!npc && playerState.party.length === 0) {
      const adjacentBriefcase = currentMap.npcs.find(
        (n) => n.isStarterSelector && Math.abs(n.x - p.x) + Math.abs(n.y - p.y) <= 1
      );
      if (adjacentBriefcase) {
        npc = adjacentBriefcase;
      }
    }
    if (npc) {
      sound.playSelect();
      if (p.dir === 'up') npc.direction = 'down';
      else if (p.dir === 'down') npc.direction = 'up';
      else if (p.dir === 'left') npc.direction = 'right';
      else if (p.dir === 'right') npc.direction = 'left';

      if (npc.isStarterSelector) {
        if (playerState.party.length === 0) {
          setActiveDialog({
            speaker: npc.name,
            lines: npc.dialog,
            lineIdx: 0,
            onComplete: () => {
              onOpenStarterSelect();
            },
          });
        } else {
          setActiveDialog({
            speaker: npc.name,
            lines: ['가방 안에는 나머지 몬스터볼이 들어 있다. 어서 잔모래마을의 마박사님께 가자!'],
            lineIdx: 0,
          });
        }
        return;
      }

      if (npc.isHealer && playerState.party.length > 0) {
        const healedParty = playerState.party.map((poke) => ({
          ...poke,
          currentHp: poke.maxHp,
          isFainted: false,
          moves: poke.moves.map((m) => ({ ...m, pp: m.maxPp })),
        }));
        onUpdatePlayerState({ party: healedParty, x: p.x, y: p.y, direction: p.dir });
        sound.playHeal();
      }

      if (npc.trainerId) {
        const trainer = TRAINERS[npc.trainerId];
        if (trainer && !trainer.defeated) {
          setActiveDialog({
            speaker: `${trainer.title} ${trainer.name}`,
            lines: [trainer.dialogBefore],
            lineIdx: 0,
            onComplete: () => {
              onTriggerTrainerBattle(npc.trainerId!);
            },
          });
          return;
        } else if (trainer && trainer.defeated) {
          setActiveDialog({
            speaker: `${trainer.title} ${trainer.name}`,
            lines: [trainer.dialogAfter],
            lineIdx: 0,
          });
          return;
        }
      }

      setActiveDialog({
        speaker: npc.name,
        lines: npc.dialog,
        lineIdx: 0,
      });
      return;
    }

    // Check Signpost interaction (Signposts are solid, so player stands right in front of them at targetX, targetY)
    const sign = currentMap.signposts.find((s) => s.x === targetX && s.y === targetY);
    if (sign) {
      sound.playSelect();
      setActiveDialog({
        speaker: sign.title,
        lines: [sign.text],
        lineIdx: 0,
      });
    }
  }, [activeDialog, advanceDialog, currentMap, onOpenStarterSelect, onTriggerTrainerBattle, onUpdatePlayerState, playerState.party]);

  const tryStartMove = useCallback(
    (dir: Direction) => {
      const p = playerRef.current;
      if (p.isMoving || activeDialog) return;
      p.dir = dir;

      let nx = p.x;
      let ny = p.y;
      if (dir === 'up') ny -= 1;
      else if (dir === 'down') ny += 1;
      else if (dir === 'left') nx -= 1;
      else if (dir === 'right') nx += 1;

      const inBounds = nx >= 0 && nx < currentMap.width && ny >= 0 && ny < currentMap.height;
      const targetTile = inBounds ? currentMap.tiles[ny][nx] : 4;
      // Impassable tiles: 4 (tree), 6 (wall), 8 (cliff), 3 (water), 9 (pokecenter), 10 (mart), 11 (gym), 12 (white picket fence)
      const isTilePassable =
        targetTile !== 4 &&
        targetTile !== 6 &&
        targetTile !== 8 &&
        targetTile !== 3 &&
        targetTile !== 9 &&
        targetTile !== 10 &&
        targetTile !== 11 &&
        targetTile !== 12;

      const npcBlocking = currentMap.npcs.some(
        (n) => n.x === nx && n.y === ny && !(n.isStarterSelector && playerState.party.length > 0)
      );

      // SOLID SIGNPOST COLLISION: Player stops cleanly in front of signposts!
      const signpostBlocking = currentMap.signposts.some((s) => s.x === nx && s.y === ny);

      // Prevent leaving Twinleaf Town or entering tall grass without a Pokémon
      const warpAtTarget = currentMap.warps.find((w) => w.x === nx && w.y === ny);
      if (
        playerState.party.length === 0 &&
        (targetTile === 2 || (warpAtTarget && warpAtTarget.targetMap === 'route_201'))
      ) {
        sound.playSelect();
        setActiveDialog({
          speaker: '용식',
          lines: [
            '잠깐만! 포켓몬도 없이 풀숲에 들어가면 야생 포켓몬이 덮쳐온다고!',
            '마박사님이 두고 가신 가방이 여기 있으니까 먼저 가방 안의 몬스터볼을 골라봐!',
          ],
          lineIdx: 0,
          onComplete: () => {
            onOpenStarterSelect();
          },
        });
        return;
      }

      if (inBounds && isTilePassable && !npcBlocking && !signpostBlocking) {
        p.isMoving = true;
        p.moveProgress = 0;
        p.targetX = nx;
        p.targetY = ny;
      } else {
        // Persist facing direction even when stopped by a signpost, fence, or NPC
        onUpdatePlayerState({ x: p.x, y: p.y, direction: p.dir });
        if (animFrameCounter.current % 18 === 0) {
          sound.playCollision();
        }
      }
    },
    [activeDialog, currentMap, onOpenStarterSelect, onUpdatePlayerState, playerState.party.length]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const code = e.code;
      keysHeld.current[code] = true;

      if (code === 'ArrowUp' || code === 'KeyW') {
        e.preventDefault();
        tryStartMove('up');
        return;
      }
      if (code === 'ArrowDown' || code === 'KeyS') {
        e.preventDefault();
        tryStartMove('down');
        return;
      }
      if (code === 'ArrowLeft' || code === 'KeyA') {
        e.preventDefault();
        tryStartMove('left');
        return;
      }
      if (code === 'ArrowRight' || code === 'KeyD') {
        e.preventDefault();
        tryStartMove('right');
        return;
      }

      if (code === 'Space' || code === 'Enter' || code === 'KeyZ') {
        e.preventDefault();
        handleInteract();
      }

      if (code === 'KeyX' || code === 'Escape') {
        e.preventDefault();
        if (activeDialog) {
          advanceDialog();
        } else {
          sound.playConfirm();
          onUpdatePlayerState({
            x: playerRef.current.x,
            y: playerRef.current.y,
            direction: playerRef.current.dir,
          });
          onOpenMenu();
        }
      }

      if (code === 'KeyM') {
        const nextMute = !sound.getMuted();
        sound.setMuted(nextMute);
        setIsMuted(nextMute);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysHeld.current[e.code] = false;
    };

    const handleBlur = () => {
      keysHeld.current = {};
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [activeDialog, advanceDialog, handleInteract, onOpenMenu, onUpdatePlayerState, setIsMuted, tryStartMove]);

  // Main 60fps Game Loop
  useEffect(() => {
    let animId: number;

    const render = (time: number) => {
      const rawDt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      const dt = Math.min(rawDt, 0.05) * gameSpeed;
      animFrameCounter.current += 1;

      const p = playerRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (p.isMoving) {
        const runMultiplier =
          (keysHeld.current['ShiftLeft'] || keysHeld.current['ShiftRight']) && playerState.hasRunningShoes
            ? 2.0
            : 1.0;
        p.moveProgress += dt * 4.5 * runMultiplier;

        if (p.moveProgress >= 1) {
          p.x = p.targetX;
          p.y = p.targetY;
          p.isMoving = false;
          p.moveProgress = 0;
          p.animStep = (p.animStep + 1) % 4;

          setStepCount((prev) => prev + 1);

          const warp = currentMap.warps.find((w) => w.x === p.x && w.y === p.y);
          if (warp) {
            sound.playConfirm();
            onUpdatePlayerState({
              currentMap: warp.targetMap,
              x: warp.targetX,
              y: warp.targetY,
              direction: p.dir,
            });
            return;
          }

          onUpdatePlayerState({
            x: p.x,
            y: p.y,
            direction: p.dir,
          });

          if (
            currentMap.tiles[p.y]?.[p.x] === 2 &&
            currentMap.wildEncounters &&
            currentMap.wildEncounters.length > 0 &&
            playerState.party.length > 0
          ) {
            sound.playGrassRustle();
            if (Math.random() < 0.16) {
              const encounters = currentMap.wildEncounters;
              const totalWeight = encounters.reduce((sum, e) => sum + e.weight, 0);
              let roll = Math.random() * totalWeight;
              let chosen = encounters[0];
              for (const enc of encounters) {
                if (roll < enc.weight) {
                  chosen = enc;
                  break;
                }
                roll -= enc.weight;
              }
              const level =
                Math.floor(Math.random() * (chosen.maxLevel - chosen.minLevel + 1)) + chosen.minLevel;
              onTriggerWildBattle(chosen.baseId, level);
              return;
            }
          }
        }
      } else if (!activeDialog) {
        let nextDir: Direction | null = null;
        if (keysHeld.current['ArrowUp'] || keysHeld.current['KeyW']) nextDir = 'up';
        else if (keysHeld.current['ArrowDown'] || keysHeld.current['KeyS']) nextDir = 'down';
        else if (keysHeld.current['ArrowLeft'] || keysHeld.current['KeyA']) nextDir = 'left';
        else if (keysHeld.current['ArrowRight'] || keysHeld.current['KeyD']) nextDir = 'right';

        if (nextDir) {
          tryStartMove(nextDir);
        }
      }

      // --- RENDERING CANVAS (Authentic DS 2.5D Close-Up Camera at 2x High-DPI Integer Resolution) ---
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        const tileSize = 32;
        const viewW = viewportSize.w;
        const viewH = viewportSize.h;

        const visualX = p.isMoving ? p.x + (p.targetX - p.x) * p.moveProgress : p.x;
        const visualY = p.isMoving ? p.y + (p.targetY - p.y) * p.moveProgress : p.y;

        // Center camera on player, allowing a -16px top margin so row-0 tree crowns are NEVER chopped off!
        const camX = Math.round(visualX * tileSize + tileSize / 2 - viewW / 2);
        const camY = Math.round(visualY * tileSize + tileSize / 2 - viewH / 2);

        const minCamX = 0;
        const minCamY = -16; // Allows full 16px roof/tree crown overhang on row 0!
        const maxCamX = Math.max(0, currentMap.width * tileSize - viewW);
        const maxCamY = Math.max(0, currentMap.height * tileSize - viewH);
        const clampedCamX = Math.max(minCamX, Math.min(maxCamX, camX));
        const clampedCamY = Math.max(minCamY, Math.min(maxCamY, camY));

        ctx.save();
        ctx.scale(2, 2);

        // Fill background with DS grass/cave base so even negative camera margin has zero black bars
        const rockTopRow =
          currentMap.tiles[0].filter((t) => t === 8).length > currentMap.width / 2;
        ctx.fillStyle = currentMap.bgm === 'cave' ? '#5a4634' : rockTopRow ? '#8a6a48' : GRASS_BASE;
        ctx.fillRect(0, 0, viewW, viewH);

        ctx.translate(-clampedCamX, -clampedCamY);

        // 1. Base Ground Layer
        const animStep = Math.floor(animFrameCounter.current / 30);
        for (let y = 0; y < currentMap.height; y++) {
          for (let x = 0; x < currentMap.width; x++) {
            const tile = currentMap.tiles[y][x];
            const isCaveMouth = tile === 7 && y > 0 && currentMap.tiles[y - 1][x] === 8;
            const groundTile =
              isCaveMouth
                ? 7
                : tile === 4 || tile === 6 || tile === 7 || tile === 9 || tile === 10 || tile === 11
                  ? 0
                  : tile;
            const neighbors = {
              up: y > 0 ? currentMap.tiles[y - 1][x] : tile,
              down: y < currentMap.height - 1 ? currentMap.tiles[y + 1][x] : tile,
              left: x > 0 ? currentMap.tiles[y][x - 1] : tile,
              right: x < currentMap.width - 1 ? currentMap.tiles[y][x + 1] : tile,
              x,
              y,
              isCity: isCityMap,
              isCave: currentMap.bgm === 'cave',
              upLeft: y > 0 && x > 0 ? currentMap.tiles[y - 1][x - 1] : tile,
              upRight: y > 0 && x < currentMap.width - 1 ? currentMap.tiles[y - 1][x + 1] : tile,
              downLeft: y < currentMap.height - 1 && x > 0 ? currentMap.tiles[y + 1][x - 1] : tile,
              downRight:
                y < currentMap.height - 1 && x < currentMap.width - 1 ? currentMap.tiles[y + 1][x + 1] : tile,
            };
            const tileCanvas = getTileCanvas(groundTile, animStep, neighbors);
            ctx.drawImage(tileCanvas, x * tileSize, y * tileSize, tileSize, tileSize);
          }
        }

        // 2. Y-Sorted 2.5D Depth Pass (Overlapping Forest Trees, 3D Buildings, Solid Signposts, NPCs, Player)
        const renderables: Array<{ sortY: number; draw: () => void }> = [];

        // 2a. Seamless Overlapping DS Forest Trees (48x56 canopy, zero gaps horizontally or vertically)
        for (let x = 0; x < currentMap.width; x++) {
          if (currentMap.tiles[0]?.[x] === 4) {
            const bgTree = getTreeCanopyCanvas(true, (x * 7 + 3) % 3);
            renderables.push({
              sortY: -0.9,
              draw: () => {
                ctx.drawImage(bgTree, x * tileSize - 8, -1 * tileSize - 20, 48, 56);
              },
            });
          }
        }

        for (let y = 0; y < currentMap.height; y++) {
          for (let x = 0; x < currentMap.width; x++) {
            if (currentMap.tiles[y][x] === 4) {
              const hasTreeBelow =
                (y + 1 < currentMap.height && currentMap.tiles[y + 1][x] === 4) ||
                y === currentMap.height - 1;
              const treeCanopy = getTreeCanopyCanvas(hasTreeBelow, (x * 7 + y * 5) % 3);
              renderables.push({
                sortY: y + 0.1,
                draw: () => {
                  ctx.drawImage(treeCanopy, x * tileSize - 8, y * tileSize - 20, 48, 56);
                },
              });
            }
          }
        }

        // Southern border forest pass so bottom-edge trees continue seamlessly off the bottom of the map
        for (let x = 0; x < currentMap.width; x++) {
          if (currentMap.tiles[currentMap.height - 1]?.[x] === 4) {
            const southTree = getTreeCanopyCanvas(true, (x * 7 + currentMap.height * 5) % 3);
            renderables.push({
              sortY: currentMap.height + 0.1,
              draw: () => {
                ctx.drawImage(
                  southTree,
                  x * tileSize - 8,
                  currentMap.height * tileSize - 20,
                  48,
                  56
                );
              },
            });
          }
        }

        // 2b. Multi-Tile 3D Buildings
        mapBuildings.forEach((b) => {
          const bCanvas = getBuildingStructureCanvas(b.kind, b.widthTiles, b.heightTiles);
          const bottomRow = b.y + b.heightTiles - 1;
          renderables.push({
            sortY: bottomRow + 0.2,
            draw: () => {
              ctx.drawImage(
                bCanvas,
                b.x * tileSize,
                b.y * tileSize - 16,
                b.widthTiles * tileSize,
                b.heightTiles * tileSize + 16
              );
            },
          });
        });

        // 2c. Solid Signposts
        const signCanvas = getSignpostCanvas();
        currentMap.signposts.forEach((sign) => {
          renderables.push({
            sortY: sign.y + 0.45,
            draw: () => {
              ctx.drawImage(signCanvas, sign.x * tileSize, sign.y * tileSize - 2, tileSize, tileSize);
            },
          });
        });

        // 2d. NPCs (66x72 physical pixels = 33x36 logical pixels on 2x DS canvas -> exact 3x3 integer pixels per dot!)
        currentMap.npcs.forEach((npc) => {
          if (npc.isStarterSelector && playerState.party.length > 0) return;

          renderables.push({
            sortY: npc.y + 0.5,
            draw: () => {
              const actorCanvas = getActorCanvas(npc.sprite, npc.direction, 0);
              const drawX = Math.round(npc.x * tileSize * 2 - 1) / 2;
              const drawY = Math.round((npc.y * tileSize - 8) * 2) / 2;
              ctx.drawImage(actorCanvas, drawX, drawY, 33, 36);
            },
          });
        });

        // 2e. Player Character (Lucas - exact IMG_1329 pixel rig at 3x3 integer pixels per dot)
        const playerWalkStep = p.isMoving ? Math.floor(p.moveProgress * 4) : 0;
        renderables.push({
          sortY: visualY + 0.52,
          draw: () => {
            const playerCanvas = getActorCanvas('lucas', p.dir, playerWalkStep);
            const drawX = Math.round(visualX * tileSize * 2 - 1) / 2;
            const drawY = Math.round((visualY * tileSize - 8) * 2) / 2;
            ctx.drawImage(playerCanvas, drawX, drawY, 33, 36);
          },
        });

        renderables.sort((a, b) => a.sortY - b.sortY);
        renderables.forEach((r) => r.draw());

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    currentMap,
    mapBuildings,
    isCityMap,
    activeDialog,
    gameSpeed,
    playerState,
    viewportSize,
    onTriggerWildBattle,
    onUpdatePlayerState,
    setStepCount,
    tryStartMove,
  ]);

  const handleVirtualDirDown = (dir: Direction) => {
    keysHeld.current = {};
    if (dir === 'up') keysHeld.current['ArrowUp'] = true;
    if (dir === 'down') keysHeld.current['ArrowDown'] = true;
    if (dir === 'left') keysHeld.current['ArrowLeft'] = true;
    if (dir === 'right') keysHeld.current['ArrowRight'] = true;
  };

  const handleVirtualDirUp = () => {
    keysHeld.current = {};
  };

  return (
    <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-[#181c24] select-none font-pixel">
      {/* Main Upper DS Screen Viewport (Full-bleed, ZERO black bars!) */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-[#78c858]"
      >
        <canvas
          ref={canvasRef}
          width={viewportSize.w * 2}
          height={viewportSize.h * 2}
          className="w-full h-full block pixelated"
        />

        {/* Top Overworld HUD Overlay directly on the map (Matching IMG_1323 / IMG_1326!) */}
        <div className="absolute top-2 left-2 right-2 z-20 flex justify-between items-start pointer-events-none">
          {/* Authentic Gen 4 DS Top-Left Scanlined Location Plate */}
          <div
            className="pointer-events-auto px-4 py-1.5"
            style={{
              background:
                'repeating-linear-gradient(0deg, #f8fcff 0px, #f8fcff 2px, #dcecf8 2px, #dcecf8 4px)',
              border: '3px solid #486078',
              boxShadow: 'inset 0 0 0 2px #a8d0e8, 0 3px 0 rgba(0,0,0,0.38)',
            }}
          >
            <span className="font-bold text-sm tracking-tight text-[#283038]">
              {currentMap.koreanName}
            </span>
          </div>

          {/* Top-Right Compact DS Hardware Controls */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => setGameSpeed(gameSpeed === 1 ? 2 : 1)}
              className="bg-[#f8f8f8]/95 hover:bg-[#e8f0f8] text-[#283038] border-2 border-[#384048] px-2 py-1 text-[11px] font-bold shadow"
              title="배속 전환"
            >
              {gameSpeed}x 속도
            </button>

            <button
              onClick={() => {
                const nextMute = !isMuted;
                sound.setMuted(nextMute);
                setIsMuted(nextMute);
              }}
              className="bg-[#f8f8f8]/95 hover:bg-[#e8f0f8] text-[#283038] border-2 border-[#384048] px-2 py-1 text-[11px] font-bold shadow"
              title="사운드 ON/OFF [M]"
            >
              {isMuted ? '음소거' : '사운드'}
            </button>

            <button
              onClick={() => {
                sound.playConfirm();
                onUpdatePlayerState({
                  x: playerRef.current.x,
                  y: playerRef.current.y,
                  direction: playerRef.current.dir,
                });
                onOpenMenu();
              }}
              className="bg-[#f8f8f8]/95 hover:bg-[#e8f0f8] text-[#283038] border-2 border-[#384048] px-2.5 py-1 text-[11px] font-bold shadow active:translate-y-0.5"
            >
              메뉴 [X]
            </button>
          </div>
        </div>

        {/* Authentic DS Bottom Dialogue Window (Matching IMG_1322 / IMG_1325) */}
        {activeDialog && (
          <div
            onClick={advanceDialog}
            className="absolute bottom-2 left-2.5 right-2.5 z-40 cursor-pointer"
            style={{
              backgroundColor: '#f8f8f8',
              borderTop: '4px solid #505868',
              borderBottom: '4px solid #505868',
              borderLeft: '14px solid #707888',
              borderRight: '14px solid #707888',
              boxShadow: 'inset 0 0 0 2px #d0d8e0, 0 6px 14px rgba(0,0,0,0.65)',
              padding: '10px 16px',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[13px] font-bold text-[#303840] leading-relaxed">
                {activeDialog.speaker ? (
                  <span className="text-[#205098] mr-1.5">{activeDialog.speaker}:</span>
                ) : null}
                <span>{activeDialog.lines[activeDialog.lineIdx]}</span>
              </div>
              <span className="text-[#e03020] text-xs font-bold self-end animate-bounce ml-2">
                ▼
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom DS Touch / Keyboard Control Bar */}
      <div className="h-28 w-full bg-[#20242c] border-t-2 border-[#384048] px-4 py-1.5 flex justify-between items-center z-20">
        {/* Virtual D-Pad */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          <button
            onClick={() => tryStartMove('up')}
            onTouchStart={() => handleVirtualDirDown('up')}
            onTouchEnd={handleVirtualDirUp}
            onMouseDown={() => handleVirtualDirDown('up')}
            onMouseUp={handleVirtualDirUp}
            className="absolute top-0 w-8 h-8 bg-[#303844] border-2 border-[#505868] active:bg-[#485060] text-white font-bold flex items-center justify-center text-xs"
          >
            ▲
          </button>
          <button
            onClick={() => tryStartMove('down')}
            onTouchStart={() => handleVirtualDirDown('down')}
            onTouchEnd={handleVirtualDirUp}
            onMouseDown={() => handleVirtualDirDown('down')}
            onMouseUp={handleVirtualDirUp}
            className="absolute bottom-0 w-8 h-8 bg-[#303844] border-2 border-[#505868] active:bg-[#485060] text-white font-bold flex items-center justify-center text-xs"
          >
            ▼
          </button>
          <button
            onClick={() => tryStartMove('left')}
            onTouchStart={() => handleVirtualDirDown('left')}
            onTouchEnd={handleVirtualDirUp}
            onMouseDown={() => handleVirtualDirDown('left')}
            onMouseUp={handleVirtualDirUp}
            className="absolute left-0 w-8 h-8 bg-[#303844] border-2 border-[#505868] active:bg-[#485060] text-white font-bold flex items-center justify-center text-xs"
          >
            ◀
          </button>
          <button
            onClick={() => tryStartMove('right')}
            onTouchStart={() => handleVirtualDirDown('right')}
            onTouchEnd={handleVirtualDirUp}
            onMouseDown={() => handleVirtualDirDown('right')}
            onMouseUp={handleVirtualDirUp}
            className="absolute right-0 w-8 h-8 bg-[#303844] border-2 border-[#505868] active:bg-[#485060] text-white font-bold flex items-center justify-center text-xs"
          >
            ▶
          </button>
          <div className="w-7 h-7 bg-[#283038] border border-[#485060]" />
        </div>

        {/* Center Hardware Guide */}
        <div className="hidden sm:flex flex-col items-center text-[11px] text-[#b0b8c8] gap-0.5">
          <div>방향키 / WASD : 이동 (Shift: 러닝슈즈 달리기)</div>
          <div>Z / Space : 대화·표지판 조사 | X / Esc : 메뉴</div>
        </div>

        {/* DS B / A Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (activeDialog) advanceDialog();
              else {
                onUpdatePlayerState({
                  x: playerRef.current.x,
                  y: playerRef.current.y,
                  direction: playerRef.current.dir,
                });
                onOpenMenu();
              }
            }}
            className="w-11 h-11 bg-[#b83028] active:bg-[#d04038] border-2 border-[#f08070] text-white font-bold flex flex-col items-center justify-center text-xs shadow"
          >
            <span>B</span>
            <span className="text-[8px] font-normal">취소</span>
          </button>

          <button
            onClick={handleInteract}
            className="w-11 h-11 bg-[#2878b8] active:bg-[#3890d8] border-2 border-[#88c8f8] text-white font-bold flex flex-col items-center justify-center text-xs shadow"
          >
            <span>A</span>
            <span className="text-[8px] font-normal">결정</span>
          </button>
        </div>
      </div>
    </div>
  );
};
