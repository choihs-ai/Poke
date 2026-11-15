/**
 * Authentic Pokémon Gen 4 (Diamond / Pearl / Platinum) Nintendo DS Pixel Art Engine
 * Reproduces exact DS visual characteristics from reference screenshots:
 * 1. Seamless overlapping forest tree canopies (trunks only visible on frontmost row)
 * 2. Full-tile spiky crown tall grass bushes (1 crown bush per 32x32 tile)
 * 3. Corner-rounded autotiled paths (lime-green trodden grass path & town brick road)
 * 4. White wooden picket fences & molded 3D brown rock cliffs
 * 5. Multi-tile 3D-projected buildings (Houses, PokéCenter, PokéMart, Rowan Lab, Gym)
 * 6. High-density 24x30 pixel-art DS chibi characters (Lucas, Dawn, Barry, Rowan, NPCs)
 */

const spriteCache: Record<string, HTMLCanvasElement> = {};
const dataUrlCache: Record<string, string> = {};

function createPixelCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

function drawPixelMatrix(
  ctx: CanvasRenderingContext2D,
  matrix: string[],
  palette: Record<string, string>,
  offsetX = 0,
  offsetY = 0,
  scale = 1
) {
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
      }
    }
  }
}

export interface TileNeighbors {
  up: number;
  down: number;
  left: number;
  right: number;
  x?: number;
  y?: number;
  isCity?: boolean;
  isCave?: boolean;
  upLeft?: number;
  upRight?: number;
  downLeft?: number;
  downRight?: number;
}

/**
 * Draws the base DS mint-emerald grass (#58d868) with subtle natural 1px micro-tones
 * (Matching IMG_1323 & IMG_1325 — zero artificial scanline stripes or boxy dots)
 */
// --- Shared overworld palette (one palette for every outdoor tile so nothing clashes) ---
export const GRASS_BASE = '#78c858';
const GRASS = {
  base: GRASS_BASE,
  light: '#90d870',
  dark: '#60b048',
  edge: '#4c9840',
};
const DIRT = {
  base: '#e8d098',
  light: '#f4e0b0',
  shade: '#d4b878',
  dark: '#b89858',
};

/** Deterministic 0..1 hash from world coordinates (stable variation, no flicker). */
function hash2(x: number, y: number, seed = 0): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * Lawn: one calm base green plus small hand-placed grass tufts whose
 * positions come from the tile's world coordinates, so no two tiles repeat.
 */
function fillBaseDsGrass(ctx: CanvasRenderingContext2D, wx = 0, wy = 0) {
  px(ctx, GRASS.base, 0, 0, 32, 32);
  const tufts = 3 + Math.floor(hash2(wx, wy, 1) * 3);
  for (let i = 0; i < tufts; i++) {
    const tx = 2 + Math.floor(hash2(wx, wy, 10 + i) * 26);
    const ty = 2 + Math.floor(hash2(wx, wy, 20 + i) * 26);
    // small "v" tuft: two dark blades with a sunlit tip
    px(ctx, GRASS.dark, tx, ty + 1);
    px(ctx, GRASS.dark, tx + 2, ty + 1);
    px(ctx, GRASS.dark, tx + 1, ty + 2);
    px(ctx, GRASS.light, tx, ty);
    px(ctx, GRASS.light, tx + 2, ty);
  }
  // a few single light specks
  for (let i = 0; i < 4; i++) {
    const sx = Math.floor(hash2(wx, wy, 40 + i) * 32);
    const sy = Math.floor(hash2(wx, wy, 50 + i) * 32);
    px(ctx, GRASS.light, sx, sy);
  }
}

/**
 * Natural dirt route path, drawn pixel-by-pixel:
 * - soft, slightly ragged grass borders that line up across tiles
 * - rounded outer corners and filled inner corners
 * - a dark rim under the grass lip and pebbles inside
 */
function drawDirtPath(ctx: CanvasRenderingContext2D, nb: TileNeighbors, stone = false) {
  const isPath = (t?: number) => t === 1 || t === 7;
  const nU = isPath(nb.up), nD = isPath(nb.down), nL = isPath(nb.left), nR = isPath(nb.right);
  const wx = nb.x ?? 0, wy = nb.y ?? 0;
  const R = stone ? 4 : 6; // corner radius
  const BASE_W = 2;

  // ragged border width along an edge, seamless because it uses world pixel coordinates
  const jag = (along: number, seed: number) =>
    stone ? BASE_W : BASE_W + (hash2(Math.floor(along / 2), seed, 7) < 0.35 ? 1 : 0);
  const P = stone
    ? { base: '#d8d2c4', light: '#ece6da', shade: '#c4bcac', dark: '#9c9484' }
    : DIRT;

  const isDirt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x > 31 || y > 31) return false;
    const gxw = wx * 32 + x, gyw = wy * 32 + y;
    const wL = nL ? -99 : jag(gyw, wx * 2 + 1);
    const wR = nR ? -99 : jag(gyw, wx * 2 + 2);
    const wU = nU ? -99 : jag(gxw, wy * 2 + 3);
    const wD = nD ? -99 : jag(gxw, wy * 2 + 4);
    if (x < wL || 31 - x < wR || y < wU || 31 - y < wD) return false;
    // rounded outer corners
    const corner = (cx: number, cy: number) => (x - cx) ** 2 + (y - cy) ** 2 > R * R;
    if (!nU && !nL && x < BASE_W + R && y < BASE_W + R && corner(BASE_W + R, BASE_W + R)) return false;
    if (!nU && !nR && x > 31 - BASE_W - R && y < BASE_W + R && corner(31 - BASE_W - R, BASE_W + R)) return false;
    if (!nD && !nL && x < BASE_W + R && y > 31 - BASE_W - R && corner(BASE_W + R, 31 - BASE_W - R)) return false;
    if (!nD && !nR && x > 31 - BASE_W - R && y > 31 - BASE_W - R && corner(31 - BASE_W - R, 31 - BASE_W - R)) return false;
    // inner corners (path continues both ways but the diagonal is grass)
    const r2 = stone ? 0 : 3;
    if (nU && nL && nb.upLeft !== undefined && !isPath(nb.upLeft) && x * x + y * y < r2 * r2 + 2) return false;
    if (nU && nR && nb.upRight !== undefined && !isPath(nb.upRight) && (31 - x) ** 2 + y * y < r2 * r2 + 2) return false;
    if (nD && nL && nb.downLeft !== undefined && !isPath(nb.downLeft) && x * x + (31 - y) ** 2 < r2 * r2 + 2) return false;
    if (nD && nR && nb.downRight !== undefined && !isPath(nb.downRight) && (31 - x) ** 2 + (31 - y) ** 2 < r2 * r2 + 2) return false;
    return true;
  };

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const d = isDirt(x, y);
      if (!d) {
        // grass pixel touching dirt gets a darker edge so the border reads clearly
        const touches =
          isDirt(x + 1, y) || isDirt(x - 1, y) || isDirt(x, y + 1) || isDirt(x, y - 1);
        if (touches) px(ctx, GRASS.edge, x, y);
        continue;
      }
      const grassAbove = !isDirt(x, y - 1) && !(y === 0 && nU);
      const grassAbove2 = !isDirt(x, y - 2) && !(y <= 1 && nU);
      const grassLeft = !isDirt(x - 1, y) && !(x === 0 && nL);
      const grassBelow = !isDirt(x, y + 1) && !(y === 31 && nD);
      let c = P.base;
      if (grassAbove) c = P.dark;
      else if (grassAbove2 || grassLeft) c = P.shade;
      else if (grassBelow) c = P.light;
      else if (stone) {
        // staggered paving stones on a world-aligned grid
        const gxw = wx * 32 + x, gyw = wy * 32 + y;
        const row = Math.floor(gyw / 6);
        if (gyw % 6 === 0 || (gxw + (row % 2) * 5) % 10 === 0) c = P.shade;
        else if (gyw % 6 === 1) c = P.light;
      } else {
        const h = hash2(wx * 32 + x, wy * 32 + y, 99);
        if (h < 0.035) c = DIRT.shade;
        else if (h < 0.06) c = DIRT.light;
      }
      px(ctx, c, x, y);
    }
  }
  // occasional pebble
  if (!stone && hash2(wx, wy, 5) < 0.45) {
    const bx = 8 + Math.floor(hash2(wx, wy, 6) * 14);
    const by = 8 + Math.floor(hash2(wx, wy, 7) * 14);
    if (isDirt(bx, by) && isDirt(bx + 2, by + 1)) {
      px(ctx, DIRT.dark, bx, by + 1, 3, 1);
      px(ctx, '#f8ecc8', bx, by, 2, 1);
    }
  }
}


const ROCK_OUTDOOR = {
  out: '#3a2818',
  top: { dark: '#8a6a48', mid: '#b08c64', light: '#c8a87c', hi: '#e0c498' },
  face: { dark: '#5c402a', mid: '#7c5a3c', light: '#9a7650' },
};
const ROCK_CAVE = {
  out: '#22180e',
  top: { dark: '#5a4634', mid: '#76604a', light: '#8c765c', hi: '#a48c70' },
  face: { dark: '#3a2a1e', mid: '#4e3a2a', light: '#664c38' },
};
const CAVE_FLOOR = { base: '#a88c68', dark: '#907452', light: '#bca07a' };

function fillCaveFloor(ctx: CanvasRenderingContext2D, wx: number, wy: number) {
  px(ctx, CAVE_FLOOR.base, 0, 0, 32, 32);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(hash2(wx, wy, 80 + i) * 30);
    const y = Math.floor(hash2(wx, wy, 90 + i) * 30);
    px(ctx, CAVE_FLOOR.dark, x, y + 1, 2, 1);
    px(ctx, CAVE_FLOOR.light, x, y, 2, 1);
  }
}

/**
 * Rock / cliff autotile: rocky plateau on top, a vertical cliff face with
 * cracks where the tile below is open ground, rounded outer corners.
 */
function drawRock(ctx: CanvasRenderingContext2D, nb: TileNeighbors) {
  const pal = nb.isCave ? ROCK_CAVE : ROCK_OUTDOOR;
  const isRock = (t?: number) => t === 8 || t === 7;
  const nU = isRock(nb.up), nD = nb.down === 8 || (nb.down === 7 && !nb.isCave), nL = isRock(nb.left), nR = isRock(nb.right);
  const wx = nb.x ?? 0, wy = nb.y ?? 0;
  const FACE = nD ? 0 : 13;
  const topBottom = 31 - FACE;
  const inside = (x: number, y: number) => {
    const r = 3;
    if (!nU && !nL && x < r && y < r && (r - x) ** 2 + (r - y) ** 2 > r * r) return false;
    if (!nU && !nR && x > 31 - r && y < r && (x - 31 + r) ** 2 + (r - y) ** 2 > r * r) return false;
    if (!nD && !nL && x < r && y > 31 - r && (r - x) ** 2 + (y - 31 + r) ** 2 > r * r) return false;
    if (!nD && !nR && x > 31 - r && y > 31 - r && (x - 31 + r) ** 2 + (y - 31 + r) ** 2 > r * r) return false;
    return true;
  };
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (!inside(x, y)) continue;
      const edgeL = !nL && x === 0, edgeR = !nR && x === 31, edgeU = !nU && y === 0, edgeD = !nD && y === 31;
      if (edgeL || edgeR || edgeU || edgeD || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1)) {
        px(ctx, pal.out, x, y);
        continue;
      }
      const gx = wx * 32 + x, gy = wy * 32 + y;
      let c: string;
      if (y <= topBottom) {
        // plateau
        c = pal.top.mid;
        if (!nU && y === 1) c = pal.top.hi;
        else if (!nL && x === 1) c = pal.top.light;
        else if (!nR && x >= 29) c = pal.top.dark;
        else if (FACE && y === topBottom) c = pal.out; // lip line
        else if (FACE && y === topBottom - 1) c = pal.top.hi;
        else {
          // organic boulders: jittered-cell (Voronoi) pattern in world space
          let d1 = 1e9, d2 = 1e9, ccy = 0;
          const bx = Math.floor(gx / 10), by = Math.floor(gy / 9);
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const qx = (bx + i) * 10 + hash2(bx + i, by + j, 11) * 8;
              const qy = (by + j) * 9 + hash2(bx + i, by + j, 12) * 7;
              const d = Math.hypot(gx - qx, gy - qy);
              if (d < d1) { d2 = d1; d1 = d; ccy = qy; } else if (d < d2) d2 = d;
            }
          }
          if (d2 - d1 < 1.1) c = pal.top.dark;
          else if (gy - ccy < -1.5 && d2 - d1 > 2.2) c = pal.top.light;
          else if (gy - ccy > 2.5 && d2 - d1 < 2.4) c = pal.top.dark;
        }
      } else {
        // cliff face
        const fy = y - topBottom;
        c = pal.face.mid;
        if (fy <= 2) c = pal.face.light;
        if (!nL && x <= 2) c = pal.face.light;
        if (!nR && x >= 29) c = pal.face.dark;
        const crackX = (gx + Math.floor(gy / 5) * 3) % 7;
        if (crackX === 0 && hash2(gx, Math.floor(gy / 4), 13) < 0.7 && fy > 2) c = pal.face.dark;
        if (fy >= FACE - 2) c = pal.face.dark;
      }
      px(ctx, c, x, y);
    }
  }
}

