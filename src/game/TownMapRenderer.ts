import Phaser from 'phaser';
import { assetManifest } from '../assets/manifest';
import {
  BUILDINGS,
  CELL_SIZE,
  BEACH_Y,
  DOCK_RECTS,
  FARM_BOUNDS,
  GRID_HEIGHT,
  GRID_WIDTH,
  OCEAN_Y,
  OPEN_LAKE_OVALS,
  PROPS,
  ROAD_RECTS,
  TOWN_GRID,
  type FloorPlanBuildingSpec,
  type FurnitureSpec,
  type PropSpec,
} from '../data/townGrid';

const WORLD_WIDTH = GRID_WIDTH * CELL_SIZE;
const WORLD_HEIGHT = GRID_HEIGHT * CELL_SIZE;
const BAKE_CHUNK_SIZE = 2048;

const TILE_COLORS = {
  grass: 0x8fe678,
  road: 0xeed087,
  plaza: 0xd8c492,
  park: 0xaee98a,
  sand: 0xf2dc9c,
  water: 0x45a9c2,
  dock: 0xb77d48,
} as const;

type StaticBakeObject = Phaser.GameObjects.GameObject & { depth: number };

export class TownMapRenderer {
  private gridLayer?: Phaser.GameObjects.Graphics;
  private obstacleLayer?: Phaser.GameObjects.Graphics;
  private readonly staticBakeChunks: Phaser.GameObjects.RenderTexture[] = [];
  private readonly staticObjects: StaticBakeObject[] = [];
  private readonly mapLabels: Phaser.GameObjects.Text[] = [];
  private lastShowGrid = false;
  private lastShowObstacles = false;
  private labelsVisible = true;

  constructor(private readonly scene: Phaser.Scene) {}

  render(): void {
    this.rebuildStaticBake();
    this.drawAnimatedWaterWaves();
    this.drawLabels();
  }

  rebuildStaticBake(): void {
    for (const chunk of this.staticBakeChunks) {
      chunk.destroy();
    }
    this.staticBakeChunks.length = 0;
    for (const object of this.staticObjects) {
      object.destroy();
    }
    this.staticObjects.length = 0;

    this.drawGround();
    this.drawRoadsAndPlaza();
    this.drawOpenWorldLake();
    this.drawFarmLand();
    this.drawCoastDock();
    this.drawFloorPlans();
    this.drawOutdoorProps();
    this.drawLightingOverlay();
    this.bakeStaticObjects();
  }

  setDebug(showGrid: boolean, showObstacles: boolean): void {
    if (showGrid && !this.gridLayer) {
      this.createGridLayer();
    }
    if (showObstacles && !this.obstacleLayer) {
      this.createObstacleLayer();
    }

    if (showGrid !== this.lastShowGrid) {
      this.gridLayer?.setVisible(showGrid);
      this.lastShowGrid = showGrid;
    }
    if (showObstacles !== this.lastShowObstacles) {
      this.obstacleLayer?.setVisible(showObstacles);
      this.lastShowObstacles = showObstacles;
    }
  }

  setLabelVisibility(cameraZoom: number): void {
    const visible = cameraZoom >= 0.75;
    if (visible === this.labelsVisible) {
      return;
    }

    this.labelsVisible = visible;
    for (const label of this.mapLabels) {
      label.setVisible(visible);
    }
  }

