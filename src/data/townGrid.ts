import type { GridPoint } from '../agents/Pathfinding';
import type { LocationId, Vector2 } from './locations';

export type TileType = 'grass' | 'road' | 'plaza' | 'park' | 'sand' | 'water' | 'dock';
export type FloorStyle = 'wood' | 'tile' | 'carpet' | 'stone' | 'schoolTile';
export type FurnitureKind =
  | 'bed'
  | 'table'
  | 'chair'
  | 'cabinet'
  | 'counter'
  | 'bookshelf'
  | 'desk'
  | 'blackboard'
  | 'stove'
  | 'rug'
  | 'plant'
  | 'crate'
  | 'boat';

export interface GridCell {
  x: number;
  y: number;
  type: TileType;
  walkable: boolean;
  obstacle: boolean;
}

export interface DoorSpec {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RectSpec {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FurnitureSpec extends RectSpec {
  kind: FurnitureKind;
  blocksPath: boolean;
  depthAnchorY: number;
  collisionRect?: RectSpec;
  color?: number;
  label?: string;
}

export interface FloorPlanBuildingSpec extends RectSpec {
  locationId: LocationId;
  wallThickness: number;
  wallColor: number;
  floorColor: number;
  floorStyle: FloorStyle;
  doors: DoorSpec[];
  furniture: FurnitureSpec[];
  label: {
    text: string;
    x: number;
    y: number;
  };
}

export interface PropSpec extends RectSpec {
  kind:
    | 'tree'
    | 'bench'
    | 'fountain'
    | 'lamp'
    | 'mailbox'
    | 'flowers'
    | 'crate'
    | 'boat'
    | 'pond'
    | 'campfire'
    | 'notice'
    | 'umbrella'
    | 'shell'
    | 'fence'
    | 'rock'
    | 'fishingSpot'
    | 'grass'
    | 'crop';
  blocksPath?: boolean;
  collisionRect?: RectSpec;
  depthAnchorY?: number;
  color?: number;
  label?: string;
}

export interface HarvestablePlant extends RectSpec {
  id: string;
  crop: 'carrot' | 'tomato' | 'berry' | 'pumpkin' | 'apple';
  itemId: string;
  displayName: string;
  harvested: boolean;
}

export const CELL_SIZE = 20;
export const GRID_WIDTH = 256;
export const GRID_HEIGHT = 168;

const WALL_THICKNESS = 14;

function f(
  kind: FurnitureKind,
  x: number,
  y: number,
  width: number,
  height: number,
  blocksPath = true,
  insetRatio = 0.34,
  color?: number,
): FurnitureSpec {
  const insetX = blocksPath ? Math.min(width * insetRatio, Math.max(0, width / 2 - 4)) : 0;
  const insetY = blocksPath ? Math.min(height * insetRatio, Math.max(0, height / 2 - 4)) : 0;
  return {
    kind,
    x,
    y,
    width,
    height,
    blocksPath,
    depthAnchorY: y + height,
    collisionRect: blocksPath
      ? {
          x: x + insetX,
          y: y + insetY,
          width: Math.max(4, width - insetX * 2),
          height: Math.max(4, height - insetY * 2),
        }
      : undefined,
    color,
  };
}

function building(
  locationId: LocationId,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  floorStyle: FloorStyle,
  floorColor: number,
  wallColor: number,
  doors: DoorSpec[],
  furniture: FurnitureSpec[],
): FloorPlanBuildingSpec {
  return {
    locationId,
    x,
    y,
    width,
    height,
    wallThickness: WALL_THICKNESS,
    wallColor,
    floorColor,
    floorStyle,
    doors,
    furniture,
    label: { text, x: x + 14, y: y - 34 },
  };
}

export const BUILDINGS: FloorPlanBuildingSpec[] = [
  building('home', 'Home', 360, 620, 420, 280, 'wood', 0xd9b778, 0xd7d2c7, [{ x: 535, y: 886, width: 74, height: 18 }], [
    f('bed', 392, 654, 82, 52),
    f('cabinet', 718, 654, 38, 70),
    f('table', 522, 724, 62, 46),
    f('chair', 538, 782, 34, 24),
    f('rug', 404, 770, 100, 62, false),
    f('desk', 676, 786, 58, 38),
  ]),
  building('cafe', 'Cafe', 1260, 420, 440, 300, 'wood', 0xcfa66b, 0xd8c9af, [{ x: 1435, y: 706, width: 78, height: 18 }], [
    f('counter', 1300, 456, 250, 34, true, 0.18),
    f('stove', 1580, 456, 40, 58),
    f('cabinet', 1512, 518, 58, 34),
    f('table', 1328, 575, 58, 48),
    f('chair', 1344, 634, 34, 24),
    f('table', 1472, 575, 58, 48),
    f('chair', 1542, 584, 28, 38),
    f('plant', 1646, 632, 26, 34),
  ]),
  building('library', 'Library', 2240, 520, 480, 320, 'wood', 0xbda77c, 0xcdd5df, [{ x: 2442, y: 826, width: 84, height: 18 }], [
    f('bookshelf', 2280, 558, 110, 36, true, 0.16),
    f('bookshelf', 2420, 558, 110, 36, true, 0.16),
    f('bookshelf', 2560, 558, 96, 36, true, 0.16),
    f('bookshelf', 2280, 704, 110, 36, true, 0.16),
    f('bookshelf', 2550, 704, 110, 36, true, 0.16),
    f('table', 2424, 672, 82, 54),
    f('chair', 2448, 740, 34, 24),
    f('cabinet', 2606, 636, 50, 64),
  ]),
  building('school', 'School', 3900, 560, 520, 340, 'schoolTile', 0xcfd7c9, 0xd6d8c0, [{ x: 4120, y: 886, width: 90, height: 18 }], [
    f('blackboard', 3950, 598, 164, 34, true, 0.08),
    f('desk', 4186, 606, 70, 46),
    f('desk', 3960, 710, 60, 44),
    f('chair', 3974, 768, 34, 24),
    f('desk', 4076, 710, 60, 44),
    f('chair', 4090, 768, 34, 24),
    f('desk', 4192, 710, 60, 44),
    f('chair', 4206, 768, 34, 24),
    f('bookshelf', 4332, 688, 46, 104, true, 0.18),
  ]),
  building('clinic', 'Clinic', 3050, 1310, 430, 300, 'tile', 0xcfece6, 0xc8ddd9, [{ x: 3046, y: 1425, width: 18, height: 80 }], [
    f('bed', 3090, 1350, 88, 48),
    f('bed', 3090, 1432, 88, 48),
    f('cabinet', 3412, 1348, 42, 74),
    f('desk', 3258, 1468, 66, 44),
    f('chair', 3334, 1478, 30, 34),
    f('table', 3104, 1510, 62, 36),
    f('plant', 3416, 1510, 28, 36),
  ]),
  building('restaurant', 'Restaurant', 720, 1520, 460, 320, 'tile', 0xc99a6a, 0xdbcec1, [{ x: 1166, y: 1640, width: 18, height: 80 }], [
    f('counter', 758, 1560, 160, 36, true, 0.18),
    f('stove', 940, 1558, 62, 48),
    f('cabinet', 1090, 1560, 46, 82),
    f('table', 792, 1692, 62, 52),
    f('chair', 748, 1702, 30, 38),
    f('chair', 868, 1702, 30, 38),
    f('table', 996, 1698, 62, 52),
    f('chair', 1010, 1762, 34, 24),
  ]),
  building('studio', 'Studio', 610, 2360, 420, 310, 'carpet', 0xcebddb, 0xd6cbe0, [{ x: 1016, y: 2475, width: 18, height: 82 }], [
    f('desk', 652, 2400, 78, 44),
    f('chair', 674, 2458, 34, 24),
    f('table', 782, 2462, 76, 60),
    f('cabinet', 954, 2400, 48, 84),
    f('bookshelf', 670, 2580, 108, 36, true, 0.18),
    f('rug', 840, 2570, 106, 52, false),
    f('plant', 970, 2580, 28, 34),
  ]),
  building('workshop', 'Workshop', 1500, 2210, 440, 310, 'stone', 0xc9b190, 0xcbb9a5, [{ x: 1680, y: 2506, width: 84, height: 18 }], [
    f('counter', 1540, 2250, 178, 38, true, 0.18),
    f('crate', 1750, 2256, 60, 46),
    f('desk', 1562, 2380, 86, 50),
    f('chair', 1662, 2392, 30, 36),
    f('cabinet', 1852, 2268, 42, 90),
    f('table', 1760, 2398, 78, 50),
  ]),
  building('grocery', 'Grocery', 3990, 1430, 440, 310, 'tile', 0xcfdca6, 0xd5d3b8, [{ x: 3986, y: 1545, width: 18, height: 82 }], [
    f('counter', 4040, 1470, 198, 36, true, 0.18),
    f('bookshelf', 4032, 1554, 96, 38, true, 0.16),
    f('bookshelf', 4180, 1554, 96, 38, true, 0.16),
    f('table', 4048, 1650, 66, 46),
    f('table', 4190, 1650, 66, 46),
    f('crate', 4304, 1510, 48, 46),
    f('plant', 4358, 1668, 26, 34),
  ]),
  building('bakery', 'Bakery', 4240, 2290, 440, 300, 'wood', 0xd8b06f, 0xd8c1aa, [{ x: 4236, y: 2405, width: 18, height: 82 }], [
    f('counter', 4284, 2328, 210, 36, true, 0.18),
    f('stove', 4520, 2326, 62, 50),
    f('table', 4310, 2426, 62, 48),
    f('chair', 4324, 2486, 34, 24),
    f('table', 4452, 2428, 62, 48),
    f('chair', 4526, 2440, 30, 38),
    f('cabinet', 4612, 2388, 40, 72),
  ]),
  building('inn', 'Inn', 2280, 2710, 470, 310, 'wood', 0xcaa372, 0xd4c4ad, [{ x: 2475, y: 2706, width: 86, height: 18 }], [
    f('bed', 2320, 2754, 84, 52),
    f('bed', 2626, 2754, 84, 52),
    f('table', 2464, 2834, 72, 52),
    f('chair', 2482, 2898, 34, 24),
    f('cabinet', 2670, 2840, 48, 78),
    f('rug', 2352, 2860, 108, 58, false),
  ]),
  building('postOffice', 'Post Office', 2760, 2110, 430, 300, 'tile', 0xe6c783, 0xd3b27c, [{ x: 2935, y: 2396, width: 82, height: 18 }], [
    f('counter', 2804, 2150, 200, 36, true, 0.18),
    f('desk', 3030, 2160, 66, 46),
    f('chair', 3108, 2170, 30, 36),
    f('cabinet', 2814, 2252, 54, 78),
    f('crate', 2910, 2268, 56, 42),
    f('table', 3040, 2274, 68, 48),
  ]),
];

function tree(x: number, y: number, width = 54, height = 74): PropSpec {
  return {
    kind: 'tree',
    x,
    y,
    width,
    height,
    blocksPath: true,
    collisionRect: { x: x + width * 0.39, y: y + height * 0.7, width: width * 0.22, height: height * 0.18 },
    depthAnchorY: y + height,
  };
}

function decoration(kind: 'flowers' | 'grass', x: number, y: number, width = 42, height = 24): PropSpec {
  return {
    kind,
    x,
    y,
    width,
    height,
    blocksPath: false,
    depthAnchorY: y + height,
  };
}

function rectIntersects(a: RectSpec, b: RectSpec): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export interface OvalSpec {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

export const FARM_BOUNDS: RectSpec = { x: 3420, y: 2460, width: 1220, height: 560 };
export const OCEAN_Y = 3120;
export const BEACH_Y = 2920;
export const OPEN_LAKE_OVALS: OvalSpec[] = [
  { x: 1910, y: 1140, radiusX: 560, radiusY: 320 },
  { x: 2360, y: 1220, radiusX: 360, radiusY: 240 },
  { x: 1750, y: 1410, radiusX: 340, radiusY: 190 },
];
export const DOCK_RECTS: RectSpec[] = [
  { x: 760, y: 2860, width: 180, height: 500 },
  { x: 650, y: 2990, width: 420, height: 110 },
];

const farmBounds = FARM_BOUNDS;

const ROAD_RECTS_BASE: RectSpec[] = [
  { x: 420, y: 830, width: 3900, height: 105 },
  { x: 520, y: 910, width: 105, height: 1840 },
  { x: 1180, y: 720, width: 110, height: 1060 },
  { x: 2140, y: 840, width: 110, height: 950 },
  { x: 3380, y: 900, width: 110, height: 1780 },
  { x: 4100, y: 900, width: 110, height: 1760 },
  { x: 620, y: 1260, width: 2840, height: 100 },
  { x: 620, y: 1780, width: 2880, height: 120 },
  { x: 560, y: 2670, width: 3650, height: 110 },
  { x: 380, y: 2920, width: 3820, height: 95 },
  { x: 760, y: 2860, width: 180, height: 500 },
  { x: 650, y: 2990, width: 420, height: 110 },
  { x: 510, y: 900, width: 150, height: 110 },
  { x: 1430, y: 700, width: 110, height: 150 },
  { x: 2440, y: 820, width: 120, height: 170 },
  { x: 4100, y: 880, width: 140, height: 120 },
  { x: 1160, y: 1640, width: 180, height: 100 },
  { x: 1010, y: 2460, width: 230, height: 110 },
  { x: 1680, y: 2510, width: 140, height: 170 },
  { x: 3000, y: 1420, width: 110, height: 430 },
  { x: 3980, y: 1540, width: 180, height: 110 },
  { x: 4230, y: 2400, width: 190, height: 110 },
  { x: 2470, y: 2580, width: 110, height: 160 },
  { x: 2920, y: 2400, width: 110, height: 300 },
  { x: 2320, y: 1710, width: 760, height: 290 },
  { x: 3350, y: 2680, width: 170, height: 130 },
];

const NO_DECORATION_RECTS: RectSpec[] = [
  ...BUILDINGS.map((buildingSpec) => inflateRect(buildingSpec, 34)),
  ...ROAD_RECTS_BASE.map((road) => inflateRect(road, 14)),
  { x: 0, y: BEACH_Y - 90, width: GRID_WIDTH * CELL_SIZE, height: GRID_HEIGHT * CELL_SIZE - BEACH_Y + 90 },
  { x: farmBounds.x - 30, y: farmBounds.y - 30, width: farmBounds.width + 60, height: farmBounds.height + 60 },
];

function canPlaceProp(prop: PropSpec): boolean {
  const footprint = prop;
  if (footprint.x < 0 || footprint.y < 0 || footprint.x + footprint.width > GRID_WIDTH * CELL_SIZE || footprint.y + footprint.height > GRID_HEIGHT * CELL_SIZE) {
    return false;
  }

  const center = { x: footprint.x + footprint.width / 2, y: footprint.y + footprint.height / 2 };
  if (OPEN_LAKE_OVALS.some((oval) => pointInOval(center.x, center.y, { ...oval, radiusX: oval.radiusX + footprint.width, radiusY: oval.radiusY + footprint.height }))) {
    return false;
  }

  return NO_DECORATION_RECTS.every((rect) => !rectIntersects(footprint, rect));
}

function filterPlaceable(props: PropSpec[]): PropSpec[] {
  return props.filter(canPlaceProp);
}

function clusteredTrees(zones: RectSpec[], countPerZone: number): PropSpec[] {
  return zones.flatMap((zone, zoneIndex) =>
    Array.from({ length: countPerZone }, (_, index) => {
      const cluster = Math.floor(index / 2);
      const local = index % 5;
      const baseX = zone.x + 18 + ((cluster * 127 + zoneIndex * 71) % Math.max(24, zone.width - 92));
      const baseY = zone.y + 14 + ((cluster * 89 + zoneIndex * 53) % Math.max(24, zone.height - 108));
      const x = baseX + [0, 64, -48, 36, -34][local];
      const y = baseY + [0, 36, 54, -32, 72][local];
      return tree(x, y, 48 + ((index + zoneIndex) % 4) * 4, 66 + ((index * 3 + zoneIndex) % 4) * 5);
    }),
  );
}

function bakedGroundDetails(zones: RectSpec[], countPerZone: number): PropSpec[] {
  return zones.flatMap((zone, zoneIndex) =>
    Array.from({ length: countPerZone }, (_, index) => {
      const x = zone.x + 8 + ((index * 53 + zoneIndex * 37) % Math.max(12, zone.width - 42));
      const y = zone.y + 8 + ((index * 31 + zoneIndex * 61) % Math.max(12, zone.height - 28));
      return decoration(index % 3 === 0 ? 'flowers' : 'grass', x, y, index % 3 === 0 ? 38 : 34, index % 3 === 0 ? 24 : 18);
    }),
  );
}

function borderTrees(): PropSpec[] {
  const top = Array.from({ length: 58 }, (_, index) =>
    tree(20 + index * 88 + ((index * 17) % 35), 8 + ((index * 11) % 38), 48 + ((index * 5) % 12), 66 + ((index * 7) % 12)),
  );
  const left = Array.from({ length: 38 }, (_, index) =>
    tree(6 + ((index * 13) % 28), 120 + index * 82 + ((index * 7) % 30), 48 + ((index * 3) % 12), 66 + ((index * 5) % 12)),
  );
  const right = Array.from({ length: 38 }, (_, index) =>
    tree(5030 + ((index * 19) % 26), 120 + index * 82 + ((index * 5) % 30), 48 + ((index * 7) % 12), 66 + ((index * 3) % 12)),
  );
  return [...top, ...left, ...right];
}

function lakeSideTrees(): PropSpec[] {
  return clusteredTrees(
    [
      { x: 1120, y: 740, width: 330, height: 290 },
      { x: 2480, y: 820, width: 380, height: 290 },
      { x: 1260, y: 1520, width: 360, height: 300 },
      { x: 2510, y: 1510, width: 420, height: 260 },
    ],
    8,
  );
}

function farmFenceProps(): PropSpec[] {
  const props: PropSpec[] = [];
  for (let x = farmBounds.x; x < farmBounds.x + farmBounds.width; x += 62) {
    props.push({
      kind: 'fence',
      x,
      y: farmBounds.y,
      width: 58,
      height: 18,
      blocksPath: true,
      collisionRect: { x, y: farmBounds.y + 4, width: 58, height: 10 },
      depthAnchorY: farmBounds.y + 18,
    });
    props.push({
      kind: 'fence',
      x,
      y: farmBounds.y + farmBounds.height - 18,
      width: 58,
      height: 18,
      blocksPath: true,
      collisionRect: { x, y: farmBounds.y + farmBounds.height - 14, width: 58, height: 10 },
      depthAnchorY: farmBounds.y + farmBounds.height,
    });
  }
  for (let y = farmBounds.y + 22; y < farmBounds.y + farmBounds.height - 24; y += 54) {
    if (y > farmBounds.y + 210 && y < farmBounds.y + 326) {
      continue;
    }
    props.push({
      kind: 'fence',
      x: farmBounds.x,
      y,
      width: 18,
      height: 50,
      blocksPath: true,
      collisionRect: { x: farmBounds.x + 4, y, width: 10, height: 50 },
      depthAnchorY: y + 50,
    });
    props.push({
      kind: 'fence',
      x: farmBounds.x + farmBounds.width - 18,
      y,
      width: 18,
      height: 50,
      blocksPath: true,
      collisionRect: { x: farmBounds.x + farmBounds.width - 14, y, width: 10, height: 50 },
      depthAnchorY: y + 50,
    });
  }
  return props;
}

export const HARVESTABLE_PLANTS: HarvestablePlant[] = Array.from({ length: 36 }, (_, index) => {
  const col = index % 12;
  const row = Math.floor(index / 12);
  const crops: HarvestablePlant['crop'][] = ['carrot', 'tomato', 'berry', 'pumpkin', 'apple'];
  const crop = crops[(index + row) % crops.length];
  return {
    id: `farm-plant-${index + 1}`,
    crop,
    itemId: crop,
    displayName: crop[0].toUpperCase() + crop.slice(1),
    x: farmBounds.x + 132 + col * 72,
    y: farmBounds.y + 104 + row * 86,
    width: 30,
    height: 30,
    harvested: false,
  };
});

export const PROPS: PropSpec[] = [
  { kind: 'fountain', x: 2560, y: 1800, width: 90, height: 76, blocksPath: true, collisionRect: { x: 2580, y: 1818, width: 50, height: 42 }, depthAnchorY: 1876 },
  { kind: 'notice', x: 2160, y: 900, width: 42, height: 56, blocksPath: true, collisionRect: { x: 2172, y: 928, width: 18, height: 24 }, depthAnchorY: 956 },
  { kind: 'notice', x: 2910, y: 1870, width: 42, height: 56, blocksPath: true, collisionRect: { x: 2922, y: 1898, width: 18, height: 24 }, depthAnchorY: 1926 },
  { kind: 'umbrella', x: 440, y: 2985, width: 72, height: 56, blocksPath: true, collisionRect: { x: 466, y: 3013, width: 18, height: 18 }, depthAnchorY: 3041 },
  { kind: 'umbrella', x: 1250, y: 2988, width: 72, height: 56, blocksPath: true, collisionRect: { x: 1276, y: 3016, width: 18, height: 18 }, depthAnchorY: 3044 },
  { kind: 'boat', x: 1150, y: 3220, width: 124, height: 46, blocksPath: true, collisionRect: { x: 1184, y: 3234, width: 58, height: 20 }, depthAnchorY: 3266 },
  { kind: 'crate', x: 660, y: 2970, width: 46, height: 36, blocksPath: true, collisionRect: { x: 672, y: 2980, width: 22, height: 16 }, depthAnchorY: 3006 },
  { kind: 'crate', x: 1050, y: 3058, width: 46, height: 36, blocksPath: true, collisionRect: { x: 1062, y: 3068, width: 22, height: 16 }, depthAnchorY: 3094 },
  { kind: 'fishingSpot', x: 830, y: 3270, width: 76, height: 34, blocksPath: false, depthAnchorY: 3304 },
  ...filterPlaceable(borderTrees()),
  ...filterPlaceable(
    clusteredTrees(
      [
        { x: 160, y: 130, width: 850, height: 360 },
        { x: 3260, y: 170, width: 820, height: 280 },
        { x: 4400, y: 270, width: 480, height: 680 },
        { x: 120, y: 1080, width: 460, height: 680 },
        { x: 600, y: 1840, width: 560, height: 360 },
        { x: 3000, y: 640, width: 540, height: 460 },
        { x: 2900, y: 2520, width: 360, height: 460 },
      ],
      12,
    ),
  ),
  ...Array.from({ length: 42 }, (_, index) => ({
    kind: 'fence' as const,
    x: 300 + index * 108,
    y: index % 3 === 0 ? 960 : index % 3 === 1 ? 2050 : 2840,
    width: 58,
    height: 18,
    blocksPath: false,
    depthAnchorY: index % 3 === 0 ? 978 : index % 3 === 1 ? 2068 : 2858,
  })),
  ...filterPlaceable(lakeSideTrees()),
  ...filterPlaceable(
    bakedGroundDetails(
      [
        { x: 180, y: 520, width: 1080, height: 1220 },
        { x: 1180, y: 820, width: 2100, height: 980 },
        { x: 3300, y: 980, width: 1400, height: 1300 },
        { x: 360, y: 2060, width: 1800, height: 760 },
        { x: 2700, y: 2060, width: 1500, height: 760 },
      ],
      52,
    ),
  ),
  ...farmFenceProps(),
  ...Array.from({ length: 52 }, (_, index) => ({
    kind: 'shell' as const,
    x: 120 + ((index * 211) % 4720),
    y: BEACH_Y + 40 + ((index * 29) % 150),
    width: 18,
    height: 12,
    blocksPath: false,
    depthAnchorY: BEACH_Y + 52 + ((index * 29) % 150),
  })),
];

export const LOCATION_ENTRANCES: Record<LocationId, GridPoint> = {
  home: worldToCell({ x: 572, y: 940 }),
  cafe: worldToCell({ x: 1474, y: 770 }),
  clinic: worldToCell({ x: 3000, y: 1465 }),
  library: worldToCell({ x: 2484, y: 900 }),
  school: worldToCell({ x: 4166, y: 960 }),
  restaurant: worldToCell({ x: 1238, y: 1680 }),
  studio: worldToCell({ x: 1082, y: 2518 }),
  workshop: worldToCell({ x: 1722, y: 2580 }),
  grocery: worldToCell({ x: 3944, y: 1586 }),
  bakery: worldToCell({ x: 4194, y: 2446 }),
  farm: worldToCell({ x: 3448, y: 2720 }),
  inn: worldToCell({ x: 2520, y: 2660 }),
  postOffice: worldToCell({ x: 2976, y: 2480 }),
  park: worldToCell({ x: 2140, y: 1320 }),
  townSquare: worldToCell({ x: 2660, y: 1840 }),
  dock: worldToCell({ x: 850, y: 3220 }),
};

export const LOCATION_TARGETS: Record<LocationId, GridPoint> = {
  home: worldToCell({ x: 572, y: 790 }),
  cafe: worldToCell({ x: 1462, y: 622 }),
  clinic: worldToCell({ x: 3250, y: 1495 }),
  library: worldToCell({ x: 2476, y: 702 }),
  school: worldToCell({ x: 4138, y: 792 }),
  restaurant: worldToCell({ x: 970, y: 1728 }),
  studio: worldToCell({ x: 836, y: 2550 }),
  workshop: worldToCell({ x: 1720, y: 2420 }),
  grocery: worldToCell({ x: 4180, y: 1648 }),
  bakery: worldToCell({ x: 4460, y: 2490 }),
  farm: worldToCell({ x: 4050, y: 2735 }),
  inn: worldToCell({ x: 2500, y: 2888 }),
  postOffice: worldToCell({ x: 2980, y: 2298 }),
  park: worldToCell({ x: 2140, y: 1320 }),
  townSquare: worldToCell({ x: 2660, y: 1840 }),
  dock: worldToCell({ x: 850, y: 3260 }),
};

export const COUNTER_ANCHORS: Partial<Record<LocationId, GridPoint>> = {
  cafe: worldToCell({ x: 1428, y: 520 }),
  restaurant: worldToCell({ x: 848, y: 1628 }),
  workshop: worldToCell({ x: 1632, y: 2328 }),
  grocery: worldToCell({ x: 4140, y: 1534 }),
  bakery: worldToCell({ x: 4388, y: 2398 }),
  postOffice: worldToCell({ x: 2902, y: 2208 }),
};

export const BUILDING_ACTIVITY_POINTS: Record<LocationId, GridPoint[]> = {
  home: [worldToCell({ x: 572, y: 790 }), worldToCell({ x: 704, y: 812 })],
  cafe: [worldToCell({ x: 1428, y: 520 }), worldToCell({ x: 1500, y: 640 }), worldToCell({ x: 1360, y: 640 })],
  clinic: [worldToCell({ x: 3250, y: 1495 }), worldToCell({ x: 3150, y: 1508 }), worldToCell({ x: 3388, y: 1462 })],
  library: [worldToCell({ x: 2476, y: 702 }), worldToCell({ x: 2320, y: 664 }), worldToCell({ x: 2600, y: 760 })],
  school: [worldToCell({ x: 4138, y: 792 }), worldToCell({ x: 4000, y: 770 }), worldToCell({ x: 4298, y: 760 })],
  restaurant: [worldToCell({ x: 970, y: 1728 }), worldToCell({ x: 848, y: 1628 }), worldToCell({ x: 1080, y: 1748 })],
  studio: [worldToCell({ x: 836, y: 2550 }), worldToCell({ x: 710, y: 2538 }), worldToCell({ x: 960, y: 2558 })],
  workshop: [worldToCell({ x: 1720, y: 2420 }), worldToCell({ x: 1632, y: 2328 }), worldToCell({ x: 1840, y: 2440 })],
  grocery: [worldToCell({ x: 4180, y: 1648 }), worldToCell({ x: 4140, y: 1534 }), worldToCell({ x: 4328, y: 1660 })],
  bakery: [worldToCell({ x: 4460, y: 2490 }), worldToCell({ x: 4388, y: 2398 }), worldToCell({ x: 4588, y: 2462 })],
  farm: [worldToCell({ x: 4050, y: 2735 }), worldToCell({ x: 3600, y: 2700 }), worldToCell({ x: 4520, y: 2810 })],
  inn: [worldToCell({ x: 2500, y: 2888 }), worldToCell({ x: 2388, y: 2868 }), worldToCell({ x: 2660, y: 2888 })],
  postOffice: [worldToCell({ x: 2980, y: 2298 }), worldToCell({ x: 2902, y: 2208 }), worldToCell({ x: 3104, y: 2298 })],
  park: [worldToCell({ x: 2140, y: 1320 }), worldToCell({ x: 1700, y: 1220 }), worldToCell({ x: 2460, y: 1380 })],
  townSquare: [worldToCell({ x: 2660, y: 1840 }), worldToCell({ x: 2440, y: 1880 }), worldToCell({ x: 2900, y: 1880 })],
  dock: [worldToCell({ x: 850, y: 3260 }), worldToCell({ x: 700, y: 3040 }), worldToCell({ x: 1040, y: 3040 })],
};

export const ROAD_RECTS: RectSpec[] = ROAD_RECTS_BASE;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function rectToCellRange(rect: RectSpec) {
  return {
    minX: Math.max(0, Math.floor(rect.x / CELL_SIZE)),
    minY: Math.max(0, Math.floor(rect.y / CELL_SIZE)),
    maxX: Math.min(GRID_WIDTH - 1, Math.ceil((rect.x + rect.width) / CELL_SIZE) - 1),
    maxY: Math.min(GRID_HEIGHT - 1, Math.ceil((rect.y + rect.height) / CELL_SIZE) - 1),
  };
}

function markRect(cells: Set<string>, rect: RectSpec): void {
  const range = rectToCellRange(rect);
  for (let y = range.minY; y <= range.maxY; y += 1) {
    for (let x = range.minX; x <= range.maxX; x += 1) {
      cells.add(cellKey(x, y));
    }
  }
}

function clearRect(cells: Set<string>, rect: RectSpec): void {
  const range = rectToCellRange(rect);
  for (let y = range.minY; y <= range.maxY; y += 1) {
    for (let x = range.minX; x <= range.maxX; x += 1) {
      cells.delete(cellKey(x, y));
    }
  }
}

function inflateRect(rect: RectSpec, amount: number): RectSpec {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function pointInRect(x: number, y: number, rect: RectSpec): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function pointInOval(x: number, y: number, oval: OvalSpec): boolean {
  const dx = (x - oval.x) / oval.radiusX;
  const dy = (y - oval.y) / oval.radiusY;
  return dx * dx + dy * dy <= 1;
}

function markBuildingWalls(cells: Set<string>, buildingSpec: FloorPlanBuildingSpec): void {
  const t = buildingSpec.wallThickness;
  markRect(cells, { x: buildingSpec.x, y: buildingSpec.y, width: buildingSpec.width, height: t });
  markRect(cells, { x: buildingSpec.x, y: buildingSpec.y + buildingSpec.height - t, width: buildingSpec.width, height: t });
  markRect(cells, { x: buildingSpec.x, y: buildingSpec.y, width: t, height: buildingSpec.height });
  markRect(cells, { x: buildingSpec.x + buildingSpec.width - t, y: buildingSpec.y, width: t, height: buildingSpec.height });

  for (const door of buildingSpec.doors) {
    clearRect(cells, inflateRect(door, CELL_SIZE * 1.2));
  }
}

function isDockCell(x: number, y: number): boolean {
  const px = x * CELL_SIZE + CELL_SIZE / 2;
  const py = y * CELL_SIZE + CELL_SIZE / 2;
  return DOCK_RECTS.some((rect) => pointInRect(px, py, rect));
}

function isRoadCell(x: number, y: number): boolean {
  const px = x * CELL_SIZE + CELL_SIZE / 2;
  const py = y * CELL_SIZE + CELL_SIZE / 2;
  return ROAD_RECTS.some((rect) => pointInRect(px, py, rect));
}

function isOpenLakeCell(x: number, y: number): boolean {
  const px = x * CELL_SIZE + CELL_SIZE / 2;
  const py = y * CELL_SIZE + CELL_SIZE / 2;
  return OPEN_LAKE_OVALS.some((oval) => pointInOval(px, py, oval));
}

function isParkCell(x: number, y: number): boolean {
  const px = x * CELL_SIZE + CELL_SIZE / 2;
  const py = y * CELL_SIZE + CELL_SIZE / 2;
  return pointInRect(px, py, { x: 1180, y: 760, width: 1720, height: 1040 });
}

function isTownSquareCell(x: number, y: number): boolean {
  const px = x * CELL_SIZE + CELL_SIZE / 2;
  const py = y * CELL_SIZE + CELL_SIZE / 2;
  return pointInRect(px, py, { x: 2320, y: 1710, width: 760, height: 290 });
}

function tileTypeAt(x: number, y: number): TileType {
  if (isDockCell(x, y)) return 'dock';
  if (y * CELL_SIZE >= OCEAN_Y || isOpenLakeCell(x, y)) return 'water';
  if (y * CELL_SIZE >= BEACH_Y) return 'sand';
  if (isTownSquareCell(x, y)) return 'plaza';
  if (isRoadCell(x, y)) return 'road';
  if (isParkCell(x, y)) return 'park';
  return 'grass';
}

function buildObstacleCells(): Set<string> {
  const cells = new Set<string>();

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      if (tileTypeAt(x, y) === 'water') {
        cells.add(cellKey(x, y));
      }
    }
  }

  for (const buildingSpec of BUILDINGS) {
    markBuildingWalls(cells, buildingSpec);
    for (const item of buildingSpec.furniture) {
      if (item.blocksPath && item.collisionRect) {
        markRect(cells, item.collisionRect);
      }
    }
    for (const door of buildingSpec.doors) {
      clearRect(cells, inflateRect(door, CELL_SIZE * 1.2));
    }
  }

  for (const prop of PROPS) {
    if (prop.blocksPath) {
      markRect(cells, prop.collisionRect ?? prop);
    }
  }

  for (const target of Object.values(LOCATION_TARGETS)) {
    clearRect(cells, {
      x: target.x * CELL_SIZE - CELL_SIZE,
      y: target.y * CELL_SIZE - CELL_SIZE,
      width: CELL_SIZE * 3,
      height: CELL_SIZE * 3,
    });
  }
  for (const entrance of Object.values(LOCATION_ENTRANCES)) {
    clearRect(cells, {
      x: entrance.x * CELL_SIZE - CELL_SIZE,
      y: entrance.y * CELL_SIZE - CELL_SIZE,
      width: CELL_SIZE * 3,
      height: CELL_SIZE * 3,
    });
  }

  return cells;
}

const obstacleCells = buildObstacleCells();

export const TOWN_GRID: GridCell[][] = Array.from({ length: GRID_HEIGHT }, (_, y) =>
  Array.from({ length: GRID_WIDTH }, (_, x) => {
    const type = tileTypeAt(x, y);
    const obstacle = obstacleCells.has(cellKey(x, y));
    return {
      x,
      y,
      type,
      walkable: !obstacle,
      obstacle,
    };
  }),
);

export function isWalkableCell(x: number, y: number): boolean {
  return TOWN_GRID[y]?.[x]?.walkable ?? false;
}

export function worldToCell(position: Vector2): GridPoint {
  return {
    x: Math.max(0, Math.min(GRID_WIDTH - 1, Math.floor(position.x / CELL_SIZE))),
    y: Math.max(0, Math.min(GRID_HEIGHT - 1, Math.floor(position.y / CELL_SIZE))),
  };
}

export function cellToWorld(cell: GridPoint): Vector2 {
  return {
    x: cell.x * CELL_SIZE + CELL_SIZE / 2,
    y: cell.y * CELL_SIZE + CELL_SIZE / 2,
  };
}

export function locationEntranceWorld(locationId: LocationId): Vector2 {
  return cellToWorld(LOCATION_ENTRANCES[locationId]);
}

export function locationTargetWorld(locationId: LocationId): Vector2 {
  return cellToWorld(LOCATION_TARGETS[locationId]);
}

export function nearestWalkableCell(cell: GridPoint): GridPoint {
  if (isWalkableCell(cell.x, cell.y)) {
    return cell;
  }

  for (let radius = 1; radius < Math.max(GRID_WIDTH, GRID_HEIGHT); radius += 1) {
    for (let y = cell.y - radius; y <= cell.y + radius; y += 1) {
      for (let x = cell.x - radius; x <= cell.x + radius; x += 1) {
        if (isWalkableCell(x, y)) {
          return { x, y };
        }
      }
    }
  }

  return { x: 0, y: 0 };
}