function drawWater(ctx: CanvasRenderingContext2D, nb: TileNeighbors | undefined, frame: number) {
  const isW = (t?: number) => t === 3;
  const nU = nb ? isW(nb.up) : true, nD = nb ? isW(nb.down) : true;
  const nL = nb ? isW(nb.left) : true, nR = nb ? isW(nb.right) : true;
  const wx = nb?.x ?? 0, wy = nb?.y ?? 0;
  const m = 2, r = 4;
  const inW = (x: number, y: number) => {
    if (x < 0) return nL;
    if (x > 31) return nR;
    if (y < 0) return nU;
    if (y > 31) return nD;
    if ((!nL && x < m) || (!nR && x > 31 - m) || (!nU && y < m) || (!nD && y > 31 - m)) return false;
    const c = (cx: number, cy: number) => (x - cx) ** 2 + (y - cy) ** 2 > r * r;
    if (!nU && !nL && x < m + r && y < m + r && c(m + r, m + r)) return false;
    if (!nU && !nR && x > 31 - m - r && y < m + r && c(31 - m - r, m + r)) return false;
    if (!nD && !nL && x < m + r && y > 31 - m - r && c(m + r, 31 - m - r)) return false;
    if (!nD && !nR && x > 31 - m - r && y > 31 - m - r && c(31 - m - r, 31 - m - r)) return false;
    return true;
  };
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (!inW(x, y)) {
        if (inW(x + 1, y) || inW(x - 1, y) || inW(x, y + 1) || inW(x, y - 1)) px(ctx, GRASS.edge, x, y);
        continue;
      }
      let c = '#4888d8';
      if (!inW(x, y - 1) || !inW(x, y - 2)) c = '#2c64b0'; // bank shadow at the top
      else if (!inW(x, y + 1) || !inW(x - 1, y) || !inW(x + 1, y)) c = '#a8d8f8'; // foam
      else {
        const gx = wx * 32 + x, gy = wy * 32 + y;
        if (Math.floor(gy / 4) % 3 === 0 && hash2(Math.floor(gx / 6), Math.floor(gy / 4), 21) < 0.4) c = '#3c78c8';
        const rx = (gx + frame * 3) % 24, ry = gy % 10;
        if (ry === 4 && rx < 4 && hash2(Math.floor(gx / 24), Math.floor(gy / 10), 22) < 0.7) c = '#a8d8f8';
        if (ry === 5 && rx > 0 && rx < 3 && hash2(Math.floor(gx / 24), Math.floor(gy / 10), 22) < 0.7) c = '#78b8f0';
      }
      px(ctx, c, x, y);
    }
  }
}

function drawCaveEntrance(ctx: CanvasRenderingContext2D, nb: TileNeighbors) {
  drawRock(ctx, { ...nb, left: 8, right: 8, down: 1 });
  const arch = [
    '.......kkkkkkkkkk.......',
    '.....kkKKKKKKKKKKkk.....',
    '...kkKKKKKKKKKKKKKKkk...',
    '..kKKKKKKKKKKKKKKKKKKk..',
    '.kKKKKKKKKKKKKKKKKKKKKk.',
    '.kKKKKKKKKKKKKKKKKKKKKk.',
    'kKKKKKKKKKKKKKKKKKKKKKKk',
  ];
  drawPixelMatrix(ctx, arch, { k: '#22180e', K: '#140c08' }, 4, 12);
  px(ctx, '#140c08', 5, 19, 22, 13);
  px(ctx, '#22180e', 4, 19, 1, 13);
  px(ctx, '#22180e', 27, 19, 1, 13);
}

/**
 * Dense tall grass: staggered blade clumps on an 8px grid so neighbouring
 * tall-grass tiles join into one continuous patch.
 */
function drawTallGrass(ctx: CanvasRenderingContext2D, nb: TileNeighbors | undefined, frame: number) {
  const wx = nb?.x ?? 0, wy = nb?.y ?? 0;
  const upOpen = nb ? nb.up !== 2 : false;
  const downOpen = nb ? nb.down !== 2 : false;
  const top = upOpen ? 3 : 0;
  px(ctx, '#2f7a34', 0, top, 32, 32 - top);

  const clump = [
    '.......kk.......',
    '..kk..kHLk..kk..',
    '.kHLk.kLLk.kHLk.',
    '.kLLk.kLGk.kLLk.',
    'kLLGkkLLGGkkLLGk',
    'kLGGGkLGGGkLGGGk',
    'kGGGGGGGGDGGGGDk',
    'kGGDGGGGDDGGGDDk',
    '.kGDDGGDDDDGDDk.',
    '.kDDDDDDDDDDDDk.',
    '..kDDDDDDDDDDk..',
    '...kkkkkkkkkk...',
  ];
  const pal: Record<string, string> = {
    k: '#24602a',
    D: '#2f7a34',
    G: '#3f9a3c',
    L: '#66c050',
    H: '#a8e078',
  };
  for (let row = -2; row < 4; row++) {
    const oy = row * 8 + top;
    const stagger = (row & 1) * 8;
    for (let col = -1; col < 3; col++) {
      const ox = col * 16 + stagger;
      const h = hash2(wx * 2 + col, wy * 4 + row, 3);
      const sway = frame && h < 0.5 ? 1 : 0;
      drawPixelMatrix(ctx, clump, pal, ox + sway, oy);
    }
  }
  if (upOpen) {
    // let blade tips poke over the lawn edge
    px(ctx, GRASS.base, 0, 0, 32, top);
    for (let x = 1; x < 32; x += 4) {
      const o = ((x >> 2) + wx) & 1 ? 1 : 0;
      px(ctx, '#24602a', x + o, top - 2, 1, 2);
      px(ctx, '#66c050', x + o, top - 3);
    }
  }
  if (downOpen) {
    px(ctx, '#24602a', 0, 30, 32, 1);
    px(ctx, 'rgba(16,48,16,0.35)', 0, 31, 32, 1);
  }
}

/**
 * Generates a 32x32px tile canvas with neighbor-aware autotiling
 */
export function getTileCanvas(
  tileType: number,
  animFrame = 0,
  neighbors?: TileNeighbors
): HTMLCanvasElement {
  const frame = animFrame % 2;
  const wx = neighbors?.x ?? 0;
  const wy = neighbors?.y ?? 0;
  const isCity = neighbors?.isCity ? 1 : 0;
  const nbKey = neighbors
    ? `${neighbors.up}_${neighbors.down}_${neighbors.left}_${neighbors.right}_${neighbors.upLeft}_${neighbors.upRight}_${neighbors.downLeft}_${neighbors.downRight}_${wx}_${wy}_${isCity}_${neighbors.isCave ? 1 : 0}`
    : 'none';
  // Animated frames only matter for tall grass / flowers / water
  const animKey = tileType === 2 || tileType === 3 || tileType === 5 ? frame : 0;
  const key = `ds_tile_v6_${tileType}_${animKey}_${nbKey}`;
  if (spriteCache[key]) return spriteCache[key];

  const [canvas, ctx] = createPixelCanvas(32, 32);

  // Base DS Mint-Emerald Lawn
  if (neighbors?.isCave) fillCaveFloor(ctx, wx, wy);
  else fillBaseDsGrass(ctx, wx, wy);

  if (tileType === 1) {
    // 1: Walkable Path — Autotiled with smooth DS interior and rounded corners!
    const isPathLike = (t: number) => t === 1 || t === 7;
    const nUp = neighbors ? isPathLike(neighbors.up) : true;
    const nDown = neighbors ? isPathLike(neighbors.down) : true;
    const nLeft = neighbors ? isPathLike(neighbors.left) : true;
    const nRight = neighbors ? isPathLike(neighbors.right) : true;

    const padT = nUp ? 0 : 2;
    const padB = nDown ? 0 : 2;
    const padL = nLeft ? 0 : 2;
    const padR = nRight ? 0 : 2;
    const pw = 32 - padL - padR;
    const ph = 32 - padT - padB;

    if (neighbors?.isCity) {
      drawDirtPath(ctx, neighbors, true);
    } else if (!neighbors?.isCave) {
      drawDirtPath(ctx, neighbors ?? { up: 1, down: 1, left: 1, right: 1 });
    }
  } else if (tileType === 2) {
    // 2: Wild Tall Grass — dense, continuous patch
    drawTallGrass(ctx, neighbors, frame);
  } else if (tileType === 3) {
    // 3: Pond / lake water with banks, foam and drifting ripples
    drawWater(ctx, neighbors, frame);
  } else if (tileType === 5) {
    // 5: Wildflowers — 4-petal blossoms, colour & layout vary per tile, gentle sway
    const flower = ['..p..', '.ppp.', 'ppcps', '.pss.', '..s..'];
    const colors = [
      { p: '#f8f8f8', s: '#c8c8d8', c: '#f0c030' },
      { p: '#f86878', s: '#c84058', c: '#f8e070' },
      { p: '#f8d838', s: '#d09820', c: '#f87830' },
    ];
    const spots = [
      [3, 4], [18, 3], [10, 14], [24, 15], [4, 23], [18, 24],
    ];
    spots.forEach(([fx, fy], i) => {
      if (hash2(wx, wy, 60 + i) < 0.25) return;
      const col = colors[Math.floor(hash2(wx, wy, 70 + i) * colors.length)];
      const sway = frame && i % 2 ? 1 : 0;
      px(ctx, GRASS.edge, fx + 2, fy + 5, 1, 2); // stem
      px(ctx, GRASS.dark, fx + 3, fy + 5); // leaf
      drawPixelMatrix(ctx, flower, col, fx + sway, fy);
    });
  } else if (tileType === 7) {
    // 7: Building entrance threshold, or a cave mouth when set into a rock wall
    if (neighbors && neighbors.up === 8) drawCaveEntrance(ctx, neighbors);
    else if (!neighbors?.isCave) drawDirtPath(ctx, neighbors ?? { up: 1, down: 1, left: 1, right: 1 }, !!neighbors?.isCity);
  } else if (tileType === 8) {
    // 8: Rock / cliff autotile
    drawRock(ctx, neighbors ?? { up: 8, down: 8, left: 8, right: 8 });
  } else if (tileType === 12) {
    // 12: Authentic DS 3D White Wooden Picket Fence (Exact match to IMG_1322 & IMG_1325!)
    // Soft ground shadow
    ctx.fillStyle = 'rgba(16, 40, 20, 0.25)';
    ctx.fillRect(0, 26, 32, 4);

    // Continuous horizontal rails (soft grey-blue outline + white-lavender rail)
    ctx.fillStyle = '#707888';
    ctx.fillRect(0, 13, 32, 5);
    ctx.fillRect(0, 21, 32, 5);
    ctx.fillStyle = '#dce4f0';
    ctx.fillRect(0, 14, 32, 3);
    ctx.fillStyle = '#c0cad8';
    ctx.fillRect(0, 22, 32, 3);

    // 4 Sculpted White Picket Posts per tile with rounded tops & 3D shading
    for (let px = 1; px < 31; px += 8) {
      // Soft slate outer border
      ctx.fillStyle = '#687080';
      ctx.fillRect(px + 1, 7, 4, 1);
      ctx.fillRect(px, 8, 6, 19);
      // Bright white top cap & front face
      ctx.fillStyle = '#f8fcff';
      ctx.fillRect(px + 1, 8, 4, 2);
      ctx.fillStyle = '#e8eef8';
      ctx.fillRect(px + 1, 10, 3, 12);
      // Right-side & lower 3D periwinkle shadow
      ctx.fillStyle = '#b8c4d8';
      ctx.fillRect(px + 4, 10, 1, 16);
      ctx.fillRect(px + 1, 22, 3, 4);
    }
  }

  // cliffs cast a short shadow onto the ground tile below them
  if (neighbors && neighbors.up === 8 && tileType !== 8 && tileType !== 7) {
    px(ctx, 'rgba(20, 16, 8, 0.28)', 0, 0, 32, 3);
  }

  spriteCache[key] = canvas;
  return canvas;
}