  private addStaticGraphics(depth: number): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    graphics.setDepth(depth);
    this.staticObjects.push(graphics);
    return graphics;
  }

  private addStaticImage(x: number, y: number, texture: string, frame?: string | number): Phaser.GameObjects.Image {
    const image = this.scene.add.image(x, y, texture, frame);
    this.staticObjects.push(image);
    return image;
  }

  private rpgFrame(name: keyof typeof assetManifest.map.rpgFrames): number {
    return assetManifest.map.rpgFrames[name];
  }

  private addRpgTile(
    frame: keyof typeof assetManifest.map.rpgFrames,
    x: number,
    y: number,
    size = CELL_SIZE,
    depth = 1,
    alpha = 1,
  ): Phaser.GameObjects.Image {
    const image = this.addStaticImage(x + size / 2, y + size / 2, assetManifest.tiles.roguelikeRpgSheet, this.rpgFrame(frame));
    image.setDisplaySize(size, size);
    image.setDepth(depth);
    image.setAlpha(alpha);
    image.setOrigin(0.5);
    return image;
  }

  private stampTileRect(
    rect: { x: number; y: number; width: number; height: number },
    frame: keyof typeof assetManifest.map.rpgFrames,
    size: number,
    depth: number,
    alpha = 1,
    skipEvery = 0,
  ): void {
    for (let y = rect.y; y < rect.y + rect.height; y += size) {
      for (let x = rect.x; x < rect.x + rect.width; x += size) {
        if (skipEvery > 0 && (Math.floor(x / size) + Math.floor(y / size)) % skipEvery === 0) {
          continue;
        }
        this.addRpgTile(frame, x, y, size, depth, alpha);
      }
    }
  }

  private bakeStaticObjects(): void {
    const objects = [...this.staticObjects].sort((a, b) => a.depth - b.depth);
    for (let y = 0; y < WORLD_HEIGHT; y += BAKE_CHUNK_SIZE) {
      for (let x = 0; x < WORLD_WIDTH; x += BAKE_CHUNK_SIZE) {
        const width = Math.min(BAKE_CHUNK_SIZE, WORLD_WIDTH - x);
        const height = Math.min(BAKE_CHUNK_SIZE, WORLD_HEIGHT - y);
        const renderTexture = this.scene.add.renderTexture(x, y, width, height);
        renderTexture.setOrigin(0);
        renderTexture.setDepth(0);
        for (const object of objects) {
          renderTexture.draw(object, -x, -y);
        }
        this.staticBakeChunks.push(renderTexture);
      }
    }

    for (const object of objects) {
      object.destroy();
    }

    this.staticObjects.length = 0;
  }

  private drawGround(): void {
    const graphics = this.addStaticGraphics(0);
    graphics.fillStyle(0x7fda62, 1);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    graphics.fillStyle(0x9de174, 0.32);
    graphics.fillEllipse(1700, 900, 1700, 950);
    graphics.fillEllipse(3660, 1080, 1800, 900);
    graphics.fillEllipse(2140, 2350, 2200, 900);

    graphics.fillStyle(TILE_COLORS.sand, 0.96);
    graphics.fillRoundedRect(0, BEACH_Y, WORLD_WIDTH, OCEAN_Y - BEACH_Y + 36, 22);
    graphics.fillStyle(0xffefb4, 0.46);
    graphics.fillRoundedRect(0, BEACH_Y - 18, WORLD_WIDTH, 64, 24);

    graphics.fillStyle(TILE_COLORS.water, 1);
    graphics.fillRect(0, OCEAN_Y, WORLD_WIDTH, WORLD_HEIGHT - OCEAN_Y);
    graphics.fillStyle(0x63c0cf, 0.34);
    graphics.fillRoundedRect(0, OCEAN_Y + 34, WORLD_WIDTH, 110, 20);

    this.stampTileRect({ x: 0, y: 0, width: WORLD_WIDTH, height: BEACH_Y - 40 }, 'grass', 80, 1, 0.18, 5);
    this.stampTileRect({ x: 0, y: BEACH_Y, width: WORLD_WIDTH, height: OCEAN_Y - BEACH_Y }, 'sand', 60, 1, 0.42, 4);
    this.stampTileRect({ x: 0, y: OCEAN_Y, width: WORLD_WIDTH, height: WORLD_HEIGHT - OCEAN_Y }, 'water', 80, 1, 0.34, 4);

    for (let i = 0; i < 1250; i += 1) {
      const gx = (i * 47 + 13) % GRID_WIDTH;
      const gy = (i * 71 + 19) % Math.floor((BEACH_Y - 80) / CELL_SIZE);
      this.drawGrassTexture(graphics, gx * CELL_SIZE, gy * CELL_SIZE, gx, gy);
    }

    for (let i = 0; i < 260; i += 1) {
      const gx = (i * 37 + 5) % GRID_WIDTH;
      const gy = Math.floor(BEACH_Y / CELL_SIZE) + ((i * 17 + 3) % 9);
      this.drawSandTexture(graphics, gx * CELL_SIZE, gy * CELL_SIZE, gx, gy);
    }
  }

  private drawRoadsAndPlaza(): void {
    const graphics = this.addStaticGraphics(1);

    graphics.fillStyle(0xf6d98c, 0.32);
    for (const rect of ROAD_RECTS) {
      graphics.fillRoundedRect(rect.x - 12, rect.y - 12, rect.width + 24, rect.height + 24, 28);
    }

    graphics.fillStyle(0xc78748, 0.92);
    for (const rect of ROAD_RECTS) {
      graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 24);
      this.stampTileRect(rect, rect.width > 250 || rect.height > 250 ? 'dirt' : 'gravel', 44, 2, 0.32, 3);
    }

    graphics.fillStyle(TILE_COLORS.plaza, 0.98);
    graphics.fillRoundedRect(2320, 1710, 760, 290, 28);
    this.stampTileRect({ x: 2340, y: 1730, width: 720, height: 250 }, 'stone', 48, 2, 0.36, 4);

    graphics.lineStyle(5, 0x8d642f, 0.22);
    for (const rect of ROAD_RECTS) {
      graphics.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 24);
    }

    graphics.fillStyle(0xa66b36, 0.22);
    for (let x = 460; x < 4300; x += 118) {
      graphics.fillRoundedRect(x, 878, 46, 6, 4);
      graphics.fillRoundedRect(x + 40, 2720, 52, 6, 4);
    }
    for (let y = 970; y < 2660; y += 106) {
      graphics.fillRoundedRect(562, y, 7, 46, 4);
      graphics.fillRoundedRect(4148, y + 24, 7, 46, 4);
    }
  }

  private drawOpenWorldLake(): void {
    const graphics = this.addStaticGraphics(2);

    graphics.fillStyle(0x6bc25d, 0.28);
    graphics.fillEllipse(2050, 1210, 2100, 1240);
    graphics.fillStyle(0xd0aa68, 0.52);
    for (const oval of OPEN_LAKE_OVALS) {
      graphics.fillEllipse(oval.x, oval.y, oval.radiusX * 2 + 44, oval.radiusY * 2 + 42);
    }
    graphics.fillStyle(0x4db5c9, 0.98);
    for (const oval of OPEN_LAKE_OVALS) {
      graphics.fillEllipse(oval.x, oval.y, oval.radiusX * 2, oval.radiusY * 2);
    }
    graphics.fillStyle(0x9be3ee, 0.38);
    graphics.fillEllipse(1880, 1090, 520, 92);
    graphics.fillEllipse(2340, 1294, 360, 70);
    graphics.fillEllipse(1620, 1460, 260, 54);

    this.stampTileRect({ x: 1380, y: 860, width: 1320, height: 760 }, 'waterLight', 80, 3, 0.28, 3);
    ['lily', 'rock', 'rock', 'lily'].forEach((frame, index) => {
      const positions = [
        { x: 1970, y: 1070 },
        { x: 2260, y: 1160 },
        { x: 1660, y: 1330 },
        { x: 2380, y: 1390 },
      ];
      const position = positions[index];
      this.addRpgTile(frame as keyof typeof assetManifest.map.rpgFrames, position.x, position.y, 34, 5, 0.9);
    });
  }

  private drawFarmLand(): void {
    const graphics = this.addStaticGraphics(3);
    const bounds = FARM_BOUNDS;

    graphics.fillStyle(0x6ebf57, 0.22);
    graphics.fillRoundedRect(bounds.x - 28, bounds.y - 26, bounds.width + 56, bounds.height + 52, 34);
    graphics.fillStyle(0xd5aa63, 0.98);
    graphics.fillRoundedRect(bounds.x + 18, bounds.y + 24, bounds.width - 54, bounds.height - 52, 18);
    graphics.fillStyle(0xc18c47, 0.32);
    for (let y = bounds.y + 72; y < bounds.y + bounds.height - 64; y += 86) {
      graphics.fillRoundedRect(bounds.x + 58, y, bounds.width - 126, 20, 10);
      graphics.lineStyle(2, 0x8f5f31, 0.24);
      graphics.lineBetween(bounds.x + 68, y + 10, bounds.x + bounds.width - 78, y + 10);
    }

    graphics.fillStyle(0xf3dd9b, 0.95);
    graphics.fillRoundedRect(bounds.x - 12, bounds.y + 220, 84, 90, 28);
    graphics.fillStyle(0x79553b, 0.25);
    graphics.fillRoundedRect(bounds.x + 24, bounds.y + 240, 8, 52, 4);

  }

  private drawCoastDock(): void {
    const graphics = this.addStaticGraphics(2);

    graphics.fillStyle(0x4db5c9, 0.86);
    graphics.fillRect(0, OCEAN_Y, WORLD_WIDTH, WORLD_HEIGHT - OCEAN_Y);
    graphics.fillStyle(0x9be3ee, 0.48);
    for (let x = 18; x < WORLD_WIDTH; x += 96) {
      graphics.fillRoundedRect(x, OCEAN_Y + 48, 46, 4, 3);
      graphics.fillRoundedRect(x + 42, OCEAN_Y + 106, 74, 4, 3);
      graphics.fillRoundedRect(x + 8, OCEAN_Y + 168, 58, 4, 3);
    }
    graphics.fillStyle(0xe8c982, 0.94);
    graphics.fillRoundedRect(0, BEACH_Y, WORLD_WIDTH, OCEAN_Y - BEACH_Y + 12, 24);
    graphics.fillStyle(0xf7e6ae, 0.48);
    graphics.fillRoundedRect(0, BEACH_Y - 22, WORLD_WIDTH, 48, 20);
    graphics.fillStyle(0xd2b36e, 0.26);
    for (let x = 24; x < WORLD_WIDTH; x += 92) {
      graphics.fillRoundedRect(x, BEACH_Y + 70, 24, 5, 4);
      graphics.fillRoundedRect(x + 44, BEACH_Y + 130, 34, 5, 4);
    }

    graphics.fillStyle(0x111827, 0.14);
    graphics.fillRoundedRect(650, 2990, 420, 110, 6);
    graphics.fillRoundedRect(760, 2860, 180, 500, 6);
    graphics.fillStyle(TILE_COLORS.dock, 1);
    for (const rect of DOCK_RECTS) {
      graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 6);
      this.stampTileRect(rect, 'plank', 40, 4, 0.38, 0);
    }

    graphics.fillStyle(0x8f5e37, 0.72);
    for (let x = 668; x < 1060; x += 30) {
      graphics.fillRoundedRect(x, 2998, 9, 350, 4);
    }
    graphics.lineStyle(3, 0x6f482b, 0.62);
    graphics.lineBetween(660, 3038, 1060, 3038);
    graphics.lineBetween(786, 2910, 914, 2910);
    graphics.lineBetween(786, 3140, 914, 3140);
  }

  private drawAnimatedWaterWaves(): void {
    const waveLayer = this.scene.add.graphics();
    waveLayer.setDepth(3);
    waveLayer.fillStyle(0xd5f9ff, 0.42);
    for (let x = -120; x < WORLD_WIDTH + 160; x += 120) {
      waveLayer.fillRoundedRect(x, OCEAN_Y + 56, 48, 4, 3);
      waveLayer.fillRoundedRect(x + 52, OCEAN_Y + 104, 76, 4, 3);
      waveLayer.fillRoundedRect(x + 16, OCEAN_Y + 162, 58, 4, 3);
    }

    this.scene.tweens.add({
      targets: waveLayer,
      x: -120,
      duration: 4200,
      repeat: -1,
      ease: 'Linear',
    });
  }

  private drawFloorPlans(): void {
    for (const building of BUILDINGS) {
      this.drawBuildingFloor(building);
      this.drawFurnitureSet(building);
    }
  }

  private drawBuildingFloor(building: FloorPlanBuildingSpec): void {
    const graphics = this.addStaticGraphics(20);

    graphics.fillStyle(0x172033, 0.15);
    graphics.fillRoundedRect(building.x + 10, building.y + 12, building.width, building.height, 12);

    graphics.fillStyle(building.floorColor, 1);
    graphics.fillRoundedRect(building.x, building.y, building.width, building.height, 10);
    this.drawFloorPattern(graphics, building);

    graphics.fillStyle(0x111827, 0.08);
    graphics.fillRect(
      building.x + building.wallThickness,
      building.y + building.wallThickness,
      building.width - building.wallThickness * 2,
      16,
    );
    graphics.fillRect(
      building.x + building.wallThickness,
      building.y + building.wallThickness,
      14,
      building.height - building.wallThickness * 2,
    );

    graphics.fillStyle(building.wallColor, 1);
    graphics.fillRect(building.x, building.y, building.width, building.wallThickness);
    graphics.fillRect(building.x, building.y + building.height - building.wallThickness, building.width, building.wallThickness);
    graphics.fillRect(building.x, building.y, building.wallThickness, building.height);
    graphics.fillRect(building.x + building.width - building.wallThickness, building.y, building.wallThickness, building.height);

    for (const door of building.doors) {
      graphics.fillStyle(building.floorColor, 1);
      graphics.fillRect(door.x, door.y, door.width, door.height);
      graphics.lineStyle(3, 0x8f7a5f, 0.4);
      if (door.width > door.height) {
        graphics.lineBetween(door.x + 4, door.y + door.height / 2, door.x + door.width - 4, door.y + door.height / 2);
      } else {
        graphics.lineBetween(door.x + door.width / 2, door.y + 4, door.x + door.width / 2, door.y + door.height - 4);
      }
    }

    graphics.lineStyle(2, 0xffffff, 0.34);
    graphics.strokeRoundedRect(building.x + 2, building.y + 2, building.width - 4, building.height - 4, 8);
    graphics.lineStyle(2, 0x5f6471, 0.28);
    graphics.strokeRoundedRect(building.x, building.y, building.width, building.height, 10);
  }

  private drawFloorPattern(graphics: Phaser.GameObjects.Graphics, building: FloorPlanBuildingSpec): void {
    if (building.floorStyle === 'wood') {
      graphics.lineStyle(1, 0x8d6840, 0.22);
      for (let y = building.y + 24; y < building.y + building.height - 12; y += 12) {
        graphics.lineBetween(building.x + 16, y, building.x + building.width - 16, y);
      }
      graphics.lineStyle(1, 0xf4d69c, 0.18);
      for (let x = building.x + 28; x < building.x + building.width - 16; x += 52) {
        graphics.lineBetween(x, building.y + 16, x, building.y + building.height - 16);
      }
      return;
    }

    if (building.floorStyle === 'tile' || building.floorStyle === 'schoolTile') {
      graphics.lineStyle(1, building.floorStyle === 'schoolTile' ? 0x94a995 : 0xb68052, 0.24);
      for (let x = building.x + 22; x < building.x + building.width; x += 34) {
        graphics.lineBetween(x, building.y + 14, x, building.y + building.height - 14);
      }
      for (let y = building.y + 22; y < building.y + building.height; y += 34) {
        graphics.lineBetween(building.x + 14, y, building.x + building.width - 14, y);
      }
      return;
    }

    graphics.fillStyle(0xa98165, 0.16);
    graphics.fillRoundedRect(building.x + 28, building.y + 36, building.width - 56, building.height - 74, 14);
  }

  private drawFurnitureSet(building: FloorPlanBuildingSpec): void {
    const furnitureByDepth = new Map<number, FurnitureSpec[]>();
    for (const item of building.furniture) {
      const depthBucket = Math.round(item.depthAnchorY / 80) * 80;
      const bucket = furnitureByDepth.get(depthBucket) ?? [];
      bucket.push(item);
      furnitureByDepth.set(depthBucket, bucket);
    }

    for (const [depth, items] of furnitureByDepth) {
      const graphics = this.addStaticGraphics(depth);
      for (const item of items) {
        this.drawFurniture(graphics, item);
      }
    }
  }

  private drawFurniture(graphics: Phaser.GameObjects.Graphics, item: FurnitureSpec): void {
    if (item.kind !== 'rug' && item.kind !== 'blackboard' && item.kind !== 'plant') {
      graphics.fillStyle(0x111827, 0.14);
      graphics.fillRoundedRect(item.x + 4, item.y + 5, item.width, item.height, 6);
    }

    if (item.kind === 'bed') {
      graphics.fillStyle(0x7aa6c9, 1);
      graphics.fillRoundedRect(item.x, item.y, item.width, item.height, 7);
      graphics.fillStyle(0xeaf3f8, 1);
      graphics.fillRoundedRect(item.x + 8, item.y + 8, 24, item.height - 16, 5);
      graphics.fillStyle(0xd9edf6, 1);
      graphics.fillRoundedRect(item.x + 38, item.y + 10, item.width - 46, item.height - 20, 6);
      return;
    }

    if (item.kind === 'table') {
      graphics.fillStyle(item.color ?? 0xa06a3c, 1);
      graphics.fillRoundedRect(item.x, item.y, item.width, item.height, 9);
      graphics.fillStyle(0xd2a66b, 0.9);
      graphics.fillRoundedRect(item.x + 7, item.y + 7, item.width - 14, item.height - 14, 7);
      return;
    }

    if (item.kind === 'chair') {
      graphics.fillStyle(item.color ?? 0xd3a447, 1);
      graphics.fillRoundedRect(item.x, item.y, item.width, item.height, 5);
      graphics.fillStyle(0x8f6235, 0.85);
      graphics.fillRect(item.x + 5, item.y + item.height - 5, item.width - 10, 3);
      return;
    }

    if (item.kind === 'cabinet' || item.kind === 'counter' || item.kind === 'desk' || item.kind === 'crate') {
      const baseColor = item.kind === 'counter' ? 0x7e5636 : item.kind === 'desk' ? 0x8e663f : 0x71523b;
      graphics.fillStyle(baseColor, 1);
      graphics.fillRoundedRect(item.x, item.y, item.width, item.height, 5);
      graphics.fillStyle(0xe1c08b, item.kind === 'counter' ? 0.92 : 0.72);
      graphics.fillRoundedRect(item.x + 7, item.y + 6, item.width - 14, Math.max(8, item.height / 3), 4);
      if (item.kind === 'counter') {
        graphics.fillStyle(0x2d3748, 0.85);
        graphics.fillRoundedRect(item.x + item.width - 34, item.y + 6, 24, 18, 5);
      }
      return;
    }

    if (item.kind === 'bookshelf') {
      graphics.fillStyle(0x76502f, 1);
      graphics.fillRoundedRect(item.x, item.y, item.width, item.height, 5);
      const bookColors = [0xd56b5f, 0x4e7fc0, 0xe0c463, 0x5ea66c, 0x8b6bb7];
      for (let x = item.x + 7; x < item.x + item.width - 7; x += 10) {
        graphics.fillStyle(bookColors[Math.abs(x + item.y) % bookColors.length], 1);
        graphics.fillRect(x, item.y + 8, 6, item.height - 16);
      }
      return;
    }

    if (item.kind === 'blackboard') {
      graphics.fillStyle(0x35593d, 1);
      graphics.fillRoundedRect(item.x, item.y, item.width, item.height, 5);
      graphics.fillStyle(0xdcead7, 0.8);
      graphics.fillRect(item.x + 14, item.y + 11, item.width - 28, 3);
      return;
    }

    if (item.kind === 'stove') {
      graphics.fillStyle(0x444b55, 1);
      graphics.fillRoundedRect(item.x, item.y, item.width, item.height, 5);
      graphics.fillStyle(0x121822, 0.92);
      graphics.fillCircle(item.x + 14, item.y + 14, 6);
      graphics.fillCircle(item.x + item.width - 14, item.y + 14, 6);
      graphics.fillStyle(0xbec6d2, 1);
      graphics.fillRect(item.x + 8, item.y + item.height - 13, item.width - 16, 5);
      return;
    }

    if (item.kind === 'rug') {
      graphics.fillStyle(0xb95f5b, 0.72);
      graphics.fillRoundedRect(item.x, item.y, item.width, item.height, 10);
      graphics.lineStyle(2, 0xf3d0a9, 0.68);
      graphics.strokeRoundedRect(item.x + 7, item.y + 7, item.width - 14, item.height - 14, 8);
      return;
    }

    if (item.kind === 'plant') {
      graphics.fillStyle(0x23422e, 0.16);
      graphics.fillEllipse(item.x + item.width / 2 + 3, item.y + item.height - 3, item.width, 10);
      graphics.fillStyle(0x6b4a2d, 1);
      graphics.fillRoundedRect(item.x + 5, item.y + 14, item.width - 10, 12, 3);
      graphics.fillStyle(0x3f9d56, 1);
      graphics.fillCircle(item.x + item.width / 2, item.y + 10, 10);
      graphics.fillStyle(0x68bd67, 0.9);
      graphics.fillCircle(item.x + 6, item.y + 14, 6);
      graphics.fillCircle(item.x + item.width - 6, item.y + 14, 6);
    }
  }

  private drawOutdoorProps(): void {
    for (const prop of PROPS) {
      const texture = this.textureForProp(prop);
      if (texture && this.scene.textures.exists(texture.key)) {
        const image = this.addStaticImage(prop.x + prop.width / 2, prop.y + prop.height / 2, texture.key, texture.frame);
        image.setDisplaySize(prop.width, prop.height);
        image.setDepth(prop.depthAnchorY ?? prop.y + prop.height);
        continue;
      }

      const graphics = this.addStaticGraphics(prop.depthAnchorY ?? prop.y + prop.height);
      this.drawProp(graphics, prop);
    }
  }

  private textureForProp(prop: PropSpec): { key: string; frame?: string | number } | undefined {
    if (prop.kind === 'tree') return { key: assetManifest.tiles.roguelikeRpgSheet, frame: (prop.x + prop.y) % 3 === 0 ? this.rpgFrame('treePine') : this.rpgFrame('treeRound') };
    if (prop.kind === 'flowers') return { key: assetManifest.tiles.roguelikeRpgSheet, frame: (prop.x + prop.y) % 2 === 0 ? this.rpgFrame('flowersRed') : this.rpgFrame('flowersWhite') };
    if (prop.kind === 'grass') return { key: assetManifest.tiles.roguelikeRpgSheet, frame: this.rpgFrame('grassTuft') };
    if (prop.kind === 'fence') return { key: assetManifest.tiles.roguelikeRpgSheet, frame: prop.width >= prop.height ? this.rpgFrame('fenceHorizontal') : this.rpgFrame('fenceVertical') };
    if (prop.kind === 'rock') return { key: assetManifest.tiles.roguelikeRpgSheet, frame: this.rpgFrame('rock') };
    if (prop.kind === 'notice') return { key: assetManifest.tiles.roguelikeRpgSheet, frame: this.rpgFrame('sign') };
    if (prop.kind === 'crate') return { key: assetManifest.tiles.roguelikeRpgSheet, frame: this.rpgFrame('crate') };
    if (prop.kind === 'crop') {
      const crop = prop.label ?? 'carrot';
      const frameByCrop: Record<string, keyof typeof assetManifest.map.rpgFrames> = {
        carrot: 'cropCarrot',
        tomato: 'cropTomato',
        berry: 'cropBerry',
        pumpkin: 'cropPumpkin',
        apple: 'cropApple',
      };
      return { key: assetManifest.tiles.roguelikeRpgSheet, frame: this.rpgFrame(frameByCrop[crop] ?? 'cropCarrot') };
    }
    if (prop.kind === 'boat') return { key: 'kenney-boat' };
    return undefined;
  }

  private drawProp(graphics: Phaser.GameObjects.Graphics, prop: PropSpec): void {
    if (prop.kind === 'tree') {
      graphics.fillStyle(0x172033, 0.13);
      graphics.fillEllipse(prop.x + prop.width / 2 + 3, prop.y + prop.height - 8, prop.width * 0.75, 16);
      graphics.fillStyle(0x7d5633, 1);
      graphics.fillRoundedRect(prop.x + prop.width / 2 - 5, prop.y + prop.height / 2, 10, prop.height / 2, 3);
      graphics.fillStyle(0x2c7f48, 1);
      graphics.fillCircle(prop.x + prop.width / 2, prop.y + 22, 22);
      graphics.fillStyle(0x53a962, 0.94);
      graphics.fillCircle(prop.x + 13, prop.y + 34, 16);
      graphics.fillCircle(prop.x + prop.width - 12, prop.y + 35, 16);
      graphics.fillStyle(0x8ed072, 0.55);
      graphics.fillCircle(prop.x + prop.width / 2 - 8, prop.y + 14, 6);
      return;
    }

    if (prop.kind === 'bench') {
      graphics.fillStyle(0x111827, 0.12);
      graphics.fillRoundedRect(prop.x + 4, prop.y + 8, prop.width, prop.height, 4);
      graphics.fillStyle(0x8f5d36, 1);
      graphics.fillRoundedRect(prop.x, prop.y, prop.width, 10, 4);
      graphics.fillRoundedRect(prop.x + 8, prop.y + 20, prop.width - 16, 10, 4);
      return;
    }

    if (prop.kind === 'pond') {
      graphics.fillStyle(0x275465, 0.14);
      graphics.fillEllipse(prop.x + prop.width / 2 + 4, prop.y + prop.height / 2 + 6, prop.width, prop.height);
      graphics.fillStyle(0x6bb9c3, 0.92);
      graphics.fillEllipse(prop.x + prop.width / 2, prop.y + prop.height / 2, prop.width, prop.height);
      graphics.lineStyle(3, 0x3c8e95, 0.45);
      graphics.strokeEllipse(prop.x + prop.width / 2, prop.y + prop.height / 2, prop.width - 8, prop.height - 8);
      graphics.fillStyle(0xd9f7f7, 0.62);
      graphics.fillEllipse(prop.x + prop.width / 2 - 10, prop.y + prop.height / 2 - 7, prop.width * 0.38, prop.height * 0.18);
      return;
    }

    if (prop.kind === 'campfire') {
      graphics.fillStyle(0x482d1a, 0.2);
      graphics.fillEllipse(prop.x + prop.width / 2, prop.y + prop.height - 4, prop.width, 15);
      graphics.fillStyle(0x77512f, 1);
      graphics.fillRoundedRect(prop.x + 8, prop.y + 25, prop.width - 16, 7, 4);
      graphics.fillRoundedRect(prop.x + 15, prop.y + 15, 7, prop.height - 14, 4);
      graphics.fillStyle(0xffc857, 0.95);
      graphics.fillCircle(prop.x + prop.width / 2, prop.y + 18, 11);
      graphics.fillStyle(0xf26b38, 0.9);
      graphics.fillCircle(prop.x + prop.width / 2 + 3, prop.y + 20, 7);
      return;
    }

    if (prop.kind === 'notice') {
      graphics.fillStyle(0x5a3b24, 1);
      graphics.fillRoundedRect(prop.x + prop.width / 2 - 4, prop.y + 16, 8, prop.height - 12, 4);
      graphics.fillStyle(0xd9b778, 1);
      graphics.fillRoundedRect(prop.x, prop.y, prop.width, 28, 5);
      graphics.fillStyle(0x4b5563, 0.7);
      graphics.fillRect(prop.x + 7, prop.y + 9, prop.width - 14, 3);
      return;
    }

    if (prop.kind === 'fountain') {
      graphics.fillStyle(0x111827, 0.12);
      graphics.fillEllipse(prop.x + prop.width / 2 + 4, prop.y + prop.height / 2 + 7, prop.width, prop.height * 0.75);
      graphics.fillStyle(0x6fa9bf, 1);
      graphics.fillRoundedRect(prop.x, prop.y, prop.width, prop.height, 16);
      graphics.fillStyle(0xbfe7ef, 1);
      graphics.fillRoundedRect(prop.x + 14, prop.y + 12, prop.width - 28, prop.height - 24, 12);
      graphics.fillStyle(0x4f8da8, 1);
      graphics.fillCircle(prop.x + prop.width / 2, prop.y + prop.height / 2, 10);
      return;
    }

    if (prop.kind === 'umbrella') {
      graphics.fillStyle(0x111827, 0.12);
      graphics.fillEllipse(prop.x + prop.width / 2 + 4, prop.y + prop.height - 5, prop.width * 0.72, 14);
      graphics.fillStyle(0xe95545, 1);
      graphics.fillTriangle(prop.x, prop.y + 28, prop.x + prop.width / 2, prop.y, prop.x + prop.width, prop.y + 28);
      graphics.fillStyle(0xffffff, 0.82);
      graphics.fillTriangle(prop.x + 10, prop.y + 27, prop.x + prop.width / 2, prop.y + 3, prop.x + 36, prop.y + 28);
      graphics.fillStyle(0x805b35, 1);
      graphics.fillRoundedRect(prop.x + prop.width / 2 - 3, prop.y + 28, 6, prop.height - 22, 3);
      return;
    }

    if (prop.kind === 'flowers') {
      graphics.fillStyle(0x2f8f4e, 0.52);
      graphics.fillEllipse(prop.x + prop.width / 2, prop.y + prop.height - 6, prop.width * 0.7, 10);
      const colors = [0xf06292, 0xffd166, 0xb46ee6];
      for (let i = 0; i < 5; i += 1) {
        graphics.fillStyle(colors[i % colors.length], 0.88);
        graphics.fillCircle(prop.x + 7 + i * 7, prop.y + 7 + ((i * 3) % 8), 2.6);
      }
      return;
    }

    if (prop.kind === 'grass') {
      graphics.fillStyle(0x3c8e4f, 0.28);
      for (let i = 0; i < 5; i += 1) {
        const x = prop.x + 5 + i * 6;
        const y = prop.y + 10 + ((i * 5) % 7);
        graphics.fillTriangle(x, y + 7, x + 3, y - 3, x + 6, y + 7);
      }
      return;
    }

    if (prop.kind === 'crop') {
      const crop = prop.label ?? 'carrot';
      const colors: Record<string, number> = {
        carrot: 0xf97316,
        tomato: 0xef4444,
        berry: 0x8b5cf6,
        pumpkin: 0xf59e0b,
        apple: 0x22c55e,
      };
      graphics.fillStyle(0x2f7d42, 0.92);
      graphics.fillEllipse(prop.x + prop.width / 2, prop.y + prop.height / 2 + 5, prop.width * 0.9, prop.height * 0.72);
      graphics.fillStyle(colors[crop] ?? 0xf97316, 0.96);
      graphics.fillCircle(prop.x + prop.width / 2, prop.y + prop.height / 2, prop.width * 0.24);
      graphics.fillStyle(0xb7f7a4, 0.7);
      graphics.fillCircle(prop.x + prop.width / 2 - 5, prop.y + prop.height / 2 - 4, 3);
      return;
    }

    if (prop.kind === 'rock') {
      graphics.fillStyle(0x6b7280, 0.22);
      graphics.fillEllipse(prop.x + prop.width / 2 + 2, prop.y + prop.height - 3, prop.width, 8);
      graphics.fillStyle(0x9ca3af, 0.82);
      graphics.fillEllipse(prop.x + prop.width / 2, prop.y + prop.height / 2, prop.width * 0.78, prop.height * 0.72);
      graphics.fillStyle(0xd1d5db, 0.58);
      graphics.fillEllipse(prop.x + prop.width / 2 - 3, prop.y + prop.height / 2 - 3, prop.width * 0.28, prop.height * 0.18);
      return;
    }

    if (prop.kind === 'shell') {
      graphics.fillStyle(0xf6e7c5, 0.95);
      graphics.fillEllipse(prop.x + prop.width / 2, prop.y + prop.height / 2, prop.width, prop.height);
      graphics.lineStyle(1, 0xd0a970, 0.55);
      graphics.lineBetween(prop.x + prop.width / 2, prop.y + 2, prop.x + prop.width / 2, prop.y + prop.height - 2);
      return;
    }

    if (prop.kind === 'fence') {
      graphics.fillStyle(0x8f5d36, 0.95);
      graphics.fillRoundedRect(prop.x, prop.y + 5, prop.width, 6, 3);
      graphics.fillRoundedRect(prop.x + 4, prop.y, 7, prop.height, 3);
      graphics.fillRoundedRect(prop.x + prop.width - 11, prop.y, 7, prop.height, 3);
      return;
    }

    if (prop.kind === 'fishingSpot') {
      graphics.lineStyle(3, 0x6f482b, 0.8);
      graphics.lineBetween(prop.x + 12, prop.y + 6, prop.x + prop.width - 8, prop.y + prop.height - 6);
      graphics.fillStyle(0xe5e7eb, 0.9);
      graphics.fillCircle(prop.x + prop.width - 8, prop.y + prop.height - 6, 4);
      return;
    }

    graphics.fillStyle(prop.kind === 'mailbox' ? 0x3e6d8e : 0x9b6a3e, 1);
    graphics.fillRoundedRect(prop.x, prop.y, prop.width, prop.height, 5);
  }

  private drawGrassTexture(graphics: Phaser.GameObjects.Graphics, x: number, y: number, gx: number, gy: number): void {
    const seed = gx * 19 + gy * 31;
    graphics.fillStyle(seed % 2 === 0 ? 0x79cf64 : 0x6dc45f, 0.25);
    graphics.fillCircle(x + 5 + (seed % 8), y + 8, 2);
    graphics.fillCircle(x + 14, y + 14 - (seed % 5), 1.5);
    if (seed % 11 === 0) {
      graphics.fillStyle(0xf078a4, 0.68);
      graphics.fillCircle(x + 12, y + 7, 2);
    }
  }

  private drawSandTexture(graphics: Phaser.GameObjects.Graphics, x: number, y: number, gx: number, gy: number): void {
    const seed = gx * 17 + gy * 23;
    graphics.fillStyle(0xd3b878, 0.26);
    graphics.fillCircle(x + 4 + (seed % 10), y + 8, 1.5);
    graphics.fillCircle(x + 15, y + 14 - (seed % 4), 1.2);
  }

  private drawLabels(): void {
    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    for (const building of BUILDINGS) {
      const label = this.scene.add
        .text(building.label.x, building.label.y, building.label.text, {
          fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
          fontSize: '18px',
          color: '#253044',
          stroke: '#ffffff',
          strokeThickness: 3,
          backgroundColor: 'rgba(255,255,255,0.25)',
          padding: { left: 8, right: 8, top: 3, bottom: 3 },
        })
        .setResolution(resolution)
        .setDepth(120);
      this.mapLabels.push(label);
    }

    [
      { x: 1900, y: 820, text: 'Lakeside Park', color: '#275326' },
      { x: 2460, y: 1668, text: 'Town Square', color: '#3d3525' },
      { x: 3840, y: 2424, text: 'Farm', color: '#4d3516' },
      { x: 720, y: 2828, text: 'Beach / Dock', color: '#57391f' },
    ].forEach((label) => {
      const text = this.scene.add
        .text(label.x, label.y, label.text, {
          fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
          fontSize: '18px',
          color: label.color,
          stroke: '#ffffff',
          strokeThickness: 3,
          backgroundColor: 'rgba(255,255,255,0.25)',
          padding: { left: 8, right: 8, top: 3, bottom: 3 },
        })
        .setResolution(resolution)
        .setDepth(120);
      this.mapLabels.push(text);
    });
  }

  private drawLightingOverlay(): void {
    const graphics = this.addStaticGraphics(1500);
    graphics.fillStyle(0xfff2c2, 0.045);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    graphics.fillStyle(0xffffff, 0.055);
    graphics.fillEllipse(2500, 1580, 2900, 1700);
    graphics.fillStyle(0x142534, 0.07);
    graphics.fillRect(0, OCEAN_Y, WORLD_WIDTH, WORLD_HEIGHT - OCEAN_Y);
  }

  private createGridLayer(): void {
    this.gridLayer = this.scene.add.graphics();
    this.gridLayer.setDepth(5000);
    this.gridLayer.lineStyle(1, 0x1f2937, 0.12);

    for (let x = 0; x <= GRID_WIDTH; x += 1) {
      this.gridLayer.lineBetween(x * CELL_SIZE, 0, x * CELL_SIZE, GRID_HEIGHT * CELL_SIZE);
    }

    for (let y = 0; y <= GRID_HEIGHT; y += 1) {
      this.gridLayer.lineBetween(0, y * CELL_SIZE, GRID_WIDTH * CELL_SIZE, y * CELL_SIZE);
    }

    this.gridLayer.setVisible(false);
  }

  private createObstacleLayer(): void {
    this.obstacleLayer = this.scene.add.graphics();
    this.obstacleLayer.setDepth(5001);
    this.obstacleLayer.lineStyle(1, 0x7c2d12, 0.74);

    for (const row of TOWN_GRID) {
      for (const cell of row) {
        if (!cell.obstacle) {
          continue;
        }
        const x = cell.x * CELL_SIZE;
        const y = cell.y * CELL_SIZE;
        this.obstacleLayer.fillStyle(0xff4d2f, 0.18);
        this.obstacleLayer.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        this.obstacleLayer.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }

    this.obstacleLayer.setVisible(false);
  }
}
