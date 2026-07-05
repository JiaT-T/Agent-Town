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
export const GRID_WIDTH = 156;
export const GRID_HEIGHT = 102;

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
  building('home', 'Home', 220, 130, 360, 250, 'wood', 0xd9b778, 0xd7d2c7, [{ x: 365, y: 366, width: 70, height: 18 }], [
    f('bed', 250, 160, 76, 48),
    f('cabinet', 520, 160, 36, 62),
    f('table', 372, 210, 54, 42),
    f('chair', 384, 260, 34, 24),
    f('rug', 268, 245, 88, 58, false),
    f('desk', 496, 280, 48, 36),
  ]),
  building('cafe', 'Cafe', 760, 130, 360, 250, 'wood', 0xcfa66b, 0xd8c9af, [{ x: 905, y: 366, width: 70, height: 18 }], [
    f('counter', 790, 160, 210, 30, true, 0.2),
    f('stove', 1020, 160, 34, 50),
    f('cabinet', 960, 208, 48, 32),
    f('table', 820, 250, 52, 44),
    f('chair', 832, 304, 32, 24),
    f('table', 945, 250, 52, 44),
    f('chair', 1010, 260, 26, 36),
    f('plant', 1080, 308, 24, 32),
  ]),
  building('clinic', 'Clinic', 1300, 130, 360, 250, 'tile', 0xcfece6, 0xc8ddd9, [{ x: 1446, y: 366, width: 70, height: 18 }], [
    f('bed', 1334, 168, 82, 44),
    f('bed', 1334, 236, 82, 44),
    f('cabinet', 1592, 164, 38, 66),
    f('desk', 1466, 270, 56, 40),
    f('chair', 1530, 278, 28, 32),
    f('table', 1342, 306, 52, 34),
    f('plant', 1600, 306, 28, 34),
  ]),
  building('library', 'Library', 1840, 130, 390, 270, 'wood', 0xbda77c, 0xcdd5df, [{ x: 1995, y: 386, width: 76, height: 18 }], [
    f('bookshelf', 1872, 164, 94, 34, true, 0.16),
    f('bookshelf', 1996, 164, 94, 34, true, 0.16),
    f('bookshelf', 2120, 164, 74, 34, true, 0.16),
    f('bookshelf', 1872, 278, 94, 34, true, 0.16),
    f('bookshelf', 2100, 278, 94, 34, true, 0.16),
    f('table', 1986, 250, 72, 48),
    f('chair', 2004, 306, 32, 24),
    f('cabinet', 2152, 220, 44, 56),
  ]),
  building('school', 'School', 2430, 150, 410, 280, 'schoolTile', 0xcfd7c9, 0xd6d8c0, [{ x: 2600, y: 416, width: 82, height: 18 }], [
    f('blackboard', 2474, 182, 132, 30, true, 0.08),
    f('desk', 2650, 188, 62, 42),
    f('desk', 2472, 270, 54, 42),
    f('chair', 2484, 324, 34, 24),
    f('desk', 2564, 270, 54, 42),
    f('chair', 2576, 324, 34, 24),
    f('desk', 2656, 270, 54, 42),
    f('chair', 2668, 324, 34, 24),
    f('bookshelf', 2760, 250, 44, 86, true, 0.18),
  ]),
  building('restaurant', 'Restaurant', 180, 620, 390, 270, 'tile', 0xc99a6a, 0xdbcec1, [{ x: 556, y: 732, width: 18, height: 72 }], [
    f('counter', 214, 652, 138, 34, true, 0.18),
    f('stove', 374, 650, 54, 44),
    f('cabinet', 482, 652, 42, 72),
    f('table', 250, 760, 56, 48),
    f('chair', 212, 770, 28, 34),
    f('chair', 318, 770, 28, 34),
    f('table', 414, 765, 56, 48),
    f('chair', 426, 824, 34, 24),
  ]),
  building('studio', 'Studio', 200, 1010, 360, 250, 'carpet', 0xcebddb, 0xd6cbe0, [{ x: 546, y: 1115, width: 18, height: 72 }], [
    f('desk', 240, 1046, 70, 42),
    f('chair', 258, 1100, 34, 24),
    f('table', 350, 1102, 68, 54),
    f('cabinet', 488, 1046, 44, 76),
    f('bookshelf', 250, 1182, 94, 34, true, 0.18),
    f('rug', 386, 1174, 90, 46, false),
    f('plant', 516, 1180, 28, 34),
  ]),
  building('workshop', 'Workshop', 220, 1380, 360, 250, 'stone', 0xc9b190, 0xcbb9a5, [{ x: 566, y: 1485, width: 18, height: 72 }], [
    f('counter', 252, 1414, 150, 36, true, 0.18),
    f('crate', 432, 1418, 54, 42),
    f('desk', 270, 1514, 76, 46),
    f('chair', 360, 1524, 28, 34),
    f('cabinet', 512, 1430, 38, 82),
    f('table', 424, 1534, 70, 46),
  ]),
  building('grocery', 'Grocery', 2470, 620, 370, 260, 'tile', 0xcfdca6, 0xd5d3b8, [{ x: 2466, y: 724, width: 18, height: 72 }], [
    f('counter', 2520, 654, 164, 34, true, 0.18),
    f('bookshelf', 2512, 724, 84, 36, true, 0.16),
    f('bookshelf', 2632, 724, 84, 36, true, 0.16),
    f('table', 2530, 804, 60, 42),
    f('table', 2640, 804, 60, 42),
    f('crate', 2750, 684, 44, 42),
    f('plant', 2798, 820, 24, 30),
  ]),
  building('bakery', 'Bakery', 2470, 980, 370, 250, 'wood', 0xd8b06f, 0xd8c1aa, [{ x: 2466, y: 1082, width: 18, height: 72 }], [
    f('counter', 2506, 1018, 178, 34, true, 0.18),
    f('stove', 2704, 1016, 58, 46),
    f('table', 2530, 1100, 56, 44),
    f('chair', 2542, 1152, 34, 24),
    f('table', 2640, 1102, 56, 44),
    f('chair', 2706, 1112, 28, 34),
    f('cabinet', 2784, 1068, 36, 66),
  ]),
  building('inn', 'Inn', 750, 1460, 380, 260, 'wood', 0xcaa372, 0xd4c4ad, [{ x: 902, y: 1446, width: 76, height: 18 }], [
    f('bed', 780, 1500, 78, 48),
    f('bed', 1018, 1500, 78, 48),
    f('table', 890, 1562, 64, 48),
    f('chair', 906, 1618, 34, 24),
    f('cabinet', 1060, 1570, 44, 70),
    f('rug', 802, 1582, 90, 52, false),
  ]),
  building('postOffice', 'Post Office', 1960, 1460, 370, 250, 'tile', 0xe6c783, 0xd3b27c, [{ x: 2108, y: 1446, width: 76, height: 18 }], [
    f('counter', 2000, 1496, 174, 34, true, 0.18),
    f('desk', 2192, 1504, 58, 42),
    f('chair', 2258, 1512, 28, 34),
    f('cabinet', 2008, 1574, 50, 72),
    f('crate', 2088, 1590, 50, 40),
    f('table', 2200, 1592, 60, 44),
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

function rectCenter(rect: RectSpec): Vector2 {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

const farmBounds: RectSpec = { x: 2360, y: 1320, width: 610, height: 340 };

const NO_DECORATION_RECTS: RectSpec[] = [
  ...BUILDINGS.map((buildingSpec) => inflateRect(buildingSpec, 34)),
  { x: 640, y: 444, width: 1840, height: 124 },
  { x: 640, y: 1284, width: 1840, height: 124 },
  { x: 620, y: 440, width: 130, height: 1060 },
  { x: 2370, y: 440, width: 130, height: 1060 },
  { x: 715, y: 870, width: 1690, height: 126 },
  { x: 1496, y: 548, width: 134, height: 780 },
  { x: 1160, y: 1120, width: 800, height: 108 },
  { x: 1224, y: 1390, width: 676, height: 306 },
  { x: 1400, y: 1680, width: 340, height: 360 },
  { x: 0, y: 1680, width: GRID_WIDTH * CELL_SIZE, height: 360 },
  { x: farmBounds.x - 30, y: farmBounds.y - 30, width: farmBounds.width + 60, height: farmBounds.height + 60 },
];

function canPlaceProp(prop: PropSpec): boolean {
  const footprint = prop;
  if (footprint.x < 0 || footprint.y < 0 || footprint.x + footprint.width > GRID_WIDTH * CELL_SIZE || footprint.y + footprint.height > GRID_HEIGHT * CELL_SIZE) {
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
      const cluster = Math.floor(index / 3);
      const local = index % 5;
      const baseX = zone.x + 18 + ((cluster * 61 + zoneIndex * 47) % Math.max(24, zone.width - 70));
      const baseY = zone.y + 14 + ((cluster * 43 + zoneIndex * 29) % Math.max(24, zone.height - 82));
      const x = baseX + [0, 42, -34, 26, -22][local];
      const y = baseY + [0, 24, 38, -24, 54][local];
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
  const top = Array.from({ length: 48 }, (_, index) =>
    tree(18 + index * 64 + ((index * 17) % 19), 4 + ((index * 11) % 24), 48 + ((index * 5) % 12), 66 + ((index * 7) % 12)),
  );
  const left = Array.from({ length: 25 }, (_, index) =>
    tree(8 + ((index * 13) % 18), 95 + index * 66 + ((index * 7) % 22), 48 + ((index * 3) % 12), 66 + ((index * 5) % 12)),
  );
  const right = Array.from({ length: 25 }, (_, index) =>
    tree(3034 + ((index * 19) % 22), 95 + index * 66 + ((index * 5) % 22), 48 + ((index * 7) % 12), 66 + ((index * 3) % 12)),
  );
  return [...top, ...left, ...right];
}

function centralForestTrees(): PropSpec[] {
  const props: PropSpec[] = [];
  const park = { x: 900, y: 585, width: 1300, height: 660 };
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 15; col += 1) {
      if ((row * 7 + col * 5) % 6 === 0) {
        continue;
      }
      const x = park.x + 24 + col * 84 + ((row * 31 + col * 17) % 35) - 17;
      const y = park.y + 18 + row * 73 + ((row * 19 + col * 29) % 33) - 14;
      const candidate = tree(x, y, 44 + ((row + col) % 4) * 4, 62 + ((row * 2 + col) % 4) * 5);
      const center = rectCenter(candidate);
      const onWalkway =
        Math.abs(center.y - 930) < 66 ||
        Math.abs(center.x - 1560) < 66 ||
        (center.x > 1160 && center.x < 1980 && center.y > 1112 && center.y < 1238);
      if (!onWalkway) {
        props.push(candidate);
      }
    }
  }
  return props;
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
    if (y > 1430 && y < 1536) {
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
  const col = index % 9;
  const row = Math.floor(index / 9);
  const crops: HarvestablePlant['crop'][] = ['carrot', 'tomato', 'berry', 'pumpkin', 'apple'];
  const crop = crops[(index + row) % crops.length];
  return {
    id: `farm-plant-${index + 1}`,
    crop,
    itemId: crop,
    displayName: crop[0].toUpperCase() + crop.slice(1),
    x: 2440 + col * 54,
    y: 1370 + row * 58,
    width: 30,
    height: 30,
    harvested: false,
  };
});

export const PROPS: PropSpec[] = [
  { kind: 'fountain', x: 1510, y: 1500, width: 90, height: 76, blocksPath: true, collisionRect: { x: 1530, y: 1518, width: 50, height: 42 }, depthAnchorY: 1576 },
  { kind: 'notice', x: 2050, y: 1010, width: 42, height: 56, blocksPath: true, collisionRect: { x: 2062, y: 1038, width: 18, height: 24 }, depthAnchorY: 1066 },
  { kind: 'umbrella', x: 430, y: 1740, width: 72, height: 56, blocksPath: true, collisionRect: { x: 456, y: 1768, width: 18, height: 18 }, depthAnchorY: 1796 },
  { kind: 'umbrella', x: 2260, y: 1748, width: 72, height: 56, blocksPath: true, collisionRect: { x: 2286, y: 1776, width: 18, height: 18 }, depthAnchorY: 1804 },
  { kind: 'boat', x: 1840, y: 1900, width: 124, height: 46, blocksPath: true, collisionRect: { x: 1874, y: 1914, width: 58, height: 20 }, depthAnchorY: 1946 },
  { kind: 'crate', x: 1370, y: 1832, width: 46, height: 36, blocksPath: true, collisionRect: { x: 1382, y: 1842, width: 22, height: 16 }, depthAnchorY: 1868 },
  { kind: 'crate', x: 1700, y: 1850, width: 46, height: 36, blocksPath: true, collisionRect: { x: 1712, y: 1860, width: 22, height: 16 }, depthAnchorY: 1886 },
  { kind: 'fishingSpot', x: 1540, y: 1948, width: 76, height: 34, blocksPath: false, depthAnchorY: 1982 },
  ...filterPlaceable(borderTrees()),
  ...filterPlaceable(
    clusteredTrees(
      [
        { x: 1120, y: 86, width: 190, height: 330 },
        { x: 1684, y: 86, width: 170, height: 330 },
        { x: 2258, y: 86, width: 180, height: 340 },
        { x: 64, y: 360, width: 180, height: 260 },
        { x: 54, y: 910, width: 560, height: 150 },
        { x: 56, y: 1260, width: 560, height: 140 },
      ],
      7,
    ),
  ),
  ...Array.from({ length: 18 }, (_, index) => ({
    kind: 'fence' as const,
    x: 720 + index * 82,
    y: index % 2 === 0 ? 432 : 1410,
    width: 58,
    height: 18,
    blocksPath: false,
    depthAnchorY: index % 2 === 0 ? 450 : 1428,
  })),
  ...filterPlaceable(centralForestTrees()),
  ...filterPlaceable(
    bakedGroundDetails(
      [
        { x: 745, y: 575, width: 150, height: 720 },
        { x: 2225, y: 575, width: 150, height: 720 },
        { x: 660, y: 520, width: 1760, height: 1040 },
        { x: 70, y: 460, width: 540, height: 1060 },
        { x: 2500, y: 470, width: 430, height: 790 },
      ],
      28,
    ),
  ),
  ...farmFenceProps(),
  ...Array.from({ length: 28 }, (_, index) => ({
    kind: 'shell' as const,
    x: 120 + ((index * 211) % 2860),
    y: 1730 + ((index * 29) % 120),
    width: 18,
    height: 12,
    blocksPath: false,
    depthAnchorY: 1742 + ((index * 29) % 120),
  })),
];

export const LOCATION_ENTRANCES: Record<LocationId, GridPoint> = {
  home: worldToCell({ x: 400, y: 430 }),
  cafe: worldToCell({ x: 940, y: 430 }),
  clinic: worldToCell({ x: 1480, y: 430 }),
  library: worldToCell({ x: 2034, y: 442 }),
  school: worldToCell({ x: 2640, y: 480 }),
  restaurant: worldToCell({ x: 620, y: 770 }),
  studio: worldToCell({ x: 610, y: 1150 }),
  workshop: worldToCell({ x: 630, y: 1520 }),
  grocery: worldToCell({ x: 2420, y: 760 }),
  bakery: worldToCell({ x: 2420, y: 1118 }),
  farm: worldToCell({ x: 2368, y: 1488 }),
  inn: worldToCell({ x: 940, y: 1406 }),
  postOffice: worldToCell({ x: 2146, y: 1406 }),
  park: worldToCell({ x: 1560, y: 930 }),
  townSquare: worldToCell({ x: 1560, y: 1540 }),
  dock: worldToCell({ x: 1560, y: 1850 }),
};

export const LOCATION_TARGETS: Record<LocationId, GridPoint> = {
  home: worldToCell({ x: 404, y: 276 }),
  cafe: worldToCell({ x: 934, y: 286 }),
  clinic: worldToCell({ x: 1478, y: 294 }),
  library: worldToCell({ x: 2024, y: 264 }),
  school: worldToCell({ x: 2580, y: 360 }),
  restaurant: worldToCell({ x: 372, y: 810 }),
  studio: worldToCell({ x: 402, y: 1160 }),
  workshop: worldToCell({ x: 400, y: 1538 }),
  grocery: worldToCell({ x: 2610, y: 818 }),
  bakery: worldToCell({ x: 2608, y: 1168 }),
  farm: worldToCell({ x: 2630, y: 1490 }),
  inn: worldToCell({ x: 930, y: 1612 }),
  postOffice: worldToCell({ x: 2150, y: 1608 }),
  park: worldToCell({ x: 1560, y: 930 }),
  townSquare: worldToCell({ x: 1560, y: 1540 }),
  dock: worldToCell({ x: 1560, y: 1930 }),
};

export const COUNTER_ANCHORS: Partial<Record<LocationId, GridPoint>> = {
  cafe: worldToCell({ x: 895, y: 220 }),
  restaurant: worldToCell({ x: 286, y: 720 }),
  workshop: worldToCell({ x: 332, y: 1474 }),
  grocery: worldToCell({ x: 2600, y: 714 }),
  bakery: worldToCell({ x: 2595, y: 1080 }),
  postOffice: worldToCell({ x: 2086, y: 1554 }),
};

export const BUILDING_ACTIVITY_POINTS: Record<LocationId, GridPoint[]> = {
  home: [worldToCell({ x: 404, y: 276 }), worldToCell({ x: 496, y: 306 })],
  cafe: [worldToCell({ x: 895, y: 220 }), worldToCell({ x: 960, y: 304 }), worldToCell({ x: 840, y: 304 })],
  clinic: [worldToCell({ x: 1478, y: 294 }), worldToCell({ x: 1370, y: 300 }), worldToCell({ x: 1548, y: 280 })],
  library: [worldToCell({ x: 2024, y: 264 }), worldToCell({ x: 1900, y: 240 }), worldToCell({ x: 2144, y: 330 })],
  school: [worldToCell({ x: 2580, y: 360 }), worldToCell({ x: 2508, y: 334 }), worldToCell({ x: 2728, y: 332 })],
  restaurant: [worldToCell({ x: 372, y: 810 }), worldToCell({ x: 286, y: 720 }), worldToCell({ x: 470, y: 824 })],
  studio: [worldToCell({ x: 402, y: 1160 }), worldToCell({ x: 278, y: 1140 }), worldToCell({ x: 492, y: 1168 })],
  workshop: [worldToCell({ x: 400, y: 1538 }), worldToCell({ x: 332, y: 1474 }), worldToCell({ x: 492, y: 1548 })],
  grocery: [worldToCell({ x: 2610, y: 818 }), worldToCell({ x: 2600, y: 714 }), worldToCell({ x: 2740, y: 812 })],
  bakery: [worldToCell({ x: 2608, y: 1168 }), worldToCell({ x: 2595, y: 1080 }), worldToCell({ x: 2740, y: 1140 })],
  farm: [worldToCell({ x: 2630, y: 1490 }), worldToCell({ x: 2470, y: 1420 }), worldToCell({ x: 2800, y: 1540 })],
  inn: [worldToCell({ x: 930, y: 1612 }), worldToCell({ x: 842, y: 1568 }), worldToCell({ x: 1050, y: 1602 })],
  postOffice: [worldToCell({ x: 2150, y: 1608 }), worldToCell({ x: 2086, y: 1554 }), worldToCell({ x: 2240, y: 1586 })],
  park: [worldToCell({ x: 1560, y: 930 }), worldToCell({ x: 1220, y: 948 }), worldToCell({ x: 1880, y: 920 })],
  townSquare: [worldToCell({ x: 1560, y: 1540 }), worldToCell({ x: 1420, y: 1580 }), worldToCell({ x: 1700, y: 1580 })],
  dock: [worldToCell({ x: 1560, y: 1930 }), worldToCell({ x: 1450, y: 1848 }), worldToCell({ x: 1680, y: 1860 })],
};

export const ROAD_RECTS: RectSpec[] = [
  { x: 640, y: 460, width: 1840, height: 90 },
  { x: 640, y: 1300, width: 1840, height: 90 },
  { x: 640, y: 460, width: 90, height: 1020 },
  { x: 2390, y: 460, width: 90, height: 1020 },
  { x: 730, y: 888, width: 1660, height: 90 },
  { x: 1518, y: 550, width: 90, height: 750 },
  { x: 1180, y: 1138, width: 760, height: 70 },
  { x: 1180, y: 1390, width: 760, height: 90 },
  { x: 1500, y: 1480, width: 120, height: 270 },
  { x: 1480, y: 1690, width: 160, height: 250 },
  { x: 320, y: 390, width: 170, height: 90 },
  { x: 860, y: 390, width: 170, height: 90 },
  { x: 1400, y: 390, width: 170, height: 90 },
  { x: 1960, y: 390, width: 170, height: 90 },
  { x: 2580, y: 420, width: 170, height: 70 },
  { x: 570, y: 730, width: 160, height: 90 },
  { x: 560, y: 1110, width: 170, height: 90 },
  { x: 580, y: 1480, width: 170, height: 90 },
  { x: 2390, y: 720, width: 170, height: 90 },
  { x: 2390, y: 1080, width: 170, height: 90 },
  { x: 2330, y: 1450, width: 170, height: 90 },
  { x: 910, y: 1370, width: 90, height: 90 },
  { x: 2100, y: 1370, width: 90, height: 90 },
];

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
  return pointInRect(px, py, { x: 1410, y: 1770, width: 300, height: 270 });
}

function isRoadCell(x: number, y: number): boolean {
  const px = x * CELL_SIZE + CELL_SIZE / 2;
  const py = y * CELL_SIZE + CELL_SIZE / 2;
  return ROAD_RECTS.some((rect) => pointInRect(px, py, rect));
}

function isCentralForestCell(x: number, y: number): boolean {
  return x >= 44 && x <= 112 && y >= 28 && y <= 64;
}

function tileTypeAt(x: number, y: number): TileType {
  if (isDockCell(x, y)) return 'dock';
  if (y >= 93) return 'water';
  if (y >= 85) return 'sand';
  if (x >= 62 && x <= 94 && y >= 71 && y <= 84) return 'plaza';
  if (isRoadCell(x, y)) return 'road';
  if (isCentralForestCell(x, y)) return 'park';
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