function nBottomOrZero(nDown: boolean): number {
  return nDown ? 0 : 2;
}

/**
 * SEAMLESS OVERLAPPING 2.5D GEN 4 TREE SPRITE (48x56px, Exact Match to IMG_1323 & IMG_1325!)
 * - Drawn at (x * 32 - 8, y * 32 - 20, 48, 56) so adjacent trees overlap 16px horizontally and 24px vertically.
 * - When `hasTreeBelow = true`, the deep pine under-foliage fills the lower corners (y=26..52) so the tapered
 *   crown of the tree below sits 100% on top of dark forest foliage with ZERO grass gaps!
 * - Only when `hasTreeBelow = false` (frontmost tree row) is the braided root trunk drawn.
 */
export function getTreeCanopyCanvas(hasTreeBelow = false, variant = 0): HTMLCanvasElement {
  const v = ((variant % 3) + 3) % 3;
  const key = `ds_tree_v6_${hasTreeBelow ? 'mid' : 'front'}_${v}`;
  if (spriteCache[key]) return spriteCache[key];

  const [canvas, raw] = createPixelCanvas(48, 56);
  // Variant 1 is mirrored, variant 2 uses a deeper palette — breaks up the "stamped" forest look
  const flip = v === 1;
  const pal: Record<string, string> =
    v === 2
      ? { '#1e3214': '#1a2e16', '#36581c': '#30541e', '#284414': '#24401a', '#547c28': '#4a742a',
          '#2c4816': '#284418', '#78a434': '#6c9c36', '#446820': '#3e6222', '#94be42': '#86b444' }
      : {};
  const ctx = {
    set fillStyle(c: string) { raw.fillStyle = pal[c] ?? c; },
    fillRect(x: number, y: number, w: number, h: number) {
      raw.fillRect(flip ? 48 - x - w : x, y, w, h);
    },
  } as unknown as CanvasRenderingContext2D;

  if (hasTreeBelow) {
    // Deep forest under-canopy fill so the tapered crown of the lower tree (y+1) NEVER exposes green lawn at the sides!
    ctx.fillStyle = '#1e3214';
    ctx.fillRect(4, 24, 40, 28);
    ctx.fillStyle = '#284414';
    ctx.fillRect(6, 24, 36, 26);
    ctx.fillStyle = '#36581c';
    ctx.fillRect(8, 22, 32, 22);
  } else {
    // 1. Dark Ground Shadow Oval (Only on frontmost tree in a column!)
    ctx.fillStyle = 'rgba(16, 40, 20, 0.42)';
    ctx.fillRect(8, 46, 32, 6);
    ctx.fillRect(6, 48, 36, 3);

    // 2. Braided Root Trunk at Base (Matching IMG_1323 front tree trunks!)
    ctx.fillStyle = '#24180c';
    ctx.fillRect(15, 38, 18, 13);
    ctx.fillRect(12, 46, 24, 5);

    ctx.fillStyle = '#684c2c';
    ctx.fillRect(17, 39, 14, 11);
    ctx.fillRect(14, 47, 20, 3);

    ctx.fillStyle = '#8c6c40';
    ctx.fillRect(18, 40, 4, 9);
    ctx.fillRect(25, 40, 4, 9);

    ctx.fillStyle = '#442e18';
    ctx.fillRect(22, 40, 3, 10);
  }

  // 3. Plump 48px-wide DS Conifer Dome (Overlaps 8px left and 8px right of every 32px tile!)
  // Outer dark-forest outline (#1e3214)
  ctx.fillStyle = '#1e3214';
  ctx.fillRect(16, 2, 16, 2);
  ctx.fillRect(12, 4, 24, 3);
  ctx.fillRect(8, 7, 32, 3);
  ctx.fillRect(5, 10, 38, 4);
  ctx.fillRect(3, 14, 42, 6);
  ctx.fillRect(1, 20, 46, 15);
  // Scalloped 3-lobe lower outline
  ctx.fillRect(3, 35, 12, 5);
  ctx.fillRect(16, 36, 16, 6);
  ctx.fillRect(33, 35, 12, 5);

  // Bottom Tier Foliage: Deep pine green (#36581c)
  ctx.fillStyle = '#36581c';
  ctx.fillRect(3, 21, 42, 14);
  ctx.fillRect(5, 35, 9, 3);
  ctx.fillRect(17, 35, 14, 5);
  ctx.fillRect(34, 35, 9, 3);

  // Pixel leaf texture clusters in bottom tier
  ctx.fillStyle = '#284414';
  ctx.fillRect(7, 31, 3, 2);
  ctx.fillRect(15, 33, 3, 2);
  ctx.fillRect(30, 33, 3, 2);
  ctx.fillRect(38, 31, 3, 2);

  // Middle Tier Foliage: Rich olive green (#547c28) with 3 rounded scalloped lobes
  ctx.fillStyle = '#547c28';
  ctx.fillRect(7, 11, 34, 4);
  ctx.fillRect(5, 15, 38, 11);
  ctx.fillRect(6, 26, 10, 4);
  ctx.fillRect(17, 26, 14, 5);
  ctx.fillRect(32, 26, 10, 4);

  // Dark leaf shadow scallops under middle tier
  ctx.fillStyle = '#2c4816';
  ctx.fillRect(7, 30, 8, 1);
  ctx.fillRect(18, 31, 12, 1);
  ctx.fillRect(33, 30, 8, 1);

  // Upper Crown Tier: Sunlit yellow-olive (#78a434)
  ctx.fillStyle = '#78a434';
  ctx.fillRect(16, 4, 16, 2);
  ctx.fillRect(12, 6, 24, 4);
  ctx.fillRect(9, 10, 30, 7);
  ctx.fillRect(10, 17, 8, 3);
  ctx.fillRect(19, 17, 10, 4);
  ctx.fillRect(30, 17, 8, 3);

  // Subtle leaf crease under upper crown
  ctx.fillStyle = '#446820';
  ctx.fillRect(11, 20, 6, 1);
  ctx.fillRect(20, 21, 8, 1);
  ctx.fillRect(31, 20, 6, 1);

  // Top Crown Highlight: Bright warm chartreuse (#94be42)
  ctx.fillStyle = '#94be42';
  ctx.fillRect(18, 4, 12, 2);
  ctx.fillRect(14, 6, 20, 4);
  ctx.fillRect(16, 10, 16, 3);
  ctx.fillRect(13, 11, 2, 2);
  ctx.fillRect(33, 11, 2, 2);
  ctx.fillRect(22, 13, 4, 2);

  // Leaf texture: small sunlit / shaded clusters, placed differently per variant
  for (let i = 0; i < 7; i++) {
    const lx = 8 + Math.floor(hash2(v, i, 31) * 30);
    const ly = 8 + Math.floor(hash2(v, i, 32) * 22);
    ctx.fillStyle = ly < 18 ? '#a8cc58' : '#6c9430';
    ctx.fillRect(lx, ly, 2, 1);
    ctx.fillStyle = ly < 18 ? '#78a434' : '#36581c';
    ctx.fillRect(lx + 1, ly + 1, 2, 1);
  }

  spriteCache[key] = canvas;
  return canvas;
}

