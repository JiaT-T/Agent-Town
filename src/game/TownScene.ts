import Phaser from 'phaser';
import type { AgentSimulation } from '../agents/AgentSimulation';
import { formatTime } from '../agents/time';
import type { WorldEvent } from '../agents/types';
import { LOCATION_BY_ID, LOCATIONS, WORLD_SIZE, type LocationId } from '../data/locations';
import type { PerformanceMonitor } from '../performance/PerformanceMonitor';
import { AgentRenderer } from './AgentRenderer';
import { CameraController } from './CameraController';
import { blurActiveTextEntry, isTextEntryActive } from './InputFocusGuard';
import { PlayerRenderer } from './PlayerRenderer';
import { TownMapRenderer } from './TownMapRenderer';

export class TownScene extends Phaser.Scene {
  private agentRenderer?: AgentRenderer;
  private playerRenderer?: PlayerRenderer;
  private cameraController?: CameraController;
  private mapRenderer?: TownMapRenderer;
  private eventMarkerGraphics?: Phaser.GameObjects.Graphics;
  private readonly eventMarkerTexts = new Map<LocationId, Phaser.GameObjects.Text>();
  private eventMarkerSignature = '';
  private keys?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
  };

  constructor(
    private readonly simulation: AgentSimulation,
    private readonly onSelectAgent: (agentId: string) => void,
    private readonly performanceMonitor?: PerformanceMonitor,
  ) {
    super('TownScene');
  }

  preload(): void {
    this.load.image('kenney-tree', '/assets/kenney/tiny-town/Tiles/tile_0005.png');
    this.load.image('kenney-crate', '/assets/kenney/tiny-town/Tiles/tile_0091.png');
    this.load.image('kenney-shell', '/assets/kenney/tiny-town/Tiles/tile_0014.png');
    this.load.image('kenney-flowers', '/assets/kenney/tiny-town/Tiles/tile_0001.png');
    this.load.image('kenney-boat', '/assets/kenney/top-down-shooter/PNG/Tiles/tile_100.png');
    this.load.image('kenney-player', '/assets/kenney/top-down-shooter/PNG/Man%20Blue/manBlue_stand.png');
    this.load.image('kenney-man-blue', '/assets/kenney/top-down-shooter/PNG/Man%20Blue/manBlue_stand.png');
    this.load.image('kenney-man-brown', '/assets/kenney/top-down-shooter/PNG/Man%20Brown/manBrown_stand.png');
    this.load.image('kenney-man-old', '/assets/kenney/top-down-shooter/PNG/Man%20Old/manOld_stand.png');
    this.load.image('kenney-survivor', '/assets/kenney/top-down-shooter/PNG/Survivor%201/survivor1_stand.png');
    this.load.image('kenney-hitman', '/assets/kenney/top-down-shooter/PNG/Hitman%201/hitman1_stand.png');
    this.load.spritesheet(
      'kenney-roguelike-char-sheet',
      '/assets/kenney/roguelike-characters/Spritesheet/roguelikeChar_transparent.png',
      {
        frameWidth: 16,
        frameHeight: 16,
        spacing: 1,
      },
    );
    this.load.spritesheet('kenney-roguelike-rpg-sheet', '/assets/kenney/roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png', {
      frameWidth: 16,
      frameHeight: 16,
      spacing: 1,
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#f6f3ea');
    this.cameraController = new CameraController(this, WORLD_SIZE);
    this.cameraController.install();
    this.mapRenderer = new TownMapRenderer(this);
    this.mapRenderer.render();
    this.createEventMarkers();
    this.agentRenderer = new AgentRenderer(this, (agentId, pointer) => this.selectAgentIfClick(agentId, pointer));
    this.playerRenderer = new PlayerRenderer(this);
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,SHIFT,E') as TownScene['keys'];
    this.game.canvas.addEventListener('pointerdown', this.handleCanvasPointerDown);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('aivilization:reset-game-keys', this.handleGlobalKeyReset);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyInputGuards);
  }

  update(_time: number, delta: number): void {
    const frameStartedAt = performance.now();
    this.performanceMonitor?.beginFrame(frameStartedAt);

    const simulationStartedAt = performance.now();
    if (this.simulation.started) {
      this.updatePlayerInput(delta);
    } else {
      this.resetGameplayKeys();
    }
    this.simulation.update(delta);
    this.performanceMonitor?.recordSimulation(performance.now() - simulationStartedAt);

    const renderStartedAt = performance.now();
    this.mapRenderer?.setDebug(this.simulation.debug.showGrid, this.simulation.debug.showObstacles);
    this.renderEventMarkersIfNeeded(this.simulation.events);
    this.mapRenderer?.setLabelVisibility(this.cameras.main.zoom);
    if (this.simulation.started) {
      this.playerRenderer?.render(this.simulation.player, this.getElapsedMs());
    }
    this.agentRenderer?.render(
      this.simulation.agents,
      this.simulation.selectedAgentId,
      this.getElapsedMs(),
      this.simulation.debug.showPath,
      this.cameras.main.zoom,
    );
    if (this.simulation.started) {
      this.cameraController?.followWorldPoint(this.simulation.player.position, 0.18);
    }
    this.performanceMonitor?.setDisplayObjectCount(this.children.length);
    this.performanceMonitor?.recordRender(performance.now() - renderStartedAt);
  }

  private getElapsedMs(): number {
    return this.game.loop.time;
  }

  private selectAgentIfClick(agentId: string, pointer: Phaser.Input.Pointer): void {
    if (!this.cameraController?.isClick(pointer)) {
      return;
    }

    this.onSelectAgent(agentId);
  }

  private updatePlayerInput(deltaMs: number): void {
    if (!this.keys || this.isDomEditing() || this.simulation.player.dialogue) {
      this.resetGameplayKeys();
      this.simulation.updatePlayerMovement({ x: 0, y: 0, running: false }, deltaMs / 1000);
      return;
    }

    const x = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
    const y = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0);
    this.simulation.updatePlayerMovement(
      {
        x,
        y,
        running: this.keys.SHIFT.isDown,
      },
      deltaMs / 1000,
    );

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this.simulation.tryPlayerInteract();
    }
  }

  private isDomEditing(): boolean {
    return isTextEntryActive();
  }

  private resetGameplayKeys(): void {
    this.keys?.W.reset();
    this.keys?.A.reset();
    this.keys?.S.reset();
    this.keys?.D.reset();
    this.keys?.SHIFT.reset();
    this.keys?.E.reset();
  }

  private readonly handleCanvasPointerDown = (): void => {
    blurActiveTextEntry();
    this.resetGameplayKeys();
  };

  private readonly handleWindowBlur = (): void => {
    this.resetGameplayKeys();
  };

  private readonly handleGlobalKeyReset = (): void => {
    this.resetGameplayKeys();
  };

  private readonly destroyInputGuards = (): void => {
    this.game.canvas.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('aivilization:reset-game-keys', this.handleGlobalKeyReset);
  };

  private createEventMarkers(): void {
    this.eventMarkerGraphics = this.add.graphics();
    this.eventMarkerGraphics.setDepth(8);

    for (const location of LOCATIONS) {
      const markerText = this.add
        .text(location.x + location.width - 52, location.y + 28, '', {
          fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
          fontSize: '12px',
          color: '#ffffff',
          fontStyle: '700',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(9)
        .setVisible(false);

      this.eventMarkerTexts.set(location.id, markerText);
    }
  }

  private renderEventMarkersIfNeeded(events: WorldEvent[]): void {
    const signature = events
      .map((event) => `${event.id}:${event.locationId}:${event.timeMinutes}:${event.groupInteractionDone ? 1 : 0}`)
      .join('|');
    if (signature === this.eventMarkerSignature) {
      return;
    }

    this.eventMarkerSignature = signature;
    this.renderEventMarkers(events);
  }

  private renderEventMarkers(events: WorldEvent[]): void {
    if (!this.eventMarkerGraphics) {
      return;
    }

    this.eventMarkerGraphics.clear();
    for (const markerText of this.eventMarkerTexts.values()) {
      markerText.setVisible(false);
    }

    const eventsByLocation = new Map<LocationId, WorldEvent[]>();
    for (const event of events) {
      const locationEvents = eventsByLocation.get(event.locationId) ?? [];
      locationEvents.push(event);
      eventsByLocation.set(event.locationId, locationEvents);
    }

    for (const [locationId, locationEvents] of eventsByLocation) {
      const location = LOCATION_BY_ID[locationId];
      const markerText = this.eventMarkerTexts.get(locationId);
      if (!markerText) {
        continue;
      }

      const nextEvent = [...locationEvents].sort((a, b) => a.timeMinutes - b.timeMinutes)[0];
      const x = location.x + location.width - 104;
      const y = location.y + 14;
      const width = 92;
      const height = 34;
      const label = locationEvents.length > 1 ? `${locationEvents.length} Events` : 'Event';

      this.eventMarkerGraphics.fillStyle(0xd13f36, 0.95);
      this.eventMarkerGraphics.fillRoundedRect(x, y, width, height, 7);
      this.eventMarkerGraphics.lineStyle(2, 0xffffff, 0.92);
      this.eventMarkerGraphics.strokeRoundedRect(x, y, width, height, 7);
      markerText.setText(`${label}\n${formatTime(nextEvent.timeMinutes)}`);
      markerText.setPosition(x + width / 2, y + height / 2);
      markerText.setVisible(true);
    }
  }
}
