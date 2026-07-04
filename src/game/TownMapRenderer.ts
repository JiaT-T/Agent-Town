import Phaser from 'phaser';
import {
  BUILDINGS,
  CELL_SIZE,
  GRID_HEIGHT,
  GRID_WIDTH,
  PROPS,
  ROAD_RECTS,
  TOWN_GRID,
  type FloorPlanBuildingSpec,
  type FurnitureSpec,
  type PropSpec,
} from '../data/townGrid';

const WORLD_WIDTH = GRID_WIDTH * CELL_SIZE;
const WORLD_HEIGHT = GRID_HEIGHT * CELL_SIZE;

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
  private staticBake?: Phaser.GameObjects.RenderTexture;
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
    this.staticBake?.destroy();
    for (const object of this.staticObjects) {
      object.destroy();
    }
    this.staticObjects.length = 0;

    this.drawGround();
    this.drawRoadsAndPlaza();
    this.drawCentralForest();
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

  private bakeStaticObjects(): void {
    const renderTexture = this.scene.add.renderTexture(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    renderTexture.setOrigin(0);
    renderTexture.setDepth(0);

    const objects = [...this.staticObjects].sort((a, b) => a.depth - b.depth);
    for (const object of objects) {
      renderTexture.draw(object);
      object.destroy();
    }

    this.staticObjects.length = 0;
    this.staticBake = renderTexture;
  }

  private drawGround(): void {
    const graphics = this.addStaticGraphics(0);
    graphics.fillStyle(TILE_COLORS.grass, 1);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    graphics.fillStyle(TILE_COLORS.park, 0.52);
    graphics.fillRoundedRect(790, 500, 1540, 820, 54);
    graphics.fillStyle(0x76d46d, 0.18);
    graphics.fillRoundedRect(70, 80, WORLD_WIDTH - 140, 1580, 90);

    graphics.fillStyle(TILE_COLORS.sand, 0.94);
    graphics.fillRoundedRect(0, 1690, WORLD_WIDTH, 190, 24);
    graphics.fillStyle(0xffefb4, 0.45);
    graphics.fillRoundedRect(0, 1700, WORLD_WIDTH, 70, 28);

    graphics.fillStyle(TILE_COLORS.water, 1);
    graphics.fillRect(0, 1860, WORLD_WIDTH, 180);
    graphics.fillStyle(0x63c0cf, 0.34);
    graphics.fillRoundedRect(0, 1890, WORLD_WIDTH, 76, 18);

    for (let i = 0; i < 520; i += 1) {
      const gx = (i * 47 + 13) % GRID_WIDTH;
      const gy = (i * 71 + 19) % 84;
      this.drawGrassTexture(graphics, gx * CELL_SIZE, gy * CELL_SIZE, gx, gy);
    }

    for (let i = 0; i < 140; i += 1) {
      const gx = (i * 37 + 5) % GRID_WIDTH;
      const gy = 85 + ((i * 17 + 3) % 8);
      this.drawSandTexture(graphics, gx * CELL_SIZE, gy * CELL_SIZE, gx, gy);
    }
  }

  private drawRoadsAndPlaza(): void {
    const graphics = this.addStaticGraphics(1);

    graphics.fillStyle(0xf7e0a2, 0.34);
    for (const rect of ROAD_RECTS) {
      graphics.fillRoundedRect(rect.x - 8, rect.y - 8, rect.width + 16, rect.height + 16, 22);
    }

    graphics.fillStyle(TILE_COLORS.road, 0.98);
    for (const rect of ROAD_RECTS) {
      graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 20);
    }

    graphics.fillStyle(TILE_COLORS.plaza, 0.98);
    graphics.fillRoundedRect(1248, 1420, 624, 260, 24);

    graphics.fillStyle(TILE_COLORS.dock, 0.98);
    graphics.fillRoundedRect(1480, 1808, 160, 230, 6);

    graphics.lineStyle(5, 0xc5a761, 0.26);
    graphics.strokeRoundedRect(640, 460, 1840, 930, 34);
    graphics.strokeRoundedRect(1248, 1420, 624, 260, 24);

    graphics.fillStyle(0xc7aa67, 0.24);
    for (let x = 700; x <= 2380; x += 96) {
      graphics.fillRoundedRect(x, 490, 42, 6, 4);
      graphics.fillRoundedRect(x + 34, 1338, 44, 6, 4);
    }
    for (let y = 520; y <= 1310; y += 86) {
      graphics.fillRoundedRect(674, y, 7, 44, 4);
      graphics.fillRoundedRect(2428, y + 18, 7, 44, 4);
    }
  }

  private drawCentralForest(): void {
    const graphics = this.addStaticGraphics(2);

    graphics.fillStyle(0x78cf67, 0.76);
    graphics.fillRoundedRect(880, 560, 1360, 720, 42);
    graphics.lineStyle(5, 0x5fab58, 0.34);
    graphics.strokeRoundedRect(892, 572, 1336, 696, 40);

    graphics.fillStyle(0xf2df9a, 0.9);
    graphics.fillRoundedRect(1040, 888, 1040, 90, 45);
    graphics.fillRoundedRect(1518, 590, 90, 610, 45);
    graphics.fillRoundedRect(1180, 1138, 760, 70, 35);
    graphics.fillStyle(0xd4bf78, 0.28);
    graphics.fillRoundedRect(1060, 926, 1000, 8, 5);
    graphics.fillRoundedRect(1558, 620, 8, 560, 5);

    graphics.fillStyle(0x6bbf5e, 0.26);
    graphics.fillEllipse(1230, 720, 360, 180);
    graphics.fillEllipse(1900, 760, 400, 190);
    graphics.fillEllipse(1600, 1150, 620, 170);
  }

  private drawFarmLand(): void {
    const graphics = this.addStaticGraphics(3);
    const bounds = { x: 2360, y: 1320, width: 610, height: 340 };

    graphics.fillStyle(0x6ebf57, 0.22);
    graphics.fillRoundedRect(bounds.x - 28, bounds.y - 26, bounds.width + 56, bounds.height + 52, 34);
    graphics.fillStyle(0xd5aa63, 0.98);
    graphics.fillRoundedRect(bounds.x + 18, bounds.y + 24, bounds.width - 54, bounds.height - 52, 18);
    graphics.fillStyle(0xc18c47, 0.32);
    for (let y = bounds.y + 52; y < bounds.y + bounds.height - 42; y += 58) {
      graphics.fillRoundedRect(bounds.x + 58, y, bounds.width - 126, 20, 10);
      graphics.lineStyle(2, 0x8f5f31, 0.24);
      graphics.lineBetween(bounds.x + 68, y + 10, bounds.x + bounds.width - 78, y + 10);
    }

    graphics.fillStyle(0xf3dd9b, 0.95);
    graphics.fillRoundedRect(bounds.x - 12, bounds.y + 138, 78, 76, 28);
    graphics.fillStyle(0x79553b, 0.25);
    graphics.fillRoundedRect(bounds.x + 22, bounds.y + 152, 8, 48, 4);

  }

  private drawCoastDock(): void {
    const graphics = this.addStaticGraphics(2);

    graphics.fillStyle(0x4db5c9, 0.86);
    graphics.fillRect(0, 1860, WORLD_WIDTH, 180);
    graphics.fillStyle(0x9be3ee, 0.48);
    for (let x = 18; x < WORLD_WIDTH; x += 96) {
      graphics.fillRoundedRect(x, 1908, 46, 4, 3);
      graphics.fillRoundedRect(x + 42, 1966, 74, 4, 3);
      graphics.fillRoundedRect(x + 8, 2018, 58, 4, 3);
    }
    graphics.fillStyle(0xe8c982, 0.94);
    graphics.fillRoundedRect(0, 1700, WORLD_WIDTH, 176, 24);
    graphics.fillStyle(0xf7e6ae, 0.48);
    graphics.fillRoundedRect(0, 1690, WORLD_WIDTH, 44, 20);
    graphics.fillStyle(0xd2b36e, 0.26);
    for (let x = 24; x < WORLD_WIDTH; x += 92) {
      graphics.fillRoundedRect(x, 1770, 24, 5, 4);
      graphics.fillRoundedRect(x + 44, 1830, 34, 5, 4);
    }

    graphics.fillStyle(0x111827, 0.14);
    graphics.fillRoundedRect(1398, 1778, 330, 56, 6);
    graphics.fillRoundedRect(1490, 1818, 140, 220, 6);
    graphics.fillStyle(TILE_COLORS.dock, 1);
    graphics.fillRoundedRect(1388, 1768, 350, 60, 6);
    graphics.fillRoundedRect(1480, 1808, 160, 230, 6);

    graphics.fillStyle(0x8f5e37, 0.72);
    for (let x = 1404; x < 1728; x += 26) {
      graphics.fillRoundedRect(x, 1774, 9, 254, 4);
    }
    graphics.lineStyle(3, 0x6f482b, 0.62);
    graphics.lineBetween(1396, 1798, 1730, 1798);
    graphics.lineBetween(1500, 1870, 1620, 1870);
    graphics.lineBetween(1500, 1950, 1620, 1950);
  }

  private drawAnimatedWaterWaves(): void {
    const waveLayer = this.scene.add.graphics();
    waveLayer.setDepth(3);
    waveLayer.fillStyle(0xd5f9ff, 0.42);
    for (let x = -120; x < WORLD_WIDTH + 160; x += 120) {
      waveLayer.fillRoundedRect(x, 1916, 48, 4, 3);
      waveLayer.fillRoundedRect(x + 52, 1960, 76, 4, 3);
      waveLayer.fillRoundedRect(x + 16, 2014, 58, 4, 3);
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
    if (prop.kind === 'crate') return { key: 'kenney-crate' };
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
      { x: 1420, y: 600, text: 'Forest Park', color: '#275326' },
      { x: 1390, y: 1392, text: 'Town Square', color: '#3d3525' },
      { x: 2440, y: 1288, text: 'Farm', color: '#4d3516' },
      { x: 1450, y: 1710, text: 'Beach / Dock', color: '#57391f' },
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
    graphics.fillEllipse(1560, 980, 2100, 1100);
    graphics.fillStyle(0x142534, 0.07);
    graphics.fillRect(0, 1860, WORLD_WIDTH, 180);
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