// --- MULTI-TILE 3D-PROJECTED GEN 4 BUILDINGS (Matching IMG_1322, IMG_1323 & IMG_1326!) ---
export function getBuildingStructureCanvas(
  kind: 'house' | 'lab' | 'pokecenter' | 'mart' | 'gym',
  widthTiles: number,
  heightTiles: number
): HTMLCanvasElement {
  const w = widthTiles * 32;
  const h = heightTiles * 32 + 16;
  const key = `ds_bldg_v5_${kind}_${w}x${h}`;
  if (spriteCache[key]) return spriteCache[key];

  const [canvas, ctx] = createPixelCanvas(w, h);

  // Soft 2.5D ground drop shadow
  ctx.fillStyle = 'rgba(16, 40, 20, 0.32)';
  ctx.fillRect(2, h - 7, w - 2, 7);

  if (kind === 'pokecenter') {
    // Authentic Gen 4 PokéCenter (Matching IMG_1326.jpeg!)
    // Beveled octagonal silhouette
    ctx.fillStyle = '#241814';
    ctx.fillRect(6, 4, w - 12, h - 8);
    ctx.fillRect(2, 10, w - 4, h - 16);

    // Lower curved bay wall & grey-blue corner windows
    ctx.fillStyle = '#dce4ec';
    ctx.fillRect(4, h - 30, w - 8, 24);
    ctx.fillStyle = '#586878';
    ctx.fillRect(4, h - 28, 18, 20);
    ctx.fillRect(w - 22, h - 28, 18, 20);
    ctx.fillStyle = '#78b8e8';
    ctx.fillRect(6, h - 25, 12, 14);
    ctx.fillRect(w - 18, h - 25, 12, 14);
    ctx.fillStyle = '#b8e8ff';
    ctx.fillRect(8, h - 24, 4, 12);
    ctx.fillRect(w - 14, h - 24, 4, 12);

    // Vermilion-orange 3D pitched roof (#e05818 / #f07820)
    ctx.fillStyle = '#c84010';
    ctx.fillRect(4, 10, w - 8, h - 38);
    ctx.fillStyle = '#e86418';
    ctx.fillRect(6, 8, w - 12, h - 42);
    ctx.fillStyle = '#f88428';
    ctx.fillRect(10, 6, w - 20, 12);

    // Vertical roof panel seams
    ctx.fillStyle = '#b8380c';
    for (let x = 12; x < w - 10; x += 10) {
      ctx.fillRect(x, 8, 2, h - 42);
    }

    // White diagonal corner stripes on lower roof (Exact match to IMG_1326!)
    ctx.fillStyle = '#f8f8fc';
    ctx.fillRect(6, h - 34, w - 12, 3);
    ctx.fillRect(8, h - 38, 14, 3);
    ctx.fillRect(w - 22, h - 38, 14, 3);

    // Central raised cylindrical skylight vault on top of roof (IMG_1326!)
    const cx = Math.floor(w / 2);
    ctx.fillStyle = '#482010';
    ctx.fillRect(cx - 13, 2, 26, 26);
    ctx.fillStyle = '#d87018';
    ctx.fillRect(cx - 11, 4, 22, 22);
    ctx.fillStyle = '#f8a030';
    ctx.fillRect(cx - 7, 4, 14, 20);
    ctx.fillStyle = '#ffd068';
    ctx.fillRect(cx - 3, 4, 6, 18);

    // White half-Pokéball emblem above front door (IMG_1326!)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 9, h - 43, 18, 11);
    ctx.fillRect(cx - 7, h - 45, 14, 2);
    ctx.fillStyle = '#d84818';
    ctx.fillRect(cx - 6, h - 40, 12, 3);
    ctx.fillRect(cx - 3, h - 42, 6, 7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 2, h - 40, 4, 3);

    // Glowing cyan automatic entrance doors
    ctx.fillStyle = '#182838';
    ctx.fillRect(cx - 12, h - 28, 24, 24);
    ctx.fillStyle = '#48a8e8';
    ctx.fillRect(cx - 10, h - 26, 20, 22);
    ctx.fillStyle = '#a8e8ff';
    ctx.fillRect(cx - 8, h - 24, 7, 18);
    ctx.fillRect(cx + 1, h - 24, 7, 18);
  } else if (kind === 'mart') {
    // Authentic Gen 4 PokéMart
    ctx.fillStyle = '#182434';
    ctx.fillRect(4, 6, w - 8, h - 10);
    ctx.fillRect(2, 10, w - 4, h - 16);

    // Clean white-grey lower facade
    ctx.fillStyle = '#e8ecf0';
    ctx.fillRect(4, h - 30, w - 8, 24);
    ctx.fillStyle = '#98a4b0';
    ctx.fillRect(4, h - 10, w - 8, 4);

    // Stepped royal-blue 3D roof
    ctx.fillStyle = '#1c5098';
    ctx.fillRect(4, 8, w - 8, h - 36);
    ctx.fillStyle = '#3070c8';
    ctx.fillRect(6, 8, w - 12, h - 40);
    ctx.fillStyle = '#5098f0';
    ctx.fillRect(8, 8, w - 16, 10);

    // Roof seam ribs
    ctx.fillStyle = '#184480';
    for (let x = 12; x < w - 10; x += 10) {
      ctx.fillRect(x, 10, 2, h - 42);
    }

    // White roof trim band
    ctx.fillStyle = '#f8fcff';
    ctx.fillRect(4, h - 33, w - 8, 3);

    // Left display window
    ctx.fillStyle = '#284060';
    ctx.fillRect(8, h - 25, 24, 14);
    ctx.fillStyle = '#78c8f8';
    ctx.fillRect(10, h - 23, 20, 10);
    ctx.fillStyle = '#c8f0ff';
    ctx.fillRect(12, h - 22, 6, 8);

    // Entrance door & blue MART sign
    const cx = Math.floor(w / 2) + 6;
    ctx.fillStyle = '#183868';
    ctx.fillRect(cx - 11, h - 27, 22, 23);
    ctx.fillStyle = '#48a0e8';
    ctx.fillRect(cx - 9, h - 25, 18, 21);
    ctx.fillStyle = '#a8e8ff';
    ctx.fillRect(cx - 7, h - 23, 6, 17);

    // Blue & white MART sign plaque
    ctx.fillStyle = '#183868';
    ctx.fillRect(cx - 12, h - 39, 24, 11);
    ctx.fillStyle = '#f8fcff';
    ctx.fillRect(cx - 10, h - 37, 20, 7);
    ctx.fillStyle = '#2868c8';
    ctx.fillRect(cx - 8, h - 35, 16, 3);
  } else if (kind === 'house') {
    // Authentic Gen 4 Town House with Golden Shingled Roof & Timber-Framed Triangular Gable (Exact match to IMG_1322!)
    ctx.fillStyle = '#282018';
    ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.fillRect(2, 8, w - 4, h - 14);

    // Warm cream-stone lower wall & slate base
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(4, h - 30, w - 8, 24);
    ctx.fillStyle = '#b8b2a4';
    ctx.fillRect(4, h - 30, w - 8, 3);
    ctx.fillStyle = '#8c887c';
    ctx.fillRect(4, h - 10, w - 8, 4);

    // Golden-ochre 3D pitched roof (#f8d038 -> #e0a818 -> #b87c10)
    ctx.fillStyle = '#98640c';
    ctx.fillRect(3, 6, w - 6, h - 34);
    ctx.fillStyle = '#d89c18';
    ctx.fillRect(5, 6, w - 10, h - 36);
    ctx.fillStyle = '#f0bc28';
    ctx.fillRect(6, 7, w - 12, h - 40);
    ctx.fillStyle = '#ffe058';
    ctx.fillRect(8, 7, w - 16, 6);

    // Shingle tile texture ridges
    ctx.fillStyle = '#b87c10';
    for (let x = 10; x < w - 8; x += 8) {
      ctx.fillRect(x, 8, 2, h - 40);
    }
    for (let y = 14; y < h - 34; y += 6) {
      ctx.fillRect(5, y, w - 10, 1);
    }

    // Crisp white & brown eaves overhang
    ctx.fillStyle = '#583c20';
    ctx.fillRect(3, h - 33, w - 6, 4);
    ctx.fillStyle = '#f4f0e4';
    ctx.fillRect(4, h - 32, w - 8, 2);

    // Door position (centered on 3-tile house, or aligned to tile 2 on 4-tile house)
    const doorCenterX = widthTiles === 4 ? 2 * 32 + 16 : Math.floor(w / 2);

    // Triangular Timber-Framed Gable above the door (Exact match to IMG_1322 top-left house!)
    for (let step = 0; step < 14; step++) {
      const gw = 38 - step * 2;
      const gx = doorCenterX - Math.floor(gw / 2);
      const gy = h - 31 - step;
      ctx.fillStyle = '#483018';
      ctx.fillRect(gx - 3, gy, gw + 6, 2);
      ctx.fillStyle = '#785430';
      ctx.fillRect(gx - 1, gy, gw + 2, 2);
      ctx.fillStyle = '#f4f0e4';
      ctx.fillRect(gx + 1, gy + 1, gw - 2, 2);
    }
    // Timber cross-beams inside the triangular gable (IMG_1322!)
    ctx.fillStyle = '#684828';
    ctx.fillRect(doorCenterX - 2, h - 43, 4, 12);
    ctx.fillRect(doorCenterX - 11, h - 35, 22, 3);

    // Deep-set blue wooden entrance door
    ctx.fillStyle = '#1c3048';
    ctx.fillRect(doorCenterX - 10, h - 27, 20, 23);
    ctx.fillStyle = '#3870b0';
    ctx.fillRect(doorCenterX - 8, h - 25, 16, 21);
    ctx.fillStyle = '#285488';
    ctx.fillRect(doorCenterX - 6, h - 14, 12, 9);
    ctx.fillStyle = '#88c8ff';
    ctx.fillRect(doorCenterX - 6, h - 23, 12, 7);
    ctx.fillStyle = '#d8f0ff';
    ctx.fillRect(doorCenterX - 5, h - 22, 4, 5);

    // White-framed windows with blue glass & window boxes
    const winPositions = widthTiles === 4 ? [10, 38, w - 26] : [8, w - 26];
    for (const wx of winPositions) {
      if (Math.abs(wx + 9 - doorCenterX) < 18) continue;
      ctx.fillStyle = '#283850';
      ctx.fillRect(wx, h - 25, 18, 15);
      ctx.fillStyle = '#f8f8fc';
      ctx.fillRect(wx + 1, h - 24, 16, 13);
      ctx.fillStyle = '#5088c8';
      ctx.fillRect(wx + 3, h - 22, 12, 9);
      ctx.fillStyle = '#98d0ff';
      ctx.fillRect(wx + 4, h - 21, 4, 7);
      // Window sill
      ctx.fillStyle = '#c8c4b8';
      ctx.fillRect(wx, h - 11, 18, 2);
    }
  } else if (kind === 'lab') {
    // Authentic Gen 4 Prof. Rowan Research Lab (Matching IMG_1322 right & IMG_1323 right!)
    ctx.fillStyle = '#241c18';
    ctx.fillRect(2, 4, w - 4, h - 8);

    // Raised 3D terracotta-brown parapet frame around roof (Exact match to IMG_1323 right building!)
    ctx.fillStyle = '#785438';
    ctx.fillRect(4, 6, w - 8, h - 10);
    ctx.fillStyle = '#b48864';
    ctx.fillRect(6, 6, w - 12, h - 34);
    ctx.fillStyle = '#cfa480';
    ctx.fillRect(6, 6, w - 12, 4);
    ctx.fillRect(6, 6, 5, h - 34);
    ctx.fillRect(w - 11, 6, 5, h - 34);

    // Recessed corrugated slate-blue roof inside parapet (Exact match to IMG_1323 right!)
    ctx.fillStyle = '#485878';
    ctx.fillRect(12, 11, w - 24, h - 42);
    ctx.fillStyle = '#687ca0';
    for (let y = 13; y < h - 33; y += 5) {
      ctx.fillRect(14, y, w - 28, 3);
    }

    // Warm stone lower wall
    ctx.fillStyle = '#e4dcd0';
    ctx.fillRect(6, h - 30, w - 12, 24);
    ctx.fillStyle = '#989088';
    ctx.fillRect(6, h - 10, w - 12, 4);

    // Arched brown entrance awning on tile 2 (door at x=6 in sandgem_town, which is index 2 of 4..7)
    const doorCenterX = 2 * 32 + 16;
    ctx.fillStyle = '#482c18';
    ctx.fillRect(doorCenterX - 16, h - 42, 32, 14);
    ctx.fillStyle = '#986438';
    ctx.fillRect(doorCenterX - 14, h - 40, 28, 11);
    ctx.fillStyle = '#c48c58';
    ctx.fillRect(doorCenterX - 12, h - 39, 24, 5);
    // Emblem on awning
    ctx.fillStyle = '#f8f4e8';
    ctx.fillRect(doorCenterX - 4, h - 38, 8, 6);

    // Lab entrance glass doors
    ctx.fillStyle = '#203040';
    ctx.fillRect(doorCenterX - 11, h - 27, 22, 23);
    ctx.fillStyle = '#5098d8';
    ctx.fillRect(doorCenterX - 9, h - 25, 18, 21);
    ctx.fillStyle = '#a8e0ff';
    ctx.fillRect(doorCenterX - 7, h - 23, 6, 17);
    ctx.fillRect(doorCenterX + 1, h - 23, 6, 17);

    // Wide lab windows on left
    ctx.fillStyle = '#283848';
    ctx.fillRect(12, h - 25, 36, 14);
    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(13, h - 24, 34, 12);
    ctx.fillStyle = '#68b4e8';
    ctx.fillRect(15, h - 22, 14, 8);
    ctx.fillRect(31, h - 22, 14, 8);
  } else if (kind === 'gym') {
    // Oreburgh Pokémon Gym (Industrial Mine Steel & Stone Roof)
    ctx.fillStyle = '#181c20';
    ctx.fillRect(2, 4, w - 4, h - 8);
    ctx.fillStyle = '#384048';
    ctx.fillRect(4, 6, w - 8, h - 12);

    // Corrugated steel roof panels
    ctx.fillStyle = '#505864';
    ctx.fillRect(6, 8, w - 12, h - 36);
    ctx.fillStyle = '#687480';
    for (let x = 10; x < w - 10; x += 12) {
      ctx.fillRect(x, 10, 6, h - 40);
    }

    // Orange-gold steel girder beams
    ctx.fillStyle = '#d87018';
    ctx.fillRect(4, 6, w - 8, 5);
    ctx.fillRect(4, h - 32, w - 8, 4);

    // Gym crest badge in center
    const cx = Math.floor(w / 2);
    ctx.fillStyle = '#201810';
    ctx.fillRect(cx - 12, 14, 24, 16);
    ctx.fillStyle = '#f0a820';
    ctx.fillRect(cx - 10, 16, 20, 12);
    ctx.fillStyle = '#ffe878';
    ctx.fillRect(cx - 6, 18, 12, 8);

    // Automatic Gym Doors
    ctx.fillStyle = '#182430';
    ctx.fillRect(cx - 14, h - 27, 28, 23);
    ctx.fillStyle = '#50a8d8';
    ctx.fillRect(cx - 12, h - 25, 24, 21);
    ctx.fillStyle = '#a8e4ff';
    ctx.fillRect(cx - 10, h - 23, 9, 17);
    ctx.fillRect(cx + 1, h - 23, 9, 17);
  }

  spriteCache[key] = canvas;
  return canvas;
}

// --- WOODEN SIGNPOST SPRITE (Matching IMG_1322!) ---
export function getSignpostCanvas(): HTMLCanvasElement {
  const key = 'ds_signpost_v6';
  if (spriteCache[key]) return spriteCache[key];

  const [canvas, ctx] = createPixelCanvas(32, 32);
  const sign = [
    '..kkkkkkkkkkkkkkkkkkkk..',
    '.kHHHHHHHHHHHHHHHHHHHHk.',
    'kHWWWWWWWWWWWWWWWWWWWWSk',
    'kHWWddddddddddddWWWWWWSk',
    'kHWWWWWWWWWWWWWWWWWWWWSk',
    'kHWWddddddddddWWWWWWWWSk',
    'kHWWWWWWWWWWWWWWWWWWWWSk',
    'kHWWddddddddddddddWWWWSk',
    'kHWWWWWWWWWWWWWWWWWWWWSk',
    '.kSSSSSSSSSSSSSSSSSSSSk.',
    '..kkkkkkkkkkkkkkkkkkkk..',
    '.........kPPPk..........',
    '.........kPPSk..........',
    '.........kPPSk..........',
    '.........kPPSk..........',
    '.........kPPSk..........',
    '........kkkkkkk.........',
  ];
  ctx.fillStyle = 'rgba(16, 48, 16, 0.30)';
  ctx.fillRect(7, 26, 18, 3);
  ctx.fillRect(9, 25, 14, 5);
  drawPixelMatrix(
    ctx,
    sign,
    { k: '#4a2c14', H: '#e8b878', W: '#d09858', S: '#a06c38', d: '#7a4c24', P: '#b07840' },
    4,
    10
  );

  spriteCache[key] = canvas;
  return canvas;
}

// --- AUTHENTIC 32x32 NINTENDO DS GEN 4 CHARACTER SPRITE ENGINE ---
// Built directly on the exact 1:1 32x32 pixel matrices & 4bpp DS hardware palettes of
// Lucas (IMG_1329_bee0f8f5.png) and Barry (IMG_1330_e8997016.png), extended across all 12 Sinnoh characters!

interface DsCharacterRig {
  palette: Record<string, string>;
  down: string[]; // 32x32 front matrix (rows 0..31)
  up: string[];   // 32x32 back matrix (rows 0..31)
  left: string[]; // 32x32 left-profile matrix (rows 0..31); right is mirrored automatically
}

function mirrorMatrix32(mat: string[]): string[] {
  return mat.map((row) => row.split('').reverse().join(''));
}

/**
 * Generates authentic Gen 4 DS walking frames (step 1 = left foot forward, step 3 = right foot forward)
 * from the 32x32 standing matrix while preserving crisp 1:1 pixel outlines.
 */
function applyDsWalkStep(
  baseMat: string[],
  direction: 'down' | 'up' | 'left' | 'right',
  step: number
): string[] {
  if (step === 0 || step === 2) return baseMat;

  const rows = [...baseMat];
  // 1px vertical DS walking bounce on head & upper torso (rows 3..22 shift down by 1px)
  const bounced = new Array(32).fill('................................');
  for (let y = 4; y <= 22; y++) {
    bounced[y + 1] = rows[y];
  }

  if (direction === 'down' || direction === 'up') {
    // Arm swing + alternating foot stride on rows 23..27
    const r22 = rows[22];
    const r23 = rows[23];
    const r24 = rows[24];
    const r25 = rows[25];
    const r26 = rows[26];
    const r27 = rows[27];

    if (step === 1) {
      // Left hand raised 1px, right hand lowered 1px; left shoe steps down 1px, right shoe tucks up 1px
      bounced[23] = r23.slice(0, 16) + r22.slice(16);
      bounced[24] = r24;
      bounced[25] = r25.slice(0, 16) + r26.slice(16);
      bounced[26] = r26.slice(0, 16) + r27.slice(16);
      bounced[27] = r27.slice(0, 16) + '................';
    } else {
      // Right hand raised 1px, left hand lowered 1px; right shoe steps down 1px, left shoe tucks up 1px
      bounced[23] = r22.slice(0, 16) + r23.slice(16);
      bounced[24] = r24;
      bounced[25] = r26.slice(0, 16) + r25.slice(16);
      bounced[26] = r27.slice(0, 16) + r26.slice(16);
      bounced[27] = '................' + r27.slice(16);
    }
    return bounced;
  }

  // Side profile ('left' or 'right') stride: separate legs into front/back stride on rows 24..27
  bounced[23] = rows[23];
  bounced[24] = rows[24];
  const shoeRow = rows[25];
  const soleRow = rows[26];
  // Extract primary shoe color token from row 25
  let shoeCh = '0';
  let outlineCh = '3';
  for (let i = 0; i < shoeRow.length; i++) {
    const ch = shoeRow[i];
    if (ch !== '.' && ch !== '3' && ch !== '4' && ch !== '2') {
      shoeCh = ch;
      break;
    }
  }
  for (let i = 0; i < soleRow.length; i++) {
    if (soleRow[i] !== '.') {
      outlineCh = soleRow[i];
      break;
    }
  }
  const k = outlineCh;
  const S = shoeCh;
  if (step === 1) {
    bounced[25] = `.........${k}${S}${S}${k}..${k}${S}${S}${k}.............`;
    bounced[26] = `..........${k}${k}....${k}${k}..............`;
  } else {
    bounced[25] = `..........${k}${S}${S}${k}.${k}${S}${S}${k}.............`;
    bounced[26] = `...........${k}${k}...${k}${k}..............`;
  }
  return bounced;
}

// 1. LUCAS (광휘) — Exact 1:1 pixel matrix & 13-color palette from IMG_1329_bee0f8f5.png
const LUCAS_PALETTE: Record<string, string> = {
  '0': '#c03838', // Dark red cap outline / scarf / shoes
  '1': '#f06848', // Bright red cap crown / scarf highlight
  '2': '#784040', // Warm dark brown-red outline
  '3': '#000000', // Black outline / pupils / shoe soles
  '4': '#e8e8f8', // White emblem / eye sclera / sleeve
  '5': '#c8c8d8', // Light grey emblem shade / buckle
  '6': '#384040', // Dark charcoal hair & vest
  '7': '#a8a0c8', // Lavender-grey eye iris & vest trim
  '8': '#d8a078', // Shaded warm skin
  '9': '#f8d0b8', // Bright warm skin
  'A': '#c89838', // Golden-yellow backpack & straps
  'B': '#486060', // Slate-blue jeans shadow
  'C': '#6088d0', // Denim blue jeans
};

const LUCAS_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............0000000.............',
  '..........00111111100...........',
  '.........2111111111112..........',
  '........311111111111112.........',
  '.......31110000000001112........',
  '.......31401111111110413........',
  '.......35411111111111453........',
  '........651111111111156.........',
  '.......23700111111100732........',
  '.......38300011111000383........',
  '.......38262000000026283........',
  '........328676222676823.........',
  '.........3884388834883..........',
  '..........28999999982...........',
  '..........32899899823...........',
  '.........34A3288823A43..........',
  '........384A6010076A482.........',
  '.......29763611776636793........',
  '.......39933601666633993........',
  '........333B3365633B333.........',
  '..........32BCCCCCB23...........',
  '..........30033333003...........',
  '...........33.....33............',
  '................................',
  '................................',
  '................................',
  '................................',
];

const LUCAS_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............0000000.............',
  '..........00111111100...........',
  '.........2111111111112..........',
  '........311111111111112.........',
  '.......31111111111111112........',
  '.......31001111111110013........',
  '.......30000000000000003........',
  '........600000000000006.........',
  '.......23666000000066632........',
  '.......38366666666666383........',
  '.......38236666666663283........',
  '........326666666666623.........',
  '.........3666666666663..........',
  '..........33666666633...........',
  '..........34011111043...........',
  '.........34AAAAAAAAA43..........',
  '........384AAAAAAAAA482.........',
  '.......2973AAAAAAAAA3793........',
  '.......39933AAAAAAA33993........',
  '........333B3366633B333.........',
  '..........32BCCCCCB23...........',
  '..........30033333003...........',
  '...........33.....33............',
  '................................',
  '................................',
  '................................',
  '................................',
];

const LUCAS_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............0000000.............',
  '..........00111111100...........',
  '.........2111111111112..........',
  '........311111111111112.........',
  '.......31144111111111112........',
  '.......31445111111111003........',
  '......000550011111100063........',
  '.....300000000000000666.........',
  '......33388662200666663.........',
  '........388438866666663.........',
  '........388438889866663.........',
  '.........2899998986663..........',
  '.........328999983663...........',
  '..........3328882333............',
  '..........3601166AAA3...........',
  '.........36611448AAAA3..........',
  '.........36606489AAAA3..........',
  '.........33666399AAAA3..........',
  '..........33BCCCCB333...........',
  '...........3BCCCCB3.............',
  '...........30033003.............',
  '............33..33..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 2. BARRY / RIVAL (용식) — Exact 1:1 pixel matrix & 16-color palette from IMG_1330_e8997016.png
const BARRY_PALETTE: Record<string, string> = {
  '0': '#c2a86d', // Golden-tan hair shade
  '1': '#f7d475', // Bright blonde spiky hair
  '2': '#7e5d36', // Warm brown hair/jaw/bag outline
  '3': '#ffffff', // Pure white accent
  '4': '#000000', // Black outline / pupils / shoe soles
  '5': '#d4976d', // Shaded warm skin
  '6': '#e5eef7', // White shirt stripe & eye sclera
  '7': '#4d8665', // Dark emerald green eye iris & scarf shade
  '8': '#f7cbb1', // Bright warm skin
  '9': '#ee753d', // Vibrant orange shirt stripe
  'A': '#75cb7e', // Bright mint-green scarf
  'B': '#c2c2d4', // Light grey shirt shade
  'C': '#455d7e', // Dark slate-blue wristband & pants
  'D': '#b95d2e', // Russet-brown shoulder bag & shoes
  'E': '#9f97c2', // Lavender-grey buckle
  'F': '#2e3645', // Deep navy-charcoal pants shadow
};

const BARRY_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '.............000000.............',
  '........0..0011111100.0.........',
  '.......01201111111111010........',
  '......211011111111111110........',
  '......2111011111111111012.......',
  '......2111111111111111112.......',
  '.......21101101110110112........',
  '......2121211011101121112.......',
  '.......20112101110121102........',
  '.......40202510101520204........',
  '.......40225552525552204........',
  '........425567888765524.........',
  '.........4556488846554..........',
  '..........25888888852...........',
  '..........42588588524...........',
  '.........4694255524964..........',
  '........4569667A7B69652.........',
  '.......285C499AA2294C584........',
  '.......48844667AB2244884........',
  '........444C2DBEBD22244.........',
  '..........42FC222CF224..........',
  '..........4DD4...4D44...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const BARRY_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '.............000000.............',
  '........0..0011111100.0.........',
  '.......01201111111111010........',
  '......211011111111111110........',
  '......2111011111111111012.......',
  '......2111111111111111112.......',
  '.......21101111111110112........',
  '......2121111111111112112.......',
  '.......20111011111011102........',
  '.......40201101110110204........',
  '.......45220110001102254........',
  '........425001111100524.........',
  '.........4520000000254..........',
  '..........42200200224...........',
  '..........47AAAAAAA74...........',
  '.........4697AAAAA7964..........',
  '........4569997A7999652.........',
  '.......285C4666D6664C584........',
  '.......4884499DDD9944884........',
  '........444C2DDDDD22244.........',
  '..........42FCCCCCF224..........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const BARRY_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............000000..............',
  '.......0..0011111100............',
  '......01201111111111010.........',
  '......21111111111111110.........',
  '.......21111111111111012........',
  '......211101111111111112........',
  '.......2101111111110112.........',
  '......22121111111101212.........',
  '.......2255101111001102.........',
  '........455675501100204.........',
  '........45564855850024..........',
  '.........258888585024...........',
  '.........42588885424............',
  '..........442555244.............',
  '..........47AA99667A4...........',
  '.........47AA99665AA74..........',
  '.........449966588474...........',
  '..........49964884DD4...........',
  '..........44FCCCCFDD4...........',
  '...........4FCCCCF44............',
  '...........4DD44DD4.............',
  '............44..44..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 3. DAWN (빛나) — Built on the exact Lucas/Barry 32x32 rig with white beanie, blue twin locks & pink scarf
const DAWN_PALETTE: Record<string, string> = {
  '0': '#c8c8dc', // White beanie shade
  '1': '#f4f4ff', // White beanie crown
  '2': '#787890', // Beanie & jaw warm outline
  '3': '#000000', // Black outline / pupils / shoe soles
  '4': '#ffffff', // Pure white eye sclera
  '5': '#e85888', // Pink beanie emblem & skirt hem
  '6': '#243058', // Dark navy hair & tunic dress
  '7': '#485888', // Blue eye iris & hair highlight
  '8': '#d8a078', // Shaded warm skin
  '9': '#f8d0b8', // Bright warm skin
  'A': '#f0c038', // Yellow backpack/bag
  'B': '#383848', // Charcoal dress shade
  'C': '#f880a8', // Bright pink scarf & boots
};

const DAWN_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......30111155555111103........',
  '.......3011155CCC5511103........',
  '.......30011111111111003........',
  '........600000000000006.........',
  '.......36676622222667663........',
  '.......38666882828866683........',
  '.......3826684788874866283......',
  '........32668438883486623.......',
  '.........366289999982663........',
  '.........366328998923663........',
  '.........36A3C28882C3A63........',
  '........386A6CC5C5CC6A683.......',
  '.......2986366CCCCC6636893......',
  '.......3993366BBBBB6633993......',
  '........333B66BBBBB66B333.......',
  '..........325CCCCCCC523.........',
  '..........3CC33333CC3...........',
  '...........33.....33............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const DAWN_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......30111111111111103........',
  '.......30111111111111103........',
  '.......30001111111110003........',
  '........600000000000006.........',
  '.......36676666666667663........',
  '.......38666766666766683........',
  '........326666666666623.........',
  '.........3666666666663..........',
  '.........36636666663663.........',
  '.........366CCCCCCCC663.........',
  '.........38AAAAAAAAA83..........',
  '........3896AAAAAAA6983.........',
  '.......29936AAAAAAA63993........',
  '........333B66BBB66B333.........',
  '..........325CCCCC523...........',
  '..........3CC33333CC3...........',
  '...........33.....33............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const DAWN_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........205511111111102.........',
  '.......305CC511111111103........',
  '.......30155111111111003........',
  '.......30000000000000663........',
  '........3668866666676663........',
  '........3688478866676663........',
  '........368843889866663.........',
  '.........3628999898663..........',
  '.........3632899836663..........',
  '.........363328823663...........',
  '..........36CCC66AAA3...........',
  '.........366CC89AAAA3...........',
  '.........366B689AAAA3...........',
  '.........336BB399AAA3...........',
  '..........35CCCCCCC53...........',
  '...........35CCCCC53............',
  '...........3CC33CC3.............',
  '............33..33..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 4. PROF. ROWAN (마박사) — Built on the exact 32x32 Barry/Lucas rig with silver hair & white handlebar mustache
const ROWAN_PALETTE: Record<string, string> = {
  '0': '#b0bcc8', // Silver-grey hair shade
  '1': '#eef4fc', // Silver-white hair & mustache highlight
  '2': '#586474', // Slate hair/jaw outline
  '3': '#ffffff', // Pure white collar
  '4': '#000000', // Black outline / pupils / shoe soles
  '5': '#c89070', // Tanned skin shade
  '6': '#dce4ec', // Beige-white lab coat
  '7': '#486898', // Cerulean blue vest
  '8': '#f0bfa0', // Tanned skin highlight
  '9': '#304870', // Deep navy vest shade
  'A': '#8894a4', // Coat lapel shade
  'B': '#b8c4d0', // Coat lower shadow
  'C': '#684c38', // Brown trousers
  'D': '#483020', // Dark brown dress shoes
  'E': '#d8b040', // Gold vest button
  'F': '#382418', // Dark trousers shadow
};

const ROWAN_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '..........000.....000...........',
  '........001110000011100.........',
  '.......21111111111111112........',
  '......2111111111111111112.......',
  '......2111011111111101112.......',
  '.......21000111111100012........',
  '.......20022011111022002........',
  '.......40255520002555204........',
  '.......40211152525111204........',
  '.......45255648884655254........',
  '........425564888465524.........',
  '.........4511110111154..........',
  '.........4111028201114..........',
  '..........42258885224...........',
  '.........46A4255524A64..........',
  '........466A6379736A664.........',
  '.......28664667E76646682........',
  '.......48844667976644884........',
  '........444B669E966B444.........',
  '..........42B6CCC6B24...........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const ROWAN_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '..........000.....000...........',
  '........001110000011100.........',
  '.......21111111111111112........',
  '......2111111111111111112.......',
  '......2111111111111111112.......',
  '.......21110111111101112........',
  '.......20110011111001102........',
  '.......40011001110011004........',
  '.......45200000000000254........',
  '.......45220000000002254........',
  '........422000000000224.........',
  '.........4200000000024..........',
  '..........44200000244...........',
  '..........4AA66666AA4...........',
  '.........4666666666664..........',
  '........466666666666664.........',
  '.......286B466666664B682........',
  '.......48844666B66644884........',
  '........444B66BBB66B444.........',
  '..........42B6CCC6B24...........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const ROWAN_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '...........00000000.............',
  '.........001111111100...........',
  '........21111111111112..........',
  '.......2111111111111112.........',
  '.......2110011111111112.........',
  '........200211111111002.........',
  '.......4111550011110024.........',
  '.......4556485500000024.........',
  '.......455648858500024..........',
  '......411110885850024...........',
  '......41102588854224............',
  '.......44..4255244..............',
  '..........4796666A4.............',
  '.........479665866A4............',
  '.........479668866B4............',
  '.........449638866B4............',
  '..........4B66666B4.............',
  '..........44FCCCCF4.............',
  '...........4FCCCCF4.............',
  '...........4DD44DD4.............',
  '............44..44..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 5. MOM (엄마) — Built on the exact 32x32 rig with chestnut bun hair, coral blouse & white apron
const MOM_PALETTE: Record<string, string> = {
  '0': '#a86030', // Chestnut hair mid
  '1': '#d88850', // Warm auburn hair highlight
  '2': '#683818', // Dark brown hair/jaw outline
  '3': '#ffffff', // Pure white apron & sclera
  '4': '#000000', // Black outline / pupils / soles
  '5': '#d4976d', // Shaded warm skin
  '6': '#e5eef7', // Apron shade / eye sclera
  '7': '#785030', // Warm brown eye iris
  '8': '#f7cbb1', // Bright warm skin
  '9': '#e86078', // Coral-pink blouse
  'A': '#f890a4', // Light coral collar
  'B': '#c2c8d8', // Apron fold shadow
  'C': '#584058', // Plum skirt
  'D': '#b83850', // Rose-red slippers
  'F': '#3c283c', // Dark skirt shadow
};

const MOM_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............2011102.............',
  '...........201111102............',
  '.........2001111111002..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20110011111001102........',
  '.......20102201110220102........',
  '.......40025552025552004........',
  '.......40025555255552004........',
  '........40255678887655204.......',
  '........40255648884655204.......',
  '.........402588888885204........',
  '..........4225885885224.........',
  '.........49A4255524A94..........',
  '........4599A33A33A9954.........',
  '.......28994993339949982........',
  '.......48844933333944884........',
  '........444C633B336C444.........',
  '..........42CC333CC24...........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const MOM_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............2011102.............',
  '...........201111102............',
  '.........2001111111002..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20111100000111102........',
  '.......20110011111001102........',
  '.......40010111111101004........',
  '.......40000011111000004........',
  '........4000000000000004........',
  '........4020000000000204........',
  '.........40220000002204.........',
  '..........442200002244..........',
  '.........49A9333339A94..........',
  '........459999999999954.........',
  '.......28994999999949982........',
  '.......48844993339944884........',
  '........444CCCCCCCC444..........',
  '..........42CCCCCCC24...........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const MOM_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '.............2011102............',
  '............201111102...........',
  '.........200111111102...........',
  '........20111111111102..........',
  '.......2011111111111102.........',
  '.......20100111111111002........',
  '.......40025501111110004........',
  '........4255678500110004........',
  '........425564885800004.........',
  '.........2588885850004..........',
  '.........425888854004...........',
  '..........4425552424............',
  '..........4339999A4.............',
  '.........433995899A4............',
  '.........4339988994.............',
  '.........4433388994.............',
  '..........4C333CCC4.............',
  '..........44FCCCCF4.............',
  '...........4FCCCCF4.............',
  '...........4DD44DD4.............',
  '............44..44..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 6. YOUNGSTER (반바지 꼬마) — Matching IMG_1322 top NPC round chestnut hair dome & yellow/blue outfit
const YOUNGSTER_PALETTE: Record<string, string> = {
  '0': '#986838', // Chestnut hair mid
  '1': '#c89058', // Sunlit chestnut hair crown
  '2': '#603c1c', // Warm brown hair/jaw outline
  '3': '#ffffff', // White accent
  '4': '#000000', // Black outline / pupils / soles
  '5': '#d4976d', // Shaded warm skin
  '6': '#e5eef7', // Eye sclera & white collar
  '7': '#486080', // Slate eye iris
  '8': '#f7cbb1', // Bright warm skin
  '9': '#f8c838', // Bright yellow T-shirt stripe
  'A': '#3878d0', // Royal-blue T-shirt & sleeves
  'B': '#d8a020', // Yellow shirt shade
  'C': '#385888', // Navy shorts
  'D': '#d83828', // Red sneakers
  'F': '#243858', // Dark shorts shadow
};

const YOUNGSTER_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20110011111001102........',
  '.......20000001110000002........',
  '........400020010020004.........',
  '.......45200552025500254........',
  '.......45225555255552254........',
  '........425567888765524.........',
  '.........4556488846554..........',
  '..........25888888852...........',
  '..........42588588524...........',
  '.........4AA4255524AA4..........',
  '........45AA9966699AA54.........',
  '.......285A499999994A582........',
  '.......48844AAAAAAA44884........',
  '........444C99BBB99C444.........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const YOUNGSTER_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20111000000011102........',
  '.......20000000000000002........',
  '........400000000000004.........',
  '.......45200000000000254........',
  '.......45220000000002254........',
  '........422000000000224.........',
  '.........4220000000224..........',
  '..........44220002244...........',
  '..........4AAAAAAAAA4...........',
  '.........4AA9999999AA4..........',
  '........45AA9999999AA54.........',
  '.......285A4AAAAAAA4A582........',
  '.......4884499BBB9944884........',
  '........444CCCCCCCCC444.........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const YOUNGSTER_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20001111111110002........',
  '.......40025500111000004........',
  '........425567850000004.........',
  '........425564885800004.........',
  '.........2588885850004..........',
  '.........425888854004...........',
  '..........4425552444............',
  '..........499AAAAA4.............',
  '.........4999AA58AA4............',
  '.........4AAA9988AA4............',
  '.........44999388AA4............',
  '..........4CCCCCCC4.............',
  '..........44FCCCCF4.............',
  '...........4FCCCCF4.............',
  '...........4DD44DD4.............',
  '............44..44..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 7. LASS (짧은 치마) — Matching IMG_1325 blonde girl with sailor collar, red bow & skirt
const LASS_PALETTE: Record<string, string> = {
  '0': '#d0a848', // Honey-blonde hair mid
  '1': '#f8dc78', // Bright blonde hair crown
  '2': '#806028', // Warm golden-brown outline
  '3': '#ffffff', // Crisp white sailor blouse
  '4': '#000000', // Black outline / pupils / soles
  '5': '#d4976d', // Shaded warm skin
  '6': '#e5eef7', // Eye sclera & blouse shade
  '7': '#487898', // Blue-green eye iris
  '8': '#f7cbb1', // Bright warm skin
  '9': '#e84040', // Red sailor ribbon bow
  'A': '#385888', // Navy sailor collar
  'B': '#b8c4d8', // Blouse fold shade
  'C': '#d85040', // Red-orange pleated skirt
  'D': '#704424', // Brown loafers
  'F': '#983028', // Skirt shadow
};

const LASS_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20110011111001102........',
  '.......20100201110200102........',
  '.......40105552025550104........',
  '.......40125555255552104........',
  '.......4012556788876552104......',
  '........40255648884655204.......',
  '........40125888888852104.......',
  '.........402258858852204........',
  '.........43A4255524A34..........',
  '........4533AA999AA3354.........',
  '.......28334339993343382........',
  '.......48844336B63344884........',
  '........444CCCCCCCCC444.........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const LASS_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20111100000111102........',
  '.......20110011111001102........',
  '.......40100111111100104........',
  '.......40100011111000104........',
  '.......40000001110000004........',
  '........400000000000004.........',
  '........402000000000204.........',
  '.........4220000000224..........',
  '.........43AAAAAAAAA34..........',
  '........4533AAAAAAA3354.........',
  '.......28334333333343382........',
  '.......48844336B63344884........',
  '........444CCCCCCCCC444.........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const LASS_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20001111111111002........',
  '.......40025501111110004........',
  '........4255678511110004........',
  '........4255648858110004........',
  '.........25888858511004.........',
  '.........4258888540004..........',
  '..........44255524004...........',
  '..........499AA33344............',
  '.........49933358334............',
  '.........43333388334............',
  '.........44336388334............',
  '..........4CCCCCCC4.............',
  '..........44FCCCCF4.............',
  '...........4FCCCCF4.............',
  '...........4DD44DD4.............',
  '............44..44..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 8. NURSE JOY (간호순) — Built on the exact 32x32 rig with white nurse cap, pink hair loops & dress
const NURSE_PALETTE: Record<string, string> = {
  '0': '#d86888', // Pink hair mid
  '1': '#f898b8', // Soft rose-pink hair & dress
  '2': '#883850', // Deep rose hair/jaw outline
  '3': '#ffffff', // Pure white nurse cap & apron
  '4': '#000000', // Black outline / pupils / soles
  '5': '#d4976d', // Shaded warm skin
  '6': '#d8e0f0', // White cap/apron shade & sclera
  '7': '#4878a8', // Blue eye iris
  '8': '#f7cbb1', // Bright warm skin
  '9': '#e83848', // Red cross emblem
  'B': '#b8c4d8', // Apron fold shadow
  'C': '#f8b0c8', // Light pink dress highlight
  'D': '#d84870', // Pink nurse shoes
  'F': '#b84868', // Dress lower shadow
};

const NURSE_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............2633362.............',
  '...........233999332............',
  '..........20633933602...........',
  '.........2011666661102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '......2011100111110011102.......',
  '......2010022011102200102.......',
  '......4010555520255550104.......',
  '......4012555552555552104.......',
  '.......40255678887655204........',
  '.......40255648884655204........',
  '........422588888885224.........',
  '..........42588588524...........',
  '.........4314255524134..........',
  '........453113333311354.........',
  '.......28314113331141382........',
  '.......48844133333144884........',
  '........444F633B336F444.........',
  '..........42133333124...........',
  '..........42F13331F24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const NURSE_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............2633362.............',
  '...........233333332............',
  '..........20633333602...........',
  '.........2011666661102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '......2011110000000111102.......',
  '......2011001111111001102.......',
  '......4010011111111100104.......',
  '......4000001111111000004.......',
  '.......40000000000000004........',
  '.......40220000000002204........',
  '........442200000002244.........',
  '.........4311333331134..........',
  '........453111111111354.........',
  '.......28314111111141382........',
  '.......48844113331144884........',
  '........444F1133311F444.........',
  '..........42111111124...........',
  '..........42F11111F24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const NURSE_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............2633362.............',
  '...........29333332.............',
  '..........206333602.............',
  '.........20111111102............',
  '........2011111111102...........',
  '.......201111111111102..........',
  '.......2000111111111102.........',
  '.......4002550111111004.........',
  '........425567850111004.........',
  '........425564885801004.........',
  '.........2588885850004..........',
  '.........425888854204...........',
  '..........4425552444............',
  '..........433111134.............',
  '.........43311581134............',
  '.........4331188114.............',
  '.........4433688114.............',
  '..........4F33311F4.............',
  '..........44F1111F4.............',
  '...........4F1111F4.............',
  '...........4DD44DD4.............',
  '............44..44..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 9. POKEMART CLERK (프렌들리숍 직원) — Built on the exact 32x32 Lucas rig with blue PokéMart cap & apron
const CLERK_PALETTE: Record<string, string> = {
  '0': '#2858a8', // Blue PokéMart cap visor & apron
  '1': '#4888e8', // Bright blue cap crown & apron highlight
  '2': '#183868', // Dark navy cap outline
  '3': '#000000', // Black outline / pupils / shoes
  '4': '#f0f4fc', // Crisp white shirt & cap badge
  '5': '#c8d0e0', // White shirt shade
  '6': '#583c24', // Neat brown hair
  '7': '#486888', // Eye iris
  '8': '#d8a078', // Shaded warm skin
  '9': '#f8d0b8', // Bright warm skin
  'A': '#48b868', // Green necktie
  'B': '#203048', // Dark slacks shadow
  'C': '#384c68', // Slate slacks
};

const CLERK_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............0000000.............',
  '..........00111111100...........',
  '.........2111111111112..........',
  '........311111111111112.........',
  '.......31111144444111112........',
  '.......31111441114411113........',
  '.......30011111111111003........',
  '........600000000000006.........',
  '.......23600000000000632........',
  '.......38366000000066383........',
  '.......38266222222266283........',
  '........328676222676823.........',
  '.........3884388834883..........',
  '..........28999999982...........',
  '..........32899899823...........',
  '.........3453288823543..........',
  '........3844004A4004482.........',
  '.......29543011A11034593........',
  '.......39933001110033993........',
  '........333B0011100B333.........',
  '..........32BCCCCCB23...........',
  '..........33333333333...........',
  '...........33.....33............',
  '................................',
  '................................',
  '................................',
  '................................',
];

const CLERK_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............0000000.............',
  '..........00111111100...........',
  '.........2111111111112..........',
  '........311111111111112.........',
  '.......31111111111111112........',
  '.......31001111111110013........',
  '.......30000000000000003........',
  '........600000000000006.........',
  '.......23666666666666632........',
  '.......38366666666666383........',
  '.......38236666666663283........',
  '........326666666666623.........',
  '.........3666666666663..........',
  '..........33666666633...........',
  '..........34444444443...........',
  '.........3440000000443..........',
  '........384444444444482.........',
  '.......29534400000443593........',
  '.......39933001110033993........',
  '........333B0011100B333.........',
  '..........32BCCCCCB23...........',
  '..........33333333333...........',
  '...........33.....33............',
  '................................',
  '................................',
  '................................',
  '................................',
];

const CLERK_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............0000000.............',
  '..........00111111100...........',
  '.........2111111111112..........',
  '........311111111111112.........',
  '.......31441111111111112........',
  '.......31441111111111003........',
  '......000000011111100063........',
  '.....300000000000000666.........',
  '......33388662222666663.........',
  '........388438866666663.........',
  '........388438889866663.........',
  '.........2899998986663..........',
  '.........328999983663...........',
  '..........3328882333............',
  '..........3001144443............',
  '.........30011448443............',
  '.........30011489443............',
  '.........3300139943.............',
  '..........33BCCCCB3.............',
  '...........3BCCCCB3.............',
  '...........33333333.............',
  '............33..33..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 10. GYM LEADER ROARK (강석) — Built on the exact 32x32 Lucas rig with red miner helmet, headlamp & glasses
const ROARK_PALETTE: Record<string, string> = {
  '0': '#b82820', // Red miner helmet shade & tie
  '1': '#e84838', // Glossy red miner helmet crown
  '2': '#701810', // Dark crimson helmet outline
  '3': '#000000', // Black outline / pupils / soles
  '4': '#f0f8ff', // Glasses glint & headlamp highlight
  '5': '#a0b8d0', // Silver glasses rim
  '6': '#404850', // Charcoal miner jacket
  '7': '#682c24', // Brown-crimson hair
  '8': '#d8a078', // Shaded warm skin
  '9': '#f8d0b8', // Bright warm skin
  'A': '#f8d848', // Golden headlamp badge
  'B': '#283038', // Dark jacket/pants shadow
  'C': '#586068', // Slate work pants
  'D': '#784828', // Brown mining boots
};

const ROARK_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2000002.............',
  '..........20111011102...........',
  '.........2111110111112..........',
  '........3111110A0111113.........',
  '.......3111110AAA0111113........',
  '.......310000AA4AA000013........',
  '.......3000000AAA0000003........',
  '......3000000000000000003.......',
  '.......23777000000077732........',
  '.......38377722222777383........',
  '.......38275544244557283........',
  '........328543585345823.........',
  '.........3855588855583..........',
  '..........28999999982...........',
  '..........32899899823...........',
  '.........36B3288823B63..........',
  '........386664010466682.........',
  '.......29663660106636693........',
  '.......39933666066633993........',
  '........333B66B5B66B333.........',
  '..........32BCCCCCB23...........',
  '..........3DD33333DD3...........',
  '...........33.....33............',
  '................................',
  '................................',
  '................................',
  '................................',
];

const ROARK_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2000002.............',
  '..........20111011102...........',
  '.........2111110111112..........',
  '........311111101111113.........',
  '.......31111111011111113........',
  '.......31000011011000013........',
  '.......30000000000000003........',
  '......3000000000000000003.......',
  '.......23777777777777732........',
  '.......38377777777777383........',
  '.......38237777777773283........',
  '........327777777777723.........',
  '.........3777777777773..........',
  '..........33777777733...........',
  '..........3BBBBBBBBB3...........',
  '.........3666666666663..........',
  '........3866666B6666682.........',
  '.......29663666B66636693........',
  '.......39933666B66633993........',
  '........333B66BBB66B333.........',
  '..........32BCCCCCB23...........',
  '..........3DD33333DD3...........',
  '...........33.....33............',
  '................................',
  '................................',
  '................................',
  '................................',
];

const ROARK_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2000002.............',
  '..........20111111102...........',
  '.........2111111111112..........',
  '........3A1111111111113.........',
  '.......3AA11111111111113........',
  '.......30000111111110003........',
  '.....3000000000000000003........',
  '......33387772227777773.........',
  '.......3543588777777773.........',
  '.......3543588898777773.........',
  '........35589998987773..........',
  '.........328999983773...........',
  '..........3328882333............',
  '..........30666666B3............',
  '.........3006658666B3...........',
  '.........3666689666B3...........',
  '.........33666399663............',
  '..........33BCCCCB3.............',
  '...........3BCCCCB3.............',
  '...........3DD33DD3.............',
  '............33..33..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 11. HIKER (등산가) — Built on the exact 32x32 Barry rig with brown beard, mountain vest & rucksack
const HIKER_PALETTE: Record<string, string> = {
  '0': '#704820', // Brown hair & beard mid
  '1': '#986838', // Chestnut hair crown
  '2': '#482c10', // Dark brown hair/beard/boots outline
  '3': '#ffffff', // White sclera
  '4': '#000000', // Black outline / pupils / soles
  '5': '#c89068', // Tanned skin shade
  '6': '#e5eef7', // Eye sclera
  '7': '#488848', // Green rucksack strap & pack
  '8': '#f0b890', // Tanned skin highlight
  '9': '#d88030', // Khaki-orange mountain vest
  'A': '#68b058', // Bright green rucksack highlight
  'B': '#985018', // Vest shade
  'C': '#604830', // Brown cargo pants
  'D': '#482c10', // Heavy mountain boots
  'F': '#382414', // Dark pants shadow
};

const HIKER_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............222222..............',
  '.........200111111002...........',
  '........20111111111102..........',
  '.......2011111111111102.........',
  '......201110111111011102........',
  '......201100000000001102........',
  '.......2002200110022002.........',
  '.......4025552002555204.........',
  '.......4025555225555204.........',
  '........425564888465524.........',
  '.........4056488846504..........',
  '.........4005880885004..........',
  '.........4200020200024..........',
  '..........44200000244...........',
  '.........47A4200024A74..........',
  '........457A99B5B99A754.........',
  '.......28574999B99947582........',
  '.......4884499BBB9944884........',
  '........444C99BBB99C444.........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const HIKER_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............222222..............',
  '.........200111111002...........',
  '........20111111111102..........',
  '.......2011111111111102.........',
  '......201111111111111102........',
  '......201110000000011102........',
  '.......2000000000000002.........',
  '.......4000000000000004.........',
  '.......4520000000000254.........',
  '........42000000000024..........',
  '.........420000000024...........',
  '.........422000000224...........',
  '..........4422002244............',
  '.........47AAAAAAAAA74..........',
  '........457AAAAAAAAA754.........',
  '.......28574AAAAAAA47582........',
  '.......48844777777744884........',
  '........444CCCCCCCCC444.........',
  '..........42FCCCCCF24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const HIKER_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '............222222..............',
  '.........200111111002...........',
  '........20111111111102..........',
  '.......2011111111111102.........',
  '.......2001111111111102.........',
  '.......4025500111100024.........',
  '........425564850000024.........',
  '........40556488580004..........',
  '.......40005888585004...........',
  '.......4200008854004............',
  '........44420002444.............',
  '..........49977AAA74............',
  '.........4999758AAA74...........',
  '.........499B788AAA74...........',
  '.........449B3887774............',
  '..........4CCCCCCC4.............',
  '..........44FCCCCF4.............',
  '...........4FCCCCF4.............',
  '...........4DD44DD4.............',
  '............44..44..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

// 12. GALACTIC GRUNT (갤럭시단 조무래기) — Built on the exact 32x32 rig with cyan bowl-cut & yellow 'G' emblem
const GRUNT_PALETTE: Record<string, string> = {
  '0': '#28a0b0', // Teal-cyan hair mid
  '1': '#58dce8', // Bright cyan bowl-cut highlight
  '2': '#185868', // Dark teal hair outline
  '3': '#ffffff', // Pure white suit highlight
  '4': '#000000', // Black outline / pupils / soles
  '5': '#d4976d', // Shaded warm skin
  '6': '#e5eef7', // White Galactic vest & sclera
  '7': '#384858', // Sharp dark eye iris
  '8': '#f7cbb1', // Bright warm skin
  '9': '#242830', // Black Galactic inner suit & gloves
  'A': '#f8c838', // Golden Galactic 'G' logo
  'B': '#b8c4d4', // White trousers shade
  'C': '#d8e0ec', // White Galactic trousers
  'D': '#384048', // Dark grey space boots
};

const GRUNT_DOWN: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20110011111001102........',
  '.......20100000000000102........',
  '.......40102222222220104........',
  '.......40125555255552104........',
  '.......4012556788876552104......',
  '........40255648884655204.......',
  '........42225888888852224.......',
  '..........42588588524...........',
  '.........46B4255524B64..........',
  '........49669AA9AA96694.........',
  '.......4996499AAA9946994........',
  '.......49944669A96644994........',
  '........444B6699966B444.........',
  '..........42BCCCCCB24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const GRUNT_UP: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20111000000011102........',
  '.......20100000000000102........',
  '.......40000000000000004........',
  '.......40222222222222204........',
  '........425599999995524.........',
  '.........4559999999554..........',
  '..........44999999944...........',
  '.........46B9999999B64..........',
  '........496666666666694.........',
  '.......49964666B66646994........',
  '.......49944666B66644994........',
  '........444B66BBB66B444.........',
  '..........42BCCCCCB24...........',
  '..........4DD4...4DD4...........',
  '...........44.....44............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const GRUNT_LEFT: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............2222222.............',
  '..........20111111102...........',
  '.........2011111111102..........',
  '........201111111111102.........',
  '.......20111111111111102........',
  '.......20000011111110002........',
  '.......40025500000000004........',
  '........425567850000004.........',
  '........425564885800004.........',
  '.........2588885852224..........',
  '.........425888854994...........',
  '..........4425552494............',
  '..........4AA96666B4............',
  '.........4AA9669966B4...........',
  '.........4996669966B4...........',
  '.........44666399664............',
  '..........4BCCCCCB4.............',
  '..........44BCCCCB4.............',
  '...........4BCCCCB4.............',
  '...........4DD44DD4.............',
  '............44..44..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const DS_CHARACTER_RIGS: Record<string, DsCharacterRig> = {
  lucas: { palette: LUCAS_PALETTE, down: LUCAS_DOWN, up: LUCAS_UP, left: LUCAS_LEFT },
  rival: { palette: BARRY_PALETTE, down: BARRY_DOWN, up: BARRY_UP, left: BARRY_LEFT },
  dawn: { palette: DAWN_PALETTE, down: DAWN_DOWN, up: DAWN_UP, left: DAWN_LEFT },
  rowan: { palette: ROWAN_PALETTE, down: ROWAN_DOWN, up: ROWAN_UP, left: ROWAN_LEFT },
  mom: { palette: MOM_PALETTE, down: MOM_DOWN, up: MOM_UP, left: MOM_LEFT },
  youngster: { palette: YOUNGSTER_PALETTE, down: YOUNGSTER_DOWN, up: YOUNGSTER_UP, left: YOUNGSTER_LEFT },
  lass: { palette: LASS_PALETTE, down: LASS_DOWN, up: LASS_UP, left: LASS_LEFT },
  nurse: { palette: NURSE_PALETTE, down: NURSE_DOWN, up: NURSE_UP, left: NURSE_LEFT },
  clerk: { palette: CLERK_PALETTE, down: CLERK_DOWN, up: CLERK_UP, left: CLERK_LEFT },
  roark: { palette: ROARK_PALETTE, down: ROARK_DOWN, up: ROARK_UP, left: ROARK_LEFT },
  hiker: { palette: HIKER_PALETTE, down: HIKER_DOWN, up: HIKER_UP, left: HIKER_LEFT },
  grunt: { palette: GRUNT_PALETTE, down: GRUNT_DOWN, up: GRUNT_UP, left: GRUNT_LEFT },
};

export function getActorCanvas(
  spriteId: string,
  direction: 'up' | 'down' | 'left' | 'right',
  animStep = 0
): HTMLCanvasElement {
  const step = animStep % 4;
  const key = `ds_actor_v5_${spriteId}_${direction}_${step}`;
  if (spriteCache[key]) return spriteCache[key];

  if (spriteId === 'briefcase') {
    const [canvas, ctx] = createPixelCanvas(66, 72);
    ctx.fillStyle = 'rgba(16, 40, 20, 0.32)';
    ctx.fillRect(12, 50, 42, 8);

    const caseMat = [
      '......kkkkkkkk......',
      '.....kGGGGGGGGk.....',
      '.....kk......kk.....',
      '..kkkkkkkkkkkkkkkk..',
      '.kLLLLLLLLLLLLLLLLk.',
      '.kLHHHHHHHHHHHHHHLk.',
      '.kLLLLLLLLLLLLLLLLk.',
      '.kkkkkkkkkkkkkkkkkk.',
      '.kDDDDGGDDDDGGDDDDk.',
      '.kDDDDDDDDDDDDDDDDk.',
      '.kDDDDDDDDDDDDDDDDk.',
      '..kkkkkkkkkkkkkkkk..',
    ];
    drawPixelMatrix(
      ctx,
      caseMat,
      { k: '#18100c', G: '#ffd848', L: '#885028', H: '#b07040', D: '#683818' },
      3,
      22,
      3
    );
    spriteCache[key] = canvas;
    return canvas;
  }

  // Active character bounds in 32x32 frame: cols 5..26 (22px), rows 4..27 (24px)
  // Rendered at 3x integer scale (66x72 physical px) -> 33x36 logical px on 2x DS canvas!
  const [canvas, ctx] = createPixelCanvas(66, 72);
  const rig = DS_CHARACTER_RIGS[spriteId] || DS_CHARACTER_RIGS.youngster;

  // 1. Subtle DS Ground Shadow Oval under shoes
  ctx.fillStyle = 'rgba(16, 40, 20, 0.30)';
  ctx.fillRect(12, 60, 42, 9);
  ctx.fillRect(15, 57, 36, 14);

  // 2. Select directional 32x32 matrix & apply crisp walking animation
  let baseMat: string[];
  if (direction === 'down') baseMat = rig.down;
  else if (direction === 'up') baseMat = rig.up;
  else if (direction === 'left') baseMat = rig.left;
  else baseMat = mirrorMatrix32(rig.left);

  const animatedMat = applyDsWalkStep(baseMat, direction, step);
  drawPixelMatrix(ctx, animatedMat, rig.palette, -5 * 3, -4 * 3, 3);

  spriteCache[key] = canvas;
  return canvas;
}

/**
 * Generates authentic 16x16 Pixel Art Icons for UI (Pokéball, Potion, Badge, etc.)
 */
export function getPixelIconDataUrl(
  type: 'pokeball' | 'greatball' | 'potion' | 'super_potion' | 'revive' | 'badge'
): string {
  if (dataUrlCache[type]) return dataUrlCache[type];
  const [canvas, ctx] = createPixelCanvas(16, 16);

  if (type === 'pokeball' || type === 'greatball') {
    const topColor = type === 'greatball' ? '#2868d8' : '#e83020';
    const topHighlight = type === 'greatball' ? '#f84030' : '#ff7868';
    const mat = [
      '.....kkkkkk.....',
      '...kkTTTTTTkk...',
      '..kTTHHTTTTTTk..',
      '.kTTHHTTTTTTTTk.',
      '.kTTTTTTTTTTTTk.',
      'kTTTTTkkkkTTTTTk',
      'kkkkkkwwwwkkkkkk',
      'kwwwwwkwwkwwwwwk',
      'kwwwwwwkkwwwwwwk',
      '.kwwwwwwwwwwwwk.',
      '.kwwwwwwwwwwwwk.',
      '..kwwwwwwwwwwk..',
      '...kkwwwwwwkk...',
      '.....kkkkkk.....',
    ];
    drawPixelMatrix(ctx, mat, { k: '#181820', T: topColor, H: topHighlight, w: '#f8f8f8' }, 0, 1);
  } else if (type === 'potion' || type === 'super_potion') {
    const bodyColor = type === 'super_potion' ? '#e85838' : '#8848c8';
    const mat = [
      '......kkkk......',
      '.....kwwwwk.....',
      '.....kggggk.....',
      '....kkBBBBkk....',
      '...kBBwBBBBB....',
      '...kBBwBBBBBk...',
      '...kBBBBBBBBk...',
      '...kBwwwwwwBk...',
      '...kBwwwwwwBk...',
      '...kBBBBBBBBk...',
      '....kkkkkkkk....',
    ];
    drawPixelMatrix(ctx, mat, { k: '#181820', w: '#f8f8f8', g: '#98a0b0', B: bodyColor }, 0, 2);
  } else if (type === 'revive') {
    const mat = [
      '.......kk.......',
      '......kYYk......',
      '.....kYYYYk.....',
      '....kYYwwYYk....',
      '...kYYYwwYYYk...',
      '...kYYYYYYYYk...',
      '....kYYYYYYk....',
      '.....kYYYYk.....',
      '......kYYk......',
      '.......kk.......',
    ];
    drawPixelMatrix(ctx, mat, { k: '#181820', Y: '#f8c820', w: '#fff8c0' }, 0, 3);
  } else if (type === 'badge') {
    const mat = [
      '....kkkkkkkk....',
      '...kBBBBBBBBk...',
      '..kBBYYYYYYBBk..',
      '.kBBYYwwwwYYBBk.',
      '.kBBYYwwwwYYBBk.',
      '.kBBYYYYYYYYBBk.',
      '..kBBBBBBBBBBk..',
      '...kkkkkkkkkk...',
    ];
    drawPixelMatrix(ctx, mat, { k: '#181820', B: '#885028', Y: '#e89830', w: '#ffe078' }, 0, 4);
  }

  dataUrlCache[type] = canvas.toDataURL();
  return dataUrlCache[type];
}

// --- AUTHENTIC GEN 4 DIAMOND/PEARL SPRITE URL HELPER ---
export function getPokemonSpriteUrl(id: number, isBack = false): string {
  if (isBack) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iv/diamond-pearl/back/${id}.png`;
  }
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iv/diamond-pearl/${id}.png`;
}

export function getPokemonFallbackSpriteUrl(id: number, isBack = false): string {
  if (isBack) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${id}.png`;
  }
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}
